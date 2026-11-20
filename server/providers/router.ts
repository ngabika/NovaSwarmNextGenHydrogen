import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  ExecutionPreset,
  MediaArtifact,
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

export const LOCAL_MODEL_PRICING_CATALOG: PricingRule[] = [
  { pattern: /^gemini-3\.1-flash-lite/i, inputCostPer1M: 0.05, outputCostPer1M: 0.2, tier: 'free', contextWindow: 1000000 },
  { pattern: /^gemini-4-hydrogen/i, inputCostPer1M: 0.15, outputCostPer1M: 0.6, tier: 'budget', contextWindow: 1000000 },
  { pattern: /^gemini-4-neon/i, inputCostPer1M: 0.6, outputCostPer1M: 2.5, tier: 'standard', contextWindow: 1000000 },
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

/** M5: Token estimator & Automatic Context Diet */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 3.8));
}

export function applyContextDiet(
  prompt: string,
  contextWindow = 32768,
  reserveRatio = 0.7
): { trimmedPrompt: string; wasTrimmed: boolean; estimatedTokens: number } {
  const maxTokens = Math.max(512, Math.floor(contextWindow * reserveRatio));
  const est = estimateTokens(prompt);
  if (est <= maxTokens) {
    return { trimmedPrompt: prompt, wasTrimmed: false, estimatedTokens: est };
  }
  const maxChars = Math.floor(maxTokens * 3.6);
  const headChars = Math.floor(maxChars * 0.4);
  const tailChars = Math.floor(maxChars * 0.55);
  const trimmedPrompt = `${prompt.slice(0, headChars)}\n\n[... kontextus-diéta: ${est - maxTokens} becsült token tömörítve ...]\n\n${prompt.slice(-tailChars)}`;
  return {
    trimmedPrompt,
    wasTrimmed: true,
    estimatedTokens: estimateTokens(trimmedPrompt),
  };
}

/** M9: Monthly Cost Projection & Budget Alert */
export function computeMonthlyProjection(stateOverride?: NovaSwarmState): {
  todaySpendUsd: number;
  dailyLimitUsd: number;
  projectedMonthlyUsd: number;
  monthlyAlertUsd: number;
  alertExceeded: boolean;
  daysInMonth: number;
  dayOfMonth: number;
} {
  const s = stateOverride ?? getState();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const todaySpend = s.settings.dailySpendUsd || 0;
  const projectedMonthlyUsd = Number((todaySpend * daysInMonth).toFixed(4));
  const monthlyAlertUsd = s.settings.monthlyBudgetAlertUsd || 25;
  return {
    todaySpendUsd: todaySpend,
    dailyLimitUsd: s.settings.dailyCostLimitUsd,
    projectedMonthlyUsd,
    monthlyAlertUsd,
    alertExceeded: projectedMonthlyUsd > monthlyAlertUsd,
    daysInMonth,
    dayOfMonth,
  };
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

function makeCacheKey(
  provider: ProviderId,
  model: string,
  prompt: string,
  systemInstruction?: string,
  preset?: ExecutionPreset
): string {
  const normPrompt = (prompt || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normSys = (systemInstruction || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${provider}|${model}|${preset || 'fast'}|${normSys}|${normPrompt}`)
    .digest('hex');
}

/** Round-robin cursor per provider */
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

export async function discoverModels(deps: DiscoveryFetchers = {}): Promise<{
  models: ModelInfo[];
  errors: string[];
}> {
  const fetchImpl = deps.fetchFn ?? fetch;
  const state = getState();
  const discovered: ModelInfo[] = [];
  const errors: string[] = [];

  // 1. Gemini
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
    for (const id of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-neon', 'gemini-4-carbon']) {
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

  // 2. OpenRouter
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

  // 3. OpenAI
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

  // 4. Anthropic
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

  // 5. Local Ollama
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
          contextWindow: state.settings.ollamaNumCtx || 4096,
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
      contextWindow: state.settings.ollamaNumCtx || 4096,
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

let lastOllamaActivityMs = 0;

/** M41: Unload Ollama model from RAM immediately (keep_alive: 0) */
export async function unloadOllamaModel(fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; model: string; message: string }> {
  const s = getState().settings;
  const baseUrl = s.ollamaUrl.replace(/\/$/, '');
  try {
    const res = await fetchImpl(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.ollamaModel,
        prompt: '',
        keep_alive: 0,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, model: s.ollamaModel, message: `Ollama HTTP ${res.status}` };
    }
    lastOllamaActivityMs = 0;
    return { ok: true, model: s.ollamaModel, message: `${s.ollamaModel} sikeresen kirakva a RAM-ból (keep_alive: 0).` };
  } catch (err) {
    return {
      ok: false,
      model: s.ollamaModel,
      message: `Ollama nem érhető el: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function checkOllamaIdleUnload(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const s = getState().settings;
  const mins = s.ollamaAutoUnloadMinutes ?? 0;
  if (mins <= 0 || lastOllamaActivityMs === 0) return false;
  if (Date.now() - lastOllamaActivityMs >= mins * 60_000) {
    const out = await unloadOllamaModel(fetchImpl);
    if (out.ok) {
      appendAuditLog({
        type: 'system',
        sourceAgentId: 'ollama-unloader',
        sourceAgentName: 'Ollama Memória Őr',
        message: out.message,
        verifiedExecution: true,
      });
    }
    return out.ok;
  }
  return false;
}

/** M6: Warm up Ollama model into RAM for instant low-latency replies */
export async function warmOllamaModel(fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; model: string; message: string }> {
  const s = getState().settings;
  const baseUrl = s.ollamaUrl.replace(/\/$/, '');
  try {
    const res = await fetchImpl(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.ollamaModel,
        prompt: '',
        keep_alive: s.ollamaKeepAlive || '5m',
        options: { num_ctx: s.ollamaNumCtx || 2048 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { ok: false, model: s.ollamaModel, message: `Ollama HTTP ${res.status}` };
    }
    lastOllamaActivityMs = Date.now();
    return { ok: true, model: s.ollamaModel, message: `${s.ollamaModel} előtöltve (${s.ollamaKeepAlive || '5m'}, num_ctx=${s.ollamaNumCtx || 2048}).` };
  } catch (err) {
    return {
      ok: false,
      model: s.ollamaModel,
      message: `Ollama nem érhető el: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
  preset?: ExecutionPreset;
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
  ollamaNumCtx?: number;
  ollamaKeepAlive?: string;
  preset?: ExecutionPreset;
  images?: InlineMediaInput[];
  audio?: InlineMediaInput;
  tools?: OpenAiToolDefinition[];
  toolChoice?: unknown;
  onChunk?: (delta: string) => void;
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
  if (explicitModel) {
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
      return complexity === 'simple' ? 'gemini-4-hydrogen' : 'gemini-4-neon';
    case 'openrouter':
      return 'meta-llama/llama-3.3-70b-instruct:free';
    case 'openai':
      return complexity === 'simple' ? 'gpt-4o-mini' : 'gpt-4o';
    case 'anthropic':
      return complexity === 'simple' ? 'claude-3-5-haiku-latest' : 'claude-3-7-sonnet-latest';
  }
}

export async function defaultCallProvider(params: ProviderCallParams): Promise<ProviderCallOutput> {
  const temperature =
    params.preset === 'precise' ? 0.1 : params.preset === 'deep' ? 0.45 : 0.7;

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
    const config: Record<string, unknown> = { temperature };
    if (params.systemInstruction) {
      config.systemInstruction = params.systemInstruction;
    }
    if (params.preset === 'deep' && /gemini-4|gemini-3/i.test(params.model)) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (params.preset === 'fast' && /gemini-4|gemini-3/i.test(params.model)) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
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

    if (params.onChunk && (!params.tools || params.tools.length === 0)) {
      const stream = await ai.models.generateContentStream({
        model: params.model,
        contents: parts.length === 1 ? params.prompt : [{ role: 'user', parts }],
        config,
      });
      let acc = '';
      for await (const chunk of stream) {
        if (chunk.text) {
          acc += chunk.text;
          params.onChunk(chunk.text);
        }
      }
      return {
        text: acc,
        inputTokens: estimateTokens(params.prompt),
        outputTokens: estimateTokens(acc),
      };
    }

    const response = await ai.models.generateContent({
      model: params.model,
      contents: parts.length === 1 ? params.prompt : [{ role: 'user', parts }],
      config,
    });

    const fnCalls = response.functionCalls?.map((fc, idx) => ({
      id: `call_gem_${crypto.randomUUID().slice(0, 8)}_${idx}`,
      type: 'function' as const,
      function: {
        name: fc.name || 'tool',
        arguments: JSON.stringify(fc.args ?? {}),
      },
    }));

    if (params.onChunk && response.text) {
      params.onChunk(response.text);
    }

    return {
      text: response.text ?? '',
      inputTokens: response.usageMetadata?.promptTokenCount ?? estimateTokens(params.prompt),
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? estimateTokens(response.text ?? ''),
      toolCalls: fnCalls && fnCalls.length > 0 ? fnCalls : undefined,
    };
  }

  if (params.provider === 'ollama') {
    const userMsg: Record<string, unknown> = { role: 'user', content: params.prompt };
    if (params.images && params.images.length > 0) {
      userMsg.images = params.images.map((i) => i.dataBase64);
    }
    const useStream = Boolean(params.onChunk && (!params.tools || params.tools.length === 0));
    const res = await fetch(`${params.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        stream: useStream,
        keep_alive: params.ollamaKeepAlive || '5m',
        options: {
          num_ctx: params.ollamaNumCtx || 2048,
          temperature,
        },
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

    if (useStream && res.body && params.onChunk) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { message?: { content?: string } };
            if (obj.message?.content) {
              acc += obj.message.content;
              params.onChunk(obj.message.content);
            }
          } catch {
            // partial JSON line
          }
        }
      }
      return {
        text: acc,
        inputTokens: estimateTokens(params.prompt),
        outputTokens: estimateTokens(acc),
        headers: res.headers,
      };
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
    const textOut = data.message?.content ?? '';
    if (params.onChunk && textOut) params.onChunk(textOut);
    return {
      text: textOut,
      inputTokens: data.prompt_eval_count ?? estimateTokens(params.prompt),
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

    const useStream = Boolean(params.onChunk && (!params.tools || params.tools.length === 0));
    const payload: Record<string, unknown> = {
      model: params.model,
      temperature,
      stream: useStream,
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

    if (useStream && res.body && params.onChunk) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const clean = line.replace(/^data:\s*/, '').trim();
          if (!clean || clean === '[DONE]') continue;
          try {
            const parsed = JSON.parse(clean) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              params.onChunk(delta);
            }
          } catch {
            // partial
          }
        }
      }
      return {
        text: acc,
        inputTokens: estimateTokens(params.prompt),
        outputTokens: estimateTokens(acc),
        headers: res.headers,
      };
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
    const textOut = msg?.content ?? '';
    if (params.onChunk && textOut) params.onChunk(textOut);
    return {
      text: textOut,
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(params.prompt),
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
    temperature,
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
  if (params.onChunk && textOut) params.onChunk(textOut);
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
    inputTokens: data.usage?.input_tokens ?? estimateTokens(params.prompt),
    outputTokens: data.usage?.output_tokens ?? 100,
    headers: res.headers,
    toolCalls: toolUseCalls.length > 0 ? toolUseCalls : undefined,
  };
}

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
    // Fallback
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

/** Ú4: Real Image Generation via Gemini ('gemini-3.1-flash-lite-image') saved into MediaArtifacts */
export async function generateImageArtifactWithGemini(params: {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
  agentId?: string;
}): Promise<MediaArtifact> {
  const state = getState();
  const picked = pickNextPoolKey('gemini', state.settings.providerKeys.gemini, new Set());
  if (!picked) {
    throw new Error('Képgeneráláshoz legalább egy aktív Gemini API kulcs szükséges.');
  }
  const ai = new GoogleGenAI({
    apiKey: picked.secret,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: params.prompt,
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: params.aspectRatio || '1:1',
      },
    },
  });

  const candidates = response.candidates || [];
  let mimeType = 'image/png';
  let b64 = '';
  for (const c of candidates) {
    for (const part of c.content?.parts || []) {
      if (part.inlineData?.data) {
        b64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }
    if (b64) break;
  }

  if (!b64) {
    throw new Error('A Gemini képgeneráló modell nem adott vissza képadatot (ellenőrizd a jogosultságot vagy promptot).');
  }

  const artifact: MediaArtifact = {
    id: `art-img-${crypto.randomUUID().slice(0, 8)}`,
    kind: 'image',
    title: params.prompt.slice(0, 64),
    mimeType,
    urlOrContent: `data:${mimeType};base64,${b64}`,
    agentId: params.agentId,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.artifacts.unshift(artifact);
    s.artifacts = s.artifacts.slice(0, 50);
  });

  appendAuditLog({
    type: 'action',
    sourceAgentId: params.agentId || 'media-studio',
    sourceAgentName: 'Képstúdió',
    message: `Kép generálva (gemini-3.1-flash-lite-image): "${params.prompt.slice(0, 60)}"`,
    verifiedExecution: true,
  });

  return artifact;
}

/** Ú5: Speech-to-Text via local whisper-cli / whisper binary first, then Gemini multimodal audio */
export async function transcribeAudioBuffer(params: {
  dataBase64: string;
  mimeType: string;
}): Promise<{ text: string; engine: string }> {
  const buf = Buffer.from(params.dataBase64, 'base64');

  // 1. Probe local whisper binary for zero-cost offline transcription
  for (const bin of ['whisper-cli', 'whisper']) {
    try {
      const which = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (which) {
        const ext = params.mimeType.includes('wav') ? '.wav' : params.mimeType.includes('ogg') ? '.ogg' : '.webm';
        const tmpFile = path.join(os.tmpdir(), `ns-audio-${Date.now()}${ext}`);
        fs.writeFileSync(tmpFile, buf);
        try {
          const out = spawnSync(which, [tmpFile, '--output_format', 'txt'], { encoding: 'utf8', timeout: 25000 });
          if (out.status === 0 && out.stdout?.trim()) {
            return { text: out.stdout.trim(), engine: `local:${bin}` };
          }
        } finally {
          if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
        }
      }
    } catch {
      // try next
    }
  }

  // 2. Fallback to Gemini cloud multimodal transcription
  const state = getState();
  const picked = pickNextPoolKey('gemini', state.settings.providerKeys.gemini, new Set());
  if (!picked) {
    throw new Error('Sem lokális whisper bináris, sem aktív Gemini API kulcs nem érhető el a hangátíráshoz.');
  }
  const ai = new GoogleGenAI({
    apiKey: picked.secret,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Írd le pontosan szó szerint a hangfelvételt magyarul vagy az elhangzott nyelven. Csak a szöveget add vissza.' },
          { inlineData: { mimeType: params.mimeType || 'audio/webm', data: params.dataBase64 } },
        ],
      },
    ],
  });
  return {
    text: (response.text || '').trim(),
    engine: 'gemini-3.5-transcribe',
  };
}

export async function invokeStreamWithFailover(
  req: LlmInvokeRequest,
  onChunk: (delta: string) => void,
  deps: RouterDependencies = {}
): Promise<LlmInvokeResult> {
  return invokeWithFailoverInternal(req, deps, onChunk);
}

export async function invokeWithFailover(
  req: LlmInvokeRequest,
  deps: RouterDependencies = {}
): Promise<LlmInvokeResult> {
  return invokeWithFailoverInternal(req, deps, undefined);
}

async function invokeWithFailoverInternal(
  req: LlmInvokeRequest,
  deps: RouterDependencies = {},
  onChunk?: (delta: string) => void
): Promise<LlmInvokeResult> {
  const state = getState();
  const callProvider = deps.callProvider ?? defaultCallProvider;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const resolveSecret = deps.resolveSecret ?? resolveEffectiveKeySecret;

  const effectivePreset = req.preset ?? state.settings.defaultPreset ?? 'fast';

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
        `Napi globális költséglimit elérve ($${state.settings.dailySpendUsd.toFixed(4)} / $${state.settings.dailyCostLimitUsd.toFixed(2)}). Új hívások leállítva.`
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

  // M39 & M40: Build target candidate chain (agent modelChain + health-aware adaptive ordering)
  const recordProviderHealth = (provider: ProviderId, ok: boolean, latencyMs: number) => {
    updateState((s) => {
      s.gatewayAnalytics.providerHealth = s.gatewayAnalytics.providerHealth || ({} as NonNullable<typeof s.gatewayAnalytics.providerHealth>);
      const curr = s.gatewayAnalytics.providerHealth[provider] || {
        provider,
        totalCalls: 0,
        failedCalls: 0,
        avgLatencyMs: 0,
        lastLatencyMs: null,
      };
      curr.totalCalls += 1;
      if (!ok) {
        curr.failedCalls += 1;
        curr.lastErrorAt = new Date().toISOString();
      } else {
        curr.lastLatencyMs = latencyMs;
        const okCount = Math.max(1, curr.totalCalls - curr.failedCalls);
        curr.avgLatencyMs = Math.round((curr.avgLatencyMs * (okCount - 1) + latencyMs) / okCount);
      }
      s.gatewayAnalytics.providerHealth[provider] = curr;
    });
  };

  const agentRef = req.agentId ? state.agents.find((a) => a.id === req.agentId) : undefined;
  const rawSteps: Array<{ provider: ProviderId; model?: string }> = [];

  if (forceOllama) {
    rawSteps.push({ provider: 'ollama', model: req.preferredModel });
  } else {
    if (req.preferredProvider) {
      rawSteps.push({ provider: req.preferredProvider, model: req.preferredModel });
    }
    if (agentRef?.modelChain && agentRef.modelChain.length > 0) {
      for (const link of agentRef.modelChain) {
        if (link?.providerId) {
          rawSteps.push({ provider: link.providerId, model: link.modelId });
        }
      }
    }
    const baseProviders: ProviderId[] = [
      state.settings.primaryProvider,
      state.settings.secondaryProvider,
      'ollama',
    ];
    // M39: When no explicit preferredProvider is forced and agent has no modelChain, adaptively rank healthy/fast providers higher
    if (!req.preferredProvider && (!agentRef?.modelChain || agentRef.modelChain.length === 0) && state.gatewayAnalytics.providerHealth) {
      const healthMap = state.gatewayAnalytics.providerHealth;
      baseProviders.sort((a, b) => {
        if (a === 'ollama' && b !== 'ollama') return 1;
        if (b === 'ollama' && a !== 'ollama') return -1;
        const ha = healthMap[a];
        const hb = healthMap[b];
        if (!ha || ha.totalCalls < 2 || !hb || hb.totalCalls < 2) return 0;
        const errRateA = ha.failedCalls / ha.totalCalls;
        const errRateB = hb.failedCalls / hb.totalCalls;
        if (Math.abs(errRateA - errRateB) > 0.15) return errRateA - errRateB;
        return (ha.avgLatencyMs || 9999) - (hb.avgLatencyMs || 9999);
      });
    }
    for (const bp of baseProviders) {
      rawSteps.push({ provider: bp, model: bp === req.preferredProvider ? req.preferredModel : undefined });
    }
  }

  const seenStep = new Set<string>();
  const targetChain = rawSteps.filter((st) => {
    const key = `${st.provider}:${st.model || 'auto'}`;
    if (seenStep.has(key)) return false;
    seenStep.add(key);
    return true;
  });

  const allowCache =
    !onChunk &&
    state.settings.responseCacheEnabled &&
    !req.bypassCache &&
    (!req.images || req.images.length === 0) &&
    !req.audio &&
    (!req.tools || req.tools.length === 0);

  const firstStep = targetChain[0];
  const primaryCandidateModel = selectModelForProvider(
    firstStep.provider,
    req.complexity ?? 'simple',
    state,
    firstStep.model
  );
  if (allowCache) {
    const cacheKey = makeCacheKey(
      firstStep.provider,
      primaryCandidateModel,
      req.prompt,
      req.systemInstruction,
      effectivePreset
    );
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

  for (const stepTarget of targetChain) {
    const provider = stepTarget.provider;
    const model = selectModelForProvider(provider, req.complexity ?? 'simple', state, stepTarget.model);
    const pricing = classifyModelPricing(model, provider);
    const contextWin = provider === 'ollama' ? state.settings.ollamaNumCtx || 2048 : pricing.contextWindow;
    const diet = applyContextDiet(req.prompt, contextWin);

    if (provider === 'ollama') {
      const t0 = Date.now();
      try {
        const res = await callProvider({
          provider: 'ollama',
          model,
          apiKey: '',
          prompt: diet.trimmedPrompt,
          systemInstruction: req.systemInstruction,
          ollamaUrl: state.settings.ollamaUrl,
          ollamaNumCtx: state.settings.ollamaNumCtx,
          ollamaKeepAlive: state.settings.ollamaKeepAlive,
          preset: effectivePreset,
          images: req.images,
          audio: req.audio,
          tools: req.tools,
          toolChoice: req.toolChoice,
          onChunk,
        });
        lastOllamaActivityMs = Date.now();
        recordProviderHealth('ollama', true, Date.now() - t0);
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
        recordProviderHealth('ollama', false, Date.now() - t0);
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

      const t0 = Date.now();
      try {
        const res = await callProvider({
          provider,
          model,
          apiKey: picked.secret,
          prompt: diet.trimmedPrompt,
          systemInstruction: req.systemInstruction,
          ollamaUrl: state.settings.ollamaUrl,
          preset: effectivePreset,
          images: req.images,
          audio: req.audio,
          tools: req.tools,
          toolChoice: req.toolChoice,
          onChunk,
        });

        recordProviderHealth(provider, true, Date.now() - t0);
        const outGuard = evaluateGuardrails(res.text, 'output', state.settings);
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
          const cacheKey = makeCacheKey(
            firstStep.provider,
            primaryCandidateModel,
            req.prompt,
            req.systemInstruction,
            effectivePreset
          );
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
        recordProviderHealth(provider, false, Date.now() - t0);
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

