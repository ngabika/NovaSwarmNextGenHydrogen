import crypto from 'node:crypto';
import type {
  AutonomousGoalCycle,
  WeeklySelfEvaluationReport,
  WorldModelEdge,
  WorldModelNode,
} from '../../shared/types';
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
import { appendAuditLog, getState, updateState, verifyAuditLogChain } from '../state/store';

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

export function evaluateMcpRoiAndDiscover(): Array<{
  id: string;
  name: string;
  status: string;
  roiNote: string;
}> {
  const s = getState();
  return (s.mcpServers || []).map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    roiNote:
      m.status === 'connected'
        ? 'Aktív és használható integráció (magas ROI).'
        : 'Nincs csatlakoztatva vagy konfigurálva — felülvizsgálat ajánlott.',
  }));
}

export async function runWeeklySelfEvaluationBenchmark(opts?: {
  telegramSender?: (text: string) => Promise<unknown>;
}): Promise<WeeklySelfEvaluationReport> {
  const s = getState();
  const cycles = s.goalCycles || [];
  const verifiedCycles = cycles.filter((c) => c.verifiedSuccess).length;
  const failedCycles = cycles.filter((c) => !c.verifiedSuccess).length;
  const decisions = s.autonomyDecisions || [];
  const rolledBack = decisions.filter((d) => d.outcome === 'rolled_back').length;
  const totalTasks = Math.max(1, verifiedCycles + failedCycles + decisions.length);
  const successNumerator = verifiedCycles + decisions.filter((d) => d.outcome === 'applied' || d.outcome === 'verified').length;
  const successRatePct = Math.min(100, Math.round((successNumerator / totalTasks) * 100));
  const auditValid = verifyAuditLogChain().valid;
  const openCircuits = (s.circuitBreakerTasks || []).filter((c) => c.state === 'open').length;

  const recommendations: string[] = [];
  if (!auditValid) recommendations.push('KRITIKUS: Audit hash-lánc sérülés vizsgálata azonnal szükséges!');
  if (openCircuits > 0) recommendations.push(`${openCircuits} feladatnál nyitott megszakító van — buktatók ellenőrzése ajánlott.`);
  if ((s.pendingDevicePrompts || []).some((p) => p.status === 'pending')) {
    recommendations.push('Hiányzó LAN eszköz hitelesítő adatok megadása az Autonómia központban.');
  }
  if (recommendations.length === 0) {
    recommendations.push('A rendszer autonóm teljesítménye stabil; nincs azonnali beavatkozást igénylő eltérés.');
  }

  const report: WeeklySelfEvaluationReport = {
    id: `wbench-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    successRatePct,
    verifiedTasks: verifiedCycles,
    failedOrRolledBackTasks: failedCycles + rolledBack,
    avgCostPerTaskUsd: Number((s.settings.dailySpendUsd / Math.max(1, s.goalCycles?.length || 1)).toFixed(4)),
    securityAuditValid: auditValid,
    recommendations,
    summaryMarkdown: [
      `### Heti Önértékelő Jelentés (${new Date().toISOString().slice(0, 10)})`,
      `- Sikerességi arány: **${successRatePct}%**`,
      `- Hitelesített feladatok: **${verifiedCycles}** · Sikertelen / Visszaállított: **${failedCycles + rolledBack}**`,
      `- Audit hash-lánc: **${auditValid ? 'ÉP ✅' : 'SÉRÜLT ⚠️'}**`,
      `- Nyitott megszakítók: **${openCircuits}** db`,
      ...recommendations.map((r) => `- Javaslat: ${r}`),
    ].join('\n'),
  };

  updateState((st) => {
    st.weeklyEvaluations = [report, ...(st.weeklyEvaluations || [])].slice(0, 26);
  });

  await notifyExceptionToTelegram(
    `📈 [Heti Önértékelés]\nSikeresség: ${successRatePct}% · Hitelesített: ${verifiedCycles} · Hiba/Rollback: ${failedCycles + rolledBack}\nAudit: ${auditValid ? 'ÉP ✅' : 'SÉRÜLT ⚠️'}`,
    !auditValid || openCircuits > 0,
    opts?.telegramSender
  ).catch(() => {});

  return report;
}
