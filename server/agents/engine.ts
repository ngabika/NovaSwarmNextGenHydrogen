import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Agent,
  ExecutionPreset,
  KanbanCard,
  MessageAttachment,
  SessionIsolationMode,
  ToolExecutionStep,
  UnifiedMessage,
} from '../../shared/types';
import { ensureKanbanGitBranch } from '../infra/hostAdmin';
import { preCompactThreadMemory, searchMemories } from '../memory/vectorStore';
import {
  invokeStreamWithFailover,
  invokeWithFailover,
  type InlineMediaInput,
  type RouterDependencies,
} from '../providers/router';
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
  buildDynamicToolsInstruction,
  executeAgentTool,
  parseAllToolCallsFromResponse,
} from './tools';

export const SELF_DOCUMENTATION_TEXT = `NovaSwarm Önismereti Architektúra Dokumentáció:
1. Állapot & Igazságforrás: Minden konfiguráció és entitás a központi állapottárban (.state.json, .config.json) él, atomikus ideiglenes fájlos átnevezéssel (rename) mentve.
2. Ágensek, Al-ágensek & Tanács: Induláskor csak a felhasználó által létrehozott ágensek és az állandó Felügyelő Auditor fut. Párhuzamos eszközlánc, Konzilium mód, időablak és sebességkorlát támogatva.
3. Session Izoláció & Jogosultsági Kapu: A fő szál (main_host) gazdagép-hozzáférést kaphat az assertHostPermission kapun át; minden másodlagos/külső szál (sandboxed) automatikusan izolált sandboxban fut.
4. AI Gateway Proxy (/v1/*): OpenAI-kompatibilis /v1/chat/completions (SSE stream & auto routing), /v1/models, /v1/embeddings, Virtuális Kulcsok (budget + RPM), LRU válasz-cache, Guardrail védelem és kulcs-cooldown rotáció.
5. Rétegzett Hibrid Memória & Álmodás: Hot/Warm/Cold/Shared rétegek, salience decay, RRF hibrid keresés, ellentmondás-feloldás, RAG dokumentumok, Markdown Wiki és 3 fázisú Álmodás + Reflexion.
6. Ökoszisztéma & Host Üzemeltetés: Gazdag Kanban (függőségek, izolált git branch), Munkafolyamatok, Webhookok, RSS/Email/Naptár, Okosotthon (HA/MQTT), Docker/Systemd/SSH Flotta és GitHub OTA frissítés.`;

/** M23: Check per-agent active hours & hourly run rate limits */
export function isAgentScheduleAndRateAllowed(agent: Agent, now = new Date()): { allowed: boolean; reason?: string } {
  if (typeof agent.activeHoursStart === 'number' && typeof agent.activeHoursEnd === 'number') {
    const h = now.getHours();
    const start = agent.activeHoursStart;
    const end = agent.activeHoursEnd;
    const inWindow = start <= end ? h >= start && h < end : h >= start || h < end;
    if (!inWindow) {
      return { allowed: false, reason: `Csendes órák (${start}:00–${end}:00 között aktív csak)` };
    }
  }
  if (typeof agent.maxRunsPerHour === 'number' && agent.maxRunsPerHour > 0) {
    const cutoff = now.getTime() - 3_600_000;
    const recentCount = (agent.runTimestamps || []).filter((ts) => Date.parse(ts) >= cutoff).length;
    if (recentCount >= agent.maxRunsPerHour) {
      return { allowed: false, reason: `Óránkénti futtatási limit elérve (${recentCount}/${agent.maxRunsPerHour})` };
    }
  }
  return { allowed: true };
}

function recordAgentRunTimestamp(agentId: string): void {
  const cutoff = Date.now() - 3_600_000;
  const nowIso = new Date().toISOString();
  updateState((s) => {
    const ag = s.agents.find((a) => a.id === agentId);
    if (!ag) return;
    ag.runTimestamps = [...(ag.runTimestamps || []).filter((t) => Date.parse(t) >= cutoff), nowIso];
  });
}

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
  const allowedMcps =
    agent.allowedMcpIds && agent.allowedMcpIds.length > 0
      ? state.mcpServers.filter((m) => agent.allowedMcpIds!.includes(m.id))
      : state.mcpServers;
  const mcpSummary = allowedMcps.map((m) => `- ${m.id}: ${m.name} (${m.transport || 'http'}, ${m.status})`).join('\n');

  const dynamicToolsIdx = buildDynamicToolsInstruction();

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
    mcpSummary ? `Elérhető MCP szerverek:\n${mcpSummary}` : '',
    memories ? `Kapcsolódó tartós memóriák:\n${memories}` : '',
    skillsIndex ? `Elérhető ellenőrzött skillek (progressive disclosure):\n${skillsIndex}` : '',
    AGENT_TOOLS_INSTRUCTION,
    dynamicToolsIdx,
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
 * Multi-step bounded tool-calling loop with parallel tool execution (M2 & M3),
 * execution presets (M4), and optional streaming delta callback (M1).
 */
export async function runAgentWithTools(params: {
  agent: Agent;
  prompt: string;
  complexity: 'simple' | 'complex';
  preset?: ExecutionPreset;
  isolationMode: SessionIsolationMode;
  images?: InlineMediaInput[];
  maxSteps?: number;
  onStreamDelta?: (delta: string) => void;
  routerDeps?: RouterDependencies;
}): Promise<{
  text: string;
  model: string;
  provider: Agent['providerId'];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  toolTrace: ToolExecutionStep[];
  artifactIds: string[];
}> {
  const startedAt = Date.now();
  const state = getState();
  const systemInstruction = buildDynamicAgentSystemPrompt(params.agent, params.isolationMode);
  const maxSteps = Math.max(1, Math.min(20, params.maxSteps ?? state.settings.maxToolSteps ?? 12));
  const preset = params.preset ?? state.settings.defaultPreset ?? 'fast';
  const toolTrace: ToolExecutionStep[] = [];
  const artifactIds: string[] = [];
  let runningPrompt = params.prompt;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let retryCount = 0;
  let lastModel = params.agent.modelId;
  let lastProvider = params.agent.providerId;

  for (let step = 0; step < maxSteps; step++) {
    const invokeReq = {
      prompt: runningPrompt,
      systemInstruction,
      complexity: preset === 'deep' ? ('complex' as const) : params.complexity,
      preset,
      preferredProvider: params.agent.providerId,
      preferredModel: params.agent.modelId,
      agentId: params.agent.id,
      images: step === 0 ? params.images : undefined,
      bypassCache: toolTrace.length > 0 || Boolean(params.images?.length),
    };

    const res = params.onStreamDelta
      ? await invokeStreamWithFailover(invokeReq, params.onStreamDelta, params.routerDeps)
      : await invokeWithFailover(invokeReq, params.routerDeps);

    totalCost = Number((totalCost + res.costUsd).toFixed(6));
    totalInputTokens += res.inputTokens ?? 0;
    totalOutputTokens += res.outputTokens ?? 0;
    lastModel = res.model;
    lastProvider = res.provider;

    const calls = parseAllToolCallsFromResponse(res.text);
    if (calls.length === 0) {
      return {
        text: res.text,
        model: lastModel,
        provider: lastProvider,
        costUsd: totalCost,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        latencyMs: Date.now() - startedAt,
        toolTrace,
        artifactIds,
      };
    }

    const outcomes = await Promise.all(
      calls.map((c) =>
        executeAgentTool({
          agent: params.agent,
          toolName: c.name,
          args: c.args,
          isolationMode: params.isolationMode,
        })
      )
    );

    const obsBlocks: string[] = [];
    let anyFailed = false;
    for (let idx = 0; idx < outcomes.length; idx++) {
      const outcome = outcomes[idx];
      toolTrace.push(outcome.step);
      if (!outcome.step.ok) anyFailed = true;
      if (outcome.createdArtifactId) artifactIds.push(outcome.createdArtifactId);
      obsBlocks.push(`[Eszköz hívás #${step + 1}.${idx + 1}: ${calls[idx].name}]\n[Eredmény]:\n${outcome.observation}`);
    }

    /** M35: Self-healing tool retry injection */
    let healHint = '';
    if (anyFailed && retryCount < 2) {
      retryCount += 1;
      healHint = `\n\n[Öngyógyító Tool Figyelmeztetés (${retryCount}/2)]: Egy vagy több eszköz hívás sikertelen volt. Elemezd a pontos hibaüzenetet, javítsd az argumentumokat vagy útvonalat, és próbáld meg újra vagy válassz alternatív eszközt!`;
    }

    runningPrompt = `${runningPrompt}\n\n${obsBlocks.join('\n\n')}${healHint}\n\nFolytasd a feladatot vagy adj végleges választ a felhasználónak.`;
  }

  return {
    text: `Eszköz-lánc befejezve (${toolTrace.length} lépés végrehajtva).`,
    model: lastModel,
    provider: lastProvider,
    costUsd: totalCost,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    latencyMs: Date.now() - startedAt,
    toolTrace,
    artifactIds,
  };
}

/**
 * Processes an explicit user message (Web UI, Telegram, Discord, Slack, Webhook, Federation)
 * with priority over autonomous tasks, session isolation, PreCompact hook, tool loop, streaming, and delegation.
 */
export async function handleUserTurn(params: {
  threadId: string;
  content: string;
  channel: UnifiedMessage['channel'];
  targetAgentId?: string | null;
  preset?: ExecutionPreset;
  attachments?: MessageAttachment[];
  onStreamDelta?: (delta: string) => void;
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

  // Enforce schedule & rate guard for automated non-interactive channels
  if (params.channel !== 'web') {
    const sched = isAgentScheduleAndRateAllowed(targetAgent);
    if (!sched.allowed) {
      const blockedReply = appendUnifiedMessage({
        threadId: params.threadId,
        senderType: 'system',
        senderId: targetAgent.id,
        senderName: targetAgent.name,
        channel: params.channel,
        content: `Ütemezési korlát miatt kihagyva: ${sched.reason}`,
      });
      return { userMessage, agentMessages: [], coordinatorReply: blockedReply };
    }
  }
  recordAgentRunTimestamp(targetAgent.id);

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
        preset: params.preset,
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
        artifactIds: subRes.artifactIds,
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
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyMs = 0;
  let toolTrace: ToolExecutionStep[] = [];
  let artifactIds: string[] = [];

  try {
    const res = await runAgentWithTools({
      agent: targetAgent,
      prompt: fullPrompt,
      complexity: isComplex ? 'complex' : 'simple',
      preset: params.preset,
      isolationMode,
      images: imageInputs.length > 0 ? imageInputs : undefined,
      onStreamDelta: params.onStreamDelta,
      routerDeps: params.routerDeps,
    });
    replyText = res.text;
    modelUsed = res.model;
    providerUsed = res.provider;
    costUsd = res.costUsd;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
    latencyMs = res.latencyMs;
    toolTrace = res.toolTrace;
    artifactIds = res.artifactIds;
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
    inputTokens,
    outputTokens,
    latencyMs,
    costUsd,
    toolTrace,
    artifactIds: artifactIds.length > 0 ? artifactIds : undefined,
  });

  updateState((s) => {
    s.activeExplicitTaskAgentId = null;
  });

  auditRecentCycle();

  return { userMessage, agentMessages, coordinatorReply };
}

/**
 * Ú21: Multi-Agent Council Consensus Mode
 * Queries up to 3 active specialist agents in parallel, then synthesizes consensus.
 */
export async function handleCouncilTurn(params: {
  threadId: string;
  content: string;
  preset?: ExecutionPreset;
  routerDeps?: RouterDependencies;
}): Promise<{
  userMessage: UnifiedMessage;
  opinions: UnifiedMessage[];
  consensusReply: UnifiedMessage;
}> {
  const state = getState();
  if (state.settings.killSwitchActive) {
    throw new Error('A Vészleállító aktív.');
  }
  const activeAgents = state.agents.filter((a) => !a.isSupervisor && a.active).slice(0, 3);
  const userMessage = appendUnifiedMessage({
    threadId: params.threadId,
    senderType: 'user',
    senderId: 'user',
    senderName: 'Felhasználó (Konzilium)',
    channel: 'web',
    content: params.content,
  });

  if (activeAgents.length === 0) {
    const emptyReply = appendUnifiedMessage({
      threadId: params.threadId,
      senderType: 'system',
      senderId: 'council',
      senderName: 'Konzilium',
      channel: 'web',
      content: 'Nincs aktív felhasználói ágens a tanácskozáshoz.',
    });
    return { userMessage, opinions: [], consensusReply: emptyReply };
  }

  const results = await Promise.all(
    activeAgents.map(async (ag) => {
      const res = await runAgentWithTools({
        agent: ag,
        prompt: `Konzilium szakértői véleménykérés (szerepköröd: ${ag.role}):\n${params.content}\n\nAdj tömör, határozott állásfoglalást a saját szakterületed szemszögéből, és a legvégén adj egyetlen sort ebben a formában: [SZAVAZAT: approve|caution|reject, BIZALOM: 85]`,
        complexity: 'simple',
        preset: params.preset || 'deep',
        isolationMode: 'sandboxed',
        maxSteps: 2,
        routerDeps: params.routerDeps,
      });
      return { ag, res };
    })
  );

  const opinions: UnifiedMessage[] = [];
  const councilVotes: NonNullable<UnifiedMessage['councilVotes']> = [];

  for (const { ag, res } of results) {
    const vMatch = res.text.match(/\[SZAVAZAT:\s*(approve|caution|reject)[^\d]*(\d{1,3})?\]/i);
    const verdict = (vMatch?.[1]?.toLowerCase() as 'approve' | 'caution' | 'reject') ||
      (/\b(elutasít|kockázat|veszély|reject|nem ajánlott)\b/i.test(res.text)
        ? 'caution'
        : 'approve');
    const confidence = Math.min(100, Math.max(10, Number(vMatch?.[2] || 82)));
    councilVotes.push({
      agentId: ag.id,
      agentName: ag.name,
      verdict,
      confidence,
      rationale: res.text.replace(/\[SZAVAZAT:[^\]]+\]/i, '').trim().slice(0, 140),
    });

    opinions.push(
      appendUnifiedMessage({
        threadId: params.threadId,
        senderType: 'agent',
        senderId: ag.id,
        senderName: `${ag.name} (${ag.role})`,
        channel: 'swarm_internal',
        content: res.text,
        modelUsed: res.model,
        providerUsed: res.provider,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        latencyMs: res.latencyMs,
        costUsd: res.costUsd,
        toolTrace: res.toolTrace,
      })
    );
  }

  const lead = activeAgents[0];
  const synthesisPrompt = `Összegezd az alábbi ${results.length} specialista véleményét egyetlen közös, cselekvési konszenzusba magyarul:\n\nKérdés: ${params.content}\n\n${results
    .map((r) => `### ${r.ag.name} (${r.ag.role}):\n${r.res.text}`)
    .join('\n\n')}`;

  const synthT0 = Date.now();
  const synth = await invokeWithFailover(
    {
      prompt: synthesisPrompt,
      complexity: 'complex',
      preset: params.preset || 'deep',
      preferredProvider: lead.providerId,
      preferredModel: lead.modelId,
      agentId: lead.id,
    },
    params.routerDeps
  );

  const consensusReply = appendUnifiedMessage({
    threadId: params.threadId,
    senderType: 'agent',
    senderId: lead.id,
    senderName: `Konzilium Konszenzus (${lead.name})`,
    channel: 'web',
    content: synth.text,
    modelUsed: synth.model,
    providerUsed: synth.provider,
    inputTokens: synth.inputTokens,
    outputTokens: synth.outputTokens,
    latencyMs: Date.now() - synthT0,
    costUsd: synth.costUsd,
    councilVotes,
  });

  return { userMessage, opinions, consensusReply };
}

/** M32: Fork a chat thread from a specific message into an isolated sandboxed branch */
export function forkThreadFromMessage(sourceThreadId: string, messageId: string): {
  newThreadId: string;
  copiedMessages: number;
} {
  const state = getState();
  const srcThread = state.threads.find((t) => t.id === sourceThreadId);
  const threadMsgs = state.messages.filter((m) => m.threadId === sourceThreadId);
  const idx = threadMsgs.findIndex((m) => m.id === messageId);
  if (idx < 0) throw new Error('A megadott üzenet nem található ebben a beszélgetési szálban.');

  const slice = threadMsgs.slice(0, idx + 1);
  const newThreadId = `thread-fork-${crypto.randomUUID().slice(0, 6)}`;
  const now = new Date().toISOString();

  updateState((s) => {
    s.threads.unshift({
      id: newThreadId,
      title: `Elágazás: ${srcThread?.title || 'Beszélgetés'}`,
      folder: srcThread?.folder || 'Általános',
      isolationMode: 'sandboxed',
      channelSource: 'web',
      createdAt: now,
      updatedAt: now,
    });
    for (const m of slice) {
      s.messages.push({
        ...m,
        id: crypto.randomUUID(),
        threadId: newThreadId,
        forkedFromMessageId: m.id === messageId ? messageId : m.forkedFromMessageId,
      });
    }
  });

  return { newThreadId, copiedMessages: slice.length };
}

/** M32: Regenerate the last user turn cleanly */
export async function regenerateLastTurn(
  threadId: string,
  preset?: ExecutionPreset,
  routerDeps?: RouterDependencies
) {
  const state = getState();
  const threadMsgs = state.messages.filter((m) => m.threadId === threadId);
  const lastUser = [...threadMsgs].reverse().find((m) => m.senderType === 'user');
  if (!lastUser) throw new Error('Nincs újragenerálható felhasználói kérdés ebben a szálban.');

  return handleUserTurn({
    threadId,
    content: lastUser.content,
    channel: lastUser.channel === 'swarm_internal' ? 'web' : lastUser.channel,
    targetAgentId: lastUser.targetAgentId,
    preset,
    attachments: lastUser.attachments,
    routerDeps,
  });
}

/** Kanban AI Auto-Breakdown */
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
  allowedMcpIds?: string[];
  activeHoursStart?: number;
  activeHoursEnd?: number;
  maxRunsPerHour?: number;
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
    allowedMcpIds: input.allowedMcpIds,
    activeHoursStart: input.activeHoursStart,
    activeHoursEnd: input.activeHoursEnd,
    maxRunsPerHour: input.maxRunsPerHour,
    runTimestamps: [],
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
 * M16 + M17 + M23: Autonomous Kanban Backlog Worker respecting `blockedBy` dependencies,
 * isolated `gitBranch` binding, and agent active schedule/rate limits.
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

  const activeAgents = state.agents.filter(
    (a) => a.active && !a.isSupervisor && isAgentScheduleAndRateAllowed(a).allowed
  );
  if (activeAgents.length === 0) {
    return { worked: false, reason: 'Nincs aktív, időablakon belüli felhasználói ágens.' };
  }

  const wipCount = state.kanban.filter((c) => !c.archived && c.status === 'in_progress').length;
  if (wipCount >= (state.settings.kanbanWipLimit || 3)) {
    return { worked: false, reason: `WIP limit elérve (${wipCount}/${state.settings.kanbanWipLimit}).` };
  }

  const doneIds = new Set(state.kanban.filter((c) => c.status === 'done').map((c) => c.id));
  const todoCards = state.kanban
    .filter((c) => {
      if (c.archived || c.status !== 'todo') return false;
      if (c.blockedBy && c.blockedBy.length > 0) {
        return c.blockedBy.every((depId) => doneIds.has(depId));
      }
      return true;
    })
    .sort((a, b) => (KANBAN_PRIO_WEIGHT[b.priority || 'medium'] ?? 2) - (KANBAN_PRIO_WEIGHT[a.priority || 'medium'] ?? 2));

  if (todoCards.length === 0) {
    return { worked: false, reason: 'Nincs feloldott várakozó (todo) Kanban kártya.' };
  }

  const card = todoCards[0];
  const worker =
    (card.assignedAgentId && activeAgents.find((a) => a.id === card.assignedAgentId)) || activeAgents[0];

  recordAgentRunTimestamp(worker.id);

  if (card.gitBranch) {
    try {
      ensureKanbanGitBranch(card.id);
    } catch {
      // ignore if repo unavailable
    }
  }

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
    card.gitBranch ? `Git branch: ${card.gitBranch}` : '',
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
