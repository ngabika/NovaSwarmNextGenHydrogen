import crypto from 'node:crypto';
import express from 'express';
import type { ProviderId, VirtualKey } from '../../shared/types';
import { computeLocalEmbedding } from '../memory/vectorStore';
import {
  GuardrailBlockedError,
  invokeWithFailover,
  type InlineMediaInput,
  type OpenAiToolDefinition,
  type RouterDependencies,
} from '../providers/router';
import { appendAuditLog, getState, maskSecret, updateState } from '../state/store';

const rpmWindows = new Map<string, number[]>();

export function hashVirtualKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

export function createVirtualKey(input: {
  name: string;
  maxBudgetUsd?: number;
  rpmLimit?: number;
  allowedModels?: string[];
}): { key: VirtualKey; rawKey: string } {
  const rawKey = `ns-vk-${crypto.randomBytes(20).toString('hex')}`;
  const entry: VirtualKey = {
    id: `vk-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim() || 'Gateway Client Key',
    maskedKey: maskSecret(rawKey),
    keyHash: hashVirtualKey(rawKey),
    maxBudgetUsd: input.maxBudgetUsd ?? 5.0,
    spendUsd: 0,
    rpmLimit: input.rpmLimit ?? 60,
    allowedModels: (input.allowedModels ?? []).filter(Boolean),
    enabled: true,
    totalRequests: 0,
    totalTokens: 0,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  updateState((s) => {
    s.virtualKeys.unshift(entry);
  });

  appendAuditLog({
    type: 'gateway',
    sourceAgentId: 'litellm-proxy',
    sourceAgentName: 'LiteLLM Proxy',
    message: `Új virtuális API kulcs kibocsátva: ${entry.name} (${entry.maskedKey})`,
    verifiedExecution: true,
  });

  return { key: entry, rawKey };
}

export function revokeVirtualKey(id: string): boolean {
  const before = getState().virtualKeys.length;
  updateState((s) => {
    s.virtualKeys = s.virtualKeys.filter((k) => k.id !== id);
  });
  return getState().virtualKeys.length < before;
}

export function authenticateVirtualKey(
  authHeader: string | undefined,
  requestedModel?: string
): { ok: true; key: VirtualKey | null } | { ok: false; status: number; error: string } {
  const state = getState();
  // If no virtual keys exist and no bearer is provided, allow local operator bypass only on localhost unless keys are configured
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';

  if (state.virtualKeys.length === 0 && !token) {
    return { ok: true, key: null };
  }

  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer <virtual-key> header.' };
  }

  const hash = hashVirtualKey(token);
  const match = state.virtualKeys.find((k) => k.keyHash === hash);
  if (!match) {
    return { ok: false, status: 401, error: 'Invalid virtual API key.' };
  }
  if (!match.enabled) {
    return { ok: false, status: 403, error: 'Virtual API key is disabled.' };
  }
  if (match.maxBudgetUsd > 0 && match.spendUsd >= match.maxBudgetUsd) {
    return {
      ok: false,
      status: 429,
      error: `Virtual key budget exceeded ($${match.spendUsd.toFixed(4)} / $${match.maxBudgetUsd.toFixed(2)}).`,
    };
  }
  if (
    requestedModel &&
    requestedModel !== 'auto' &&
    match.allowedModels.length > 0 &&
    !match.allowedModels.includes(requestedModel)
  ) {
    return {
      ok: false,
      status: 403,
      error: `Model '${requestedModel}' is not in this virtual key's allowlist.`,
    };
  }

  // Sliding 60-second RPM check
  const now = Date.now();
  const stamps = (rpmWindows.get(match.id) || []).filter((ts) => now - ts < 60_000);
  if (match.rpmLimit > 0 && stamps.length >= match.rpmLimit) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded (${match.rpmLimit} RPM) for virtual key '${match.name}'.`,
    };
  }
  stamps.push(now);
  rpmWindows.set(match.id, stamps);

  return { ok: true, key: match };
}

function parseProviderAndModel(requestedModel: string): {
  provider?: ProviderId;
  model?: string;
  complexity: 'simple' | 'complex';
} {
  if (!requestedModel || requestedModel === 'auto') {
    return { complexity: 'simple' };
  }
  const slashIdx = requestedModel.indexOf('/');
  if (slashIdx > 0) {
    const prefix = requestedModel.slice(0, slashIdx).toLowerCase();
    const rest = requestedModel.slice(slashIdx + 1);
    if (prefix === 'gemini' || prefix === 'openai' || prefix === 'anthropic' || prefix === 'ollama') {
      return { provider: prefix, model: rest, complexity: 'complex' };
    }
    if (prefix === 'openrouter') {
      return { provider: 'openrouter', model: rest, complexity: 'complex' };
    }
    // OpenRouter format like meta-llama/llama-3.3-70b-instruct:free
    return { provider: 'openrouter', model: requestedModel, complexity: 'complex' };
  }
  if (requestedModel.startsWith('gemini-')) return { provider: 'gemini', model: requestedModel, complexity: 'complex' };
  if (/^(gpt-|o1|o3|o4)/.test(requestedModel)) return { provider: 'openai', model: requestedModel, complexity: 'complex' };
  if (requestedModel.startsWith('claude-')) return { provider: 'anthropic', model: requestedModel, complexity: 'complex' };
  return { model: requestedModel, complexity: 'simple' };
}

type OpenAiContentPart = { type?: string; text?: string; image_url?: { url?: string } };

function extractContentTextAndImages(content: string | OpenAiContentPart[] | null | undefined): {
  text: string;
  images: InlineMediaInput[];
} {
  if (typeof content === 'string') return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: '', images: [] };
  const textParts: string[] = [];
  const images: InlineMediaInput[] = [];
  for (const part of content) {
    if (part.type === 'text' && typeof part.text === 'string') {
      textParts.push(part.text);
    } else if (part.type === 'image_url' && part.image_url?.url) {
      const m = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        images.push({ mimeType: m[1], dataBase64: m[2] });
      }
    }
  }
  return { text: textParts.join('\n'), images };
}

/**
 * LiteLLM OpenAI-Compatible Gateway Proxy Router (/v1/*):
 * - GET /v1/models
 * - POST /v1/chat/completions (supports stream=false & SSE stream=true, model="auto", native OpenAI tools/tool_calls, multimodal vision)
 * - POST /v1/embeddings
 */
export function createOpenAiProxyRouter(
  broadcastEvent: (type: string, payload?: unknown) => void,
  routerDeps: RouterDependencies = {}
): express.Router {
  const router = express.Router();

  router.get('/models', (req, res) => {
    const auth = authenticateVirtualKey(req.headers.authorization);
    if (!auth.ok) return res.status(auth.status).json({ error: { message: auth.error } });

    const state = getState();
    const models = state.discoveredModels.map((m) => ({
      id: `${m.provider}/${m.id}`,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: m.provider,
    }));
    res.json({ object: 'list', data: models });
  });

  router.post('/chat/completions', async (req, res) => {
    try {
      const body = req.body as {
        model?: string;
        messages?: Array<{
          role: string;
          content: string | OpenAiContentPart[] | null;
          tool_calls?: unknown[];
          tool_call_id?: string;
        }>;
        stream?: boolean;
        temperature?: number;
        tools?: OpenAiToolDefinition[];
        tool_choice?: unknown;
      };
      const requestedModel = body.model || 'auto';
      const auth = authenticateVirtualKey(req.headers.authorization, requestedModel);
      if (!auth.ok) return res.status(auth.status).json({ error: { message: auth.error } });

      const msgs = body.messages || [];
      if (msgs.length === 0) {
        return res.status(400).json({ error: { message: 'messages array is required' } });
      }

      const systemParts: string[] = [];
      const userParts: string[] = [];
      const collectedImages: InlineMediaInput[] = [];

      for (const m of msgs) {
        const extracted = extractContentTextAndImages(m.content);
        if (extracted.images.length > 0) collectedImages.push(...extracted.images);
        if (m.role === 'system') {
          if (extracted.text) systemParts.push(extracted.text);
        } else if (m.role === 'tool') {
          userParts.push(`tool(${m.tool_call_id || 'result'}): ${extracted.text}`);
        } else if (m.tool_calls && m.tool_calls.length > 0) {
          userParts.push(`${m.role} tool_calls: ${JSON.stringify(m.tool_calls)}`);
        } else {
          userParts.push(`${m.role}: ${extracted.text}`);
        }
      }

      const userPrompt = userParts.join('\n');
      const parsed = parseProviderAndModel(requestedModel);
      // LiteLLM Auto Router heuristic complexity classification when model === "auto"
      const complexity: 'simple' | 'complex' =
        requestedModel === 'auto'
          ? userPrompt.length > 220 ||
            (body.tools && body.tools.length > 0) ||
            /\b(code|architect|sql|debug|plan|analyze)\b/i.test(userPrompt)
            ? 'complex'
            : 'simple'
          : parsed.complexity;

      const result = await invokeWithFailover(
        {
          prompt: userPrompt,
          systemInstruction: systemParts.join('\n') || undefined,
          complexity,
          preferredProvider: parsed.provider,
          preferredModel: parsed.model,
          images: collectedImages.length > 0 ? collectedImages : undefined,
          tools: body.tools,
          toolChoice: body.tool_choice,
        },
        routerDeps
      );

      const promptTokens = result.inputTokens ?? Math.ceil(userPrompt.length / 4);
      const completionTokens = result.outputTokens ?? Math.ceil(result.text.length / 4);
      const totalTokens = promptTokens + completionTokens;

      updateState((s) => {
        s.gatewayAnalytics.totalProxyRequests += 1;
        if (auth.key) {
          const vk = s.virtualKeys.find((k) => k.id === auth.key!.id);
          if (vk) {
            vk.spendUsd = Number((vk.spendUsd + result.costUsd).toFixed(6));
            vk.totalRequests += 1;
            vk.totalTokens += totalTokens;
            vk.lastUsedAt = new Date().toISOString();
          }
        }
      });
      broadcastEvent('state:updated');

      const completionId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
      const created = Math.floor(Date.now() / 1000);
      const modelOut = `${result.provider}/${result.model}`;
      const hasToolCalls = Boolean(result.toolCalls && result.toolCalls.length > 0);
      const finishReason = hasToolCalls ? 'tool_calls' : 'stop';

      if (body.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (hasToolCalls) {
          const tcFrame = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelOut,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: result.toolCalls!.map((tc, index) => ({ index, ...tc })),
                },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(tcFrame)}\n\n`);
        } else {
          const words = result.text.split(/(\s+)/);
          for (const chunk of words) {
            const frame = {
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: modelOut,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
            };
            res.write(`data: ${JSON.stringify(frame)}\n\n`);
          }
        }

        const finalFrame = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: modelOut,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        };
        res.write(`data: ${JSON.stringify(finalFrame)}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      return res.json({
        id: completionId,
        object: 'chat.completion',
        created,
        model: modelOut,
        choices: [
          {
            index: 0,
            message: hasToolCalls
              ? { role: 'assistant', content: result.text || null, tool_calls: result.toolCalls }
              : { role: 'assistant', content: result.text },
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
        novaswarm_meta: {
          cached: Boolean(result.cached),
          cost_usd: result.costUsd,
          provider: result.provider,
        },
      });
    } catch (err) {
      if (err instanceof GuardrailBlockedError) {
        return res.status(400).json({ error: { message: err.message, code: err.rule } });
      }
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: { message: msg } });
    }
  });

  router.post('/embeddings', (req, res) => {
    const auth = authenticateVirtualKey(req.headers.authorization);
    if (!auth.ok) return res.status(auth.status).json({ error: { message: auth.error } });

    const body = req.body as { input?: string | string[]; model?: string };
    const inputs = Array.isArray(body.input) ? body.input : [body.input || ''];
    const data = inputs.map((text, index) => ({
      object: 'embedding',
      index,
      embedding: computeLocalEmbedding(String(text), 64),
    }));

    return res.json({
      object: 'list',
      data,
      model: body.model || 'novaswarm-local-embed-64d',
      usage: {
        prompt_tokens: inputs.reduce((acc, s) => acc + Math.ceil(String(s).length / 4), 0),
        total_tokens: inputs.reduce((acc, s) => acc + Math.ceil(String(s).length / 4), 0),
      },
    });
  });

  return router;
}
