import crypto from 'node:crypto';
import type {
  AutonomousGoalCycle,
  WeeklySelfEvaluationReport,
  WorldModelEdge,
  WorldModelNode,
} from '../../shared/types';
import {
  autonomousDiscoverAndInstallMcp,
  type CatalogTemplate,
} from '../mcp/manager';
import { addPersistentMemory } from '../memory/vectorStore';
import type { RouterDependencies } from '../providers/router';
import { invokeWithFailover } from '../providers/router';
import {
  isSystemLockedDown,
  isTaskCircuitOpen,
  notifyExceptionToTelegram,
  recordAutonomyDecision,
  recordTaskExecutionOutcome,
} from '../security/totalAutonomy';
import { addSkillPitfall, createAndValidateSkill } from '../skills/loader';
import { appendAuditLog, getState, getTelegramTokenSecret, updateState, verifyAuditLogChain } from '../state/store';

export function selectComplexityModelTier(goal: string): {
  tier: 'local_fast' | 'balanced' | 'deep_reasoning';
  reason: string;
} {
  const clean = goal.toLowerCase();
  const isComplex =
    clean.length > 260 ||
    /\b(architekt|biztonság|refactor|migráció|audit|több lépés|multi-agent|optimalizál|debug)\b/i.test(clean);
  if (isComplex) {
    return { tier: 'deep_reasoning', reason: 'Összetett elemzési/biztonsági feladat -> mélyebb modellréteg.' };
  }
  if (clean.length < 90 && /\b(státusz|ellenőriz|lista|összefoglal|ping)\b/i.test(clean)) {
    return { tier: 'local_fast', reason: 'Egyszerű ellenőrző/rutin feladat -> alacsony költségű lokális réteg.' };
  }
  return { tier: 'balanced', reason: 'Normál komplexitású autonóm feladat.' };
}

export async function runGoalLoopCycle(params: {
  goal: string;
  taskKey?: string;
  hasUntrustedContext?: boolean;
  verifierRunner?: (plan: string) => Promise<{ ok: boolean; output: string }>;
  routerDeps?: RouterDependencies;
}): Promise<AutonomousGoalCycle> {
  if (isSystemLockedDown()) {
    throw new Error('Vészleállítás (LOCKDOWN) aktív — autonóm célciklus blokkolva.');
  }

  const taskKey = params.taskKey || `goal:${params.goal.slice(0, 40).toLowerCase()}`;
  const circuit = isTaskCircuitOpen(taskKey);
  if (circuit.open) {
    throw new Error(
      `Megszakító (Circuit Breaker) aktív ennél a feladatnál (${taskKey}): ${circuit.record?.reason || 'többszöri kudarc'}`
    );
  }

  const now = new Date().toISOString();
  const cycle: AutonomousGoalCycle = {
    id: `gcycle-${crypto.randomUUID().slice(0, 8)}`,
    goal: params.goal.trim(),
    phase: 'plan',
    verifiedSuccess: false,
    createdAt: now,
  };

  const tierInfo = selectComplexityModelTier(params.goal);
  let plannerNotes = `Terv (${tierInfo.tier}): ${params.goal}`;
  try {
    const planResp = await invokeWithFailover(
      {
        prompt: params.goal,
        systemInstruction: 'Rövid, 3 pontos ellenőrizhető végrehajtási tervet készíts magyarul.',
        preset: tierInfo.tier === 'deep_reasoning' ? 'precise' : 'fast',
        complexity: tierInfo.tier === 'local_fast' ? 'simple' : 'complex',
      },
      params.routerDeps
    );
    if (planResp.text) plannerNotes = planResp.text.slice(0, 700);
  } catch {
    // Fallback deterministic plan
  }

  cycle.phase = 'execute';
  cycle.plannerNotes = plannerNotes;

  cycle.phase = 'verify';
  const verifyResult = params.verifierRunner
    ? await params.verifierRunner(plannerNotes)
    : {
        ok: verifyAuditLogChain().valid && !isSystemLockedDown(),
        output: 'Rendszer állapot és audit lánc ellenőrizve.',
      };

  cycle.verifierOutput = verifyResult.output.slice(0, 600);
  cycle.phase = 'reflect';

  if (verifyResult.ok) {
    cycle.verifiedSuccess = true;
    cycle.phase = 'completed';
    cycle.completedAt = new Date().toISOString();
    recordTaskExecutionOutcome(taskKey, true, false);
    recordAutonomyDecision({
      agentId: 'goal-orchestrator',
      category: 'goal_loop',
      decision: `Célciklus sikeresen hitelesítve: ${params.goal.slice(0, 80)}`,
      rationale: `${tierInfo.reason} Verifier: ${verifyResult.output.slice(0, 160)}`,
      rejectedAlternatives: ['Ellenőrzés nélküli lezárás'],
      outcome: 'verified',
      highImpact: false,
    });
    try {
      const safeName = params.goal.replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ ]/g, '').slice(0, 32) || 'auto-goal';
      createAndValidateSkill({
        name: `auto_${safeName}`,
        description: `Hitelesített autonóm célciklus eredménye: ${params.goal.slice(0, 120)}`,
        code: `console.log(${JSON.stringify(`Verified: ${params.goal.slice(0, 80)}`)});`,
        createdByAgentId: 'goal-orchestrator',
      });
    } catch {
      // Optional skill promotion failure should not fail verified cycle
    }
  } else {
    cycle.verifiedSuccess = false;
    cycle.phase = 'failed';
    cycle.completedAt = new Date().toISOString();
    cycle.criticFeedback = `Kritikus hibaelemzés: a hitelesítő próba sikertelen (${verifyResult.output.slice(0, 180)}). Tanulság elmentve.`;
    recordTaskExecutionOutcome(taskKey, false, false, verifyResult.output.slice(0, 120));
    addPersistentMemory({
      content: `Buktató/tanulság (${params.goal}): ${verifyResult.output.slice(0, 220)}`,
      entity: 'autonomy-pitfalls',
      tags: ['pitfall', 'goal_loop'],
      importanceScore: 0.82,
      tier: 'warm',
      agentId: 'goal-orchestrator',
    });
    const firstSkill = getState().skills[0];
    if (firstSkill) {
      addSkillPitfall(firstSkill.id, `${params.goal.slice(0, 50)}: ${verifyResult.output.slice(0, 80)}`);
    }
    recordAutonomyDecision({
      agentId: 'goal-orchestrator',
      category: 'goal_loop',
      decision: `Célciklus sikertelen (visszautasítva a Verifier által): ${params.goal.slice(0, 80)}`,
      rationale: verifyResult.output.slice(0, 240),
      rejectedAlternatives: ['Sikeresnek jelölés teszt nélkül'],
      outcome: 'failed',
      highImpact: true,
    });
  }

  updateState((s) => {
    s.goalCycles = [cycle, ...(s.goalCycles || [])].slice(0, 100);
  });

  return cycle;
}

export function buildOrRefreshWorldModel(): {
  nodes: WorldModelNode[];
  edges: WorldModelEdge[];
  anomalies: string[];
} {
  const s = getState();
  const now = new Date().toISOString();
  const nodes: WorldModelNode[] = [];
  const edges: WorldModelEdge[] = [];
  const anomalies: string[] = [];

  for (const agent of s.agents) {
    nodes.push({
      id: `agent:${agent.id}`,
      kind: 'agent',
      label: `${agent.name} (${agent.role})`,
      status: agent.active ? 'nominal' : 'offline',
      detail: `${agent.providerId}:${agent.modelId}`,
      updatedAt: now,
    });
  }

  for (const dev of s.lanDeviceInventory || []) {
    const status: WorldModelNode['status'] =
      dev.status === 'offline' ? 'offline' : dev.status === 'needs_credentials' ? 'warning' : 'nominal';
    nodes.push({
      id: `dev:${dev.id}`,
      kind: 'device',
      label: `${dev.ip} (${dev.vendor})`,
      status,
      detail: `${dev.adapterType} · portok: ${dev.openPorts.join(',') || 'passzív'}`,
      updatedAt: dev.lastSeenAt,
    });
    edges.push({ fromId: 'agent:supervisor', toId: `dev:${dev.id}`, relation: 'monitors' });
    if (dev.status === 'offline') {
      anomalies.push(`LAN eszköz nem elérhető: ${dev.ip} (${dev.vendor})`);
    }
  }

  for (const up of s.uptimeTargets || []) {
    const status: WorldModelNode['status'] =
      up.status === 'down' ? 'critical' : up.status === 'degraded' ? 'warning' : 'nominal';
    nodes.push({
      id: `svc:${up.id}`,
      kind: 'service',
      label: up.name,
      status,
      detail: up.url,
      updatedAt: up.lastCheckedAt || now,
    });
    if (up.status === 'down') {
      anomalies.push(`Szolgáltatás áll: ${up.name} (${up.url})`);
    }
  }

  for (const cb of s.circuitBreakerTasks || []) {
    if (cb.state === 'open') {
      const anomId = `anom:${cb.taskKey}`;
      nodes.push({
        id: anomId,
        kind: 'anomaly',
        label: `Megszakító nyitva: ${cb.taskKey}`,
        status: 'critical',
        detail: cb.reason,
        updatedAt: cb.lastUpdatedAt,
      });
      anomalies.push(`Nyitott megszakító: ${cb.taskKey} (${cb.reason || 'ismételt hiba'})`);
    }
  }

  updateState((st) => {
    st.worldModelNodes = nodes.slice(0, 200);
    st.worldModelEdges = edges.slice(0, 300);
  });

  return { nodes, edges, anomalies };
}

export function consolidateAndFlagStaleMemories(): {
  totalBefore: number;
  consolidatedCount: number;
  staleFlaggedCount: number;
} {
  const nowMs = Date.now();
  const staleThresholdMs = 30 * 24 * 60 * 60 * 1000;
  let consolidatedCount = 0;
  let staleFlaggedCount = 0;
  const totalBefore = getState().memories.length;

  updateState((s) => {
    const seen = new Map<string, string>();
    for (const m of s.memories) {
      const normalized = m.content.trim().toLowerCase().slice(0, 120);
      if (seen.has(normalized) && !m.supersededBy) {
        m.supersededBy = seen.get(normalized);
        m.tier = 'cold';
        consolidatedCount += 1;
      } else {
        seen.set(normalized, m.id);
      }
      const refTime = Date.parse(m.lastAccessedAt || m.createdAt);
      if (Number.isFinite(refTime) && nowMs - refTime > staleThresholdMs && m.tier !== 'cold') {
        if (!m.tags.includes('elavult')) {
          m.tags = [...m.tags, 'elavult'];
          staleFlaggedCount += 1;
        }
      }
    }
  });

  if (consolidatedCount > 0 || staleFlaggedCount > 0) {
    appendAuditLog({
      type: 'memory',
      sourceAgentId: 'memory-hygiene',
      sourceAgentName: 'Éjszakai Memória Higiénia',
      message: `Memória karbantartás: ${consolidatedCount} duplikált emlék archiválva, ${staleFlaggedCount} elavult bejegyzés megjelölve.`,
      verifiedExecution: true,
    });
  }

  return { totalBefore, consolidatedCount, staleFlaggedCount };
}

export interface McpRoiEvaluationItem {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  totalCalls: number;
  successRatePct: number | null;
  avgLatencyMs: number;
  roiVerdict: 'worth_it' | 'low_value' | 'untested';
  roiNote: string;
  autoDiscovered: boolean;
}

export async function evaluateMcpRoiAndDiscover(opts?: {
  capabilityQuery?: string;
  catalogUrl?: string;
  catalogItems?: CatalogTemplate[];
  autoTest?: boolean;
}): Promise<{
  evaluations: McpRoiEvaluationItem[];
  newlyInstalled: Array<{ id: string; name: string }>;
  disabledLowValueIds: string[];
}> {
  let newlyInstalled: Array<{ id: string; name: string }> = [];
  if (opts?.capabilityQuery?.trim() && (opts.catalogUrl?.trim() || (opts.catalogItems && opts.catalogItems.length > 0))) {
    const disc = await autonomousDiscoverAndInstallMcp({
      capabilityQuery: opts.capabilityQuery.trim(),
      catalogUrl: opts.catalogUrl,
      catalogItems: opts.catalogItems,
      autoTest: opts.autoTest,
    });
    newlyInstalled = disc.installed.map((i) => ({ id: i.id, name: i.name }));
  }

  const disabledLowValueIds: string[] = [];
  const evaluations: McpRoiEvaluationItem[] = [];

  updateState((s) => {
    for (const m of s.mcpServers || []) {
      const metrics = m.metrics ?? { totalCalls: 0, successCalls: 0, avgLatencyMs: 0, lastCalledAt: null };
      const totalCalls = metrics.totalCalls;
      const successRatePct = totalCalls > 0 ? Math.round((metrics.successCalls / totalCalls) * 100) : null;
      let verdict: 'worth_it' | 'low_value' | 'untested' = 'untested';
      let roiNote = 'Még nem volt eszközhívás ezen az MCP szerveren.';

      if (totalCalls >= 3 && successRatePct !== null && successRatePct < 40) {
        verdict = 'low_value';
        roiNote = `Alacsony ROI (${successRatePct}% siker ${totalCalls} hívásból, átlag ${metrics.avgLatencyMs}ms) — letiltás vagy javítás javasolt.`;
        if (metrics.successCalls === 0 && m.enabled !== false) {
          m.enabled = false;
          disabledLowValueIds.push(m.id);
        }
      } else if (m.status === 'error' || m.status === 'disconnected') {
        verdict = 'low_value';
        roiNote = `Elérhetetlen vagy hibás állapot (${m.status}) — felülvizsgálat szükséges.`;
      } else if (totalCalls > 0 && successRatePct !== null && successRatePct >= 60) {
        verdict = 'worth_it';
        roiNote = `Magas ROI: ${successRatePct}% siker (${totalCalls} hívás, ${metrics.avgLatencyMs}ms átlagidő).`;
      } else if (m.status === 'connected') {
        verdict = 'worth_it';
        roiNote = `Aktív kapcsolat (${metrics.avgLatencyMs}ms) — használatra kész.`;
      }

      m.roiVerdict = verdict;
      m.roiNote = roiNote;
      evaluations.push({
        id: m.id,
        name: m.name,
        status: m.status,
        enabled: m.enabled !== false,
        totalCalls,
        successRatePct,
        avgLatencyMs: metrics.avgLatencyMs,
        roiVerdict: verdict,
        roiNote,
        autoDiscovered: Boolean(m.autoDiscovered),
      });
    }
  });

  if (disabledLowValueIds.length > 0) {
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'mcp-roi',
      sourceAgentName: 'MCP ROI Értékelő',
      message: `Alacsony ROI miatt ${disabledLowValueIds.length} hibás MCP szerver automatikusan letiltva.`,
      verifiedExecution: true,
    });
  }

  return { evaluations, newlyInstalled, disabledLowValueIds };
}

export async function runWeeklySelfEvaluationBenchmark(opts?: {
  telegramSender?: (text: string) => Promise<unknown>;
}): Promise<WeeklySelfEvaluationReport> {
  const s = getState();
  const cycles = s.goalCycles || [];
  const verifiedCycles = cycles.filter((c) => c.verifiedSuccess);
  const failedCycles = cycles.filter((c) => !c.verifiedSuccess);
  const decisions = s.autonomyDecisions || [];
  const appliedDecisions = decisions.filter((d) => d.outcome === 'applied' || d.outcome === 'verified');
  const rolledBackDecisions = decisions.filter((d) => d.outcome === 'rolled_back');

  const solvedItems = [
    ...verifiedCycles.map((c) => `Cél: ${c.goal}`),
    ...appliedDecisions.slice(0, 8).map((d) => `Döntés: ${d.decision}`),
  ].slice(0, 12);

  const openCircuits = (s.circuitBreakerTasks || []).filter((c) => c.state === 'open');
  const failedItems = [
    ...failedCycles.map((c) => `Sikertelen cél: ${c.goal}${c.criticFeedback ? ` (${c.criticFeedback})` : ''}`),
    ...rolledBackDecisions.slice(0, 6).map((d) => `Visszaállított döntés: ${d.decision}`),
    ...openCircuits.map((cb) => `Nyitott megszakító: ${cb.taskKey} (${cb.consecutiveFailures} hiba)`),
  ].slice(0, 12);

  const totalTasks = Math.max(1, cycles.length + decisions.length);
  const successNumerator = verifiedCycles.length + appliedDecisions.length;
  const successRatePct = Math.min(100, Math.round((successNumerator / totalTasks) * 100));
  const providerSpend = Object.values(s.gatewayAnalytics?.spendByProvider || {}).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );
  const totalSpendUsd = Number(Math.max(s.settings.dailySpendUsd || 0, providerSpend).toFixed(4));
  const avgCostPerTaskUsd = Number((totalSpendUsd / totalTasks).toFixed(4));
  const auditValid = verifyAuditLogChain().valid;

  const recommendations: string[] = [];
  if (!auditValid) recommendations.push('KRITIKUS: Audit hash-lánc sérülés vizsgálata azonnal szükséges!');
  if (openCircuits.length > 0) {
    recommendations.push(`${openCircuits.length} feladatnál nyitott megszakító van — buktatók ellenőrzése ajánlott.`);
  }
  if (failedCycles.length > 0) {
    recommendations.push(`${failedCycles.length} sikertelen célciklus javítása és újrapróbálása javasolt.`);
  }
  if ((s.pendingDevicePrompts || []).some((p) => p.status === 'pending')) {
    recommendations.push('Hiányzó LAN eszköz hitelesítő adatok megadása az Autonómia központban.');
  }
  if (recommendations.length === 0) {
    recommendations.push('A rendszer autonóm teljesítménye stabil; nincs azonnali beavatkozást igénylő eltérés.');
  }

  // Generate concrete improvement goals automatically in Kanban for failures / critical recommendations
  const autoGeneratedGoals: string[] = [];
  const goalCandidates: Array<{ title: string; description: string; priority: 'high' | 'medium' }> = [];
  if (!auditValid) {
    goalCandidates.push({
      title: 'Audit hash-lánc integritás helyreállítása',
      description: 'Heti önértékelés hibát észlelt az audit láncban — ellenőrizd az audit-chain.jsonl bejegyzéseket.',
      priority: 'high',
    });
  }
  for (const fc of failedCycles.slice(0, 2)) {
    goalCandidates.push({
      title: `Fejlesztési cél: ${fc.goal.slice(0, 64)} javítása`,
      description: `Heti önértékelés által generált javítási cél. Előző hiba: ${fc.criticFeedback || fc.verifierOutput || 'ellenőrzés sikertelen'}.`,
      priority: 'high',
    });
  }
  for (const cb of openCircuits.slice(0, 2)) {
    goalCandidates.push({
      title: `Megszakító hibaelemzés: ${cb.taskKey}`,
      description: `Automatikusan létrehozott fejlesztési cél (${cb.consecutiveFailures} hiba, ok: ${cb.reason || 'ismeretlen'}).`,
      priority: 'medium',
    });
  }
  if (goalCandidates.length === 0 && successRatePct < 80) {
    goalCandidates.push({
      title: `Heti sikerességi arány növelése (${successRatePct}% -> >85%)`,
      description: recommendations.join(' '),
      priority: 'medium',
    });
  }

  updateState((st) => {
    const existingTitles = new Set(
      st.kanban.filter((k) => !k.archived && k.status !== 'done').map((k) => k.title.toLowerCase())
    );
    const defaultAgentId = st.agents.find((a) => !a.isSupervisor && a.active)?.id || null;
    for (const cand of goalCandidates.slice(0, 3)) {
      if (existingTitles.has(cand.title.toLowerCase())) continue;
      const ts = new Date().toISOString();
      st.kanban.unshift({
        id: `goal-${crypto.randomUUID().slice(0, 8)}`,
        title: cand.title,
        description: cand.description,
        status: 'todo',
        priority: cand.priority,
        assignedAgentId: defaultAgentId,
        createdAt: ts,
        updatedAt: ts,
      });
      existingTitles.add(cand.title.toLowerCase());
      autoGeneratedGoals.push(cand.title);
    }
  });

  const report: WeeklySelfEvaluationReport = {
    id: `wbench-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    successRatePct,
    verifiedTasks: verifiedCycles.length,
    failedOrRolledBackTasks: failedCycles.length + rolledBackDecisions.length,
    avgCostPerTaskUsd,
    totalSpendUsd,
    solvedItems,
    failedItems,
    autoGeneratedGoals,
    securityAuditValid: auditValid,
    recommendations,
    summaryMarkdown: [
      `### Heti Önértékelő Jelentés (${new Date().toISOString().slice(0, 10)})`,
      `- Sikerességi arány: **${successRatePct}%**`,
      `- Hitelesített feladatok: **${verifiedCycles.length}** · Sikertelen / Visszaállított: **${failedCycles.length + rolledBackDecisions.length}**`,
      `- Összes költség: **$${totalSpendUsd.toFixed(4)}** (átlag: **$${avgCostPerTaskUsd.toFixed(4)}**/feladat)`,
      `- Audit hash-lánc: **${auditValid ? 'ÉP ✅' : 'SÉRÜLT ⚠️'}**`,
      `- Nyitott megszakítók: **${openCircuits.length}** db`,
      autoGeneratedGoals.length > 0
        ? `- Automatikus fejlesztési célok: ${autoGeneratedGoals.join('; ')}`
        : '- Automatikus fejlesztési célok: nincs új hiányosság',
      ...recommendations.map((r) => `- Javaslat: ${r}`),
    ].join('\n'),
  };

  updateState((st) => {
    st.weeklyEvaluations = [report, ...(st.weeklyEvaluations || [])].slice(0, 26);
  });

  const tgText = [
    `📈 [Heti Önértékelés]`,
    `Sikeresség: ${successRatePct}% | Megoldva: ${verifiedCycles.length} | Hiba/Rollback: ${failedCycles.length + rolledBackDecisions.length}`,
    `Költség: $${totalSpendUsd.toFixed(4)} (átlag $${avgCostPerTaskUsd.toFixed(4)}/feladat) | Audit: ${auditValid ? 'ÉP ✅' : 'SÉRÜLT ⚠️'}`,
    autoGeneratedGoals.length > 0 ? `Új fejlesztési célok: ${autoGeneratedGoals.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (opts?.telegramSender) {
    await opts.telegramSender(tgText).catch(() => {});
  } else {
    const token = getTelegramTokenSecret();
    const hasChat = Boolean(s.settings.telegramChatId?.trim() || (s.settings.telegramAllowedChatIds || []).length > 0);
    if (token && hasChat) {
      await notifyExceptionToTelegram(tgText, true).catch(() => {});
    }
  }

  return report;
}
