import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAllToolCallsFromResponse } from '../server/agents/tools';
import { buildSvgChartArtifact, exportSanitizedBundle, importSanitizedBundle } from '../server/automation/workflowsAndProductivity';
import { runHostSelfDiagnostics } from '../server/infra/hostAdmin';
import { importExpensesFromCsv, parseIcsCalendarText, parseRssOrAtomXml } from '../server/integrations/ecosystem';
import { addPersistentMemory, extractRelationsFromMemory } from '../server/memory/vectorStore';
import { applyContextDiet, computeMonthlyProjection } from '../server/providers/router';
import { chunkText, extractTextFromPdfBuffer } from '../server/rag/documents';
import { expireStaleApprovals, requireDestructiveApproval } from '../server/security/permissionGate';
import { createInitialState, resetInMemoryStateForTests, setNamedSecret } from '../server/state/store';
import { cleanHtmlToMarkdown } from '../server/web/searchAndBrowser';

test('Web Cleaner (M7) & RAG PDF/Chunking (Ú3)', () => {
  const cleaned = cleanHtmlToMarkdown(
    '<html><head><title>Teszt Oldal</title><script>alert(1)</script></head><body><h1>Főcím</h1><p>Első bekezdés <a href="https://example.com">linkkel</a>.</p></body></html>'
  );
  assert.equal(cleaned.title, 'Teszt Oldal');
  assert.match(cleaned.text, /# Főcím/);
  assert.equal(cleaned.links[0]?.text, 'linkkel');
  assert.equal(cleaned.links[0]?.url, 'https://example.com');
  assert.doesNotMatch(cleaned.text, /alert\(1\)/);

  const fakePdf = Buffer.from('%PDF-1.4\nBT (NovaSwarm helyi RAG dokumentum teszt szoveg.) Tj ET\n%%EOF', 'latin1');
  const extracted = extractTextFromPdfBuffer(fakePdf);
  assert.match(extracted, /NovaSwarm helyi RAG dokumentum teszt szoveg/);

  const longText = Array.from({ length: 40 }, (_, i) => `Bekezdés #${i} fontos architekturális leírás.`).join(' ');
  const chunks = chunkText(longText, 240, 40);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 240));
});

test('Memory Contradiction Resolution (M11), Relations (M12), Context Diet (M5) & Monthly Projection (M9)', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'novaswarm-vault-'));
  try {
    const state = createInitialState();
    state.settings.dailySpendUsd = 0.5;
    state.settings.monthlyBudgetAlertUsd = 10;
    resetInMemoryStateForTests(state);

    const oldMem = addPersistentMemory({
      entity: 'Szerver Port',
      content: 'A fő web szolgáltatás a 8080-as porton fut.',
      links: ['Nginx Proxy'],
      vaultBaseDir: tmpVault,
    });

    const newMem = addPersistentMemory({
      entity: 'Szerver Port',
      content: 'A fő web szolgáltatás már nem a 8080-as, hanem a 3000-es porton fut helyett.',
      links: ['Nginx Proxy'],
      vaultBaseDir: tmpVault,
    });

    assert.equal(newMem.supersedesId, oldMem.id);
    const oldInState = state.memories.find((m) => m.id === oldMem.id);
    assert.equal(oldInState?.supersededBy, newMem.id);
    assert.equal(oldInState?.tier, 'cold');

    const rels = extractRelationsFromMemory('Szerver Port', 'A szolgáltatás használja a Nginx Proxy réteget.', ['Nginx Proxy']);
    assert.ok(rels.length >= 1);

    const hugePrompt = 'A'.repeat(20000);
    const diet = applyContextDiet(hugePrompt, 2048, 0.7);
    assert.equal(diet.wasTrimmed, true);
    assert.ok(diet.trimmedPrompt.length < hugePrompt.length);

    const proj = computeMonthlyProjection(state);
    assert.ok(proj.projectedMonthlyUsd >= 14);
    assert.equal(proj.alertExceeded, true);
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

test('Multi-Tool Parsing (M3), SVG Chart (Ú18), Approval Expiry (M21), Calendar/RSS/CSV (Ú6, Ú8, Ú25)', () => {
  const state = createInitialState();
  resetInMemoryStateForTests(state);

  const calls = parseAllToolCallsFromResponse(
    '<tool_call>{"name":"read_file","args":{"path":"package.json"}}</tool_call>\n' +
      '<tool_call>{"name":"search_web","args":{"query":"linux kernel"}}</tool_call>'
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'read_file');
  assert.equal(calls[1].name, 'search_web');

  const chart = buildSvgChartArtifact({
    title: 'CPU Terhelés',
    labels: ['H', 'K', 'Sze'],
    values: [12, 48, 30],
    unit: '%',
  });
  assert.equal(chart.kind, 'chart_svg');
  assert.match(chart.urlOrContent, /<svg/);
  assert.match(chart.urlOrContent, /CPU Terhelés/);

  // Approval auto-expiry
  const req = requireDestructiveApproval('docker_control', 'Veszélyes törlés', 'docker stop db', 'Teszt');
  req.expiresAt = new Date(Date.now() - 5000).toISOString();
  const expiredCount = expireStaleApprovals(Date.now());
  assert.equal(expiredCount, 1);
  assert.equal(req.status, 'expired');

  // ICS parsing
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Szerver karbantartás',
    'DTSTART:20261201T100000Z',
    'LOCATION:Rack 1',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  const events = parseIcsCalendarText(ics);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Szerver karbantartás');
  assert.equal(events[0].startAt, '2026-12-01T10:00:00Z');

  // RSS parsing
  const rss = '<rss><channel><item><title>NovaSwarm v2</title><link>https://github.com/ngabika/NovaSwarmNextGenHydrogen</link><description>Új kiadás</description></item></channel></rss>';
  const rssItems = parseRssOrAtomXml(rss, 'feed-1', 'GitHub');
  assert.equal(rssItems.length, 1);
  assert.equal(rssItems[0].title, 'NovaSwarm v2');

  // CSV expenses
  const csv = 'date,merchant,amount\n2026-11-18,Lidl Budapest,14500\n2026-11-18,Hetzner Cloud,19.5';
  const expenses = importExpensesFromCsv(csv, 'HUF');
  assert.equal(expenses.length, 2);
  assert.equal(expenses[0].category, 'Élelmiszer');
  assert.equal(expenses[1].category, 'Tech & Felhő');
});

test('Sanitized Bundle Export/Import (Ú29 zero secrets) & Host Self-Diagnostics (M25)', async () => {
  const state = createInitialState();
  state.agents.push({
    ...state.agents[0],
    id: 'spec-1',
    name: 'KódMester',
    isSupervisor: false,
    active: true,
  });
  resetInMemoryStateForTests(state);
  setNamedSecret('home_assistant_token', 'SUPER_SECRET_HA_TOKEN_999');
  setNamedSecret('brave_search_key', 'BSA_SUPER_SECRET_KEY_888');

  const bundle = exportSanitizedBundle();
  const serialized = JSON.stringify(bundle);
  assert.doesNotMatch(serialized, /SUPER_SECRET_HA_TOKEN_999/);
  assert.doesNotMatch(serialized, /BSA_SUPER_SECRET_KEY_888/);
  assert.equal(bundle.agents.length, 1);

  const imported = importSanitizedBundle({
    agents: [{ name: 'ImportáltÁgens', role: 'Kutató', systemPrompt: 'Keresés és elemzés.' }],
    promptTemplates: [{ title: 'Gyors Audit', command: '/audit', body: 'Ellenőrizd a rendszert!' }],
  });
  assert.equal(imported.importedAgents, 1);
  assert.equal(imported.importedTemplates, 1);

  const diag = await runHostSelfDiagnostics();
  assert.ok(diag.checks.length >= 5);
});
