import crypto from 'node:crypto';
import type {
  FocusSession,
  HabitItem,
  KanbanCard,
  MediaArtifact,
  ProviderId,
  WorkflowDefinition,
} from '../../shared/types';
import { handleUserTurn } from '../agents/engine';
import { queryHomeAssistantStates } from '../integrations/ecosystem';
import { recordWebhookDelivery } from '../power/batch7UniverseEngine';
import { runInSupervisorSandbox } from '../sandbox/supervisorSandbox';
import { constantTimeEqual } from '../security/egressAndCrypto';
import { appendAuditLog, getState, setNamedSecret, getNamedSecret, updateState } from '../state/store';
import { sendTelegramMessage } from '../telegram/bot';
import { performWebSearch } from '../web/searchAndBrowser';

/** Ú17: Visual Workflow Automation Engine */
export async function executeWorkflow(
  workflowId: string,
  triggerPayload?: string
): Promise<{ ok: boolean; status: string; output?: string }> {
  const state = getState();
  const wf = state.workflows.find((w) => w.id === workflowId);
  if (!wf) throw new Error(`Munkafolyamat nem található: ${workflowId}`);
  if (!wf.enabled) return { ok: false, status: 'kikapcsolva' };

  if (wf.conditionExpr?.trim() && triggerPayload) {
    const condLower = wf.conditionExpr.trim().toLowerCase();
    if (!triggerPayload.toLowerCase().includes(condLower)) {
      return { ok: false, status: `feltétel nem teljesült (${wf.conditionExpr})` };
    }
  }

  let status = 'sikeres';
  let output = '';

  try {
    /** M51: Multi-step sequential workflow pipeline when steps[] are configured */
    if (wf.steps && wf.steps.length > 0) {
      let prev = triggerPayload || '';
      const stepLogs: string[] = [];

      for (let idx = 0; idx < wf.steps.length; idx++) {
        const st = wf.steps[idx];
        const rendered = st.payload
          .replace(/\{\{payload\}\}/g, triggerPayload || '')
          .replace(/\{\{prev\}\}/g, prev);

        if (st.type === 'web_search') {
          const sRes = await performWebSearch(rendered, 4);
          prev = sRes.results.map((r) => `${r.title} (${r.url}): ${r.snippet}`).join('\n') || 'Nincs találat';
          stepLogs.push(`${idx + 1}. [web_search] ${sRes.results.length} találat`);
        } else if (st.type === 'http_call') {
          const r = await fetch(st.target || rendered, { signal: AbortSignal.timeout(6000) });
          prev = (await r.text()).slice(0, 2000);
          stepLogs.push(`${idx + 1}. [http_call] HTTP ${r.status}`);
        } else if (st.type === 'kanban_create') {
          const now = new Date().toISOString();
          const card: KanbanCard = {
            id: `card-${crypto.randomUUID().slice(0, 8)}`,
            title: `[WF: ${wf.name}] ${rendered.slice(0, 80)}`,
            description: prev || rendered,
            status: 'todo',
            assignedAgentId: st.target || null,
            priority: 'high',
            subtasks: [],
            createdAt: now,
            updatedAt: now,
          };
          updateState((s) => {
            s.kanban.unshift(card);
          });
          prev = card.id;
          stepLogs.push(`${idx + 1}. [kanban_create] ${card.id}`);
        } else if (st.type === 'notify') {
          const tgRes = await sendTelegramMessage(`[WF: ${wf.name}]\n${rendered}`);
          stepLogs.push(`${idx + 1}. [notify] ${tgRes.sent ? 'elküldve' : 'naplózva'}`);
        } else {
          const turn = await handleUserTurn({
            threadId: state.threads[0]?.id || 'thread-main',
            content: `[WF Lépés ${idx + 1}: ${wf.name}] ${rendered}`,
            channel: 'webhook',
            targetAgentId: st.target || wf.actionTarget || null,
          });
          prev = turn.coordinatorReply.content;
          stepLogs.push(`${idx + 1}. [agent_prompt] OK`);
        }
      }
      output = `${stepLogs.join(' -> ')}\n\n${prev.slice(0, 1200)}`;
    } else {
      const renderedPayload = wf.actionPayload.replace(/\{\{payload\}\}/g, triggerPayload || '');

      if (wf.actionType === 'kanban_create') {
        const now = new Date().toISOString();
        const card: KanbanCard = {
          id: `card-${crypto.randomUUID().slice(0, 8)}`,
          title: `[WF: ${wf.name}] ${renderedPayload.slice(0, 90)}`,
          description: triggerPayload || renderedPayload,
          status: 'todo',
          assignedAgentId: wf.actionTarget || null,
          priority: 'high',
          subtasks: [],
          createdAt: now,
          updatedAt: now,
        };
        updateState((s) => {
          s.kanban.unshift(card);
        });
        output = `Kanban kártya létrehozva: ${card.id}`;
      } else if (wf.actionType === 'notify') {
        const tgRes = await sendTelegramMessage(`[Munkafolyamat: ${wf.name}]\n${renderedPayload}`);
        output = tgRes.sent ? 'Telegram értesítés elküldve.' : `Naplózva (${tgRes.reason || 'nincs TG'})`;
      } else {
        const turn = await handleUserTurn({
          threadId: state.threads[0]?.id || 'thread-main',
          content: `[Workflow: ${wf.name}] ${renderedPayload}`,
          channel: 'webhook',
          targetAgentId: wf.actionTarget || null,
        });
        output = turn.coordinatorReply.content;
      }
    }
  } catch (err) {
    status = `hiba: ${err instanceof Error ? err.message : String(err)}`;
  }

  updateState((s) => {
    const ref = s.workflows.find((w) => w.id === workflowId);
    if (ref) {
      ref.lastRunAt = new Date().toISOString();
      ref.lastStatus = status;
      ref.runCount = (ref.runCount || 0) + 1;
    }
  });

  appendAuditLog({
    type: 'workflow',
    sourceAgentId: wf.id,
    sourceAgentName: `Workflow: ${wf.name}`,
    message: `Lefutott (${wf.triggerType} -> ${wf.actionType}): ${status}`,
    verifiedExecution: status === 'sikeres',
  });

  return { ok: status === 'sikeres', status, output };
}

/** M57: Home Assistant entity state workflow trigger evaluator (e.g. "sensor.temp>28" or "binary_sensor.door==on") */
export async function evaluateHomeAssistantWorkflowTriggers(fetchImpl: typeof fetch = fetch): Promise<number> {
  const haWorkflows = getState().workflows.filter((w) => w.enabled && w.triggerType === 'ha_state' && w.triggerConfig.trim());
  if (haWorkflows.length === 0) return 0;

  const statesRes = await queryHomeAssistantStates(fetchImpl);
  if (!statesRes.ok || statesRes.states.length === 0) return 0;

  let triggered = 0;
  for (const wf of haWorkflows) {
    const match = wf.triggerConfig.trim().match(/^([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!match) continue;
    const [, entityId, op, rawTarget] = match;
    const entity = statesRes.states.find((st) => st.entity_id === entityId);
    if (!entity) continue;

    const val = entity.state;
    const target = rawTarget.trim();
    const numVal = Number(val);
    const numTarget = Number(target);
    let condOk = false;

    if (op === '==') condOk = val.toLowerCase() === target.toLowerCase();
    else if (op === '!=') condOk = val.toLowerCase() !== target.toLowerCase();
    else if (!Number.isNaN(numVal) && !Number.isNaN(numTarget)) {
      if (op === '>') condOk = numVal > numTarget;
      else if (op === '>=') condOk = numVal >= numTarget;
      else if (op === '<') condOk = numVal < numTarget;
      else if (op === '<=') condOk = numVal <= numTarget;
    }

    if (condOk) {
      const lastMs = wf.lastRunAt ? Date.parse(wf.lastRunAt) : 0;
      if (Date.now() - lastMs >= 60_000) {
        await executeWorkflow(wf.id, `${entityId}=${val}`);
        triggered++;
      }
    }
  }
  return triggered;
}

/** Ú18: Sandboxed Code Interpreter + SVG Bar/Line Chart Builder */
export function buildSvgChartArtifact(params: {
  title: string;
  labels: string[];
  values: number[];
  unit?: string;
}): MediaArtifact {
  const width = 540;
  const height = 240;
  const padL = 44;
  const padR = 16;
  const padT = 34;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const safeValues = params.values.map((v) => (Number.isFinite(v) ? v : 0));
  const maxVal = Math.max(1, ...safeValues);
  const barW = Math.max(12, Math.floor(plotW / Math.max(1, safeValues.length)) - 8);

  const bars = safeValues
    .map((val, idx) => {
      const step = plotW / Math.max(1, safeValues.length);
      const x = Math.round(padL + idx * step + (step - barW) / 2);
      const h = Math.round((val / maxVal) * plotH);
      const y = padT + plotH - h;
      const lbl = (params.labels[idx] || String(idx + 1)).slice(0, 10).replace(/[<>&]/g, '');
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="#0f172a"/>
<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="#334155" font-family="monospace">${val}${params.unit || ''}</text>
<text x="${x + barW / 2}" y="${height - 12}" text-anchor="middle" font-size="10" fill="#64748b" font-family="sans-serif">${lbl}</text>`;
    })
    .join('\n');

  const safeTitle = params.title.replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0">
  <text x="${padL}" y="20" font-size="13" font-weight="600" fill="#0f172a" font-family="sans-serif">${safeTitle}</text>
  <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1"/>
  ${bars}
</svg>`;

  const artifact: MediaArtifact = {
    id: `art-${crypto.randomUUID().slice(0, 8)}`,
    kind: 'chart_svg',
    title: params.title,
    mimeType: 'image/svg+xml',
    urlOrContent: svg,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.artifacts.unshift(artifact);
    s.artifacts = s.artifacts.slice(0, 50);
  });

  return artifact;
}

export function runSandboxedCodeInterpreter(params: {
  language: 'javascript' | 'python';
  code: string;
}): { passed: boolean; isolationMode: string; stdout: string; stderr: string; durationMs: number } {
  if (params.language === 'javascript') {
    const res = runInSupervisorSandbox({
      scriptOrCommand: params.code,
      isNodeScript: true,
      timeoutMs: 6000,
    });
    return {
      passed: res.passed,
      isolationMode: res.isolationMode,
      stdout: res.stdout,
      stderr: res.stderr,
      durationMs: res.durationMs,
    };
  }

  const res = runInSupervisorSandbox({
    scriptOrCommand: `python3 - <<'PYEOF'\n${params.code}\nPYEOF`,
    isNodeScript: false,
    timeoutMs: 6000,
  });
  return {
    passed: res.passed,
    isolationMode: res.isolationMode,
    stdout: res.stdout,
    stderr: res.stderr,
    durationMs: res.durationMs,
  };
}

/** Ú19: Custom Incoming Webhooks (/hooks/:slug) */
export function createCustomWebhook(input: {
  slug: string;
  name: string;
  secret?: string;
  targetAgentId?: string;
  workflowId?: string;
  promptTemplate?: string;
}) {
  const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!cleanSlug) throw new Error('Érvénytelen webhook slug.');
  const id = `wh-${crypto.randomUUID().slice(0, 6)}`;
  if (input.secret?.trim()) {
    setNamedSecret(`webhook:${id}`, input.secret.trim());
  }
  const hook = {
    id,
    slug: cleanSlug,
    name: input.name.trim() || cleanSlug,
    enabled: true,
    hasSecret: Boolean(input.secret?.trim()),
    targetAgentId: input.targetAgentId || undefined,
    workflowId: input.workflowId || undefined,
    promptTemplate: input.promptTemplate?.trim() || 'Bejövő webhook ({{slug}}): {{payload}}',
    lastTriggeredAt: null,
    hitCount: 0,
  };
  updateState((s) => {
    s.customWebhooks.push(hook);
  });
  return hook;
}

export async function triggerCustomWebhook(
  slug: string,
  providedSecret: string | undefined,
  bodyPayload: unknown,
  signatureHeader?: string
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const state = getState();
  const hook = state.customWebhooks.find((h) => h.slug === slug && h.enabled);
  if (!hook) return { ok: false, error: 'Webhook nem található vagy inaktív.' };

  const payloadStr = typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload ?? {}).slice(0, 3000);

  if (hook.hasSecret) {
    const expected = getNamedSecret(`webhook:${hook.id}`);
    if (!expected) {
      return { ok: false, error: 'Webhook titkos kulcs hiányzik a kulcstárból.' };
    }
    if (signatureHeader && /^sha256=/i.test(signatureHeader.trim())) {
      /** M48: GitHub/Stripe-compatible HMAC-SHA256 signature verification */
      const providedSig = signatureHeader.trim().toLowerCase();
      const rawBodyStr = typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload ?? {});
      const computed = `sha256=${crypto.createHmac('sha256', expected).update(rawBodyStr).digest('hex')}`;
      const bufA = Buffer.from(providedSig);
      const bufB = Buffer.from(computed);
      if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
        return { ok: false, error: 'Érvénytelen HMAC-SHA256 webhook aláírás.' };
      }
    } else if (!constantTimeEqual(expected, (providedSecret || '').trim())) {
      return { ok: false, error: 'Érvénytelen webhook titkos kulcs.' };
    }
  }
  updateState((s) => {
    const ref = s.customWebhooks.find((h) => h.id === hook.id);
    if (ref) {
      ref.hitCount += 1;
      ref.lastTriggeredAt = new Date().toISOString();
    }
  });

  if (hook.workflowId) {
    const wfOut = await executeWorkflow(hook.workflowId, payloadStr);
    recordWebhookDelivery({ slug, bodyPayload, statusOk: wfOut.ok });
    return { ok: wfOut.ok, reply: wfOut.output || wfOut.status };
  }

  const prompt = hook.promptTemplate
    .replace(/\{\{slug\}\}/g, hook.slug)
    .replace(/\{\{payload\}\}/g, payloadStr);

  const turn = await handleUserTurn({
    threadId: state.threads[0]?.id || 'thread-main',
    content: prompt,
    channel: 'webhook',
    targetAgentId: hook.targetAgentId ?? null,
  });
  recordWebhookDelivery({ slug, bodyPayload, statusOk: true });
  return { ok: true, reply: turn.coordinatorReply.content };
}

/** Ú24: Habits & Focus Sessions */
export function toggleHabitCheckin(habitId: string, isoDate = new Date().toISOString().slice(0, 10)): HabitItem | null {
  let updated: HabitItem | null = null;
  updateState((s) => {
    const h = s.habits.find((x) => x.id === habitId);
    if (!h) return;
    if (h.completedDates.includes(isoDate)) {
      h.completedDates = h.completedDates.filter((d) => d !== isoDate);
    } else {
      h.completedDates.push(isoDate);
    }
    updated = h;
  });
  return updated;
}

export function logFocusSession(input: { label: string; habitId?: string; minutes: number }): FocusSession {
  const now = new Date();
  const minutes = Math.max(1, Math.min(240, Math.round(input.minutes)));
  const session: FocusSession = {
    id: `foc-${crypto.randomUUID().slice(0, 6)}`,
    label: input.label.trim() || 'Fókusz blokk',
    habitId: input.habitId,
    minutes,
    startedAt: new Date(now.getTime() - minutes * 60_000).toISOString(),
    completedAt: now.toISOString(),
  };
  updateState((s) => {
    s.focusSessions.unshift(session);
    if (input.habitId) {
      const h = s.habits.find((x) => x.id === input.habitId);
      if (h) {
        h.totalMinutes = (h.totalMinutes || 0) + minutes;
        const today = now.toISOString().slice(0, 10);
        if (!h.completedDates.includes(today)) h.completedDates.push(today);
      }
    }
  });
  return session;
}

/** Ú29: Sanitized Agent, Skill & Workflow Bundle Export / Import (zero secrets!) */
export function exportSanitizedBundle() {
  const s = getState();
  return {
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    agents: s.agents
      .filter((a) => !a.isSupervisor)
      .map((a) => ({
        name: a.name,
        avatar: a.avatar,
        role: a.role,
        systemPrompt: a.systemPrompt,
        modelId: a.modelId,
        providerId: a.providerId,
        webSearchEnabled: a.webSearchEnabled,
        voiceReplyMode: a.voiceReplyMode,
        dailyBudgetUsd: a.dailyBudgetUsd,
      })),
    skills: s.skills
      .filter((sk) => sk.status === 'verified')
      .map((sk) => ({
        name: sk.name,
        description: sk.description,
        code: sk.code,
        pitfalls: sk.pitfalls || [],
      })),
    workflows: s.workflows.map((w) => ({
      name: w.name,
      triggerType: w.triggerType,
      triggerConfig: w.triggerConfig,
      conditionExpr: w.conditionExpr,
      actionType: w.actionType,
      actionTarget: w.actionTarget,
      actionPayload: w.actionPayload,
    })),
    promptTemplates: s.promptTemplates,
  };
}

export function importSanitizedBundle(bundle: {
  agents?: Array<{
    name: string;
    avatar?: string;
    role: string;
    systemPrompt: string;
    modelId?: string;
    providerId?: ProviderId;
    webSearchEnabled?: boolean;
  }>;
  workflows?: Array<Partial<WorkflowDefinition>>;
  promptTemplates?: Array<{ title: string; command: string; body: string; category?: string }>;
}): { importedAgents: number; importedWorkflows: number; importedTemplates: number } {
  let importedAgents = 0;
  let importedWorkflows = 0;
  let importedTemplates = 0;
  const now = new Date().toISOString();

  updateState((s) => {
    for (const ag of bundle.agents || []) {
      if (!ag?.name || s.agents.some((x) => x.name === ag.name)) continue;
      s.agents.push({
        id: `agent-${crypto.randomUUID().slice(0, 8)}`,
        name: ag.name,
        avatar: ag.avatar || 'cpu',
        role: ag.role || 'Specialista',
        parentAgentId: null,
        systemPrompt: ag.systemPrompt || 'Importált specialista ágens.',
        modelId: ag.modelId || 'gemini-4-hydrogen',
        providerId: ag.providerId || s.settings.primaryProvider,
        webSearchEnabled: ag.webSearchEnabled ?? true,
        hostExecutionEnabled: false,
        active: true,
        dailySpendUsd: 0,
        createdAt: now,
        updatedAt: now,
      });
      importedAgents++;
    }

    for (const wf of bundle.workflows || []) {
      if (!wf?.name) continue;
      s.workflows.push({
        id: `wf-${crypto.randomUUID().slice(0, 6)}`,
        name: wf.name,
        enabled: false,
        triggerType: wf.triggerType || 'manual',
        triggerConfig: wf.triggerConfig || '',
        conditionExpr: wf.conditionExpr,
        actionType: wf.actionType || 'agent_prompt',
        actionTarget: wf.actionTarget || '',
        actionPayload: wf.actionPayload || '',
        lastRunAt: null,
        runCount: 0,
      });
      importedWorkflows++;
    }

    for (const tpl of bundle.promptTemplates || []) {
      if (!tpl?.title || !tpl?.body) continue;
      s.promptTemplates.push({
        id: `tpl-${crypto.randomUUID().slice(0, 6)}`,
        title: tpl.title,
        command: tpl.command || '/sablon',
        body: tpl.body,
        category: tpl.category || 'Importált',
        createdAt: now,
      });
      importedTemplates++;
    }
  });

  return { importedAgents, importedWorkflows, importedTemplates };
}
