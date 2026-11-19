import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import type {
  ModelInfo,
  NovaSwarmState,
  ProviderId,
  ProviderKeyEntry,
  QuotaStatus,
  Settings,
} from '../../shared/types';
import {
  appendAuditLog,
  getRawProviderKeySecret,
  getState,
  maskSecret,
  setRawProviderKeySecret,
  updateState,
} from '../state/store';

export interface PricingRule {
  pattern: RegExp;
  inputCostPer1M: number;
  outputCostPer1M: number;
  tier: ModelInfo['tier'];
  contextWindow: number;
}

/**
 * Maintained local pricing & tier catalog.
 * Provider /models endpoints typically omit pricing; this catalog supplements
 * dynamic model discovery rather than replacing it.
 */
export const LOCAL_MODEL_PRICING_CATALOG: PricingRule[] = [
  { pattern: /^gemini-3\.1-flash-lite/i, inputCostPer1M: 0.05, outputCostPer1M: 0.2, tier: 'free', contextWindow: 1000000 },
  { pattern: /^gemini-4-hydrogen/i, inputCostPer1M: 0.15, outputCostPer1M: 0.6, tier: 'budget', contextWindow: 1000000 },
  { pattern: /^gemini-4-argon/i, inputCostPer1M: 1.25, outputCostPer1M: 5.0, tier: 'standard', contextWindow: 2000000 },
  { pattern: /^gemini-4-carbon/i, inputCostPer1M: 2.5, outputCostPer1M: 10.0, tier: 'flagship', contextWindow: 2000000 },
  { pattern: /gemini.*flash/i, inputCostPer1M: 0.1, outputCostPer1M: 0.4, tier: 'budget', contextWindow: 1000000 },
  { pattern: /gemini.*pro/i, inputCostPer1M: 1.25, outputCostPer1M: 5.0, tier: 'standard', contextWindow: 1000000 },
  { pattern: /^gpt-4o-mini/i, inputCostPer1M: 0.15, outputCostPer1M: 0.6, tier: 'budget', contextWindow: 128000 },
  { pattern: /^gpt-4\.1-mini|^gpt-5-mini/i, inputCostPer1M: 0.25, outputCostPer1M: 1.0, tier: 'budget', contextWindow: 128000 },
  { pattern: /^gpt-4o|^gpt-4\.1|^gpt-5/i, inputCostPer1M: 2.5, outputCostPer1M: 10.0, tier: 'flagship', contextWindow: 128000 },
  { pattern: /^o1|^o3/i, inputCostPer1M: 3.0, outputCostPer1M: 12.0, tier: 'flagship', contextWindow: 200000 },
  { pattern: /claude.*haiku/i, inputCostPer1M: 0.25, outputCostPer1M: 1.25, tier: 'budget', contextWindow: 200000 },
  { pattern: /claude.*sonnet/i, inputCostPer1M: 3.0, outputCostPer1M: 15.0, tier: 'standard', contextWindow: 200000 },
  { pattern: /claude.*opus/i, inputCostPer1M: 15.0, outputCostPer1M: 75.0, tier: 'flagship', contextWindow: 200000 },
  { pattern: /:free$/i, inputCostPer1M: 0, outputCostPer1M: 0, tier: 'free', contextWindow: 128000 },
];

export function classifyModelPricing(modelId: string, provider: ProviderId): Omit<ModelInfo, 'id' | 'name' | 'provider' | 'source'> {
  if (provider === 'ollama') {
    return { contextWindow: 32768, inputCostPer1M: 0, outputCostPer1M: 0, isFree: true, tier: 'local' };
  }
  for (const rule of LOCAL_MODEL_PRICING_CATALOG) {
    if (rule.pattern.test(modelId)) {
      return {
        contextWindow: rule.contextWindow,
        inputCostPer1M: rule.inputCostPer1M,
        outputCostPer1M: rule.outputCostPer1M,
        isFree: rule.inputCostPer1M === 0 && rule.outputCostPer1M === 0,
        tier: rule.tier,
      };
    }
  }
  return { contextWindow: 128000, inputCostPer1M: 1.0, outputCostPer1M: 3.0, isFree: false, tier: 'standard' };
}

/** Gateway Guardrails */
export class GuardrailBlockedError extends Error {
  code = 'GUARDRAIL_BLOCKED';
  rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

const GUARDRAIL_SECRET_REGEX = /(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{20,}|AKIA[0-9A-Z]{16})/;
const GUARDRAIL_PII_REGEX = /(\b\d{3}-\d{2}-\d{4}\b|\b(?:\d{4}[-\s]?){3}\d{4}\b)/;
const GUARDRAIL_INJECTION_REGEX = /(ignore (all )?previous instructions|reveal (your )?system prompt|bypass guardrails|disable safety rules)/i;

export function evaluateGuardrails(
  text: string,
  phase: 'input' | 'output',
  settings: Settings
): { ok: boolean; sanitizedText: string; blockedRule?: string } {
  if (!settings.guardrailsEnabled || !text) {
    return { ok: true, sanitizedText: text };
  }
  if (settings.guardrailBlockPromptInjection && phase === 'input' && GUARDRAIL_INJECTION_REGEX.test(text)) {
    return { ok: false, sanitizedText: text, blockedRule: 'prompt_injection' };
  }
  if (settings.guardrailBlockSecrets && GUARDRAIL_SECRET_REGEX.test(text)) {
    if (phase === 'input') {
      return { ok: false, sanitizedText: text, blockedRule: 'secret_leak' };
    }
    return {
      ok: true,
      sanitizedText: text.replace(new RegExp(GUARDRAIL_SECRET_REGEX, 'g'), '[REDACTED_SECRET]'),
    };
  }
  if (settings.guardrailBlockPii && GUARDRAIL_PII_REGEX.test(text)) {
    if (phase === 'input') {
      return { ok: false, sanitizedText: text, blockedRule: 'pii_detected' };
    }
    return {
      ok: true,
      sanitizedText: text.replace(new RegExp(GUARDRAIL_PII_REGEX, 'g'), '[REDACTED_PII]'),
    };
  }
  return { ok: true, sanitizedText: text };
}

/** Gateway LRU Response Cache */
interface CacheEntry {
  text: string;
  provider: ProviderId;
  model: string;
  estimatedCostUsd: number;
  expiresAt: number;
}
const responseCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

export function clearResponseCache(): number {
  const count = responseCache.size;
  responseCache.clear();
  return count;
}

export function getResponseCacheSize(): number {
  return responseCache.size;
}

function makeCacheKey(provider: ProviderId, model: string, prompt: string, systemInstruction?: string): string {
  return crypto
    .createHash('sha256')
    .update(`${provider}|${model}|${systemInstruction || ''}|${prompt}`)
    .digest('hex');
}

/** Round-robin cursor per provider so consecutive calls rotate across arbitrary keys */
const keyCursors: Record<ProviderId, number> = {
  gemini: 0,
  openai: 0,
  anthropic: 0,
  openrouter: 0,
  ollama: 0,
};

export function resetKeyCursorsForTests(): void {
  keyCursors.gemini = 0;
  keyCursors.openai = 0;
  keyCursors.anthropic = 0;
  keyCursors.openrouter = 0;
  keyCursors.ollama = 0;
  clearResponseCache();
}

export function addProviderKey(provider: ProviderId, rawKey: string, label?: string): ProviderKeyEntry {
  const id = `key-${provider}-${crypto.randomUUID().slice(0, 8)}`;
  setRawProviderKeySecret(id, rawKey);
  const entry: ProviderKeyEntry = {
    id,
    label: label?.trim() || `${provider.toUpperCase()} Key`,
    maskedKey: maskSecret(rawKey),
    enabled: true,
    failureCount: 0,
  };
  updateState((s) => {
    s.settings.providerKeys[provider].push(entry);
  });
  return entry;
}

export function removeProviderKey(provider: ProviderId, keyId: string): void {
  updateState((s) => {
    s.settings.providerKeys[provider] = s.settings.providerKeys[provider].filter((k) => k.id !== keyId);
  });
}

export function resetProviderCooldowns(): void {
  updateState((s) => {
    for (const p of Object.keys(s.settings.providerKeys) as ProviderId[]) {
      for (const k of s.settings.providerKeys[p]) {
        k.cooldownUntil = undefined;
      }
    }
  });
}

/**
 * Selects the next enabled & non-cooled-down key in round-robin order,
 * skipping keys already tried in the current attempt.
 */
export function pickNextPoolKey(
  provider: ProviderId,
  pool: ProviderKeyEntry[],
  triedIds: Set<string>,
  resolveSecret: (keyId: string) => string = resolveEffectiveKeySecret
): { entry: ProviderKeyEntry; secret: string } | null {
  const nowMs = Date.now();
  const enabled = pool.filter((k) => {
    if (!k.enabled || triedIds.has(k.id)) return false;
    if (k.cooldownUntil && Date.parse(k.cooldownUntil) > nowMs) return false;
    return true;
  });
  if (enabled.length === 0) return null;

  const startIdx = keyCursors[provider] % enabled.length;
  const chosen = enabled[startIdx];
  keyCursors[provider] = (keyCursors[provider] + 1) % Math.max(1, pool.length);

  const secret = resolveSecret(chosen.id);
  if (!secret) {
    triedIds.add(chosen.id);
    return pickNextPoolKey(provider, pool, triedIds, resolveSecret);
  }
  return { entry: chosen, secret };
}

export function resolveEffectiveKeySecret(keyId: string): string {
  if (keyId === 'env-gemini-default') {
    return process.env.GEMINI_API_KEY?.trim() || '';
  }
  return getRawProviderKeySecret(keyId);
}

/** Extract real HTTP rate-limit headers where providers supply them */
export function extractQuotaFromHeaders(provider: ProviderId, headers: Headers): QuotaStatus {
  const reqRem = headers.get('x-ratelimit-remaining-requests') ?? headers.get('anthropic-ratelimit-requests-remaining');
  const reqLim = headers.get('x-ratelimit-limit-requests') ?? headers.get('anthropic-ratelimit-requests-limit');
  const tokRem = headers.get('x-ratelimit-remaining-tokens') ?? headers.get('anthropic-ratelimit-tokens-remaining');
  const reset = headers.get('x-ratelimit-reset-requests') ?? headers.get('anthropic-ratelimit-requests-reset');

  const hasRealHeader = reqRem !== null || reqLim !== null || tokRem !== null;
  return {
    provider,
    remainingRequests: reqRem !== null ? Number(reqRem) : null,
    limitRequests: reqLim !== null ? Number(reqLim) : null,
    remainingTokens: tokRem !== null ? Number(tokRem) : null,
    resetAt: reset,
    isEstimated: !hasRealHeader,
    lastCheckedAt: new Date().toISOString(),
    sourceNote: hasRealHeader
      ? 'Valós API válasz-fejlécből olvasva'
      : 'A szolgáltató nem küldött kvóta-fejlécet (becsült érték)',
  };
}

export interface DiscoveryFetchers {
  fetchFn?: typeof fetch;
}

/**
 * Dynamically queries provider /models endpoints (Gemini, OpenAI, Anthropic, OpenRouter, Ollama)
 * and enriches with local pricing/tier catalog + OpenRouter exact $0 free filtering.
 */
export async function discoverModels(deps: DiscoveryFetchers = {}): Promise<{
  models: ModelInfo[];
  errors: string[];
}> {
  const fetchImpl = deps.fetchFn ?? fetch;
  const state = getState();
  const discovered: ModelInfo[] = [];
  const errors: string[] = [];

  // 1. Gemini dynamic model listing
  const geminiKey = pickNextPoolKey('gemini', state.settings.providerKeys.gemini, new Set());
  if (geminiKey) {
    try {
      const res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey.secret)}`
      );
      const quota = extractQuotaFromHeaders('gemini', res.headers);
      updateState((s) => {
        s.quotas.gemini = quota;
      });
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number }> };
        for (const m of data.models || []) {
          const cleanId = m.name.replace(/^models\//, '');
          if (!/gemini/i.test(cleanId) || /embedding|aqa|vision-001|1\.0|1\.5|2\.0/i.test(cleanId)) continue;
          const pricing = classifyModelPricing(cleanId, 'gemini');
          discovered.push({
            id: cleanId,
            name: m.displayName || cleanId,
            provider: 'gemini',
            contextWindow: m.inputTokenLimit || pricing.contextWindow,
            inputCostPer1M: pricing.inputCostPer1M,
            outputCostPer1M: pricing.outputCostPer1M,
            isFree: pricing.isFree,
            tier: pricing.tier,
            source: 'api',
          });
        }
      } else {
        errors.push(`[gemini]: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`[gemini]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!discovered.some((m) => m.provider === 'gemini')) {
    for (const id of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-argon', 'gemini-4-carbon']) {
      const pricing = classifyModelPricing(id, 'gemini');
      discovered.push({
        id,
        name: id,
        provider: 'gemini',
        ...pricing,
        source: 'catalog',
      });
    }
  }

  // 2. OpenRouter dynamic model listing (explicit pricing fields!)
  const orKey = pickNextPoolKey('openrouter', state.settings.providerKeys.openrouter, new Set());
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models', {
      headers: orKey ? { Authorization: `Bearer ${orKey.secret}` } : undefined,
    });
    const quota = extractQuotaFromHeaders('openrouter', res.headers);
    updateState((s) => {
      s.quotas.openrouter = quota;
    });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        }>;
      };
      for (const m of (data.data || []).slice(0, 60)) {
        const promptPerToken = Number(m.pricing?.prompt ?? NaN);
        const completionPerToken = Number(m.pricing?.completion ?? NaN);
        const hasExactPrice = !Number.isNaN(promptPerToken) && !Number.isNaN(completionPerToken);
        const inputCostPer1M = hasExactPrice ? Number((promptPerToken * 1_000_000).toFixed(4)) : 0;
        const outputCostPer1M = hasExactPrice ? Number((completionPerToken * 1_000_000).toFixed(4)) : 0;
        const isFree = hasExactPrice ? inputCostPer1M === 0 && outputCostPer1M === 0 : /:free$/i.test(m.id);
        discovered.push({
          id: m.id,
          name: m.name || m.id,
          provider: 'openrouter',
          contextWindow: m.context_length || 128000,
          inputCostPer1M,
          outputCostPer1M,
          isFree,
          tier: isFree ? 'free' : inputCostPer1M <= 0.5 ? 'budget' : 'standard',
          source: 'api',
        });
      }
    } else {
      errors.push(`[openrouter]: HTTP ${res.status}`);
    }
  } catch (err) {
    errors.push(`[openrouter]: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. OpenAI dynamic listing if key present
  const openaiKey = pickNextPoolKey('openai', state.settings.providerKeys.openai, new Set());
  if (openaiKey) {
    try {
      const res = await fetchImpl('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${openaiKey.secret}` },
      });
      const quota = extractQuotaFromHeaders('openai', res.headers);
      updateState((s) => {
        s.quotas.openai = quota;
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        for (const m of (data.data || []).filter((x) => /^(gpt-|o1|o3|o4)/.test(x.id)).slice(0, 25)) {
          const pricing = classifyModelPricing(m.id, 'openai');
          discovered.push({ id: m.id, name: m.id, provider: 'openai', ...pricing, source: 'api' });
        }
      } else {
        errors.push(`[openai]: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`[openai]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Anthropic dynamic listing if key present
  const anthropicKey = pickNextPoolKey('anthropic', state.settings.providerKeys.anthropic, new Set());
  if (anthropicKey) {
    try {
      const res = await fetchImpl('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': anthropicKey.secret,
          'anthropic-version': '2023-06-01',
        },
      });
      const quota = extractQuotaFromHeaders('anthropic', res.headers);
      updateState((s) => {
        s.quotas.anthropic = quota;
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
        for (const m of data.data || []) {
          const pricing = classifyModelPricing(m.id, 'anthropic');
          discovered.push({
            id: m.id,
            name: m.display_name || m.id,
            provider: 'anthropic',
            ...pricing,
            source: 'api',
          });
        }
      } else {
        errors.push(`[anthropic]: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`[anthropic]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. Local Ollama tags
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetchImpl(`${state.settings.ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      for (const m of data.models || []) {
        discovered.push({
          id: m.name,
          name: `${m.name} (Ollama)`,
          provider: 'ollama',
          contextWindow: 32768,
          inputCostPer1M: 0,
          outputCostPer1M: 0,
          isFree: true,
          tier: 'local',
          source: 'api',
        });
      }
      updateState((s) => {
        s.quotas.ollama = {
          provider: 'ollama',
          remainingRequests: null,
          limitRequests: null,
          remainingTokens: null,
          resetAt: null,
          isEstimated: false,
          lastCheckedAt: new Date().toISOString(),
          sourceNote: 'Lokális Ollama elérhető',
        };
      });
    }
  } catch {
    discovered.push({
      id: state.settings.ollamaModel,
      name: `${state.settings.ollamaModel} (Ollama konfigurált)`,
      provider: 'ollama',
      contextWindow: 32768,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      tier: 'local',
      source: 'catalog',
    });
  }

  updateState((s) => {
    s.discoveredModels = discovered;
    s.settings.lastModelDiscoveryAt = new Date().toISOString();
  });

  return { models: discovered, errors };
}

export interface InlineMediaInput {
  mimeType: string;
  dataBase64: string;
}

export interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmInvokeRequest {
  prompt: string;
  systemInstruction?: string;
  complexity?: 'simple' | 'complex';
  preferredProvider?: ProviderId;
  preferredModel?: string;
  agentId?: string;
  bypassCache?: boolean;
  images?: InlineMediaInput[];
  audio?: InlineMediaInput;
  tools?: OpenAiToolDefinition[];
  toolChoice?: unknown;
}

export interface LlmInvokeResult {
  text: string;
  provider: ProviderId;
  model: string;
  keyId: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  cached?: boolean;
  toolCalls?: OpenAiToolCall[];
  attempts: Array<{ provider: ProviderId; model: string; keyId: string; ok: boolean; error?: string }>;
}

export interface ProviderCallParams {
  provider: ProviderId;
  model: string;
  apiKey: string;
  prompt: string;
  systemInstruction?: string;
  ollamaUrl: string;
  images?: InlineMediaInput[];
  audio?: InlineMediaInput;
  tools?: OpenAiToolDefinition[];
  toolChoice?: unknown;
}

export interface ProviderCallOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  headers?: Headers;
  toolCalls?: OpenAiToolCall[];
}

export interface RouterDependencies {
  callProvider?: (params: ProviderCallParams) => Promise<ProviderCallOutput>;
  sleep?: (ms: number) => Promise<void>;
  resolveSecret?: (keyId: string) => string;
}

export function selectModelForProvider(
  provider: ProviderId,
  complexity: 'simple' | 'complex',
  state: NovaSwarmState,
  explicitModel?: string
): string {
  if (explicitModel && provider === (explicitModel.includes(':') && provider === 'ollama' ? 'ollama' : provider)) {
    if (provider === 'gemini' && explicitModel.startsWith('gemini-')) return explicitModel;
    if (provider === 'openai' && /^(gpt-|o1|o3|o4)/.test(explicitModel)) return explicitModel;
    if (provider === 'anthropic' && explicitModel.startsWith('claude-')) return explicitModel;
    if (provider === 'openrouter' && explicitModel.includes('/')) return explicitModel;
    if (provider === 'ollama') return explicitModel;
  }
  const manual = state.settings.manualModelPriority[provider];
  if (manual && manual.length > 0) {
    return manual[0];
  }
  if (provider === 'ollama') {
    return state.settings.ollamaModel;
  }
  const providerModels = state.discoveredModels.filter((m) => m.provider === provider);
  if (providerModels.length > 0) {
    if (complexity === 'simple' && state.settings.autoTaskRouting) {
      const freeOrBudget =
        providerModels.find((m) => m.isFree) ||
        providerModels.find((m) => m.tier === 'budget') ||
        providerModels[0];
      return freeOrBudget.id;
    }
    const flagship =
      providerModels.find((m) => m.tier === 'flagship' || m.tier === 'standard') ||
      providerModels[0];
    return flagship.id;
  }

  switch (provider) {
    case 'gemini':
      return complexity === 'simple' ? 'gemini-4-hydrogen' : 'gemini-4-argon';
    case 'openrouter':
      return 'meta-llama/llama-3.3-70b-instruct:free';
    case 'openai':
      return complexity === 'simple' ? 'gpt-4o-mini' : 'gpt-4o';
    case 'anthropic':
      return complexity === 'simple' ? 'claude-3-5-haiku-latest' : 'claude-3-7-sonnet-latest';
  }
}

export async function defaultCallProvider(params: ProviderCallParams): Promise<ProviderCallOutput> {
  if (params.provider === 'gemini') {
    const ai = new GoogleGenAI({
      apiKey: params.apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];
    if (params.images) {
      for (const img of params.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
      }
    }
    if (params.audio) {
      parts.push({ inlineData: { mimeType: params.audio.mimeType, data: params.audio.dataBase64 } });
    }
    const config: Record<string, unknown> = {};
    if (params.systemInstruction) {
      config.systemInstruction = params.systemInstruction;
    }
    if (params.tools && params.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: params.tools.map((t) => ({
            name: t.function.name,
            description: t.function.description || '',
            parametersJsonSchema: t.function.parameters || { type: 'object', properties: {} },
          })),
        },
      ];
    }

    const response = await ai.models.generateContent({
      model: params.model,
      contents: parts.length === 1 ? params.prompt : [{ role: 'user', parts }],
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    const fnCalls = response.functionCalls?.map((fc, idx) => ({
      id: `call_gem_${crypto.randomUUID().slice(0, 8)}_${idx}`,
      type: 'function' as const,
      function: {
        name: fc.name || 'tool',
        arguments: JSON.stringify(fc.args ?? {}),
      },
    }));

    return {
      text: response.text ?? '',
      inputTokens: response.usageMetadata?.promptTokenCount ?? Math.ceil(params.prompt.length / 4),
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? Math.ceil((response.text ?? '').length / 4),
      toolCalls: fnCalls && fnCalls.length > 0 ? fnCalls : undefined,
    };
  }

  if (params.provider === 'ollama') {
    const userMsg: Record<string, unknown> = { role: 'user', content: params.prompt };
    if (params.images && params.images.length > 0) {
      userMsg.images = params.images.map((i) => i.dataBase64);
    }
    const res = await fetch(`${params.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        stream: false,
        messages: [
          ...(params.systemInstruction ? [{ role: 'system', content: params.systemInstruction }] : []),
          userMsg,
        ],
        ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      message?: {
        content?: string;
        tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
      };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const ollamaCalls = data.message?.tool_calls?.map((tc, idx) => ({
      id: `call_oll_${crypto.randomUUID().slice(0, 8)}_${idx}`,
      type: 'function' as const,
      function: {
        name: tc.function?.name || 'tool',
        arguments:
          typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments ?? {}),
      },
    }));
    return {
      text: data.message?.content ?? '',
      inputTokens: data.prompt_eval_count ?? Math.ceil(params.prompt.length / 4),
      outputTokens: data.eval_count ?? 100,
      headers: res.headers,
      toolCalls: ollamaCalls && ollamaCalls.length > 0 ? ollamaCalls : undefined,
    };
  }

  if (params.provider === 'openrouter' || params.provider === 'openai') {
    const url =
      params.provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const userContent: unknown =
      params.images && params.images.length > 0
        ? [
            { type: 'text', text: params.prompt },
            ...params.images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
            })),
          ]
        : params.prompt;

    const payload: Record<string, unknown> = {
      model: params.model,
      messages: [
        ...(params.systemInstruction ? [{ role: 'system', content: params.systemInstruction }] : []),
        { role: 'user', content: userContent },
      ],
    };
    if (params.tools && params.tools.length > 0) {
      payload.tools = params.tools;
      if (params.toolChoice !== undefined) {
        payload.tool_choice = params.toolChoice;
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message;
    return {
      text: msg?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? Math.ceil(params.prompt.length / 4),
      outputTokens: data.usage?.completion_tokens ?? 100,
      headers: res.headers,
      toolCalls: msg?.tool_calls && msg.tool_calls.length > 0 ? msg.tool_calls : undefined,
    };
  }

  // Anthropic
  const anthropicContent: unknown =
    params.images && params.images.length > 0
      ? [
          ...params.images.map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 },
          })),
          { type: 'text', text: params.prompt },
        ]
      : params.prompt;

  const anthropicPayload: Record<string, unknown> = {
    model: params.model,
    max_tokens: 2048,
    system: params.systemInstruction,
    messages: [{ role: 'user', content: anthropicContent }],
  };
  if (params.tools && params.tools.length > 0) {
    anthropicPayload.tools = params.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicPayload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const textOut = (data.content || [])
    .filter((c) => typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
  const toolUseCalls = (data.content || [])
    .filter((c) => c.type === 'tool_use' && c.name)
    .map((c, idx) => ({
      id: c.id || `call_ant_${idx}`,
      type: 'function' as const,
      function: {
        name: c.name!,
        arguments: JSON.stringify(c.input ?? {}),
      },
    }));

  return {
    text: textOut,
    inputTokens: data.usage?.input_tokens ?? Math.ceil(params.prompt.length / 4),
    outputTokens: data.usage?.output_tokens ?? 100,
    headers: res.headers,
    toolCalls: toolUseCalls.length > 0 ? toolUseCalls : undefined,
  };
}

/**
 * Computes neural vector embeddings via local Ollama (/api/embed or /api/embeddings)
 * when settings.embeddingMode === 'ollama', returning null if unavailable.
 */
export async function computeOllamaEmbedding(
  text: string,
  settingsOverride?: Settings,
  fetchImpl: typeof fetch = fetch
): Promise<number[] | null> {
  const s = settingsOverride ?? getState().settings;
  if (s.embeddingMode !== 'ollama') return null;
  const model = s.ollamaEmbeddingModel?.trim() || 'nomic-embed-text';
  const baseUrl = s.ollamaUrl.replace(/\/$/, '');

  try {
    const res = await fetchImpl(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = (await res.json()) as { embeddings?: number[][]; embedding?: number[] };
      if (Array.isArray(data.embeddings?.[0]) && data.embeddings[0].length > 0) {
        return data.embeddings[0];
      }
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        return data.embedding;
      }
    }
  } catch {
    // Fallback check /api/embeddings for older Ollama releases
  }

  try {
    const legacyRes = await fetchImpl(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(2500),
    });
    if (!legacyRes.ok) return null;
    const data = (await legacyRes.json()) as { embedding?: number[] };
    return Array.isArray(data.embedding) && data.embedding.length > 0 ? data.embedding : null;
  } catch {
    return null;
  }
}

/**
 * Failover Router:
 * - Guardrails (input & output secret/PII/injection filter)
 * - LRU Response Cache with hit savings tracking
 * - Per-key Cooldowns (60s backoff on 429/5xx) & Round-Robin rotation
 * - Global & Per-Agent daily budget enforcement
 * - Exponential backoff failover across Primary -> Secondary -> Ollama
 */
export async function invokeWithFailover(
  req: LlmInvokeRequest,
  deps: RouterDependencies = {}
): Promise<LlmInvokeResult> {
  const state = getState();
  const callProvider = deps.callProvider ?? defaultCallProvider;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const resolveSecret = deps.resolveSecret ?? resolveEffectiveKeySecret;

  // Input Guardrails
  const inputGuard = evaluateGuardrails(req.prompt, 'input', state.settings);
  if (!inputGuard.ok) {
    updateState((s) => {
      s.gatewayAnalytics.guardrailsBlocked += 1;
    });
    appendAuditLog({
      type: 'gateway',
      sourceAgentId: req.agentId || 'guardrails',
      sourceAgentName: 'Gateway Guardrail',
      message: `Bemenet blokkolva guardrail szabály alapján: ${inputGuard.blockedRule}`,
      verifiedExecution: true,
    });
    throw new GuardrailBlockedError(
      inputGuard.blockedRule || 'policy',
      `Guardrail blokkolta a kérést (${inputGuard.blockedRule}).`
    );
  }

  // Per-Agent Daily Budget check
  if (req.agentId) {
    const ag = state.agents.find((a) => a.id === req.agentId);
    if (ag && ag.dailyBudgetUsd && ag.dailyBudgetUsd > 0 && (ag.dailySpendUsd ?? 0) >= ag.dailyBudgetUsd) {
      throw new Error(
        `Az ágens (${ag.name}) napi költségkerete elérve ($${(ag.dailySpendUsd ?? 0).toFixed(4)} / $${ag.dailyBudgetUsd.toFixed(2)}).`
      );
    }
  }

  // Enforce Global Daily Cost Limit
  let forceOllama = state.settings.ollamaOnlyMode;
  if (state.settings.dailyCostLimitEnabled) {
    const ratio = state.settings.dailySpendUsd / Math.max(0.01, state.settings.dailyCostLimitUsd);
    if (ratio >= 1.0) {
      throw new Error(
        `Napi globális költséglimit elérve ($${state.settings.dailySpendUsd.toFixed(4)} / $${state.settings.dailyCostLimitUsd.toFixed(2)}). Új hívások leállítva; növeld a limitet vagy válts Ollama módra.`
      );
    }
    if (ratio >= 0.85) {
      forceOllama = true;
      appendAuditLog({
        type: 'system',
        sourceAgentId: 'budget-guard',
        sourceAgentName: 'Költséglimit Őr',
        message: `Napi költséglimit közelében (${Math.round(ratio * 100)}%) — automatikus átállás lokális Ollama modellre.`,
      });
    }
  }

  const chain: ProviderId[] = forceOllama
    ? ['ollama']
    : Array.from(
        new Set<ProviderId>([
          req.preferredProvider ?? state.settings.primaryProvider,
          state.settings.secondaryProvider,
          'ollama',
        ])
      );

  // Check LRU Response Cache first for primary model (skip if images/audio/tools present)
  const allowCache =
    state.settings.responseCacheEnabled &&
    !req.bypassCache &&
    (!req.images || req.images.length === 0) &&
    !req.audio &&
    (!req.tools || req.tools.length === 0);

  const primaryCandidateModel = selectModelForProvider(chain[0], req.complexity ?? 'simple', state, req.preferredModel);
  if (allowCache) {
    const cacheKey = makeCacheKey(chain[0], primaryCandidateModel, req.prompt, req.systemInstruction);
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      updateState((s) => {
        s.gatewayAnalytics.cacheHits += 1;
        s.gatewayAnalytics.savedUsd = Number((s.gatewayAnalytics.savedUsd + cached.estimatedCostUsd).toFixed(6));
      });
      return {
        text: cached.text,
        provider: cached.provider,
        model: cached.model,
        keyId: 'cache-lru',
        costUsd: 0,
        cached: true,
        attempts: [{ provider: cached.provider, model: cached.model, keyId: 'cache-lru', ok: true }],
      };
    }
    updateState((s) => {
      s.gatewayAnalytics.cacheMisses += 1;
    });
  }

  const attempts: LlmInvokeResult['attempts'] = [];
  const failureSummaries: string[] = [];
  let backoffMs = 150;

  for (const provider of chain) {
    const model = selectModelForProvider(provider, req.complexity ?? 'simple', state, req.preferredModel);

    if (provider === 'ollama') {
      try {
        const res = await callProvider({
          provider: 'ollama',
          model,
          apiKey: '',
          prompt: req.prompt,
          systemInstruction: req.systemInstruction,
          ollamaUrl: state.settings.ollamaUrl,
          images: req.images,
          audio: req.audio,
          tools: req.tools,
          toolChoice: req.toolChoice,
        });
        const outGuard = evaluateGuardrails(res.text, 'output', state.settings);
        attempts.push({ provider, model, keyId: 'local-ollama', ok: true });
        return {
          text: outGuard.sanitizedText,
          provider,
          model,
          keyId: 'local-ollama',
          costUsd: 0,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          toolCalls: res.toolCalls,
          attempts,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        attempts.push({ provider, model, keyId: 'local-ollama', ok: false, error: msg });
        failureSummaries.push(`[ollama]: ${msg}`);
        continue;
      }
    }

    const pool = state.settings.providerKeys[provider] || [];
    if (pool.filter((k) => k.enabled).length === 0) {
      failureSummaries.push(`[${provider}]: nincs konfigurált aktív API kulcs`);
      continue;
    }

    const triedIds = new Set<string>();
    while (true) {
      const picked = pickNextPoolKey(provider, pool, triedIds, resolveSecret);
      if (!picked) break;
      triedIds.add(picked.entry.id);

      try {
        const res = await callProvider({
          provider,
          model,
          apiKey: picked.secret,
          prompt: req.prompt,
          systemInstruction: req.systemInstruction,
          ollamaUrl: state.settings.ollamaUrl,
          images: req.images,
          audio: req.audio,
          tools: req.tools,
          toolChoice: req.toolChoice,
        });

        const outGuard = evaluateGuardrails(res.text, 'output', state.settings);
        const pricing = classifyModelPricing(model, provider);
        const costUsd = Number(
          (
            (res.inputTokens / 1_000_000) * pricing.inputCostPer1M +
            (res.outputTokens / 1_000_000) * pricing.outputCostPer1M
          ).toFixed(6)
        );

        updateState((s) => {
          s.settings.dailySpendUsd = Number((s.settings.dailySpendUsd + costUsd).toFixed(6));
          s.gatewayAnalytics.spendByProvider[provider] = Number(
            ((s.gatewayAnalytics.spendByProvider[provider] ?? 0) + costUsd).toFixed(6)
          );
          s.gatewayAnalytics.spendByModel[model] = Number(
            ((s.gatewayAnalytics.spendByModel[model] ?? 0) + costUsd).toFixed(6)
          );
          if (req.agentId) {
            const ag = s.agents.find((a) => a.id === req.agentId);
            if (ag) ag.dailySpendUsd = Number(((ag.dailySpendUsd ?? 0) + costUsd).toFixed(6));
          }
          const keyRef = s.settings.providerKeys[provider].find((k) => k.id === picked.entry.id);
          if (keyRef) {
            keyRef.lastUsedAt = new Date().toISOString();
            keyRef.lastError = undefined;
            keyRef.cooldownUntil = undefined;
          }
          if (res.headers) {
            s.quotas[provider] = extractQuotaFromHeaders(provider, res.headers);
          }
        });

        if (allowCache && (!res.toolCalls || res.toolCalls.length === 0)) {
          if (responseCache.size >= MAX_CACHE_ENTRIES) {
            const firstKey = responseCache.keys().next().value;
            if (firstKey) responseCache.delete(firstKey);
          }
          const cacheKey = makeCacheKey(chain[0], primaryCandidateModel, req.prompt, req.systemInstruction);
          responseCache.set(cacheKey, {
            text: outGuard.sanitizedText,
            provider,
            model,
            estimatedCostUsd: costUsd,
            expiresAt: Date.now() + Math.max(10, state.settings.responseCacheTtlSec) * 1000,
          });
        }

        attempts.push({ provider, model, keyId: picked.entry.id, ok: true });
        return {
          text: outGuard.sanitizedText,
          provider,
          model,
          keyId: picked.entry.id,
          costUsd,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          toolCalls: res.toolCalls,
          attempts,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isCooldownWorthy = /\b(429|500|502|503|504|rate limit|quota)\b/i.test(msg);
        updateState((s) => {
          const keyRef = s.settings.providerKeys[provider].find((k) => k.id === picked.entry.id);
          if (keyRef) {
            keyRef.failureCount += 1;
            keyRef.lastError = msg;
            if (isCooldownWorthy) {
              keyRef.cooldownUntil = new Date(Date.now() + 60_000).toISOString();
            }
          }
        });
        attempts.push({ provider, model, keyId: picked.entry.id, ok: false, error: msg });
        failureSummaries.push(`[${provider}/${picked.entry.label}]: ${msg}`);
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 4000);
      }
    }
  }

  throw new Error(failureSummaries.join(' | ') || 'Nincs elérhető AI szolgáltató a failover láncban.');
}
