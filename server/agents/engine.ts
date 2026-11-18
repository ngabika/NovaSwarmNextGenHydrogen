import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, AuditLogEntry, UnifiedMessage } from '../../shared/types';
import { searchMemories } from '../memory/vectorStore';
import { invokeWithFailover } from '../providers/router';
import {
  assertHostPermission,
  detectDestructiveOperation,
  PROMPT_INJECTION_DEFENSE_RULE,
  requireDestructiveApproval,
} from '../security/permissionGate';
import { appendAuditLog, appendUnifiedMessage, getState, updateState } from '../state/store';

export const SELF_DOCUMENTATION_TEXT = `NovaSwarm Önismereti Architektúra Dokumentáció:
1. Állapot & Igazságforrás: Minden konfiguráció és entitás a központi állapottárban (.state.json, .config.json) él, atomikus ideiglenes fájlos átnevezéssel (rename) mentve.
2. Ágensek & Hierarchia: Induláskor csak a felhasználó által létrehozott első ágens és az állandó Felügyelő Auditor fut. Az ágensek tetszőleges mélységű hierarchiában (parentAgentId) szerveződhetnek.
3. Jogosultsági Kapu & Destruktív Jóváhagyás: Minden gazdagép-fájlművelet, parancs és PTY terminál az egységes assertHostPermission kapun halad át. OS upgrade, csomag-eltávolítás, particionálás és tűzfal-módosítás előtt 1-kattintásos jóváhagyás kötelező.
4. Multi-Provider Router (LiteLLM-minta): Gemini -> OpenRouter/OpenAI/Anthropic -> lokális Ollama failover lánc, kulcs-pool rotációval, dinamikus modellfelfedezéssel és globális napi költséglimittel.
5. Kettős Memória & Álmodás (OpenClaw-minta): Pure Node.js vektoros tár + Obsidian Markdown vault (#tag és [[wikilink]]). 10 perc inaktivitás után Light -> Deep -> REM fázisok konszolidálják a tudást.
6. Önmódosítás & Sandbox: Minden új skill/változás a Felügyelő Auditor izolált tmpfs/Docker sandboxában fut le élesítés előtt; a git-rollback és a titkos fájlok tiltott módosítási zónában vannak.`;

/**
 * Dynamically builds the system prompt for an agent based strictly on actual active agents
 * in the store (Section 6: never hardcoded agent names!) + user profile + prompt-injection rule.
 */
export function buildDynamicAgentSystemPrompt(agent: Agent): string {
  const state = getState();
  const activeRoster = state.agents
    .filter((a) => a.active && a.id !== agent.id)
    .map((a) => `- ${a.name} (${a.role}, ID: ${a.id}${a.isSupervisor ? ' [Technikai Felügyelő]' : ''})`)
    .join('\n');

  const memories = searchMemories(agent.role, 4)
    .map((m) => `- [${m.entity}] ${m.content}`)
    .join('\n');

  return [
    `Te vagy ${agent.name}, szerepköröd: ${agent.role}.`,
    agent.systemPrompt,
    `Felhasználói profil és kommunikációs elvárás:\n${state.settings.userProfile || 'Még nincs megadva.'}`,
    activeRoster
      ? `Aktuális csapattagok (valós, dinamikus lista):\n${activeRoster}`
      : 'Jelenleg te vagy az egyetlen aktív felhasználói ágens a csapatban.',
    memories ? `Kapcsolódó tartós memóriák:\n${memories}` : '',
    `Rendszer önismeret:\n${SELF_DOCUMENTATION_TEXT}`,
    PROMPT_INJECTION_DEFENSE_RULE,
    `Válaszolj a felhasználó nyelvén (${state.settings.language}). Ha egy képességed nem lett ténylegesen végrehajtva eszközzel, SOHA ne állítsd, hogy végrehajtottad.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Host command execution strictly routed through the unified Host Permission Gate (Section 8.2)
 * and narrow destructive action approval list (Section 8.3).
 */
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

/**
 * Permanent Supervisor/Auditor check (Section 10.3):
 * Scans recent logs after an autonomous turn; detects if any agent claimed to have
 * installed/created/executed something without a corresponding verifiedExecution log entry.
 */
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
      .filter((l) => l.verifiedExecution === true && (l.type === 'action' || l.type === 'terminal'))
      .map((l) => l.sourceAgentId)
  );

  const discrepancies: string[] = [];
  const claimRegex = /\b(telepítettem|lefuttattam|létrehoztam a fájlt|módosítottam a rendszert|installed|executed command|created file)\b/i;

  for (const msg of recentMessages) {
    if (claimRegex.test(msg.content) && !verifiedActions.has(msg.senderId)) {
      discrepancies.push(
        `Eltérés (${msg.senderName}): végrehajtást állított ("${msg.content.slice(0, 70)}..."), de nem található igazolt parancs/fájl végrehajtási napló.`
      );
    }
  }

  const status: 'nominal' | 'warning' | 'alert' =
    discrepancies.length > 0 ? 'warning' : 'nominal';
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

/**
 * Resolves explicit @AgentName addressing (Section 16.2) or falls back to root coordinator agent.
 */
export function resolveTargetAgent(prompt: string, explicitAgentId?: string | null): Agent | null {
  const state = getState();
  const userAgents = state.agents.filter((a) => !a.isSupervisor && a.active);
  if (userAgents.length === 0) return null;

  if (explicitAgentId) {
    const found = userAgents.find((a) => a.id === explicitAgentId);
    if (found) return found;
  }

  // Check for explicit name addressing e.g. "@Fejlesztő ..." or "Fejlesztő: ..."
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

  // Root coordinator (top-most non-supervisor agent with parentAgentId === null)
  return userAgents.find((a) => a.parentAgentId === null) || userAgents[0];
}

/**
 * Processes an explicit user message (Web UI or Telegram) with priority over autonomous tasks (Section 10.4).
 * Supports real agent-to-agent delegation when subordinate agents exist.
 */
export async function handleUserTurn(params: {
  threadId: string;
  content: string;
  channel: 'web' | 'telegram';
  targetAgentId?: string | null;
}): Promise<{
  userMessage: UnifiedMessage;
  agentMessages: UnifiedMessage[];
  coordinatorReply: UnifiedMessage;
}> {
  const state = getState();
  if (state.settings.killSwitchActive) {
    throw new Error('A Vészleállító aktív — új feladatok feldolgozása szünetel.');
  }

  const userMessage = appendUnifiedMessage({
    threadId: params.threadId,
    senderType: 'user',
    senderId: 'user',
    senderName: 'Felhasználó',
    targetAgentId: params.targetAgentId ?? null,
    channel: params.channel,
    content: params.content,
  });

  // Store short-term signal for Dreaming Light Phase
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

  // Explicit human instruction preempts any spontaneous initiative (Section 10.4)
  updateState((s) => {
    s.activeExplicitTaskAgentId = targetAgent.id;
  });

  const agentMessages: UnifiedMessage[] = [];
  const subordinates = state.agents.filter(
    (a) => a.parentAgentId === targetAgent.id && a.active && !a.isSupervisor
  );

  // Real agent-to-agent delegation if targetAgent has subordinate specialists and user didn't address a leaf agent directly
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
      const subRes = await invokeWithFailover({
        prompt: delegationPrompt,
        systemInstruction: buildDynamicAgentSystemPrompt(delegate),
        complexity: 'simple',
        preferredProvider: delegate.providerId,
        preferredModel: delegate.modelId,
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

  // Main / addressed agent response
  const isComplex = params.content.length > 160 || /\b(architektúra|kód|terv|debug|refactor|elemzés)\b/i.test(params.content);
  const fullPrompt = `${params.content}${delegatedContext}`;

  let replyText = '';
  let modelUsed = targetAgent.modelId;
  let providerUsed = targetAgent.providerId;
  let costUsd = 0;

  try {
    const llmRes = await invokeWithFailover({
      prompt: fullPrompt,
      systemInstruction: buildDynamicAgentSystemPrompt(targetAgent),
      complexity: isComplex ? 'complex' : 'simple',
      preferredProvider: targetAgent.providerId,
      preferredModel: targetAgent.modelId,
    });
    replyText = llmRes.text;
    modelUsed = llmRes.model;
    providerUsed = llmRes.provider;
    costUsd = llmRes.costUsd;
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
  });

  updateState((s) => {
    s.activeExplicitTaskAgentId = null;
  });

  // Supervisor audits the completed cycle
  auditRecentCycle();

  return { userMessage, agentMessages, coordinatorReply };
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
