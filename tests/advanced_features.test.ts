import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { runAutonomousKanbanWorkerTick } from '../server/agents/engine';
import { createOpenAiProxyRouter } from '../server/gateway/openaiProxy';
import { callMcpTool, listMcpTools, registerMcpServer } from '../server/mcp/manager';
import { addPersistentMemoryAsync, searchMemoriesAsync } from '../server/memory/vectorStore';
import { detectActiveSandboxBackend } from '../server/sandbox/supervisorSandbox';
import {
  authenticateOperatorPassword,
  isRequestAuthorized,
  requireWebAuthMiddleware,
  verifySessionToken,
} from '../server/security/auth';
import { getState, setWebAuthPassword, updateState } from '../server/state/store';
import { checkOtaUpdates } from '../server/system/ops';

test('LAN Operator Auth hashes password with scrypt, issues HMAC token, and protects API routes', () => {
  const originalEnabled = getState().settings.webAuthEnabled;
  try {
    setWebAuthPassword('teszt-jelszo-2025');
    updateState((s) => {
      s.settings.webAuthEnabled = true;
      s.settings.webAuthHasPassword = true;
    });

    const wrong = authenticateOperatorPassword('rossz-jelszo');
    assert.equal(wrong, null);

    const token = authenticateOperatorPassword('teszt-jelszo-2025');
    assert.ok(token && token.includes('.'));
    assert.equal(verifySessionToken(token), true);
    assert.equal(verifySessionToken(`${token}tampered`), false);

    assert.equal(isRequestAuthorized({}), false);
    assert.equal(isRequestAuthorized({ cookie: `novaswarm_session=${token}` }), true);

    let nextCalled = false;
    let statusSent = 0;
    const reqDenied = { path: '/state', headers: {} } as unknown as express.Request;
    const resDenied = {
      status(code: number) {
        statusSent = code;
        return this;
      },
      json() {
        return this;
      },
    } as unknown as express.Response;
    requireWebAuthMiddleware(reqDenied, resDenied, () => {
      nextCalled = true;
    });
    assert.equal(statusSent, 401);
    assert.equal(nextCalled, false);

    // Webhook exemption check
    let webhookAllowed = false;
    const reqWebhook = { path: '/channels/inbound/ch-1', headers: {} } as unknown as express.Request;
    requireWebAuthMiddleware(reqWebhook, resDenied, () => {
      webhookAllowed = true;
    });
    assert.equal(webhookAllowed, true);
  } finally {
    updateState((s) => {
      s.settings.webAuthEnabled = originalEnabled;
    });
  }
});

test('MCP Manager lists and executes tools over real JSON-RPC 2.0 HTTP server', async () => {
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const rpc = JSON.parse(body || '{}') as {
        id?: number;
        method?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (rpc.method === 'tools/list') {
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id,
            result: {
              tools: [{ name: 'calc_sum', description: 'Adds two numbers' }],
            },
          })
        );
        return;
      }
      if (rpc.method === 'tools/call') {
        const a = Number(rpc.params?.arguments?.a ?? 0);
        const b = Number(rpc.params?.arguments?.b ?? 0);
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id,
            result: {
              content: [{ type: 'text', text: `sum=${a + b}` }],
            },
          })
        );
        return;
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } }));
    });
  });

  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address() as { port: number };
  const server = registerMcpServer({
    name: 'Test JSON-RPC MCP',
    description: 'Unit test MCP',
    endpointUrl: `http://127.0.0.1:${addr.port}`,
    authType: 'none',
  });

  try {
    const listed = await listMcpTools(server.id);
    assert.equal(listed.mcpId, server.id);
    assert.equal(listed.tools[0]?.name, 'calc_sum');

    const called = await callMcpTool(server.id, 'calc_sum', { a: 7, b: 5 });
    assert.equal(called.ok, true);
    assert.equal(called.output, 'sum=12');
  } finally {
    updateState((s) => {
      s.mcpServers = s.mcpServers.filter((m) => m.id !== server.id);
    });
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});

test('OpenAI /v1/chat/completions proxy preserves native tool_calls and parses multimodal content', async () => {
  const prevKeys = getState().settings.providerKeys.openai;
  const prevPrimary = getState().settings.primaryProvider;
  const prevKill = getState().settings.killSwitchActive;

  updateState((s) => {
    s.settings.killSwitchActive = false;
    s.settings.primaryProvider = 'openai';
    s.settings.providerKeys.openai = [
      { id: 'vk-test-key', label: 'Mock', maskedKey: 'sk-...test', enabled: true, failureCount: 0 },
    ];
  });

  let capturedOpenAiPayload: { tools?: unknown[] } | null = null;
  const origFetch = globalThis.fetch;
  const app = express();
  app.use(express.json());
  app.use(
    '/v1',
    createOpenAiProxyRouter(() => {}, {
      resolveSecret: () => 'sk-mock-secret',
      callProvider: async (req) => {
        capturedOpenAiPayload = { tools: req.tools };
        return {
          text: '',
          toolCalls: [
            {
              id: 'call_123',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Budapest"}' },
            },
          ],
          finishReason: 'tool_calls',
          inputTokens: 20,
          outputTokens: 15,
          headers: new Headers(),
        };
      },
    })
  );

  const httpSrv = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => httpSrv.once('listening', resolve));
  const port = (httpSrv.address() as { port: number }).port;

  try {
    const res = await origFetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Mi az időjárás ezen a képen?' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              parameters: { type: 'object', properties: { city: { type: 'string' } } },
            },
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      choices: Array<{ finish_reason: string; message: { tool_calls?: Array<{ function: { name: string } }> } }>;
    };
    assert.equal(json.choices[0].finish_reason, 'tool_calls');
    assert.equal(json.choices[0].message.tool_calls?.[0]?.function?.name, 'get_weather');
    const captured = capturedOpenAiPayload as { tools?: unknown[] } | null;
    assert.ok(Array.isArray(captured?.tools));
  } finally {
    await new Promise<void>((resolve) => httpSrv.close(() => resolve()));
    updateState((s) => {
      s.settings.providerKeys.openai = prevKeys;
      s.settings.primaryProvider = prevPrimary;
      s.settings.killSwitchActive = prevKill;
    });
  }
});

test('Autonomous Kanban Backlog Worker picks highest priority todo card and completes it', async () => {
  const prevState = JSON.stringify(getState());

  try {
    updateState((s) => {
      s.settings.killSwitchActive = false;
      s.settings.autonomousKanbanWorkerEnabled = true;
      s.settings.primaryProvider = 'gemini';
      s.settings.providerKeys.gemini = [
        { id: 'k-kanban', label: 'G', maskedKey: 'AIza...test', enabled: true, failureCount: 0 },
      ];
      s.agents.push({
        id: 'ag-worker-test',
        name: 'KanbanWorker',
        avatar: 'KW',
        role: 'Automata',
        parentAgentId: null,
        systemPrompt: 'Végezd el a feladatot.',
        modelId: 'gemini-2.5-flash',
        providerId: 'gemini',
        webSearchEnabled: false,
        hostExecutionEnabled: false,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      s.kanban.unshift({
        id: 'card-auto-test',
        title: 'Teszt autonóm backlog feladat',
        description: 'Ellenőrizd a rendszert',
        status: 'todo',
        priority: 'urgent',
        assignedAgentId: 'ag-worker-test',
        subtasks: [{ id: 'st-1', title: 'Lépés 1', done: false }],
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const outcome = await runAutonomousKanbanWorkerTick({
      resolveSecret: () => 'AIzaMockSecret',
      callProvider: async () => ({
        text: 'Autonóm feladat megoldva és ellenőrizve.',
        inputTokens: 10,
        outputTokens: 8,
        headers: new Headers(),
      }),
    });
    assert.equal(outcome.worked, true);
    assert.equal(outcome.cardId, 'card-auto-test');
    const updatedCard = getState().kanban.find((c) => c.id === 'card-auto-test');
    assert.equal(updatedCard?.status, 'done');
    assert.equal(updatedCard?.subtasks?.[0]?.done, true);
  } finally {
    const restored = JSON.parse(prevState) as ReturnType<typeof getState>;
    updateState((s) => Object.assign(s, restored));
  }
});

test('Ollama neural embeddings integrate into async hybrid memory search', async () => {
  const prevMode = getState().settings.embeddingMode;
  const origFetch = globalThis.fetch;
  updateState((s) => {
    s.settings.embeddingMode = 'ollama';
    s.settings.ollamaEmbeddingModel = 'nomic-embed-text';
  });

  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as { prompt?: string; input?: string };
    const text = (body.prompt || body.input || '').toLowerCase();
    const vec = text.includes('kvantum') ? [1, 0, 0, 0] : [0, 1, 0, 0];
    return new Response(JSON.stringify({ embedding: vec }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  let addedId = '';
  try {
    const entry = await addPersistentMemoryAsync({
      content: 'Kvantum kriptográfiai jegyzet teszt',
      entity: 'Kutatás',
      tags: ['crypto'],
      tier: 'hot',
    });
    addedId = entry.id;
    assert.deepEqual(entry.semanticEmbedding, [1, 0, 0, 0]);

    const hits = await searchMemoriesAsync('kvantum', 5);
    assert.ok(hits.some((h) => h.id === addedId));
  } finally {
    globalThis.fetch = origFetch;
    updateState((s) => {
      s.settings.embeddingMode = prevMode;
      s.memories = s.memories.filter((m) => m.id !== addedId);
    });
  }
});

test('Sandbox backend detection returns an honest runtime isolation mode and OTA falls back to /commits/main', async () => {
  const backend = detectActiveSandboxBackend();
  assert.ok(
    ['docker_no_network', 'bwrap_sandbox', 'unshare_net_sandbox', 'isolated_tmpfs_subprocess'].includes(backend)
  );

  const mockFetch = (async (url: unknown) => {
    const u = String(url);
    if (u.endsWith('/releases/latest')) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    if (u.endsWith('/commits/main')) {
      return new Response(
        JSON.stringify({
          sha: 'abcdef1234567890',
          html_url: 'https://github.com/ngabika/NovaSwarmNextGenHydrogen/commit/abcdef1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;

  const ota = await checkOtaUpdates(mockFetch);
  assert.equal(ota.source, 'github:ngabika/NovaSwarmNextGenHydrogen');
  assert.equal(ota.remoteCommit, 'abcdef1');
  assert.equal(ota.latestVersion, 'git-abcdef1');
});
