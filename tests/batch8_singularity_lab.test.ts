import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildDynamicAgentSystemPrompt } from '../server/agents/engine';
import { executeAgentTool } from '../server/agents/tools';
import {
  addGlossaryTerm,
  addTimeBlock,
  advanceAgentHandoff,
  analyzeNumericSeries,
  analyzeProseQuality,
  analyzeWritingStyle,
  auditSqlQuery,
  buildKnowledgeConceptGraph,
  buildMultiLevelDigest,
  calculateFinancialModel,
  calculateProjectEstimations,
  convertUnitsAndTimezones,
  createAgentHandoff,
  createAgentPersona,
  createGoalTree,
  createStudyPlan,
  evaluateDecisionMatrix,
  exportOmniExecutiveReportMarkdown,
  generateArchitectureBlueprint,
  generateCommunicationDraft,
  generateStructuredFramework,
  importMeetingActionsToKanban,
  lintInfraManifest,
  logWellnessCheckin,
  processMeetingNotes,
  queryFactVault,
  renderSnippetWithVars,
  runDevConverters,
  runRedTeamCritique,
  runScenarioSimulation,
  sanitizeSensitiveText,
  saveCodeSnippet,
  searchOmniCapabilities,
  setActivePersona,
  setActiveUserContext,
  toggleChecklistItem,
  toggleGoalMilestone,
  toggleIncidentPlaybookStep,
  toggleStudyModule,
  transformTextTone,
  upsertFactVault,
} from '../server/power/batch8SingularityEngine';
import { createInitialState, getState, resetInMemoryStateForTests } from '../server/state/store';
import { processTelegramInput } from '../server/telegram/bot';

test('Batch 8 Catalog exposes at least 200 distinct capabilities (Ú361–Ú560) with filtering', () => {
  const full = searchOmniCapabilities();
  assert.ok(full.totalCount >= 200, `Expected >= 200 capabilities, got ${full.totalCount}`);
  assert.ok(full.categories.length >= 6);

  const sqlHits = searchOmniCapabilities('SQL');
  assert.ok(sqlHits.items.length >= 1);
  assert.ok(sqlHits.items.some((c) => c.title.toLowerCase().includes('sql')));

  const catHits = searchOmniCapabilities('', full.categories[0]);
  assert.ok(catHits.items.length >= 10);
});

test('Personas, Contexts, Fact Vault, Writing Style, Tone & Prompt Injection (Ú361–Ú385)', () => {
  resetInMemoryStateForTests(createInitialState());

  const state0 = getState();
  assert.ok((state0.agentPersonas || []).length >= 12);
  assert.ok((state0.userContextProfiles || []).length >= 5);

  const customP = createAgentPersona({
    name: 'Kvantum Elemző',
    roleTitle: 'Rendszer Stratéga',
    tone: 'precíz',
    systemGuidance: 'Minden választ tömör pontokkal kezdj.',
    strengths: ['analitika'],
  });
  const activated = setActivePersona(customP.id);
  assert.equal(activated.id, customP.id);

  const ctx = setActiveUserContext('ctx-travel');
  assert.equal(ctx.id, 'ctx-travel');

  const style = analyzeWritingStyle(
    'Teszt Stílus',
    'Ez az első mondat a teszthez. A második mondat rövid és lényegre törő marad.'
  );
  assert.ok(style.avgSentenceWords > 0);
  assert.ok(style.lexicalDiversity > 0);

  upsertFactVault({ category: 'Szerver', factKey: 'ProdHost', factValue: '10.0.0.42' });
  const hits = queryFactVault('ProdHost');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].factValue, '10.0.0.42');

  const prompt = buildDynamicAgentSystemPrompt(getState().agents[0], 'main_host');
  assert.ok(prompt.includes('Kvantum Elemző'));
  assert.ok(prompt.includes('10.0.0.42'));

  const formal = transformTextTone('Szia! Köszi a segítséget.', 'formal');
  assert.ok(formal.transformed.includes('Tisztelt'));

  const bluf = transformTextTone('Első lényeg. Második részlet.', 'bullet_executive');
  assert.ok(bluf.transformed.includes('Lényeg (BLUF):'));

  const prose = analyzeProseQuality('Ez igazából egy viszonylag egyszerű mondat. Rövidebb verzió jobb.');
  assert.ok(prose.fillerHits.includes('igazából'));
  assert.ok(prose.readabilityScore >= 0 && prose.readabilityScore <= 100);

  const adr = generateStructuredFramework('adr', 'SQLite WAL');
  assert.ok(adr.markdown.includes('ADR'));
});

test('Cognitive Planner: Goal Trees, Handoffs, Decision Matrix, Scenarios, Red Team & PERT/RICE (Ú386–Ú415)', () => {
  resetInMemoryStateForTests(createInitialState());

  const goal = createGoalTree({
    title: 'Homelab automatizálás',
    horizon: 'quarterly',
    milestones: ['Lépés 1', 'Lépés 2'],
  });
  assert.equal(goal.progressPercent, 0);
  const toggled = toggleGoalMilestone(goal.id, goal.milestones[0].id);
  assert.equal(toggled.progressPercent, 50);

  const ho = createAgentHandoff('Új API végpont', 'Specifikáció kész');
  assert.equal(ho.stage, 'planner');
  const ho2 = advanceAgentHandoff(ho.id, 'Kód megírva');
  assert.equal(ho2.stage, 'builder');

  const dm = evaluateDecisionMatrix({
    title: 'DB választás',
    criteria: [
      { name: 'Sebesség', weight: 3 },
      { name: 'Egyszerűség', weight: 2 },
    ],
    options: [
      { name: 'SQLite WAL', scores: [9, 10] },
      { name: 'Külső Klaszter', scores: [8, 3] },
    ],
  });
  assert.equal(dm.winnerName, 'SQLite WAL');
  assert.ok(dm.marginPercent > 0);

  const sim = runScenarioSimulation('Helyi LLM bővítés');
  assert.equal(sim.optimistic.probabilityPct + sim.realistic.probabilityPct + sim.pessimistic.probabilityPct, 100);

  const rt = runRedTeamCritique('Azonnali élesítés minden szerveren egyszerre.');
  assert.ok(rt.riskScore >= 50);
  assert.ok(rt.blindSpots.length >= 2);

  const est = calculateProjectEstimations({
    optimisticHours: 4,
    mostLikelyHours: 10,
    pessimisticHours: 22,
    reach: 20,
    impact: 3,
    confidencePct: 80,
  });
  assert.equal(est.pertExpectedHours, 11);
  assert.ok(est.safeUpperBound95Hours > est.pertExpectedHours);
  assert.ok(est.riceScore > 0);
});

test('Meeting Notes + Idempotent Kanban Export, Digest, Study Plan, Glossary & Concept Graph (Ú416–Ú445)', () => {
  resetInMemoryStateForTests(createInitialState());
  const beforeKanban = getState().kanban.length;

  const mtg = processMeetingNotes(
    'Sprint Tervező',
    '- [ ] Docker memórialimit beállítása @Gábor holnap\n- [ ] Napló rotáció ellenőrzése @Anna\nMikor lesz a kulcs rotáció?'
  );
  assert.equal(mtg.actionItems.length, 2);
  assert.equal(mtg.actionItems[0].owner, 'Gábor');
  assert.equal(mtg.openQuestions.length, 1);

  const exp1 = importMeetingActionsToKanban(mtg.id);
  assert.equal(exp1.createdCount, 2);
  assert.equal(getState().kanban.length, beforeKanban + 2);

  const exp2 = importMeetingActionsToKanban(mtg.id);
  assert.equal(exp2.createdCount, 0);

  const dig = buildMultiLevelDigest('Hír', 'Első kulcsmondat a sebességről. Második részlet a memóriáról.');
  assert.ok(dig.tldrOneLine.includes('Első kulcsmondat'));

  const sp = createStudyPlan('Rust Async', 'intermediate');
  const sp2 = toggleStudyModule(sp.id, sp.modules[0].id);
  assert.equal(sp2.modules[0].completed, true);

  addGlossaryTerm({ term: 'WAL', domain: 'Adatbázis', definition: 'Write-Ahead Logging' });
  const graph = buildKnowledgeConceptGraph();
  assert.ok(graph.mermaid.startsWith('graph TD'));
  assert.ok(graph.edgeCount >= 1);
});

test('Dev Copilot: Snippets, Blueprints, Playbooks, SQL Audit, Infra Lint & Converters (Ú446–Ú480)', () => {
  resetInMemoryStateForTests(createInitialState());

  const snip = saveCodeSnippet({
    title: 'Restart Service',
    language: 'bash',
    code: 'sudo systemctl restart {{service}}',
    tags: ['systemd'],
  });
  const rendered = renderSnippetWithVars(snip.id, { service: 'novaswarm' });
  assert.equal(rendered, 'sudo systemctl restart novaswarm');

  const bp = generateArchitectureBlueprint('Edge Node', 'iot_edge');
  assert.ok(bp.mermaidDiagram.includes('MQTT'));

  const pb0 = (getState().incidentPlaybooks || [])[0];
  assert.ok(pb0 && pb0.steps[0]);
  const pb = toggleIncidentPlaybookStep(pb0.id, pb0.steps[0].id);
  assert.equal(pb.steps[0].done, true);

  const badSql = auditSqlQuery('DELETE FROM users; SELECT * FROM audit_log;');
  assert.equal(badSql.riskLevel, 'high');
  assert.ok(badSql.findings.some((f) => f.includes('WHERE feltétel nélkül')));

  const lint = lintInfraManifest('services:\n  app:\n    image: node:latest\n    privileged: true');
  assert.ok(lint.issues.some((i) => i.severity === 'high'));

  const ts = runDevConverters('json_to_ts', '{"id": 1, "active": true}');
  assert.ok(ts.output.includes('id: number;'));

  const md = runDevConverters('csv_to_markdown', 'a,b\n1,2');
  assert.ok(md.output.includes('| a | b |'));

  const fakeJwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: '42' })).toString('base64url'),
    'sig',
  ].join('.');
  const jwt = runDevConverters('jwt_decode', fakeJwt);
  assert.ok(jwt.output.includes('"sub": "42"'));

  const envMask = runDevConverters('env_mask', 'PORT=3000\nSECRET_TOKEN=abc123');
  assert.ok(envMask.output.includes('SECRET_TOKEN=') && !envMask.output.includes('abc123'));
});

test('Analytics, Finance, Units, TimeBlocks, Wellness, Drafts, Privacy Sanitizer, Omni Tool & Telegram (Ú481–Ú560)', async () => {
  resetInMemoryStateForTests(createInitialState());

  const stats = analyzeNumericSeries('10, 12, 11, 13, 12, 95, 11, 12');
  assert.equal(stats.count, 8);
  assert.ok(stats.anomalies.some((a) => a.value === 95 && a.zScore >= 2));

  const vat = calculateFinancialModel({ mode: 'vat_hu', principal: 127000, vatRatePct: 27 });
  assert.equal(vat.monthlyPaymentOrNet, 100000);
  assert.equal(vat.totalInterestOrTax, 27000);

  const comp = calculateFinancialModel({
    mode: 'compound',
    principal: 1000000,
    annualRatePct: 10,
    years: 2,
    monthlyContribution: 0,
  });
  assert.ok(comp.finalAmount > 1200000);

  const conv = convertUnitsAndTimezones(100, 'c', 'f');
  assert.equal(conv.result, 212);
  assert.equal(conv.worldClocks.length, 5);

  const tb1 = addTimeBlock({ date: '2026-11-23', startHour: '09:00', endHour: '11:00', title: 'Fókusz 1', kind: 'deep_work' });
  assert.equal(tb1.conflicts.length, 0);
  assert.equal(tb1.deepWorkMinutesToday, 120);

  const tb2 = addTimeBlock({ date: '2026-11-23', startHour: '10:00', endHour: '12:00', title: 'Ütköző blokk', kind: 'meeting' });
  assert.equal(tb2.conflicts.length, 1);

  const cl0 = (getState().smartChecklists || [])[0];
  assert.ok(cl0 && cl0.items[0]);
  const cl1 = toggleChecklistItem(cl0.id, cl0.items[0].id);
  assert.equal(cl1.items[0].checked, true);

  const well = logWellnessCheckin({ sleepHours: 8, waterMl: 2500, energyScore: 9, movementMinutes: 45 });
  assert.equal(well.energyScore, 9);

  const draft = generateCommunicationDraft({ purpose: 'Projekt státusz', tone: 'formal', keyPoints: 'Minden kész.' });
  assert.ok(draft.body.includes('Tisztelt Címzett!'));

  const pii = sanitizeSensitiveText('Mail: a@b.hu, IP: 192.168.1.10, Tel: +36 30 555 4433, Key: sk-secretvalue1234567890');
  assert.equal(pii.redactionsCount, 4);
  assert.ok(!pii.sanitized.includes('a@b.hu'));
  assert.ok(!pii.sanitized.includes('192.168.1.10'));

  const report = exportOmniExecutiveReportMarkdown();
  assert.ok(report.markdown.includes('NovaSwarm Omni-Asszisztens Vezetői Riport'));

  // Test #36 omni_toolkit Agent Tool directly
  const toolOut = await executeAgentTool({
    agent: getState().agents[0],
    toolName: 'omni_toolkit',
    args: { mode: 'stats', numbers: '10, 20, 30' },
    isolationMode: 'main_host',
  });
  assert.equal(toolOut.step.ok, true);
  assert.ok(toolOut.observation.includes('"mean": 20'));

  // Test Batch 8 Telegram commands
  const tgOmni = await processTelegramInput('/omni sql');
  assert.ok(tgOmni.includes('Omni-Ágens Képesség Katalógus'));

  const tgSzamol = await processTelegramInput('/szamol 100 mbps -> mb/s');
  assert.ok(tgSzamol.includes('12.5'));

  const tgSan = await processTelegramInput('/anonimizal Email teszt@ceg.hu');
  assert.ok(tgSan.includes('[EMAIL_MASZKOLVA]'));
});

test('Batch 8 source files contain zero forbidden brand terms', () => {
  const bannedRx = new RegExp(['marv' + 'een', 'open' + 'claw', 'lite' + 'llm', 'bin' + 'ance'].join('|'), 'i');
  const files = [
    'server/power/batch8SingularityEngine.ts',
    'server/routes/universalV8Router.ts',
    'src/components/Batch8SingularityPanel.tsx',
  ];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    assert.equal(bannedRx.test(content), false, `Forbidden term found in ${rel}`);
  }
});
