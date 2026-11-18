import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Agent,
  KanbanCard,
  MessageAttachment,
  SessionIsolationMode,
  ToolExecutionStep,
  UnifiedMessage,
} from '../../shared/types';
import { preCompactThreadMemory, searchMemories } from '../memory/vectorStore';
import { invokeWithFailover, type InlineMediaInput, type RouterDependencies } from '../providers/router';
import {
  assertHostPermission,
  detectDestructiveOperation,
  PROMPT_INJECTION_DEFENSE_RULE,
  requireDestructiveApproval,
} from '../security/permissionGate';
import { buildProgressiveSkillsIndex } from '../skills/loader';
import { appendAuditLog, appendUnifiedMessage, getState, updateState } from '../state/store';
import {
  AGENT_TOOLS_INSTRUCTION,
  executeAgentTool,
  parseToolCallFromResponse,
} from './tools';

export const SELF_DOCUMENTATION_TEXT = `NovaSwarm Önismereti Architektúra Dokumentáció:
1. Állapot & Igazságforrás: Minden konfiguráció és entitás a központi állapottárban (.state.json, .config.json) él, atomikus ideiglenes fájlos átnevezéssel (rename) mentve.
2. Ágensek, Al-ágensek & Hierarchia: Induláskor csak a felhasználó által létrehozott első ágens és az állandó Felügyelő Auditor fut. Tetszőleges mélységű hierarchia, ágensenkénti dedikált Telegram bot és napi költségkeret.
3. Session Izoláció & Jogosultsági Kapu (OpenClaw): A fő szál (main_host) gazdagép-hozzáférést kaphat az assertHostPermission kapun át; minden másodlagos/külső szál (sandboxed) automatikusan izolált sandboxban fut.
4. LiteLLM AI Gateway Proxy (/v1/*): OpenAI-kompatibilis /v1/chat/completions (SSE stream & auto routing), /v1/models, /v1/embeddings, Virtuális Kulcsok (budget + RPM), LRU válasz-cache, Guardrail védelem és kulcs-cooldown rotáció.
5. Rétegzett Hibrid Memória & Álmodás (Marveen + OpenClaw): Hot/Warm/Cold/Shared rétegek, salience decay, RRF hibrid keresés, PreCompact kontextus-mentés, Tudásgráf és Obsidian vault + 3 fázisú Álmodás.
6. Ötletláda, Rich Kanban, Föderáció & Uptime: Impact×Effort ötletpontozás, AI feladatbontás, WIP limit & kártya-öregedés, több példányos Föderáció és Two-Strikes Uptime Monitor.`;

export function buildDynamicAgentSystemPrompt(
  agent: Agent,
  isolationMode: SessionIsolationMode = 'main_host'
): string {
  const state = getState();
  const activeRoster = state.agents
    .filter((a) => a.active && a.id !== agent.id)
    .map((a) => `- ${a.name} (${a.role}, ID: ${a.id}${a.isSupervisor ? ' [Technikai Felügyelő]' : ''})`)
    .join('\n');

  const memories = searchMemories(agent.role, 4, { agentId: agent.id, reinforce: true })
    .map((m) => `- [${(m.tier || 'warm').toUpperCase()} | ${m.entity}] ${m.content}`)
    .join('\n');

  const skillsIndex = buildProgressiveSkillsIndex();
  const mcpSummary = state.mcpServers
    .map((m) => `- ${m.id}: ${m.name} (${m.status})`)
    .join('\n');

  return [
    `Te vagy ${agent.name}, szerepköröd: ${agent.role}.`,
    agent.systemPrompt,
    `Aktuális session biztonsági mód: ${isolationMode} (${
      isolationMode === 'sandboxed'
        ? 'elszigetelt másodlagos szál — parancsok csak sandboxban futhatnak'
        : 'fő operátori szál'
    }).`,
    `Felhasználói profil és kommunikációs elvárás:\n${state.settings.userProfile || 'Még nincs megadva.'}`,
    activeRoster
      ? `Aktuális csapattagok (valós, dinamikus lista):\n${activeRoster}`
      : 'Jelenleg te vagy az egyetlen aktív felhasználói ágens a csapatban.',
    mcpSummary ? `Regisztrált MCP szerverek:\n${mcpSummary}` : '',
    memories ? `Kapcsolódó tartós memóriák:\n${memories}` : '',
    skillsIndex ? `Elérhető ellenőrzött skillek (progressive disclosure):\n${skillsIndex}` : '',
    AGENT_TOOLS_INSTRUCTION,
    `Rendszer önismeret:\n${SELF_DOCUMENTATION_TEXT}`,
    PROMPT_INJECTION_DEFENSE_RULE,
    `Válaszolj a felhasználó nyelvén (${state.settings.language}). Ha egy képességed nem lett ténylegesen végrehajtva eszközzel, SOHA ne állítsd, hogy végrehajtottad.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function executeHostCommandForAgent(
  agent: Agent,
  command: string
): { executed: boolean; pendingApproval?: boolean; approvalId?: string; stdout: string; stderr: string } {
  assertHostPermission(`exec:${command}`, agent.id);

  const destructive = detectDestructiveOperation(command);
  if (destructive.isDestructive && destructive.type && destructive.title) {
    const req = requireDestructiveApproval(destructive.type, destructive.title, command, agent.name);
    return {
      executed: false,
      pendingApproval: true,
      approvalId: req.id,
      stdout: '',
      stderr: `Jóváhagyás szükséges a destruktív művelethez (${destructive.title}). Jóváhagyási azonosító: ${req.id}`,
    };
  }

  try {
    const out = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 15000,
    });
    appendAuditLog({
      type: 'action',
      sourceAgentId: agent.id,
      sourceAgentName: agent.name,
      message: `Parancs végrehajtva: ${command}`,
      verifiedExecution: true,
    });
    return { executed: true, stdout: out, stderr: '' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    appendAuditLog({
      type: 'action',
      sourceAgentId: agent.id,
      sourceAgentName: agent.name,
      message: `Parancs sikertelen (${command}): ${msg}`,
      verifiedExecution: true,
    });
    return { executed: false, stdout: '', stderr: msg };
  }
}

export function hostReadFileForAgent(agentId: string, filePath: string): string {
  assertHostPermission(`read_file:${filePath}`, agentId);
  const abs = path.resolve(process.cwd(), filePath);
  return fs.readFileSync(abs, 'utf8');
}

export function hostWriteFileForAgent(agentId: string, filePath: string, content: string): void {
  assertHostPermission(`write_file:${filePath}`, agentId);
  const abs = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  appendAuditLog({
    type: 'action',
    sourceAgentId: agentId,
    sourceAgentName: agentId,
    message: `Fájl írva: ${filePath}`,
    verifiedExecution: true,
  });
}

export function auditRecentCycle(): {
  status: 'nominal' | 'warning' | 'alert';
  discrepancies: string[];
  summary: string;
} {
  const state = getState();
  const recentLogs = state.auditLogs.slice(-25);
  const recentMessages = state.messages.slice(-10).filter((m) => m.senderType === 'agent');

  const verifiedActions = new Set(
    recentLogs
      .filter((l) => l.verifiedExecution === true && (l.type === 'action' || l.type === 'terminal' || l.type === 'kanban'))
      .map((l) => l.sourceAgentId)
  );

  const discrepancies: string[] = [];
  const claimRegex = /\b(telepítettem|lefuttattam|létrehoztam a fájlt|módosítottam a rendszert|installed|executed command|created file)\b/i;

  for (const msg of recentMessages) {
    const hasToolProof = (msg.toolTrace && msg.toolTrace.some((t) => t.ok)) || verifiedActions.has(msg.senderId);
    if (claimRegex.test(msg.content) && !hasToolProof) {
      discrepancies.push(
        `Eltérés (${msg.senderName}): végrehajtást állított ("${msg.content.slice(0, 70)}..."), de nem található igazolt parancs/fájl végrehajtási napló.`
      );
    }
  }

  const status: 'nominal' | 'warning' | 'alert' = discrepancies.length > 0 ? 'warning' : 'nominal';
  const summary =
    discrepancies.length > 0
      ? `${discrepancies.length} eltérés észlelve az utolsó körben.`
      : 'Minden rendben — az állítások összhangban vannak a végrehajtási naplókkal.';

  updateState((s) => {
    s.supervisor.lastAuditAt = new Date().toISOString();
    s.supervisor.status = status;
    s.supervisor.lastSummary = summary;
    s.supervisor.discrepanciesFound += discrepancies.length;
  });

  if (discrepancies.length > 0) {
    for (const d of discrepancies) {
      appendAuditLog({
        type: 'supervisor',
        sourceAgentId: 'supervisor-auditor',
        sourceAgentName: 'Felügyelő Auditor',
        message: d,
        verifiedExecution: true,
      });
    }
  }

  return { status, discrepancies, summary };
}

export function resolveTargetAgent(prompt: string, explicitAgentId?: string | null): Agent | null {
  const state = getState();
  const userAgents = state.agents.filter((a) => !a.isSupervisor && a.active);
  if (userAgents.length === 0) return null;

  if (explicitAgentId) {
    const found = userAgents.find((a) => a.id === explicitAgentId);
    if (found) return found;
  }

  const lower = prompt.toLowerCase();
  for (const agent of userAgents) {
    const nameLower = agent.name.toLowerCase();
    if (
      lower.startsWith(`@${nameLower}`) ||
      lower.startsWith(`${nameLower}:`) ||
      lower.includes(`@${nameLower}`)
    ) {
      return agent;
    }
  }

  return userAgents.find((a) => a.parentAgentId === null) || userAgents[0];
}

/**
 * Multi-step bounded tool-calling loop for an agent (OpenClaw pattern).
 */
export async function runAgentWithTools(params: {
  agent: Agent;
  prompt: string;
  complexity: 'simple' | 'complex';
  isolationMode: SessionIsolationMode;
  images?: InlineMediaInput[];
  maxSteps?: number;
  routerDeps?: RouterDependencies;
}): Promise<{
  text: string;
  model: string;
  provider: Agent['providerId'];
  costUsd: number;
  toolTrace: ToolExecutionStep[];
}> {
  const systemInstruction = buildDynamicAgentSystemPrompt(params.agent, params.isolationMode);
  const maxSteps = params.maxSteps ?? 4;
  const toolTrace: ToolExecutionStep[] = [];
  let runningPrompt = params.prompt;
  let totalCost = 0;
  let lastModel = params.agent.modelId;
  let lastProvider = params.agent.providerId;

  for (let step = 0; step < maxSteps; step++) {
    const res = await invokeWithFailover(
      {
        prompt: runningPrompt,
        systemInstruction,
        complexity: params.complexity,
        preferredProvider: params.agent.providerId,
        preferredModel: params.agent.modelId,
        agentId: params.agent.id,
        images: step === 0 ? params.images : undefined,
        bypassCache: toolTrace.length > 0 || Boolean(params.images?.length),
      },
      params.routerDeps
    );
    totalCost = Number((totalCost + res.costUsd).toFixed(6));
    lastModel = res.model;
    lastProvider = res.provider;

    const call = parseToolCallFromResponse(res.text);
    if (!call) {
      return {
        text: res.text,
        model: lastModel,
        provider: lastProvider,
        costUsd: totalCost,
        toolTrace,
      };
    }

    const execOutcome = await executeAgentTool({
      agent: params.agent,
      toolName: call.name,
      args: call.args,
      isolationMode: params.isolationMode,
    });
    toolTrace.push(execOutcome.step);
    runningPrompt = `${runningPrompt}\n\n[Eszköz hívás #${step + 1}: ${call.name}]\n[Eredmény]:\n${execOutcome.observation}\n\nFolytasd a feladatot vagy adj végleges választ a felhasználónak.`;
  }

  return {
    text: `Eszköz-lánc befejezve (${toolTrace.length} lépés végrehajtva).`,
    model: lastModel,
    provider: lastProvider,
    costUsd: totalCost,
    toolTrace,
  };
}

/**
 * Processes an explicit user message (Web UI, Telegram, Discord, Slack, Webhook, Federation)
 * with priority over autonomous tasks, session isolation, PreCompact hook, tool loop, and delegation.
 */
export async function handleUserTurn(params: {
  threadId: string;
  content: string;
  channel: UnifiedMessage['channel'];
  targetAgentId?: string | null;
  attachments?: MessageAttachment[];
  routerDeps?: RouterDependencies;
}): Promise<{
  userMessage: UnifiedMessage;
  agentMessages: UnifiedMessage[];
  coordinatorReply: UnifiedMessage;
}> {
  const state = getState();
  if (state.settings.killSwitchActive) {
    throw new Error('A Vészleállító aktív — új feladatok feldolgozása szünetel.');
  }

  const thread = state.threads.find((t) => t.id === params.threadId);
  const isolationMode: SessionIsolationMode =
    thread?.isolationMode ?? (params.threadId === 'thread-main' ? 'main_host' : 'sandboxed');

  const userMessage = appendUnifiedMessage({
    threadId: params.threadId,
    senderType: 'user',
    senderId: 'user',
    senderName: 'Felhasználó',
    targetAgentId: params.targetAgentId ?? null,
    channel: params.channel,
    content: params.content,
    attachments: params.attachments,
  });

  // PreCompact hook: safeguard decisions before thread grows long
  preCompactThreadMemory(params.threadId);

  updateState((s) => {
    s.shortTermSignals.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      content: params.content,
      source: `user_${params.channel}`,
      queryCount: 1,
      tags: ['dialogue'],
    });
  });

  const targetAgent = resolveTargetAgent(params.content, params.targetAgentId);
  if (!targetAgent) {
    const sysReply = appendUnifiedMessage({
      threadId: params.threadId,
      senderType: 'system',
      senderId: 'system',
      senderName: 'Rendszer',
      channel: params.channel,
      content: 'Nincs aktív felhasználói ágens. Hozz létre egyet az Ágensek fülön vagy a Setup Wizardban.',
    });
    return { userMessage, agentMessages: [], coordinatorReply: sysReply };
  }

  updateState((s) => {
    s.activeExplicitTaskAgentId = targetAgent.id;
  });

  const agentMessages: UnifiedMessage[] = [];
  const subordinates = state.agents.filter(
    (a) => a.parentAgentId === targetAgent.id && a.active && !a.isSupervisor
  );

  let delegatedContext = '';
  if (subordinates.length > 0 && !params.targetAgentId) {
    const delegate = subordinates[0];
    const delegationPrompt = `A koordinátor (${targetAgent.name}) delegálja neked ezt a részfeladatot: "${params.content}". Adj rövid, szakmai elemzést a saját szerepkörödből (${delegate.role}).`;
    appendAuditLog({
      type: 'thought',
      sourceAgentId: targetAgent.id,
      sourceAgentName: targetAgent.name,
      message: `Delegálás -> ${delegate.name}: "${params.content.slice(0, 80)}"`,
    });

    try {
      const subRes = await runAgentWithTools({
        agent: delegate,
        prompt: delegationPrompt,
        complexity: 'simple',
        // OpenClaw pattern: subagents default to sandboxed isolation
        isolationMode: 'sandboxed',
        maxSteps: 2,
        routerDeps: params.routerDeps,
      });
      const subMsg = appendUnifiedMessage({
        threadId: params.threadId,
        senderType: 'agent',
        senderId: delegate.id,
        senderName: delegate.name,
        targetAgentId: targetAgent.id,
        channel: 'swarm_internal',
        content: subRes.text,
        modelUsed: subRes.model,
        providerUsed: subRes.provider,
        costUsd: subRes.costUsd,
        toolTrace: subRes.toolTrace,
      });
      agentMessages.push(subMsg);
      delegatedContext = `\n\nBeérkezett belső delegálási jelentés (${delegate.name}):\n${subRes.text}`;
    } catch (err) {
      appendAuditLog({
        type: 'thought',
        sourceAgentId: delegate.id,
        sourceAgentName: delegate.name,
        message: `Delegált részfeladat hiba: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const isComplex =
    params.content.length > 160 || /\b(architektúra|kód|terv|debug|refactor|elemzés)\b/i.test(params.content);
  const fullPrompt = `${params.content}${delegatedContext}`;
  const imageInputs: InlineMediaInput[] = (params.attachments || [])
    .filter((a) => a.kind === 'image' && a.dataBase64)
    .map((a) => ({ mimeType: a.mimeType, dataBase64: a.dataBase64 }));

  let replyText = '';
  let modelUsed = targetAgent.modelId;
  let providerUsed = targetAgent.providerId;
  let costUsd = 0;
  let toolTrace: ToolExecutionStep[] = [];

  try {
    const res = await runAgentWithTools({
      agent: targetAgent,
      prompt: fullPrompt,
      complexity: isComplex ? 'complex' : 'simple',
      isolationMode,
      images: imageInputs.length > 0 ? imageInputs : undefined,
      maxSteps: 4,
      routerDeps: params.routerDeps,
    });
    replyText = res.text;
    modelUsed = res.model;
    providerUsed = res.provider;
    costUsd = res.costUsd;
    toolTrace = res.toolTrace;
  } catch (err) {
    replyText = `Hiba a modellhívás közben (valós failover lánc eredmény): ${err instanceof Error ? err.message : String(err)}`;
  }

  const coordinatorReply = appendUnifiedMessage({
    threadId: params.threadId,
    senderType: 'agent',
    senderId: targetAgent.id,
    senderName: targetAgent.name,
    channel: params.channel,
    content: replyText,
    modelUsed,
    providerUsed,
    costUsd,
    toolTrace,
  });

  updateState((s) => {
    s.activeExplicitTaskAgentId = null;
  });

  auditRecentCycle();

  return { userMessage, agentMessages, coordinatorReply };
}

/** Marveen Kanban AI Auto-Breakdown */
export async function breakdownKanbanCardWithAi(
  cardId: string,
  routerDeps?: RouterDependencies
): Promise<KanbanCard | null> {
  const state = getState();
  const card = state.kanban.find((c) => c.id === cardId);
  if (!card) return null;

  let lines: string[] = [];
  try {
    const res = await invokeWithFailover(
      {
        complexity: 'simple',
        prompt: `Bontsd fel az alábbi Kanban feladatot 3-5 konkrét, végrehajtható részfeladatra (egyszerű szöveges sorok, számok/jelölők nélkül):\nCím: ${card.title}\nLeírás: ${card.description || 'nincs'}`,
        systemInstruction: 'Válaszolj pontosan 3-5 tömör, cselekvés-orientált sorral.',
      },
      routerDeps
    );
    lines = res.text
      .split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 3)
      .slice(0, 6);
  } catch {
    lines = [
      `Követelmények pontosítása: ${card.title}`,
      'Implementáció és egységtesztek elkészítése',
      'Felügyelő ellenőrzés és lezárás',
    ];
  }

  let updated: KanbanCard | null = null;
  updateState((s) => {
    const target = s.kanban.find((c) => c.id === cardId);
    if (!target) return;
    target.subtasks = lines.map((title) => ({
      id: `sub-${crypto.randomUUID().slice(0, 6)}`,
      title,
      done: false,
    }));
    target.updatedAt = new Date().toISOString();
    updated = target;
  });

  appendAuditLog({
    type: 'kanban',
    sourceAgentId: 'kanban-ai',
    sourceAgentName: 'Kanban Tervező',
    message: `AI részfeladat-bontás kész: ${card.title} (${lines.length} lépés)`,
    verifiedExecution: true,
  });

  return updated;
}

export function createAgent(input: {
  name: string;
  role: string;
  avatar?: string;
  parentAgentId?: string | null;
  systemPrompt: string;
  modelId?: string;
  providerId?: Agent['providerId'];
  webSearchEnabled?: boolean;
  hostExecutionEnabled?: boolean;
  dailyBudgetUsd?: number;
  voiceReplyMode?: Agent['voiceReplyMode'];
}): Agent {
  const now = new Date().toISOString();
  const state = getState();
  const defaultProvider = input.providerId ?? state.settings.primaryProvider;
  const agent: Agent = {
    id: `agent-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    avatar: input.avatar || 'cpu',
    role: input.role.trim(),
    parentAgentId: input.parentAgentId ?? null,
    systemPrompt: input.systemPrompt.trim(),
    modelId:
      input.modelId ||
      (defaultProvider === 'ollama' ? state.settings.ollamaModel : 'gemini-4-hydrogen'),
    providerId: defaultProvider,
    webSearchEnabled: input.webSearchEnabled ?? true,
    hostExecutionEnabled: input.hostExecutionEnabled ?? state.settings.hostPermissionsGranted,
    active: true,
    telegramBotEnabled: false,
    telegramHasToken: false,
    dailyBudgetUsd: input.dailyBudgetUsd ?? 0,
    dailySpendUsd: 0,
    voiceReplyMode: input.voiceReplyMode ?? 'off',
    createdAt: now,
    updatedAt: now,
  };

  updateState((s) => {
    s.agents.push(agent);
  });

  appendAuditLog({
    type: 'system',
    sourceAgentId: agent.id,
    sourceAgentName: agent.name,
    message: `Új ágens létrehozva: ${agent.name} (${agent.role})`,
    verifiedExecution: true,
  });

  return agent;
}

const KANBAN_PRIO_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Autonomous Kanban Backlog Worker:
 * Picks up the highest-priority 'todo' card when idle (no explicit user task running),
 * moves it to 'in_progress', executes it via the assigned agent (sandboxed), completes subtasks,
 * and marks it 'done' cleanly.
 */
export async function runAutonomousKanbanWorkerTick(
  routerDeps?: RouterDependencies
): Promise<{ worked: boolean; cardId?: string; status?: string; reason?: string }> {
  const state = getState();
  if (state.settings.killSwitchActive) {
    return { worked: false, reason: 'Vészleállító aktív.' };
  }
  if (state.activeExplicitTaskAgentId) {
    return { worked: false, reason: 'Aktív felhasználói kérés élvez elsőbbséget.' };
  }

  const activeAgents = state.agents.filter((a) => a.active && !a.isSupervisor);
  if (activeAgents.length === 0) {
    return { worked: false, reason: 'Nincs aktív felhasználói ágens.' };
  }

  const wipCount = state.kanban.filter((c) => !c.archived && c.status === 'in_progress').length;
  if (wipCount >= (state.settings.kanbanWipLimit || 3)) {
    return { worked: false, reason: `WIP limit elérve (${wipCount}/${state.settings.kanbanWipLimit}).` };
  }

  const todoCards = state.kanban
    .filter((c) => !c.archived && c.status === 'todo')
    .sort((a, b) => (KANBAN_PRIO_WEIGHT[b.priority || 'medium'] ?? 2) - (KANBAN_PRIO_WEIGHT[a.priority || 'medium'] ?? 2));

  if (todoCards.length === 0) {
    return { worked: false, reason: 'Nincs várakozó (todo) Kanban kártya.' };
  }

  const card = todoCards[0];
  const worker =
    (card.assignedAgentId && activeAgents.find((a) => a.id === card.assignedAgentId)) || activeAgents[0];

  const now = new Date().toISOString();
  updateState((s) => {
    const ref = s.kanban.find((c) => c.id === card.id);
    if (ref) {
      ref.status = 'in_progress';
      ref.assignedAgentId = worker.id;
      ref.updatedAt = now;
    }
  });

  appendAuditLog({
    type: 'kanban',
    sourceAgentId: worker.id,
    sourceAgentName: worker.name,
    message: `Autonóm Kanban munkás felvette a feladatot: ${card.title}`,
    verifiedExecution: true,
  });

  const subtaskText = (card.subtasks || [])
    .filter((st) => !st.done)
    .map((st) => `- ${st.title}`)
    .join('\n');

  const prompt = [
    `Autonóm Kanban háttér-végrehajtás (feladat: ${card.title}):`,
    card.description ? `Leírás: ${card.description}` : '',
    subtaskText ? `Nyitott részfeladatok:\n${subtaskText}` : '',
    `Dolgozd fel a feladatot röviden, tényszerűen, és ha kész, foglald össze az elvégzett lépéseket.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const result = await runAgentWithTools({
      agent: worker,
      prompt,
      complexity: card.priority === 'urgent' || card.priority === 'high' ? 'complex' : 'simple',
      isolationMode: 'sandboxed',
      maxSteps: 3,
      routerDeps,
    });

    const finishedAt = new Date().toISOString();
    updateState((s) => {
      const ref = s.kanban.find((c) => c.id === card.id);
      if (ref) {
        ref.status = 'done';
        ref.updatedAt = finishedAt;
        if (ref.subtasks && ref.subtasks.length > 0) {
          for (const st of ref.subtasks) st.done = true;
        }
        ref.description = `${ref.description ? `${ref.description}\n\n` : ''}[Autonóm teljesítés — ${worker.name}]: ${result.text.slice(0, 600)}`;
      }
    });

    appendUnifiedMessage({
      threadId: state.threads[0]?.id || 'thread-main',
      senderType: 'agent',
      senderId: worker.id,
      senderName: worker.name,
      channel: 'swarm_internal',
      content: `[Kanban kész: ${card.title}]\n${result.text}`,
      modelUsed: result.model,
      providerUsed: result.provider,
      costUsd: result.costUsd,
      toolTrace: result.toolTrace,
    });

    appendAuditLog({
      type: 'kanban',
      sourceAgentId: worker.id,
      sourceAgentName: worker.name,
      message: `Autonóm Kanban feladat kész: ${card.title}`,
      verifiedExecution: true,
    });

    return { worked: true, cardId: card.id, status: 'done' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendAuditLog({
      type: 'kanban',
      sourceAgentId: worker.id,
      sourceAgentName: worker.name,
      message: `Autonóm Kanban hiba (${card.title}): ${msg}`,
      verifiedExecution: false,
    });
    return { worked: false, cardId: card.id, status: 'in_progress', reason: msg };
  }
}
