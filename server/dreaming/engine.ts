import crypto from 'node:crypto';
import type {
  DreamJournalEntry,
  HardwareMetrics,
  MemoryEntry,
  ShortTermSignal,
} from '../../shared/types';
import { addPersistentMemory, runSalienceDecayAndTiering } from '../memory/vectorStore';
import { invokeWithFailover, type RouterDependencies } from '../providers/router';
import { appendAuditLog, getState, updateState } from '../state/store';

export interface DreamCandidate {
  id: string;
  content: string;
  source: string;
  tags: string[];
  score: number;
  frequency: number;
  relevance: number;
  queryDiversity: number;
  recency: number;
  recurrence: number;
  conceptualRichness: number;
}

/**
 * Light Phase (OpenClaw pattern):
 * Collects fresh short-term signals and recent conversation excerpts, deduplicates them,
 * and builds candidate queues. NEVER performs persistent memory writes!
 */
export function runLightDreamPhase(signals: ShortTermSignal[], recentChatExcerpts: string[]): DreamCandidate[] {
  const seen = new Set<string>();
  const combined: Array<{ content: string; source: string; tags: string[]; queryCount: number; createdAt: string }> = [];

  for (const sig of signals) {
    combined.push({
      content: sig.content,
      source: sig.source,
      tags: sig.tags,
      queryCount: sig.queryCount,
      createdAt: sig.createdAt,
    });
  }

  for (const excerpt of recentChatExcerpts) {
    combined.push({
      content: excerpt,
      source: 'conversation_excerpt',
      tags: ['memory', 'dialogue'],
      queryCount: 1,
      createdAt: new Date().toISOString(),
    });
  }

  const deduped: DreamCandidate[] = [];
  const freqMap = new Map<string, number>();

  for (const item of combined) {
    const key = item.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 8) continue;
    freqMap.set(key, (freqMap.get(key) ?? 0) + 1);
  }

  for (const item of combined) {
    const key = item.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 8 || seen.has(key)) continue;
    seen.add(key);

    const freqCount = freqMap.get(key) ?? 1;
    const ageHours = Math.max(0, (Date.now() - Date.parse(item.createdAt || new Date().toISOString())) / 3_600_000);
    const recency = Math.max(0.1, 1 - ageHours / 72);
    const frequency = Math.min(1, freqCount / 3);
    const queryDiversity = Math.min(1, (item.queryCount || 1) / 4);
    const words = new Set(key.split(' ').filter((w) => w.length > 3));
    const conceptualRichness = Math.min(1, words.size / 15);
    const relevance = item.source === 'user_profile' ? 1.0 : 0.75;
    const recurrence = freqCount > 1 ? 0.9 : 0.4;

    const score = Number(
      (
        frequency * 0.2 +
        relevance * 0.2 +
        queryDiversity * 0.15 +
        recency * 0.2 +
        recurrence * 0.1 +
        conceptualRichness * 0.15
      ).toFixed(4)
    );

    deduped.push({
      id: crypto.randomUUID(),
      content: item.content.trim(),
      source: item.source,
      tags: item.tags,
      score,
      frequency,
      relevance,
      queryDiversity,
      recency,
      recurrence,
      conceptualRichness,
    });
  }

  return deduped.sort((a, b) => b.score - a.score);
}

/**
 * Deep Phase (OpenClaw pattern):
 * Evaluates weighted scores against threshold and promotes qualifying candidates
 * into persistent Vector DB + Obsidian Markdown vault (Hot tier).
 * This is the ONLY dreaming phase that writes persistent memory.
 */
export function runDeepDreamPhase(
  candidates: DreamCandidate[],
  threshold = 0.48,
  vaultBaseDir?: string
): MemoryEntry[] {
  const promoted: MemoryEntry[] = [];
  const state = getState();
  const existingContents = new Set(state.memories.map((m) => m.content.toLowerCase().trim()));

  for (const c of candidates) {
    if (c.score < threshold) continue;
    if (existingContents.has(c.content.toLowerCase().trim())) continue;

    const entry = addPersistentMemory({
      content: c.content,
      entity: c.source === 'conversation_excerpt' ? 'Beszélgetés Konszolidáció' : c.source,
      tags: Array.from(new Set([...c.tags, 'dream'])),
      links: ['Álmodási Ciklus', 'Rendszer Tudásbázis'],
      importanceScore: c.score,
      tier: c.score >= 0.72 ? 'hot' : 'warm',
      vaultBaseDir,
    });
    promoted.push(entry);
    existingContents.add(c.content.toLowerCase().trim());
  }

  return promoted;
}

export interface DreamCycleOptions {
  hardware?: HardwareMetrics;
  routerDeps?: RouterDependencies;
  vaultBaseDir?: string;
  forceRun?: boolean;
}

export interface DreamCycleOutcome {
  executed: boolean;
  skippedReason?: string;
  journalEntry?: DreamJournalEntry;
  lightCount: number;
  deepPromotedCount: number;
  decayStats?: { decayed: number; cooledToCold: number; warmedToWarm: number };
}

/**
 * Full Dreaming Cycle (Light -> Deep -> REM + Marveen Memory Health/Salience Decay)
 * with Global Daily Cost Limit protection + Hardware thermal/battery throttling awareness.
 */
export async function runDreamingCycle(opts: DreamCycleOptions = {}): Promise<DreamCycleOutcome> {
  const state = getState();

  if (state.settings.killSwitchActive) {
    return { executed: false, skippedReason: 'Kill switch aktív', lightCount: 0, deepPromotedCount: 0 };
  }

  if (!opts.forceRun && opts.hardware) {
    if (
      opts.hardware.temperatureCelsius !== null &&
      opts.hardware.temperatureCelsius >= state.settings.thermalThrottleCelsius
    ) {
      return {
        executed: false,
        skippedReason: `Termikus védelem (${opts.hardware.temperatureCelsius}°C >= ${state.settings.thermalThrottleCelsius}°C)`,
        lightCount: 0,
        deepPromotedCount: 0,
      };
    }
    if (
      opts.hardware.batteryPercent !== null &&
      opts.hardware.isCharging === false &&
      opts.hardware.batteryPercent <= state.settings.batteryThrottlePercent
    ) {
      return {
        executed: false,
        skippedReason: `Akkumulátor-kímélő mód (${opts.hardware.batteryPercent}% <= ${state.settings.batteryThrottlePercent}%)`,
        lightCount: 0,
        deepPromotedCount: 0,
      };
    }
  }

  if (state.settings.dailyCostLimitEnabled && state.settings.dailySpendUsd >= state.settings.dailyCostLimitUsd) {
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'dreaming-engine',
      sourceAgentName: 'Álmodó Motor',
      message: `Álmodási ciklus leállítva: napi globális költséglimit elérve ($${state.settings.dailySpendUsd.toFixed(4)} / $${state.settings.dailyCostLimitUsd.toFixed(2)}).`,
    });
    return {
      executed: false,
      skippedReason: 'Napi globális költséglimit elérve',
      lightCount: 0,
      deepPromotedCount: 0,
    };
  }

  // 1. Light Phase (read-only signal aggregation & deduplication)
  const recentExcerpts = state.messages
    .slice(-16)
    .filter((m) => m.content.trim().length > 12)
    .map((m) => `${m.senderName}: ${m.content.slice(0, 280)}`);

  const lightCandidates = runLightDreamPhase(state.shortTermSignals, recentExcerpts);

  // 2. Deep Phase (the ONLY phase writing persistent memories)
  const promoted = runDeepDreamPhase(lightCandidates, 0.45, opts.vaultBaseDir);

  // Marveen Dream Bucket: Memory Health & Salience Decay
  const decayStats = runSalienceDecayAndTiering();

  updateState((s) => {
    s.shortTermSignals = [];
  });

  // 3. REM Phase (pattern identification, skill suggestions & Dream Journal synthesis)
  const themes = Array.from(new Set(lightCandidates.flatMap((c) => c.tags))).slice(0, 5);
  const openTodo = state.kanban.filter((c) => c.status === 'todo' && !c.archived).slice(0, 3);
  let narrative = `REM szintézis: ${lightCandidates.length} jelöltelem átnézve, ${promoted.length} tartós emlék rögzítve (Hot/Warm/Cold frissítve: ${decayStats.decayed} decay).`;
  let costUsd = 0;
  let usedLocalOllama = false;

  if (lightCandidates.length > 0 || openTodo.length > 0) {
    try {
      const llmRes = await invokeWithFailover(
        {
          complexity: 'simple',
          prompt: `Készíts egy rövid, 2-3 mondatos, ember számára olvasható álomnapló-összefoglalót az alábbi napi emlékekből, témákból (${themes.join(', ') || 'általános'}) és nyitott Kanban feladatokból (${openTodo.map((c) => c.title).join(', ') || 'nincs'}):\n${lightCandidates
            .slice(0, 6)
            .map((c) => `- ${c.content}`)
            .join('\n')}`,
          systemInstruction:
            'Rövid, tényszerű álomnapló-összefoglalót írsz magyarul az emberi felhasználó számára.',
        },
        opts.routerDeps
      );
      if (llmRes.text.trim()) {
        narrative = llmRes.text.trim();
      }
      costUsd = llmRes.costUsd;
      usedLocalOllama = llmRes.provider === 'ollama';
    } catch {
      // Deterministic summary kept when no LLM provider configured
    }
  }

  const journalEntry: DreamJournalEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    phaseSummary: {
      lightCandidates: lightCandidates.length,
      deepPromoted: promoted.length,
      remThemes: themes,
    },
    narrative,
    costUsd,
    usedLocalOllama,
  };

  updateState((s) => {
    s.dreamJournal.unshift(journalEntry);
  });

  appendAuditLog({
    type: 'memory',
    sourceAgentId: 'dreaming-engine',
    sourceAgentName: 'Álmodó Motor',
    message: `Álmodás kész (Light: ${lightCandidates.length}, Deep: ${promoted.length}, Decay: ${decayStats.decayed}, REM témák: ${themes.join(', ') || 'nincs'})`,
    verifiedExecution: true,
  });

  return {
    executed: true,
    journalEntry,
    lightCount: lightCandidates.length,
    deepPromotedCount: promoted.length,
    decayStats,
  };
}
