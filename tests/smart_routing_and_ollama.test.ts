import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  addProviderKeysBulk,
  clearResponseCache,
  discoverModels,
  getLlmQueueStatus,
  invokeWithFailover,
  processLlmRequestQueueTick,
  reportModelVerificationOutcome,
  resetKeyCursorsForTests,
  resetProviderCooldowns,
} from '../server/providers/router';
import {
  analyzeGeminiProjectSharing,
  classifyProviderError,
  classifyTaskType,
  parseRetryAfterMs,
  rankModelsForTask,
} from '../server/providers/smartRouting';
import { runAgentWithTools } from '../server/agents/engine';
import {
  benchmarkOllamaModel,
  reselectOllamaSuite,
  selectOptimalOllamaSuite,
} from '../server/system/ollamaSelector';
import { createInitialState, getState, resetInMemoryStateForTests } from '../server/state/store';

function collectServerTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...collectServerTsFiles(full));
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

test('Static architectural boundary: ONLY server/providers/router.ts may call AI/Ollama APIs or import @google/genai', () => {
  const serverDir = path.join(process.cwd(), 'server');
  const routerPath = path.resolve(serverDir, 'providers', 'router.ts');
  const files = collectServerTsFiles(serverDir);

  const forbiddenPatterns: Array<{ name: string; re: RegExp }> = [
    { name: '@google/genai import', re: /['"]@google\/genai['"]/ },
    { name: 'generativelanguage endpoint', re: /generativelanguage\.googleapis\.com/ },
    { name: 'openai endpoint', re: /api\.openai\.com/ },
    { name: 'anthropic endpoint', re: /api\.anthropic\.com/ },
    { name: 'openrouter endpoint', re: /openrouter\.ai/ },
    { name: 'groq/mistral endpoint', re: /api\.(groq|mistral)\.com|api\.mistral\.ai/ },
    { name: 'direct Ollama HTTP path', re: /\/api\/(?:chat|generate|embed|embeddings|tags|pull)\b/ },
    { name: 'hardcoded gemini-4-* literal', re: /gemini-4-(?:hydrogen|argon|helium)/i },
  ];

  const violations: string[] = [];
  for (const file of files) {
    if (path.resolve(file) === routerPath) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pat of forbiddenPatterns) {
      if (pat.re.test(content)) {
        violations.push(`${path.relative(process.cwd(), file)}: matched ${pat.name}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Közvetlen szolgáltatói hívások találhatók a router.ts-en kívül: ${violations.join('; ')}`);
});

test('Model -> Least-loaded Key1 -> Key2 -> Model2 -> Local Ollama -> Queue & auto-resume', async () => {
  resetKeyCursorsForTests();
  clearResponseCache();

  const state = createInitialState();
  state.settings.primaryProvider = 'gemini';
  state.settings.secondaryProvider = 'openrouter';
  state.settings.providerOrder = ['gemini', 'openrouter', 'openai', 'anthropic', 'ollama'];
  state.settings.ollamaModel = 'qwen2.5:3b';
  state.settings.providerKeys.gemini = [
    {
      id: 'gem-k1',
      label: 'Gem Proj1',
      maskedKey: 'AIza...0001',
      enabled: true,
      projectId: 'proj-alpha',
      failureCount: 0,
      rpmLimit: 15,
      requestsLastMinute: 0,
    },
    {
      id: 'gem-k2',
      label: 'Gem Proj2',
      maskedKey: 'AIza...0002',
      enabled: true,
      projectId: 'proj-beta',
      failureCount: 0,
      rpmLimit: 15,
      requestsLastMinute: 0,
    },
  ];
  state.settings.providerKeys.openrouter = [
    {
      id: 'or-k1',
      label: 'OR Key1',
      maskedKey: 'sk-o...0003',
      enabled: true,
      failureCount: 0,
      rpmLimit: 20,
      requestsLastMinute: 0,
    },
  ];
  state.discoveredModels = [
    {
      id: 'gemini-best',
      name: 'Gemini Best',
      provider: 'gemini',
      contextWindow: 1000000,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      tier: 'free',
      source: 'api',
      qualityScore: 90,
      speedScore: 95,
    },
    {
      id: 'or-backup',
      name: 'OR Backup',
      provider: 'openrouter',
      contextWindow: 128000,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      tier: 'free',
      source: 'api',
      qualityScore: 80,
      speedScore: 85,
    },
  ];
  resetInMemoryStateForTests(state);

  const secretMap: Record<string, string> = {
    'gem-k1': 'secret-alpha-key',
    'gem-k2': 'secret-beta-key',
    'or-k1': 'secret-or-key',
  };

  // Phase 1: Both gem keys on Model1 fail with 429, Model2 succeeds
  const calls1: string[] = [];
  const res1 = await invokeWithFailover(
    { prompt: 'Quick summary please', taskType: 'simple_fast', bypassCache: true },
    {
      resolveSecret: (id) => secretMap[id] || '',
      sleep: async () => {},
      callProvider: async ({ provider, model, apiKey }) => {
        calls1.push(`${provider}/${model}:${apiKey || 'local'}`);
        if (provider === 'gemini') throw new Error('HTTP 429 Retry-After: 5 rate limit');
        if (provider === 'openrouter') return { text: 'Model2 succeeded', inputTokens: 12, outputTokens: 8 };
        return { text: 'Ollama backup', inputTokens: 10, outputTokens: 5 };
      },
    }
  );
  assert.equal(res1.provider, 'openrouter');
  assert.equal(res1.model, 'or-backup');
  assert.equal(res1.degradedMode, false);
  assert.deepEqual(calls1, [
    'gemini/gemini-best:secret-alpha-key',
    'gemini/gemini-best:secret-beta-key',
    'openrouter/or-backup:secret-or-key',
  ]);

  // Phase 2: All cloud models exhausted -> local Ollama succeeds in degradedMode
  resetProviderCooldowns();
  const res2 = await invokeWithFailover(
    { prompt: 'Need backup answer', taskType: 'simple_fast', bypassCache: true },
    {
      resolveSecret: (id) => secretMap[id] || '',
      sleep: async () => {},
      callProvider: async ({ provider }) => {
        if (provider !== 'ollama') throw new Error('429 rate limit');
        return { text: 'Local Ollama answered', inputTokens: 8, outputTokens: 6 };
      },
    }
  );
  assert.equal(res2.provider, 'ollama');
  assert.equal(res2.degradedMode, true);
  assert.equal(res2.strictVerificationRequired, true);

  // Phase 3: Everything including Ollama fails -> Request queued instead of throwing; clears on queue drain
  resetProviderCooldowns();
  const res3 = await invokeWithFailover(
    { prompt: 'Critical background work', taskType: 'simple_fast', bypassCache: true },
    {
      resolveSecret: (id) => secretMap[id] || '',
      sleep: async () => {},
      callProvider: async () => {
        throw new Error('429 all quota exhausted');
      },
    }
  );
  assert.equal(res3.queued, true);
  assert.ok(res3.queueId);
  assert.equal(getLlmQueueStatus().length, 1);

  // Clear cooldowns and force queue item ready -> processLlmRequestQueueTick drains it via working provider
  resetProviderCooldowns();
  const qItem = (getState().queuedLlmRequests || [])[0];
  if (qItem) qItem.readyAt = new Date(Date.now() - 1000).toISOString();
  const drainOut = await processLlmRequestQueueTick({
    resolveSecret: (id) => secretMap[id] || '',
    sleep: async () => {},
    callProvider: async ({ provider }) => {
      if (provider === 'gemini') return { text: 'Resumed cleanly after cooldown', inputTokens: 10, outputTokens: 10 };
      throw new Error('not needed');
    },
  });
  assert.equal(drainOut.processed, 1);
  assert.equal(drainOut.completed, 1);
  assert.equal(getLlmQueueStatus().length, 0);
});

test('Smart error handling: Retry-After, daily_exhausted vs rpm_cooldown, 401 auto-disable, 5xx short retry, 80% preemptive load spread', async () => {
  assert.equal(parseRetryAfterMs('Retry-After: 42 seconds'), 42000);
  const daily = classifyProviderError('429 Quota exceeded for requests per day (RPD daily limit)', 429);
  assert.equal(daily.kind, 'daily_exhausted');
  const rpm = classifyProviderError('429 too many requests per minute', 429);
  assert.equal(rpm.kind, 'rpm_cooldown');
  const inv = classifyProviderError('401 Unauthorized invalid api key', 401);
  assert.equal(inv.kind, 'auth_invalid');
  const srv = classifyProviderError('503 Service Unavailable', 503);
  assert.equal(srv.kind, 'transient_5xx');

  resetKeyCursorsForTests();
  clearResponseCache();
  const state = createInitialState();
  state.settings.primaryProvider = 'gemini';
  state.settings.secondaryProvider = 'ollama';
  state.settings.providerKeys.gemini = [
    {
      id: 'gem-busy',
      label: 'Busy Key 90%',
      maskedKey: 'AIza...busy',
      enabled: true,
      failureCount: 0,
      rpmLimit: 10,
      requestsLastMinute: 9, // 90% >= 80% threshold -> preemptive shift to gem-free
    },
    {
      id: 'gem-free',
      label: 'Idle Key 10%',
      maskedKey: 'AIza...idle',
      enabled: true,
      failureCount: 0,
      rpmLimit: 10,
      requestsLastMinute: 1,
    },
    {
      id: 'gem-bad',
      label: 'Broken Key',
      maskedKey: 'AIza...bad0',
      enabled: true,
      failureCount: 0,
      rpmLimit: 10,
      requestsLastMinute: 99,
    },
  ];
  state.discoveredModels = [
    {
      id: 'gemini-workhorse',
      name: 'Gemini Workhorse',
      provider: 'gemini',
      contextWindow: 128000,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      tier: 'free',
      source: 'api',
      qualityScore: 80,
      speedScore: 85,
    },
  ];
  resetInMemoryStateForTests(state);

  // Also test 5xx transient retry succeeds cleanly on second attempt without disabling key
  let attemptsOnFree = 0;
  const res = await invokeWithFailover(
    { prompt: 'Hello load balancer', taskType: 'simple_fast', bypassCache: true },
    {
      resolveSecret: (id) => `sec-${id}`,
      sleep: async () => {},
      callProvider: async ({ apiKey }) => {
        assert.equal(apiKey, 'sec-gem-free', 'Router should preemptively pick least-loaded key (<80% RPM)');
        attemptsOnFree += 1;
        if (attemptsOnFree === 1) throw new Error('HTTP 503 Temporary outage');
        return { text: 'Recovered on retry', inputTokens: 10, outputTokens: 6 };
      },
    }
  );
  assert.equal(res.text, 'Recovered on retry');
  assert.equal(attemptsOnFree, 2);
  assert.equal(getState().settings.providerKeys.gemini[1].enabled, true);
});

test('Task-based classification, cross-provider ranking, user blocklist & verification learning', () => {
  assert.equal(classifyTaskType({ prompt: 'Hello' }), 'simple_fast');
  assert.equal(classifyTaskType({ prompt: 'Refactor TypeScript architecture and fix concurrency bug in stack trace' }), 'code_hard');
  assert.equal(classifyTaskType({ prompt: 'Analyze image', hasImages: true }), 'vision');
  assert.equal(classifyTaskType({ prompt: 'Long doc', estimatedPromptTokens: 60000 }), 'long_context');

  const state = createInitialState();
  state.settings.primaryProvider = 'gemini';
  state.settings.secondaryProvider = 'openrouter';
  state.settings.providerKeys.gemini = [{ id: 'g1', label: 'G1', maskedKey: 'AIza...g1', enabled: true, failureCount: 0 }];
  state.settings.providerKeys.openrouter = [{ id: 'o1', label: 'O1', maskedKey: 'sk-o...o1', enabled: true, failureCount: 0 }];
  state.settings.modelBlocklist = ['banned-model'];
  state.discoveredModels = [
    {
      id: 'banned-model',
      name: 'Banned',
      provider: 'gemini',
      contextWindow: 128000,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      tier: 'free',
      source: 'api',
    },
    {
      id: 'fast-flash',
      name: 'Fast Flash',
      provider: 'gemini',
      contextWindow: 128000,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      tier: 'free',
      source: 'api',
      capabilities: { text: true, vision: false, audio: false, tools: true, reasoning: false, embedding: false },
      qualityScore: 72,
      speedScore: 95,
    },
    {
      id: 'deep-coder-pro',
      name: 'Deep Coder Pro',
      provider: 'openrouter',
      contextWindow: 200000,
      inputCostPer1M: 1.5,
      outputCostPer1M: 4.5,
      isFree: false,
      tier: 'flagship',
      source: 'api',
      capabilities: { text: true, vision: true, audio: false, tools: true, reasoning: true, embedding: false },
      qualityScore: 96,
      speedScore: 65,
    },
  ];
  resetInMemoryStateForTests(state);

  const simpleRank = rankModelsForTask({ state: getState(), taskType: 'simple_fast', estimatedPromptTokens: 50 });
  assert.equal(simpleRank.some((m) => m.modelId === 'banned-model'), false, 'User blocklist must exclude model');
  assert.equal(simpleRank[0].modelId, 'fast-flash');

  const codeHardRank = rankModelsForTask({ state: getState(), taskType: 'code_hard', estimatedPromptTokens: 2000 });
  assert.equal(codeHardRank[0].modelId, 'deep-coder-pro');

  const visionRank = rankModelsForTask({ state: getState(), taskType: 'vision', estimatedPromptTokens: 500, requiresVision: true });
  assert.equal(visionRank.some((m) => m.modelId === 'fast-flash'), false, 'Vision task filters non-vision models');

  // Record verification failures on deep-coder-pro and passes on fast-flash -> feedback updates matrix
  const stForMatrix = getState();
  stForMatrix.keyModelMatrix = stForMatrix.keyModelMatrix || [];
  stForMatrix.keyModelMatrix.push(
    {
      keyId: 'o1',
      keyLabel: 'O1',
      maskedKey: 'sk-o...o1',
      provider: 'openrouter',
      modelId: 'deep-coder-pro',
      contextWindow: 200000,
      capabilities: { text: true, vision: true, audio: false, tools: true, reasoning: true, embedding: false },
      inputCostPer1M: 1.5,
      outputCostPer1M: 4.5,
      isFree: false,
      status: 'available',
      requestsLastMinute: 0,
      tokensLastMinute: 0,
      rpmLimit: 30,
      tpmLimit: 60000,
      successCount: 1,
      failureCount: 0,
      verificationPassCount: 0,
      verificationFailCount: 0,
      avgLatencyMs: 800,
      discoveredAt: new Date().toISOString(),
    },
    {
      keyId: 'g1',
      keyLabel: 'G1',
      maskedKey: 'AIza...g1',
      provider: 'gemini',
      modelId: 'fast-flash',
      contextWindow: 128000,
      capabilities: { text: true, vision: false, audio: false, tools: true, reasoning: false, embedding: false },
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      isFree: true,
      status: 'available',
      requestsLastMinute: 0,
      tokensLastMinute: 0,
      rpmLimit: 30,
      tpmLimit: 60000,
      successCount: 1,
      failureCount: 0,
      verificationPassCount: 0,
      verificationFailCount: 0,
      avgLatencyMs: 400,
      discoveredAt: new Date().toISOString(),
    }
  );
  reportModelVerificationOutcome('openrouter', 'deep-coder-pro', 'o1', false);
  reportModelVerificationOutcome('openrouter', 'deep-coder-pro', 'o1', false);
  reportModelVerificationOutcome('gemini', 'fast-flash', 'g1', true);
  assert.ok((getState().keyModelMatrix || []).some((m) => m.modelId === 'deep-coder-pro' && m.verificationFailCount >= 2));
  assert.ok((getState().keyModelMatrix || []).some((m) => m.modelId === 'fast-flash' && m.verificationPassCount >= 1));
});

test('Strict degraded-mode verification triggers deterministic warning on unverified local Ollama claim', async () => {
  const state = createInitialState();
  state.settings.ollamaOnlyMode = true;
  state.settings.ollamaModel = 'qwen2.5:1.5b';
  resetInMemoryStateForTests(state);

  const agent = state.agents[0];
  const result = await runAgentWithTools({
    agent,
    prompt: 'Kérlek telepítsd a nginx csomagot és indítsd el!',
    complexity: 'simple',
    isolationMode: 'sandboxed',
    routerDeps: {
      callProvider: async () => ({
        text: 'A csomagot sikeresen telepítettem és elindítottam a szerveren.',
        inputTokens: 20,
        outputTokens: 15,
      }),
    },
  });

  assert.equal(result.degradedMode, true);
  assert.match(result.text, /Szigorú Degraded Verifikáció/i);
});

test('Bulk key import, Gemini project sharing warning & zero raw-secret leakage in state/matrix/logs', async () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  const res = addProviderKeysBulk({
    provider: 'gemini',
    rawKeysText: 'AIzaSyTestSecretOne123456\nAIzaSyTestSecretTwo654321',
    labelPrefix: 'Csaladi',
    projectId: 'same-gcp-proj',
  });
  assert.equal(res.added.length, 2);
  assert.equal(res.geminiProjectReport?.hasSharedProjectRisk, true);
  assert.match(res.geminiProjectReport?.warningHu || '', /projektenként/);

  const rep = analyzeGeminiProjectSharing(getState().settings.providerKeys.gemini);
  assert.equal(rep.sharedProjects.length, 1);

  await discoverModels({
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', inputTokenLimit: 1000000 }],
        }),
        { status: 200 }
      ),
  });

  const serializedState = JSON.stringify(getState());
  assert.equal(serializedState.includes('AIzaSyTestSecretOne123456'), false);
  assert.equal(serializedState.includes('AIzaSyTestSecretTwo654321'), false);
});

test('Hardware-aware Ollama selector: 2GB Pi vs 8GB CPU vs 24GB GPU, low-disk step-down, missing manifest fallback & benchmark', async () => {
  // 1) 2GB Raspberry Pi (ARM + SD card)
  const piSel = await selectOptimalOllamaSuite({
    arch: 'arm64',
    platform: 'linux',
    isArm: true,
    isRaspberryPi: true,
    boardModel: 'Raspberry Pi 4 Model B Rev 1.4',
    cpuCores: 4,
    cpuFlags: ['neon'],
    hasAvx2: false,
    hasNeon: true,
    ramTotalMb: 2048,
    ramFreeMb: 1200,
    swapTotalMb: 1024,
    zramPresent: true,
    diskFreeMb: 16000,
    storageKind: 'sd_or_emmc',
    gpuVendor: 'none',
    gpuName: 'None',
    gpuVramMb: 0,
  });
  assert.equal(piSel.tier, 'ultra_light_pi');
  assert.equal(piSel.singleModelMutex, true);
  assert.equal(piSel.sdCardSparingMode, true);
  assert.ok(piSel.mainModelParamsB <= 1.5);
  assert.equal(piSel.embeddingModel, 'all-minilm');

  // 2) 8GB CPU-only x86 desktop
  const cpu8Sel = await selectOptimalOllamaSuite({
    arch: 'x64',
    platform: 'linux',
    isArm: false,
    isRaspberryPi: false,
    boardModel: 'Generic x64',
    cpuCores: 8,
    cpuFlags: ['avx2'],
    hasAvx2: true,
    hasNeon: false,
    ramTotalMb: 8192,
    ramFreeMb: 5500,
    swapTotalMb: 2048,
    zramPresent: false,
    diskFreeMb: 60000,
    storageKind: 'ssd_or_nvme',
    gpuVendor: 'none',
    gpuName: 'None',
    gpuVramMb: 0,
  });
  assert.equal(cpu8Sel.tier, 'standard_desktop');
  assert.ok(cpu8Sel.mainModelParamsB >= 3 && cpu8Sel.mainModelParamsB <= 4);

  // 3) 24GB VRAM NVIDIA GPU workstation
  const gpu24Sel = await selectOptimalOllamaSuite({
    arch: 'x64',
    platform: 'linux',
    isArm: false,
    isRaspberryPi: false,
    boardModel: 'Workstation',
    cpuCores: 16,
    cpuFlags: ['avx2'],
    hasAvx2: true,
    hasNeon: false,
    ramTotalMb: 65536,
    ramFreeMb: 52000,
    swapTotalMb: 8192,
    zramPresent: false,
    diskFreeMb: 250000,
    storageKind: 'ssd_or_nvme',
    gpuVendor: 'nvidia',
    gpuName: 'RTX 4090',
    gpuVramMb: 24576,
  });
  assert.equal(gpu24Sel.tier, 'workstation_gpu');
  assert.ok(gpu24Sel.mainModelParamsB >= 14);
  assert.equal(gpu24Sel.gpuLayers, 999);

  // 4) Low free disk steps down cleanly from 32B/14B to small model
  const lowDiskSel = await selectOptimalOllamaSuite({
    arch: 'x64',
    platform: 'linux',
    isArm: false,
    isRaspberryPi: false,
    boardModel: 'Workstation',
    cpuCores: 16,
    cpuFlags: ['avx2'],
    hasAvx2: true,
    hasNeon: false,
    ramTotalMb: 65536,
    ramFreeMb: 52000,
    swapTotalMb: 8192,
    zramPresent: false,
    diskFreeMb: 2800, // < 3GB disk free
    storageKind: 'ssd_or_nvme',
    gpuVendor: 'nvidia',
    gpuName: 'RTX 4090',
    gpuVramMb: 24576,
  });
  assert.ok(lowDiskSel.mainModelParamsB <= 3);
  assert.ok(lowDiskSel.skippedCandidates.some((s) => /lemez|tárhely/i.test(s.reason)));

  // 5) Missing/404 registry model steps down automatically to next available catalog entry
  const fallbackSel = await selectOptimalOllamaSuite(
    {
      arch: 'x64',
      platform: 'linux',
      isArm: false,
      isRaspberryPi: false,
      boardModel: 'PC',
      cpuCores: 8,
      cpuFlags: ['avx2'],
      hasAvx2: true,
      hasNeon: false,
      ramTotalMb: 8192,
      ramFreeMb: 5500,
      swapTotalMb: 2048,
      zramPresent: false,
      diskFreeMb: 60000,
      storageKind: 'ssd_or_nvme',
      gpuVendor: 'none',
      gpuName: 'None',
      gpuVramMb: 0,
    },
    {
      verifyCandidate: async (name) =>
        name === 'qwen2.5:3b'
          ? { available: false, source: 'registry_manifest', reason: 'HTTP 404' }
          : { available: true, source: 'registry_manifest' },
    }
  );
  assert.notEqual(fallbackSel.mainModel, 'qwen2.5:3b');
  assert.ok(fallbackSel.skippedCandidates.some((s) => s.model === 'qwen2.5:3b'));

  // 6) Full reselectOllamaSuite returns cleanup suggestions & persists benchmark telemetry
  resetInMemoryStateForTests(createInitialState());
  const reselect = await reselectOllamaSuite({
    pullMissing: false,
    runBenchmark: true,
    hardwareOverrides: {
      ramTotalMb: 8192,
      ramFreeMb: 5500,
      diskFreeMb: 60000,
      gpuVramMb: 0,
    },
    listInstalledModelsFn: async () => ['obsolete-llama:7b', 'qwen2.5:3b'],
    verifyCandidate: async () => ({ available: true, source: 'local_tags' }),
    benchmarkFn: async (model) =>
      benchmarkOllamaModel(model, {
        invokeGenerateFn: async () => ({
          text: 'Hardver teszt rendben.',
          tokensPerSec: 18.4,
          latencyMs: 210,
        }),
      }),
  });
  assert.deepEqual(reselect.cleanupSuggestions, ['obsolete-llama:7b']);
  assert.equal(getState().settings.ollamaBenchmark?.tokensPerSec, 18.4);
});
