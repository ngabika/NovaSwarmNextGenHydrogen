import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  runDeepDreamPhase,
  runDreamingCycle,
  runLightDreamPhase,
} from '../server/dreaming/engine';
import { listObsidianNotes, searchMemories } from '../server/memory/vectorStore';
import { createInitialState, resetInMemoryStateForTests } from '../server/state/store';

test('Dreaming Light -> Deep -> REM phases consolidate signals to Vector DB & Obsidian without Light-phase persistence', async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-vault-'));
  try {
    const state = createInitialState();
    state.settings.dailyCostLimitEnabled = true;
    state.settings.dailyCostLimitUsd = 1.0;
    state.settings.dailySpendUsd = 0.05;
    state.settings.providerKeys.gemini = [
      { id: 'gem-1', label: 'Gem', maskedKey: 'AIza...test', enabled: true, failureCount: 0 },
    ];
    state.shortTermSignals = [
      {
        id: 's1',
        createdAt: new Date().toISOString(),
        content: 'A felhasználó Linux rendszeradminisztrációs és automatizációs támogatást kér.',
        source: 'user_profile',
        queryCount: 3,
        tags: ['profile', 'linux'],
      },
      {
        id: 's2',
        createdAt: new Date().toISOString(),
        content: 'A felhasználó Linux rendszeradminisztrációs és automatizációs támogatást kér.',
        source: 'user_web',
        queryCount: 1,
        tags: ['linux'],
      },
    ];
    resetInMemoryStateForTests(state);

    // 1. Light phase must deduplicate and NOT write persistent memories
    const candidates = runLightDreamPhase(state.shortTermSignals, []);
    assert.equal(candidates.length, 1);
    assert.equal(state.memories.length, 0);

    // 2. Full cycle promotes to persistent memory + Obsidian Markdown + REM Dream Journal
    const outcome = await runDreamingCycle({
      vaultBaseDir: vaultDir,
      forceRun: true,
      routerDeps: {
        resolveSecret: () => 'fake-secret',
        callProvider: async () => ({
          text: 'Álomnapló: A mai munkamenet fókuszában a Linux automatizáció állt.',
          inputTokens: 120,
          outputTokens: 30,
        }),
      },
    });

    assert.equal(outcome.executed, true);
    assert.equal(outcome.lightCount, 1);
    assert.equal(outcome.deepPromotedCount, 1);
    assert.equal(state.memories.length, 1);
    assert.equal(state.dreamJournal.length, 1);
    assert.match(outcome.journalEntry!.narrative, /Álomnapló/);

    // Vector search finds consolidated memory
    const hits = searchMemories('Linux rendszeradminisztráció');
    assert.equal(hits.length, 1);

    // Obsidian note exists with #tags and [[wikilinks]]
    const notes = listObsidianNotes(vaultDir);
    assert.equal(notes.length, 1);
    assert.match(notes[0].content, /#dream/);
    assert.match(notes[0].content, /\[\[Álmodási Ciklus\]\]/);

    // Direct Deep phase respects threshold
    const skippedDeep = runDeepDreamPhase([{ ...candidates[0], score: 0.1 }], 0.5, vaultDir);
    assert.equal(skippedDeep.length, 0);
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

test('Dreaming halts when global daily cost limit is reached or thermal/battery throttling triggers', async () => {
  const state = createInitialState();
  state.settings.dailyCostLimitEnabled = true;
  state.settings.dailyCostLimitUsd = 1.0;
  state.settings.dailySpendUsd = 1.0; // 100% spent
  resetInMemoryStateForTests(state);

  const budgetHalted = await runDreamingCycle({ forceRun: true });
  assert.equal(budgetHalted.executed, false);
  assert.match(budgetHalted.skippedReason || '', /költséglimit/i);

  state.settings.dailySpendUsd = 0.1;
  const thermalHalted = await runDreamingCycle({
    forceRun: false,
    hardware: {
      cpuCores: 4,
      cpuModel: 'Test',
      cpuLoadPercent: 50,
      ramTotalMb: 8192,
      ramUsedMb: 4096,
      ramPercent: 50,
      diskTotalGb: 100,
      diskUsedGb: 40,
      diskPercent: 40,
      temperatureCelsius: 84,
      batteryPercent: 90,
      isCharging: true,
      throttledReason: 'High temp',
      timestamp: new Date().toISOString(),
    },
  });
  assert.equal(thermalHalted.executed, false);
  assert.match(thermalHalted.skippedReason || '', /Termikus védelem/);
});
