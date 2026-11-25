import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyModelPricing,
  discoverModels,
  extractQuotaFromHeaders,
  invokeWithFailover,
  resetKeyCursorsForTests,
  resetProviderCooldowns,
} from '../server/providers/router';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

test('Round-robin key pool rotation & failover chain (Gemini -> OpenRouter -> Ollama) with detailed error summary', async () => {
  resetKeyCursorsForTests();
  const state = createInitialState();
  state.settings.primaryProvider = 'gemini';
  state.settings.secondaryProvider = 'openrouter';
  state.settings.providerKeys.gemini = [
    { id: 'gem-1', label: 'Gemini Key 1', maskedKey: 'AIza...1111', enabled: true, failureCount: 0 },
    { id: 'gem-2', label: 'Gemini Key 2', maskedKey: 'AIza...2222', enabled: true, failureCount: 0 },
  ];
  state.settings.providerKeys.openrouter = [
    { id: 'or-1', label: 'OpenRouter Key 1', maskedKey: 'sk-o...9999', enabled: true, failureCount: 0 },
  ];
  resetInMemoryStateForTests(state);

  const secretMap: Record<string, string> = {
    'gem-1': 'secret-gem-1',
    'gem-2': 'secret-gem-2',
    'or-1': 'secret-or-1',
  };

  const calledKeys: string[] = [];

  // Fail both Gemini keys and OpenRouter key, succeed on local Ollama
  const res = await invokeWithFailover(
    { prompt: 'Hello router', complexity: 'simple' },
    {
      resolveSecret: (id) => secretMap[id] || '',
      sleep: async () => {},
      callProvider: async ({ provider, apiKey }) => {
        calledKeys.push(`${provider}:${apiKey || 'local'}`);
        if (provider === 'gemini') throw new Error('429 túl sok kérés');
        if (provider === 'openrouter') throw new Error('401 érvénytelen kulcs');
        return { text: 'Ollama fallback OK', inputTokens: 10, outputTokens: 5 };
      },
    }
  );

  assert.equal(res.provider, 'ollama');
  assert.equal(res.text, 'Ollama fallback OK');
  assert.deepEqual(calledKeys, [
    'gemini:secret-gem-1',
    'gemini:secret-gem-2',
    'openrouter:secret-or-1',
    'ollama:local',
  ]);

  // 429 errors placed Gemini keys on cooldown; 401 disabled OpenRouter key
  assert.ok(state.settings.providerKeys.gemini[0].cooldownUntil);
  assert.equal(state.settings.providerKeys.openrouter[0].enabled, false);
  assert.ok(state.settings.providerKeys.openrouter[0].disabledReason);

  resetProviderCooldowns();
  state.settings.providerKeys.openrouter[0].enabled = true;
  state.settings.providerKeys.openrouter[0].disabledReason = undefined;

  // If Ollama also fails, router returns graceful queued fallback AND records errorSummary listing ALL channels
  const totalOutageRes = await invokeWithFailover(
    { prompt: 'Total outage', complexity: 'simple' },
    {
      resolveSecret: (id) => secretMap[id] || '',
      sleep: async () => {},
      callProvider: async ({ provider }) => {
        if (provider === 'gemini') throw new Error('túl sok kérés');
        if (provider === 'openrouter') throw new Error('érvénytelen kulcs');
        throw new Error('időtúllépés');
      },
    }
  );
  assert.equal(totalOutageRes.queued, true);
  assert.equal(totalOutageRes.degradedMode, true);
  assert.ok(totalOutageRes.queueId);
  assert.match(totalOutageRes.errorSummary || '', /\[gemini\/Gemini Key 1\]: túl sok kérés/);
  assert.match(totalOutageRes.errorSummary || '', /\[openrouter\/OpenRouter Key 1\]: érvénytelen kulcs/);
  assert.match(totalOutageRes.errorSummary || '', /\[ollama\]: időtúllépés/);
});

test('Dynamic model discovery + local cost table + OpenRouter exact $0 free filtering', async () => {
  const state = createInitialState();
  state.settings.providerKeys.gemini = [
    { id: 'env-gemini-default', label: 'Env', maskedKey: 'AIza...env', enabled: true, failureCount: 0 },
  ];
  resetInMemoryStateForTests(state);

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(
        JSON.stringify({
          models: [
            { name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', inputTokenLimit: 1000000 },
            { name: 'models/gemini-4-argon', displayName: 'Gemini 4 Argon', inputTokenLimit: 2000000 },
          ],
        }),
        { status: 200, headers: { 'x-ratelimit-remaining-requests': '18', 'x-ratelimit-limit-requests': '30' } }
      );
    }
    if (url.includes('openrouter.ai')) {
      return new Response(
        JSON.stringify({
          data: [
            { id: 'meta-llama/llama-3.3-70b:free', name: 'Llama 3.3 Free', context_length: 128000, pricing: { prompt: '0', completion: '0' } },
            { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' } },
          ],
        }),
        { status: 200 }
      );
    }
    throw new Error('offline');
  };

  process.env.GEMINI_API_KEY = 'AIzaTestMockKeyForDiscovery';
  const { models } = await discoverModels({ fetchFn: fakeFetch });

  const gemHydrogen = models.find((m) => m.id === 'gemini-4-hydrogen');
  assert.ok(gemHydrogen);
  assert.equal(gemHydrogen.tier, 'budget');

  const orFree = models.find((m) => m.id === 'meta-llama/llama-3.3-70b:free');
  assert.ok(orFree);
  assert.equal(orFree.isFree, true);
  assert.equal(orFree.inputCostPer1M, 0);

  const orPaid = models.find((m) => m.id === 'anthropic/claude-3.7-sonnet');
  assert.ok(orPaid);
  assert.equal(orPaid.isFree, false);

  const pricingCheck = classifyModelPricing('gemini-3.1-flash-lite', 'gemini');
  assert.equal(pricingCheck.tier, 'free');
});

test('Real quota header parsing vs explicit isEstimated flag when headers are missing', () => {
  const realHeaders = new Headers({
    'x-ratelimit-remaining-requests': '18',
    'x-ratelimit-limit-requests': '30',
  });
  const realQuota = extractQuotaFromHeaders('openai', realHeaders);
  assert.equal(realQuota.isEstimated, false);
  assert.equal(realQuota.remainingRequests, 18);
  assert.equal(realQuota.limitRequests, 30);

  const emptyHeaders = new Headers();
  const estQuota = extractQuotaFromHeaders('gemini', emptyHeaders);
  assert.equal(estQuota.isEstimated, true);
  assert.equal(estQuota.remainingRequests, null);
});
