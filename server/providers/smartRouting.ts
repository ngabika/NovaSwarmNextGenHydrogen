import type {
  KeyModelMatrixEntry,
  ModelCapabilityFlags,
  ModelInfo,
  NovaSwarmState,
  ProviderId,
  ProviderKeyEntry,
  TaskType,
} from '../../shared/types';

export interface ClassifyTaskInput {
  prompt: string;
  systemInstruction?: string;
  complexity?: 'simple' | 'complex';
  taskType?: TaskType;
  estimatedPromptTokens?: number;
  hasImages?: boolean;
  hasAudio?: boolean;
  hasTools?: boolean;
  isEmbedding?: boolean;
}

export function classifyTaskType(input: ClassifyTaskInput): TaskType {
  if (input.taskType) return input.taskType;
  if (input.isEmbedding) return 'embedding';
  if (input.hasImages) return 'vision';
  if (input.hasAudio) return 'audio';

  const totalLen = (input.prompt?.length || 0) + (input.systemInstruction?.length || 0);
  if ((input.estimatedPromptTokens || 0) >= 24_000 || totalLen > 28_000) return 'long_context';

  const lower = `${input.systemInstruction || ''}\n${input.prompt || ''}`.toLowerCase();
  if (input.hasTools) return 'tool_heavy';

  const hasHardCodeCues =
    /\b(architektúra|architecture|refactor|refaktor|security audit|biztonsági audit|concurrency|race condition|deadlock|memory leak|debug|stack ?trace|database schema|migráció|migration|multi-file|teljes rendszer)\b/i.test(
      lower
    );
  const hasCodeCues =
    /\b(typescript|javascript|python|rust|bash|sql|dockerfile|systemd|regex|function|class |import |export |komponens|script|kód|program|algoritmus)\b/i.test(
      lower
    ) || /```/.test(lower);

  if (hasHardCodeCues || (hasCodeCues && (input.complexity === 'complex' || totalLen > 900))) {
    return 'code_hard';
  }
  if (hasCodeCues) {
    return 'code_simple';
  }

  if (
    /\b(összefoglal|summary|summarize|tldr|tl;dr|kivonat|digest|napló elemzés|főbb pontok)\b/i.test(lower)
  ) {
    return 'summarization';
  }

  if (
    input.complexity === 'complex' ||
    /\b(tervez|plan|stratégia|strategy|összehasonlít|compare|döntési mátrix|elemezd részletesen|kutass|deep research|critique|red-team)\b/i.test(
      lower
    ) ||
    totalLen > 1200
  ) {
    return 'complex_planning';
  }

  return 'simple_fast';
}

export interface ClassifiedProviderError {
  kind: 'auth_invalid' | 'daily_exhausted' | 'rpm_cooldown' | 'transient_5xx' | 'other';
  retryAfterMs: number;
  resetAtIso?: string;
  reason: string;
}

export function parseRetryAfterMs(
  headersOrText?: Headers | Record<string, string> | string,
  message = ''
): number | null {
  const headers = typeof headersOrText === 'string' ? undefined : headersOrText;
  const combinedText = typeof headersOrText === 'string' ? `${headersOrText}\n${message}` : message;

  const getHeader = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const rec = headers as Record<string, string>;
    const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? rec[key] : null;
  };

  const retryAfterMsRaw = getHeader('retry-after-ms');
  if (retryAfterMsRaw && Number.isFinite(Number(retryAfterMsRaw))) {
    return Math.max(500, Math.min(86_400_000, Number(retryAfterMsRaw)));
  }

  const retryAfter = getHeader('retry-after') || getHeader('x-ratelimit-reset-requests') || getHeader('x-ratelimit-reset');
  if (retryAfter) {
    const trimmed = retryAfter.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric >= 0) {
      if (numeric > 1_700_000_000) {
        return Math.max(1000, numeric * 1000 - Date.now());
      }
      return Math.max(1000, Math.min(86_400_000, Math.round(numeric * 1000)));
    }
    const durMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
    if (durMatch && (durMatch[1] || durMatch[2] || durMatch[3])) {
      const h = Number(durMatch[1] || 0) * 3_600_000;
      const m = Number(durMatch[2] || 0) * 60_000;
      const s = Number(durMatch[3] || 0) * 1000;
      return Math.max(1000, Math.round(h + m + s));
    }
    const dateMs = Date.parse(trimmed);
    if (!Number.isNaN(dateMs)) {
      return Math.max(1000, Math.min(86_400_000, dateMs - Date.now()));
    }
  }

  const bodySeconds = combinedText.match(
    /retry[-\s]*(?:in|after)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds|másodperc)\b/i
  );
  if (bodySeconds) {
    return Math.max(1000, Math.min(3_600_000, Math.round(Number(bodySeconds[1]) * 1000)));
  }
  return null;
}

function nextUtcResetIso(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0));
  return next.toISOString();
}

export function classifyProviderError(
  errorMessage: string,
  statusCode?: number,
  headers?: Headers | Record<string, string>
): ClassifiedProviderError {
  const msg = String(errorMessage || '');
  const code = statusCode ?? (msg.match(/\b(401|403|429|500|502|503|504)\b/)?.[1] ? Number(msg.match(/\b(401|403|429|500|502|503|504)\b/)![1]) : undefined);

  if (
    code === 401 ||
    code === 403 ||
    /\b(401|403|unauthorized|forbidden|invalid[_ ]api[_ ]key|api_key_invalid|érvénytelen kulcs|permission_denied|revoked)\b/i.test(
      msg
    )
  ) {
    return {
      kind: 'auth_invalid',
      retryAfterMs: 24 * 3_600_000,
      reason: `Érvénytelen/tiltott API kulcs (${code || 'auth'})`,
    };
  }

  const isDailyLimit =
    /\b(per[_ ]day|daily[_ ]limit|daily[_ ]quota|requests_per_day|rpd|day[_ ]limit|generate_requests_per_model_per_day|napi limit)\b/i.test(
      msg
    ) ||
    (/quota_exceeded|resource_exhausted/i.test(msg) && /\b(day|daily|nap)\b/i.test(msg));

  if (isDailyLimit) {
    const parsedMs = parseRetryAfterMs(headers, msg);
    const resetAtIso = parsedMs && parsedMs > 300_000
      ? new Date(Date.now() + parsedMs).toISOString()
      : nextUtcResetIso();
    const retryAfterMs = Math.max(3_600_000, Date.parse(resetAtIso) - Date.now());
    return {
      kind: 'daily_exhausted',
      retryAfterMs,
      resetAtIso,
      reason: 'Napi kvóta kimerült (resetig pihentetve)',
    };
  }

  if (
    code === 429 ||
    /\b(429|rate[_ ]?limit|too many requests|túl sok kérés|rpm|tpm|resource_exhausted|quota)\b/i.test(msg)
  ) {
    const parsedMs = parseRetryAfterMs(headers, msg) ?? 45_000;
    return {
      kind: 'rpm_cooldown',
      retryAfterMs: parsedMs,
      resetAtIso: new Date(Date.now() + parsedMs).toISOString(),
      reason: `RPM/TPM limit (${Math.ceil(parsedMs / 1000)}s pihenő)`,
    };
  }

  if (
    (code && code >= 500 && code <= 599) ||
    /\b(500|502|503|504|timeout|időtúllépés|econnreset|etimedout|econnrefused|fetch failed|temporarily unavailable|overloaded)\b/i.test(
      msg
    )
  ) {
    return {
      kind: 'transient_5xx',
      retryAfterMs: 1200,
      reason: `Átmeneti szerver/hálózati hiba (${code || '5xx/net'})`,
    };
  }

  return {
    kind: 'other',
    retryAfterMs: 15_000,
    reason: msg.slice(0, 140) || 'Ismeretlen szolgáltatói hiba',
  };
}

export function isModelBlocked(modelId: string, blocklist: string[] = []): boolean {
  const idLower = modelId.toLowerCase();
  for (const raw of blocklist) {
    const pat = raw.trim().toLowerCase();
    if (!pat) continue;
    if (pat === idLower) return true;
    if (pat.includes('*')) {
      const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      if (new RegExp(`^${escaped}$`, 'i').test(modelId)) return true;
    } else if (idLower.includes(pat)) {
      return true;
    }
  }
  return false;
}

export function inferCapabilitiesFromModelMeta(input: {
  id: string;
  provider: ProviderId;
  supportedGenerationMethods?: string[];
  inputModalities?: string[];
  supportedParameters?: string[];
}): ModelCapabilityFlags {
  const lower = input.id.toLowerCase();
  const isEmbed =
    /embed|minilm|bge-|e5-|text-embedding/i.test(lower) ||
    Boolean(input.supportedGenerationMethods?.some((m) => /embedContent/i.test(m)) && !input.supportedGenerationMethods?.some((m) => /generateContent/i.test(m)));

  const vision =
    Boolean(input.inputModalities?.some((m) => /image|vision|video/i.test(m))) ||
    /vision|llava|moondream|qwen.*vl|pixtral|gemini|gpt-4o|gpt-4\.1|gpt-5|claude-3|claude-4/i.test(lower);

  const audio =
    Boolean(input.inputModalities?.some((m) => /audio/i.test(m))) ||
    /gemini|whisper|audio|gpt-4o-audio/i.test(lower);

  const tools =
    Boolean(input.supportedParameters?.some((p) => /tools|function_calling/i.test(p))) ||
    (!isEmbed && !/moondream/i.test(lower));

  const reasoning =
    Boolean(input.supportedParameters?.some((p) => /reasoning|include_reasoning/i.test(p))) ||
    /\b(o1|o3|o4|r1|reasoning|thinking|pro|opus|sonnet|coder|70b|32b|14b|7b|3b)\b/i.test(lower);

  return {
    text: !isEmbed,
    vision,
    audio,
    tools,
    reasoning,
    embedding: isEmbed,
  };
}

export interface RankedModelCandidate {
  provider: ProviderId;
  modelId: string;
  isVirtualFallback: boolean;
  score: number;
  contextWindow: number;
  capabilities: ModelCapabilityFlags;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isFree: boolean;
  reason: string;
}

export function rankModelsForTask(input: {
  state: NovaSwarmState;
  taskType: TaskType;
  estimatedPromptTokens: number;
  preferredProvider?: ProviderId;
  preferredModel?: string;
  requiresVision?: boolean;
  requiresAudio?: boolean;
  requiresTools?: boolean;
}): RankedModelCandidate[] {
  const { state, taskType, estimatedPromptTokens, preferredProvider, preferredModel } = input;
  const nowMs = Date.now();
  const blocklist = state.settings.modelBlocklist || [];
  const matrix = state.keyModelMatrix || [];
  const discovered = state.discoveredModels || [];
  const providerOrder = state.settings.providerOrder || [
    state.settings.primaryProvider,
    state.settings.secondaryProvider,
    'gemini',
    'openrouter',
    'openai',
    'anthropic',
    'ollama',
  ];

  // Construct effective provider priority index
  const prioProviders: ProviderId[] = [];
  const pushProv = (p?: ProviderId) => {
    if (p && !prioProviders.includes(p)) prioProviders.push(p);
  };
  pushProv(preferredProvider);
  pushProv(state.settings.primaryProvider);
  pushProv(state.settings.secondaryProvider);
  for (const p of providerOrder) pushProv(p);
  pushProv('ollama');

  const ollamaBudgetMode =
    state.settings.ollamaOnlyMode ||
    (state.settings.dailyCostLimitEnabled &&
      state.settings.dailySpendUsd >= state.settings.dailyCostLimitUsd &&
      state.settings.dailyCloudCostFallbackToOllama !== false);

  // Deduplicate candidate (provider, modelId) slots
  const candidateMap = new Map<
    string,
    {
      provider: ProviderId;
      modelId: string;
      isVirtualFallback: boolean;
      contextWindow: number;
      capabilities: ModelCapabilityFlags;
      inputCostPer1M: number;
      outputCostPer1M: number;
      isFree: boolean;
      qualityScore: number;
      speedScore: number;
      avgLatencyMs: number;
      verPass: number;
      verFail: number;
      availableKeyCount: number;
    }
  >();

  const ensureCandidate = (
    provider: ProviderId,
    modelId: string,
    meta: {
      isVirtualFallback: boolean;
      contextWindow?: number;
      capabilities?: ModelCapabilityFlags;
      inputCostPer1M?: number;
      outputCostPer1M?: number;
      isFree?: boolean;
      qualityScore?: number;
      speedScore?: number;
    }
  ) => {
    if (modelId && isModelBlocked(modelId, blocklist)) return;
    const key = `${provider}::${modelId}`;
    const existing = candidateMap.get(key);
    const caps =
      meta.capabilities ??
      inferCapabilitiesFromModelMeta({
        id: modelId || 'auto',
        provider,
      });
    const inCost = meta.inputCostPer1M ?? (provider === 'ollama' ? 0 : 0.25);
    const outCost = meta.outputCostPer1M ?? (provider === 'ollama' ? 0 : 0.8);
    if (!existing) {
      candidateMap.set(key, {
        provider,
        modelId,
        isVirtualFallback: meta.isVirtualFallback,
        contextWindow: meta.contextWindow ?? (provider === 'ollama' ? state.settings.ollamaNumCtx || 4096 : 128000),
        capabilities: caps,
        inputCostPer1M: inCost,
        outputCostPer1M: outCost,
        isFree: meta.isFree ?? (provider === 'ollama' || (inCost === 0 && outCost === 0)),
        qualityScore: meta.qualityScore ?? 65,
        speedScore: meta.speedScore ?? 65,
        avgLatencyMs: 0,
        verPass: 0,
        verFail: 0,
        availableKeyCount: 0,
      });
    }
  };

  // Populate from matrix (authoritative per-key discovery records)
  for (const entry of matrix) {
    if (entry.status === 'disabled_invalid') continue;
    const keyObj = (state.settings.providerKeys[entry.provider] || []).find((k) => k.id === entry.keyId);
    if (!keyObj || !keyObj.enabled) continue;
    if (isModelBlocked(entry.modelId, blocklist)) continue;

    const dailyExhausted =
      entry.status === 'daily_exhausted' &&
      (!entry.resetAt || Date.parse(entry.resetAt) > nowMs);
    const rpmCooldown =
      entry.status === 'rpm_cooldown' &&
      Boolean(entry.cooldownUntil && Date.parse(entry.cooldownUntil) > nowMs);
    const keyCooldown = Boolean(keyObj.cooldownUntil && Date.parse(keyObj.cooldownUntil) > nowMs);

    ensureCandidate(entry.provider, entry.modelId, {
      isVirtualFallback: false,
      contextWindow: entry.contextWindow,
      capabilities: entry.capabilities,
      inputCostPer1M: entry.inputCostPer1M,
      outputCostPer1M: entry.outputCostPer1M,
      isFree: entry.isFree,
    });

    const slot = candidateMap.get(`${entry.provider}::${entry.modelId}`);
    if (slot) {
      if (!dailyExhausted && !rpmCooldown && !keyCooldown) {
        slot.availableKeyCount += 1;
      }
      slot.verPass += entry.verificationPassCount || 0;
      slot.verFail += entry.verificationFailCount || 0;
      if (entry.avgLatencyMs > 0) {
        slot.avgLatencyMs = slot.avgLatencyMs > 0 ? Math.round((slot.avgLatencyMs + entry.avgLatencyMs) / 2) : entry.avgLatencyMs;
      }
    }
  }

  // Populate from discoveredModels when keys exist (even if matrix wasn't populated yet)
  for (const m of discovered) {
    if (ollamaBudgetMode && m.provider !== 'ollama') continue;
    const keys = (state.settings.providerKeys[m.provider] || []).filter((k) => k.enabled);
    if (m.provider !== 'ollama' && keys.length === 0) continue;
    ensureCandidate(m.provider, m.id, {
      isVirtualFallback: false,
      contextWindow: m.contextWindow,
      capabilities: m.capabilities,
      inputCostPer1M: m.inputCostPer1M,
      outputCostPer1M: m.outputCostPer1M,
      isFree: m.isFree,
      qualityScore: m.qualityScore,
      speedScore: m.speedScore,
    });
    const slot = candidateMap.get(`${m.provider}::${m.id}`);
    if (slot && slot.availableKeyCount === 0) {
      const availKeys =
        m.provider === 'ollama'
          ? 1
          : keys.filter((k) => !(k.cooldownUntil && Date.parse(k.cooldownUntil) > nowMs)).length;
      slot.availableKeyCount = availKeys;
    }
  }

  // Ensure enabled cloud providers with NO discovered models still have an auto-dispatch slot (for mocked callProvider tests / pre-discovery keys)
  if (!ollamaBudgetMode) {
    for (const p of prioProviders) {
      if (p === 'ollama') continue;
      const enabledKeys = (state.settings.providerKeys[p] || []).filter((k) => k.enabled);
      if (enabledKeys.length === 0) continue;
      const hasAnyModelForProv = Array.from(candidateMap.values()).some((c) => c.provider === p);
      if (!hasAnyModelForProv) {
        const modelHint = preferredProvider === p && preferredModel ? preferredModel : '';
        ensureCandidate(p, modelHint, {
          isVirtualFallback: true,
          contextWindow: 128000,
          capabilities: { text: true, vision: p === 'gemini' || p === 'openai', audio: p === 'gemini', tools: true, reasoning: true, embedding: false },
          isFree: p === 'gemini' || p === 'openrouter',
        });
        const slot = candidateMap.get(`${p}::${modelHint}`);
        if (slot) {
          slot.availableKeyCount = enabledKeys.filter((k) => !(k.cooldownUntil && Date.parse(k.cooldownUntil) > nowMs)).length;
        }
      }
    }
  }

  // Always add local Ollama task-specialized candidate if configured (unless skipped in non-ollama tests that want pure cloud -> ollama order)
  const localOllamaCandidates: Array<{ id: string; caps: ModelCapabilityFlags; speed: number; quality: number }> = [];
  if (taskType === 'code_hard' || taskType === 'code_simple') {
    const codeId = state.settings.ollamaCodeModel?.trim() || state.settings.ollamaModel?.trim();
    if (codeId) {
      localOllamaCandidates.push({
        id: codeId,
        caps: { text: true, vision: false, audio: false, tools: true, reasoning: true, embedding: false },
        speed: 55,
        quality: 68,
      });
    }
  } else if (taskType === 'vision' && state.settings.ollamaVisionModel?.trim()) {
    localOllamaCandidates.push({
      id: state.settings.ollamaVisionModel.trim(),
      caps: { text: true, vision: true, audio: false, tools: false, reasoning: false, embedding: false },
      speed: 50,
      quality: 60,
    });
  } else if (taskType === 'simple_fast' && state.settings.ollamaFastModel?.trim()) {
    localOllamaCandidates.push({
      id: state.settings.ollamaFastModel.trim(),
      caps: { text: true, vision: false, audio: false, tools: true, reasoning: false, embedding: false },
      speed: 85,
      quality: 52,
    });
  } else if (taskType === 'embedding' && state.settings.ollamaEmbeddingModel?.trim()) {
    localOllamaCandidates.push({
      id: state.settings.ollamaEmbeddingModel.trim(),
      caps: { text: false, vision: false, audio: false, tools: false, reasoning: false, embedding: true },
      speed: 95,
      quality: 75,
    });
  }
  if (state.settings.ollamaModel?.trim()) {
    localOllamaCandidates.push({
      id: state.settings.ollamaModel.trim(),
      caps: { text: true, vision: false, audio: false, tools: true, reasoning: true, embedding: false },
      speed: 65,
      quality: 58,
    });
  }
  for (const loc of localOllamaCandidates) {
    ensureCandidate('ollama', loc.id, {
      isVirtualFallback: false,
      contextWindow: state.settings.ollamaNumCtx || 4096,
      capabilities: loc.caps,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      speedScore: loc.speed,
      qualityScore: loc.quality,
    });
    const slot = candidateMap.get(`ollama::${loc.id}`);
    if (slot) slot.availableKeyCount = 1;
  }

  const manualOverrides = (state.settings.taskModelRankingOverrides?.[taskType] || []).map((x) => x.trim().toLowerCase());

  const scored: RankedModelCandidate[] = [];
  for (const c of candidateMap.values()) {
    if (ollamaBudgetMode && c.provider !== 'ollama') continue;

    // Filter out candidates with zero available keys unless Ollama or virtual
    if (c.provider !== 'ollama' && c.availableKeyCount === 0) continue;

    // Capability checks
    if ((input.requiresVision || taskType === 'vision') && !c.capabilities.vision && c.provider !== 'ollama') continue;
    if ((input.requiresAudio || taskType === 'audio') && !c.capabilities.audio && c.provider !== 'ollama') continue;
    if (taskType === 'embedding' && !c.capabilities.embedding && c.provider !== 'ollama') continue;
    if (taskType !== 'embedding' && c.capabilities.embedding) continue;
    if (estimatedPromptTokens > 0 && c.contextWindow > 0 && estimatedPromptTokens > c.contextWindow * 1.15 && c.provider !== 'ollama') {
      continue;
    }

    let score = 1000;
    const reasons: string[] = [];

    // Explicit provider order baseline (keeps primary -> secondary -> rest -> ollama fallback!)
    const provIdx = prioProviders.indexOf(c.provider);
    if (c.provider === 'ollama') {
      const localPreferred = ollamaBudgetMode;
      score += localPreferred ? 5000 : -900;
      if (!localPreferred) reasons.push('helyi tartalék');
    } else {
      score += Math.max(0, 600 - (provIdx >= 0 ? provIdx : 6) * 80);
    }

    // Preferred explicit model boost
    if (preferredModel && c.modelId && c.modelId.toLowerCase() === preferredModel.toLowerCase()) {
      score += 450;
      reasons.push('előnyben részesített modell');
    }

    // Manual task-specific ranking override boost
    const overrideIdx = manualOverrides.findIndex(
      (o) => o === `${c.provider}:${c.modelId}`.toLowerCase() || o === c.modelId.toLowerCase()
    );
    if (overrideIdx >= 0) {
      score += 2000 - overrideIdx * 50;
      reasons.push(`manuális rangsor #${overrideIdx + 1}`);
    }

    // Task-type suitability scoring
    const lowerId = c.modelId.toLowerCase();
    const isBudgetOrFastModel = /\b(flash|lite|mini|haiku|small|nano|free|1\.5b|3b|0\.5b)\b/i.test(lowerId) || c.isFree;
    const isHeavyStrongModel = /\b(pro|opus|sonnet|gpt-4\.1|gpt-4o|gpt-5|o1|o3|o4|coder|70b|32b|14b|large|carbon|argon)\b/i.test(lowerId);

    if (taskType === 'simple_fast' || taskType === 'summarization') {
      if (isBudgetOrFastModel) {
        score += 220;
        reasons.push('gyors/olcsó feladathoz optimalizált');
      }
      if (c.isFree) score += 80;
      score -= Math.min(200, c.inputCostPer1M * 25);
    } else if (taskType === 'code_hard' || taskType === 'complex_planning' || taskType === 'tool_heavy') {
      if (isHeavyStrongModel) {
        score += 260;
        reasons.push('erős érvelő/kódoló modell');
      }
      if (c.capabilities.reasoning) score += 90;
      if (c.capabilities.tools) score += 70;
    } else if (taskType === 'code_simple') {
      if (/coder|flash|mini|haiku|3b|7b/i.test(lowerId)) score += 160;
    } else if (taskType === 'long_context') {
      score += Math.min(350, Math.round(c.contextWindow / 5000));
      reasons.push(`kontextus=${Math.round(c.contextWindow / 1000)}k`);
    } else if (taskType === 'vision') {
      if (c.capabilities.vision) score += 300;
    } else if (taskType === 'audio') {
      if (c.capabilities.audio) score += 300;
    }

    // Verification learning loop (reward verified models, penalize failed verifications)
    const totalVer = c.verPass + c.verFail;
    if (totalVer > 0) {
      const passRate = c.verPass / totalVer;
      const verDelta = Math.round((passRate - 0.5) * 260);
      score += verDelta;
      if (verDelta !== 0) {
        reasons.push(`verifikáció=${Math.round(passRate * 100)}%`);
      }
    }

    // Latency bonus (faster observed models rank slightly higher within same tier)
    if (c.avgLatencyMs > 0) {
      score += Math.max(-80, Math.min(80, Math.round((3000 - c.avgLatencyMs) / 40)));
    }

    scored.push({
      provider: c.provider,
      modelId: c.modelId,
      isVirtualFallback: c.isVirtualFallback,
      score,
      contextWindow: c.contextWindow,
      capabilities: c.capabilities,
      inputCostPer1M: c.inputCostPer1M,
      outputCostPer1M: c.outputCostPer1M,
      isFree: c.isFree,
      reason: reasons.join(', ') || `feladat=${taskType}`,
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}

export interface KeySelectionCandidate {
  key: ProviderKeyEntry;
  matrixEntry?: KeyModelMatrixEntry;
  utilizationRatio: number;
  activeConcurrency: number;
  preemptivelyThrottled: boolean;
}

export function selectLeastLoadedKeysForModel(input: {
  provider: ProviderId;
  modelId: string;
  keys: ProviderKeyEntry[];
  matrix: KeyModelMatrixEntry[];
  concurrencyMap: Map<string, number>;
  rpmUsageMap: Map<string, number[]>;
  tpmUsageMap: Map<string, Array<{ ts: number; tokens: number }>>;
  cursor: number;
}): KeySelectionCandidate[] {
  const nowMs = Date.now();
  const candidates: KeySelectionCandidate[] = [];

  for (const key of input.keys) {
    if (!key.enabled) continue;
    if (key.cooldownUntil && Date.parse(key.cooldownUntil) > nowMs) continue;
    if (key.dailyExhaustedUntil && Date.parse(key.dailyExhaustedUntil) > nowMs) continue;

    const matrixEntry = input.matrix.find((m) => m.keyId === key.id && m.modelId === input.modelId);
    if (matrixEntry) {
      if (matrixEntry.status === 'disabled_invalid') continue;
      if (matrixEntry.status === 'daily_exhausted' && (!matrixEntry.resetAt || Date.parse(matrixEntry.resetAt) > nowMs)) {
        continue;
      }
      if (matrixEntry.status === 'rpm_cooldown' && matrixEntry.cooldownUntil && Date.parse(matrixEntry.cooldownUntil) > nowMs) {
        continue;
      }
    }

    const pairKey = `${key.id}::${input.modelId || '*'}`;
    const recentReqs = (input.rpmUsageMap.get(pairKey) || []).filter((ts) => nowMs - ts < 60_000);
    const recentToks = (input.tpmUsageMap.get(pairKey) || [])
      .filter((x) => nowMs - x.ts < 60_000)
      .reduce((acc, x) => acc + x.tokens, 0);

    const rpmLimit = matrixEntry?.rpmLimit || key.rpmLimit || 15;
    const tpmLimit = matrixEntry?.tpmLimit || key.tpmLimit || 250_000;
    const rpmRatio = rpmLimit > 0 ? recentReqs.length / rpmLimit : 0;
    const tpmRatio = tpmLimit > 0 ? recentToks / tpmLimit : 0;
    const utilizationRatio = Math.max(rpmRatio, tpmRatio);
    const activeConcurrency = input.concurrencyMap.get(key.id) || 0;

    candidates.push({
      key,
      matrixEntry,
      utilizationRatio,
      activeConcurrency,
      preemptivelyThrottled: utilizationRatio >= 0.8,
    });
  }

  // Sort: non-preemptively-throttled first -> lowest active concurrency -> lowest utilization -> lowest failureCount -> rotated order
  const n = candidates.length;
  const orderIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    orderIndex.set(candidates[i].key.id, ((i - (input.cursor % Math.max(1, n))) + n) % Math.max(1, n));
  }

  return candidates.sort((a, b) => {
    if (a.preemptivelyThrottled !== b.preemptivelyThrottled) {
      return a.preemptivelyThrottled ? 1 : -1;
    }
    if (a.activeConcurrency !== b.activeConcurrency) {
      return a.activeConcurrency - b.activeConcurrency;
    }
    if (Math.abs(a.utilizationRatio - b.utilizationRatio) > 0.05) {
      return a.utilizationRatio - b.utilizationRatio;
    }
    if (a.key.failureCount !== b.key.failureCount) {
      return a.key.failureCount - b.key.failureCount;
    }
    return (orderIndex.get(a.key.id) ?? 0) - (orderIndex.get(b.key.id) ?? 0);
  });
}

export interface GeminiProjectSharingReport {
  totalKeys: number;
  enabledKeys: number;
  distinctProjects: number;
  sharedProjects: Array<{ projectId: string; keyCount: number; keyLabels: string[] }>;
  unassignedCount: number;
  hasSharedProjectRisk: boolean;
  warningHu: string | null;
}

export function analyzeGeminiProjectSharing(geminiKeys: ProviderKeyEntry[]): GeminiProjectSharingReport {
  const enabled = geminiKeys.filter((k) => k.enabled);
  const byProj = new Map<string, ProviderKeyEntry[]>();
  let unassignedCount = 0;

  for (const k of enabled) {
    const pid = (k.projectId || '').trim();
    if (!pid) {
      unassignedCount += 1;
      continue;
    }
    const list = byProj.get(pid) || [];
    list.push(k);
    byProj.set(pid, list);
  }

  const sharedProjects = Array.from(byProj.entries())
    .filter(([, list]) => list.length > 1)
    .map(([projectId, list]) => ({
      projectId,
      keyCount: list.length,
      keyLabels: list.map((k) => k.label),
    }));

  const hasSharedProjectRisk =
    sharedProjects.length > 0 || (enabled.length >= 2 && (unassignedCount >= 2 || byProj.size <= 1));

  let warningHu: string | null = null;
  if (sharedProjects.length > 0) {
    const desc = sharedProjects.map((s) => `"${s.projectId}" (${s.keyCount} kulcs)`).join(', ');
    warningHu = `Figyelem: a Gemini API kvótája Google Cloud projektenként érvényes. Azonos projektbe tartozó kulcsok közös kvótán osztoznak: ${desc}. Másik Google Cloud projektet vagy másodlagos szolgáltatót (OpenRouter/Ollama) használj a valódi kapacitásbővítéshez.`;
  } else if (enabled.length >= 2 && unassignedCount > 0) {
    warningHu = `Tipp: A Gemini kvóta Google Cloud projektenként számít. Add meg a kulcsokhoz tartozó projekt-azonosítót (projectId), így a router látni fogja, mely kulcsok osztoznak ugyanazon a projektkereten.`;
  }

  return {
    totalKeys: geminiKeys.length,
    enabledKeys: enabled.length,
    distinctProjects: byProj.size,
    sharedProjects,
    unassignedCount,
    hasSharedProjectRisk,
    warningHu,
  };
}
