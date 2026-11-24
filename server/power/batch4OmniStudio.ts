import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ApiMockEndpoint,
  DocumentSafeItem,
  EphemeralNote,
  HostedMiniApp,
  KanbanCard,
  LifeGoalOkr,
  MissionCheckpoint,
  PriceWatchItem,
  SwarmDebateRun,
  UserXpProfile,
} from '../../shared/types';
import { invokeWithFailover } from '../providers/router';
import { constantTimeEqual, validateSafeOutboundUrl } from '../security/egressAndCrypto';
import { searchWalFullText } from '../state/sqliteWal';
import { appendAuditLog, getState, updateState } from '../state/store';

function assertUrlSafeForEgress(url: string): void {
  const res = validateSafeOutboundUrl(url);
  if (!res.safe) throw new Error(res.reason || 'Tiltott vagy érvénytelen kimenő URL.');
}

// ============================================================================
// M161–M178: Autonomous Swarm Intelligence Primitives
// ============================================================================

export interface DagStepInput {
  id: string;
  title: string;
  dependsOn?: string[];
}

/** M161: Topological wave scheduler for parallel mission sub-steps */
export function scheduleDagSteps(steps: DagStepInput[]): DagStepInput[][] {
  const remaining = new Map<string, DagStepInput>();
  for (const st of steps) remaining.set(st.id, st);

  const completed = new Set<string>();
  const waves: DagStepInput[][] = [];

  while (remaining.size > 0) {
    const wave: DagStepInput[] = [];
    for (const step of remaining.values()) {
      const deps = step.dependsOn || [];
      if (deps.every((d) => completed.has(d))) {
        wave.push(step);
      }
    }
    if (wave.length === 0) {
      // Cycle safety fallback: flush remaining as final sequential wave
      waves.push(Array.from(remaining.values()));
      break;
    }
    waves.push(wave);
    for (const w of wave) {
      completed.add(w.id);
      remaining.delete(w.id);
    }
  }
  return waves;
}

/** M164: Smart context-preserving tool output distiller */
export function compressToolOutput(raw: string, maxChars = 2400): string {
  const clean = raw.trim();
  if (clean.length <= maxChars) return clean;
  const lines = clean.split('\n');
  if (lines.length <= 24) {
    const half = Math.floor((maxChars - 60) / 2);
    return `${clean.slice(0, half)}\n... [${clean.length - half * 2} karakter tömörítve] ...\n${clean.slice(-half)}`;
  }
  const head = lines.slice(0, 12).join('\n');
  const tail = lines.slice(-10).join('\n');
  const result = `${head}\n... [${lines.length - 22} köztes sor tömörítve] ...\n${tail}`;
  return result.length <= maxChars ? result : result.slice(0, maxChars);
}

/** M166: Self-healing command recovery suggestions for common Linux/Node exit failures */
export function suggestCommandRecovery(stderr: string, command: string): {
  recoverable: boolean;
  reason: string;
  suggestedAlternative?: string;
} {
  const err = stderr.toLowerCase();
  if (/command not found|not found|enoent/.test(err)) {
    const bin = command.trim().split(/\s+/)[0] || 'eszköz';
    const pkgMap: Record<string, string> = {
      jq: 'python3 -m json.tool',
      htop: 'top -b -n 1',
      rg: 'grep -rn',
      fd: 'find . -name',
      bat: 'cat',
      python: 'python3',
      pip: 'pip3',
    };
    return {
      recoverable: true,
      reason: `Hiányzó parancs: ${bin}`,
      suggestedAlternative: pkgMap[bin] || `command -v ${bin} || apt-cache search ${bin}`,
    };
  }
  if (/eaddrinuse|address already in use/.test(err)) {
    return {
      recoverable: true,
      reason: 'A port már foglalt',
      suggestedAlternative: 'ss -tulpn | head -n 20',
    };
  }
  if (/permission denied|eacces/.test(err)) {
    return {
      recoverable: true,
      reason: 'Jogosultsági hiba a célkönyvtárban',
      suggestedAlternative: 'ls -la',
    };
  }
  return { recoverable: false, reason: 'Nem kategorizált parancshiba' };
}

/** M171: Lenient JSON payload extractor & repairer for noisy LLM responses */
export function repairJsonPayload<T = Record<string, unknown>>(raw: string): T | null {
  const stripped = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Try extracting outermost object or array
    const objStart = stripped.indexOf('{');
    const objEnd = stripped.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      const candidate = stripped
        .slice(objStart, objEnd + 1)
        .replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // continue
      }
    }
    const arrStart = stripped.indexOf('[');
    const arrEnd = stripped.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      const candidate = stripped
        .slice(arrStart, arrEnd + 1)
        .replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // fail
      }
    }
    return null;
  }
}

/** M178: Adaptive model temperature per task type */
export function selectAdaptiveTemperature(
  taskType: 'code' | 'json' | 'research' | 'chat' | 'creative',
  bias = 0
): number {
  const base: Record<string, number> = {
    code: 0.15,
    json: 0.1,
    research: 0.35,
    chat: 0.55,
    creative: 0.78,
  };
  const v = (base[taskType] ?? 0.45) + bias;
  return Math.max(0, Math.min(1.2, Number(v.toFixed(2))));
}

/** M175: Pre-estimate mission cost and recommend local Ollama offload when economical */
export function estimateMissionCostAndRoute(goal: string, estimatedSteps = 4): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCloudUsd: number;
  recommendLocalOllama: boolean;
  rationale: string;
} {
  const state = getState();
  const words = Math.max(10, goal.trim().split(/\s+/).length);
  const estimatedInputTokens = estimatedSteps * (900 + words * 4);
  const estimatedOutputTokens = estimatedSteps * 450;
  const estimatedCloudUsd = Number(
    ((estimatedInputTokens / 1_000_000) * 0.35 + (estimatedOutputTokens / 1_000_000) * 1.05).toFixed(5)
  );
  const remainingDaily = Math.max(0, state.settings.dailyCostLimitUsd - state.settings.dailySpendUsd);
  const recommendLocalOllama =
    state.settings.ollamaOnlyMode ||
    (state.settings.dailyCostLimitEnabled && estimatedCloudUsd > remainingDaily * 0.4);

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCloudUsd,
    recommendLocalOllama,
    rationale: recommendLocalOllama
      ? `Helyi Ollama (${state.settings.ollamaModel}) ajánlott a költségkeret kíméléséhez.`
      : `Becsült felhős költség: $${estimatedCloudUsd.toFixed(4)} (${estimatedSteps} lépés).`,
  };
}

/** M163: Crash-recovery mission checkpoint persistence */
export function saveMissionCheckpoint(input: {
  missionId: string;
  goal: string;
  completedStepIndices: number[];
  partialOutputs: string[];
}): MissionCheckpoint {
  const cp: MissionCheckpoint = {
    id: `cp-${input.missionId}`,
    missionId: input.missionId,
    goal: input.goal,
    completedStepIndices: [...input.completedStepIndices],
    partialOutputs: [...input.partialOutputs],
    updatedAt: new Date().toISOString(),
  };
  updateState((s) => {
    const idx = s.missionCheckpoints.findIndex((c) => c.missionId === input.missionId);
    if (idx >= 0) s.missionCheckpoints[idx] = cp;
    else s.missionCheckpoints.unshift(cp);
    s.missionCheckpoints = s.missionCheckpoints.slice(0, 30);
  });
  return cp;
}

// ============================================================================
// Ú206: Prompt-Built Self-Hosted Mini-App Builder (/apps/:slug)
// ============================================================================

export function buildMiniAppHtmlTemplate(title: string, description: string, bodySnippet?: string): string {
  const safeTitle = title.replace(/[<>&]/g, '');
  const safeDesc = description.replace(/[<>&]/g, '');
  const inner =
    bodySnippet?.trim() ||
    `<div style="max-width:640px;margin:40px auto;font-family:system-ui,sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:14px;background:#fff">
      <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a">${safeTitle}</h1>
      <p style="color:#475569;font-size:14px;margin-bottom:16px">${safeDesc}</p>
      <div style="display:flex;gap:8px">
        <input id="inp" type="text" placeholder="Érték vagy kifejezés..." style="flex:1;padding:10px;border:1px solid #cbd5e1;border-radius:8px" />
        <button onclick="document.getElementById('out').textContent='Feldolgozva: '+document.getElementById('inp').value" style="padding:10px 16px;background:#0f172a;color:#fff;border:0;border-radius:8px;cursor:pointer">Futtat</button>
      </div>
      <pre id="out" style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:13px"></pre>
    </div>`;

  if (/<!doctype html>/i.test(inner) || /<html/i.test(inner)) {
    return inner;
  }
  return `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle} — NovaSwarm App</title>
</head>
<body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:system-ui,sans-serif">
${inner}
</body>
</html>`;
}

export async function createHostedMiniApp(input: {
  title: string;
  description: string;
  htmlOverride?: string;
  useAi?: boolean;
}): Promise<HostedMiniApp> {
  const title = input.title.trim();
  if (!title) throw new Error('Alkalmazás név kötelező.');
  const slug =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `app-${Date.now()}`;

  let htmlContent = input.htmlOverride?.trim() || '';
  if (!htmlContent && input.useAi) {
    try {
      const res = await invokeWithFailover({
        prompt: `Készíts egy teljes, egyetlen fájlba ágyazott HTML+CSS+JS interaktív webalkalmazást (teljes <!doctype html> dokumentum, magyar felülettel, letisztult modern stílussal) az alábbi leírás alapján. Csak a nyers HTML kódot add vissza:\nNév: ${title}\nLeírás: ${input.description}`,
        complexity: 'complex',
      });
      const match = res.text.match(/```html\s*([\s\S]*?)```/i);
      htmlContent = (match ? match[1] : res.text).trim();
    } catch {
      htmlContent = '';
    }
  }

  if (!htmlContent) {
    htmlContent = buildMiniAppHtmlTemplate(title, input.description);
  }

  const now = new Date().toISOString();
  const app: HostedMiniApp = {
    id: `app-${crypto.randomUUID().slice(0, 8)}`,
    slug,
    title,
    description: input.description.trim(),
    htmlContent,
    createdAt: now,
    updatedAt: now,
  };

  updateState((s) => {
    s.hostedMiniApps = [app, ...s.hostedMiniApps.filter((a) => a.slug !== slug)].slice(0, 50);
  });
  awardUserXp(`App Builder: ${title}`, 25);
  return app;
}

// ============================================================================
// Ú218: Live Instant API Mock Server (/mock/:slug)
// ============================================================================

export function upsertApiMockEndpoint(input: {
  slug: string;
  method?: ApiMockEndpoint['method'];
  statusCode?: number;
  responseJson: string;
}): ApiMockEndpoint {
  const cleanSlug = input.slug.trim().replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9/_-]/g, '');
  if (!cleanSlug) throw new Error('Mock végpont útvonal (slug) kötelező.');
  JSON.parse(input.responseJson || '{}'); // Validate JSON strictly

  const ep: ApiMockEndpoint = {
    id: `mock-${crypto.randomUUID().slice(0, 8)}`,
    slug: cleanSlug,
    method: input.method || 'GET',
    statusCode: Math.min(599, Math.max(200, Number(input.statusCode || 200))),
    responseJson: input.responseJson,
    hitCount: 0,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.apiMocks = [
      ep,
      ...s.apiMocks.filter((m) => !(m.slug === cleanSlug && m.method === ep.method)),
    ].slice(0, 60);
  });
  return ep;
}

export function resolveApiMockRequest(
  slug: string,
  method: string
): { found: boolean; statusCode: number; body: unknown } {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const upperMethod = method.toUpperCase();
  const found = getState().apiMocks.find(
    (m) => m.slug === cleanSlug && m.method.toUpperCase() === upperMethod
  );
  if (!found) {
    return { found: false, statusCode: 404, body: { error: `Nincs mock végpont: ${upperMethod} /mock/${cleanSlug}` } };
  }
  updateState((s) => {
    const target = s.apiMocks.find((m) => m.id === found.id);
    if (target) target.hitCount += 1;
  });
  try {
    return { found: true, statusCode: found.statusCode, body: JSON.parse(found.responseJson) };
  } catch {
    return { found: true, statusCode: found.statusCode, body: { raw: found.responseJson } };
  }
}

// ============================================================================
// Ú207: Weighted Decision Matrix Assistant
// ============================================================================

export function evaluateDecisionMatrix(input: {
  title: string;
  criteria: Array<{ name: string; weight: number }>;
  options: Array<{ name: string; scores: Record<string, number> }>;
}): {
  title: string;
  ranking: Array<{ name: string; totalScore: number; normalizedPercent: number; breakdown: Record<string, number> }>;
  winner: string;
} {
  const totalWeight = input.criteria.reduce((sum, c) => sum + Math.max(0, Number(c.weight) || 0), 0) || 1;
  const maxPossible = input.criteria.reduce((sum, c) => sum + Math.max(0, Number(c.weight) || 0) * 10, 0) || 1;

  const ranking = input.options
    .map((opt) => {
      let weightedSum = 0;
      const breakdown: Record<string, number> = {};
      for (const crit of input.criteria) {
        const w = Math.max(0, Number(crit.weight) || 0);
        const rawScore = Math.min(10, Math.max(0, Number(opt.scores[crit.name] ?? 0)));
        const contrib = Number(((rawScore * w) / totalWeight).toFixed(2));
        breakdown[crit.name] = contrib;
        weightedSum += rawScore * w;
      }
      const totalScore = Number((weightedSum / totalWeight).toFixed(2));
      const normalizedPercent = Math.round((weightedSum / maxPossible) * 100);
      return { name: opt.name, totalScore, normalizedPercent, breakdown };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  return {
    title: input.title || 'Döntési Mátrix',
    ranking,
    winner: ranking[0]?.name || 'Nincs opció',
  };
}

// ============================================================================
// Ú208: Bank CSV Statement Auto-Categorizer & Anomaly Detector
// ============================================================================

const BANK_CATEGORY_RULES: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Élelmiszer & Bolt', pattern: /\b(lidl|aldi|spar|tesco|auchan|penny|cba|coop|kifli)\b/i },
  { category: 'Rezsi & Közmű', pattern: /\b(mvm|eon|főtáv|fotav|vízmű|vizmu|digi|telekom|vodafone|yettel|one)\b/i },
  { category: 'Üzemanyag & Közlekedés', pattern: /\b(mol|shell|omv|lukoil|bkk|máv|mav|bolt|uber|autópálya)\b/i },
  { category: 'Előfizetések & Tech', pattern: /\b(netflix|spotify|youtube|google|apple|github|openai|anthropic|amazon)\b/i },
  { category: 'Étterem & Kávé', pattern: /\b(wolt|foodora|mcdonald|kfc|starbucks|étterem|pizz|bistro)\b/i },
  { category: 'Egészség & Gyógyszertár', pattern: /\b(patika|gyógyszertár|benu|rossmann|dm|klinika)\b/i },
];

export function categorizeBankCsv(csvText: string): {
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  byCategory: Record<string, number>;
  anomalies: Array<{ description: string; amount: number; reason: string }>;
  rowsParsed: number;
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const byCategory: Record<string, number> = {};
  const expenseValues: Array<{ description: string; amount: number }> = [];
  let totalIncome = 0;
  let totalExpense = 0;
  let rowsParsed = 0;

  for (const line of lines) {
    if (/^(date|dátum|datum|összeg|osszeg|amount|leírás)/i.test(line)) continue;
    const cols = line.split(/[;,]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (cols.length < 2) continue;

    // Locate numeric amount column (prefer rightmost numeric column)
    let amount = NaN;
    const textParts: string[] = [];
    for (const col of cols) {
      const normalized = col.replace(/\s+/g, '').replace(',', '.');
      if (/^-?\d+(\.\d+)?$/.test(normalized) && !/^\d{4}-\d{2}-\d{2}$/.test(col)) {
        amount = Number(normalized);
      } else {
        textParts.push(col);
      }
    }
    if (!Number.isFinite(amount)) continue;

    rowsParsed += 1;
    const desc = textParts.join(' ') || 'Tétel';
    if (amount >= 0) {
      totalIncome += amount;
    } else {
      const abs = Math.abs(amount);
      totalExpense += abs;
      const matched = BANK_CATEGORY_RULES.find((r) => r.pattern.test(desc));
      const cat = matched?.category || 'Egyéb Kiadás';
      byCategory[cat] = Number(((byCategory[cat] || 0) + abs).toFixed(2));
      expenseValues.push({ description: desc, amount: abs });
    }
  }

  const avgExpense = expenseValues.length > 0 ? totalExpense / expenseValues.length : 0;
  const anomalies = expenseValues
    .filter((e) => e.amount > Math.max(avgExpense * 2.5, 50000))
    .map((e) => ({
      description: e.description,
      amount: e.amount,
      reason: `Kiugró költés (átlag ${Math.round(avgExpense)} felett 2.5x+)`,
    }));

  return {
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    netCashflow: Number((totalIncome - totalExpense).toFixed(2)),
    byCategory,
    anomalies,
    rowsParsed,
  };
}

// ============================================================================
// Ú209: Warranty & Official Document Expiry Safe
// ============================================================================

export function addDocumentSafeItem(input: {
  title: string;
  category: DocumentSafeItem['category'];
  expiresAt: string;
  issuer?: string;
  notes?: string;
}): DocumentSafeItem {
  if (!input.title?.trim() || !input.expiresAt?.trim()) {
    throw new Error('Dokumentum neve és lejárati dátuma kötelező.');
  }
  const item: DocumentSafeItem = {
    id: `doc-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title.trim(),
    category: input.category || 'warranty',
    expiresAt: input.expiresAt.trim(),
    issuer: input.issuer?.trim(),
    notes: input.notes?.trim(),
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.documentSafe.unshift(item);
  });
  return item;
}

export function checkExpiringDocuments(withinDays = 30): Array<DocumentSafeItem & { daysLeft: number }> {
  const now = Date.now();
  return getState()
    .documentSafe.map((d) => {
      const ms = Date.parse(d.expiresAt);
      const daysLeft = Number.isFinite(ms) ? Math.ceil((ms - now) / 86_400_000) : 9999;
      return { ...d, daysLeft };
    })
    .filter((d) => d.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ============================================================================
// Ú210: Webshop Price Watch Scraper
// ============================================================================

export function extractPriceFromHtml(html: string): number | null {
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const metaMatch = cleaned.match(/product:price:amount["'][^>]*content=["']([\d.,\s]+)["']/i);
  if (metaMatch) {
    const val = Number(metaMatch[1].replace(/\s+/g, '').replace(',', '.'));
    if (Number.isFinite(val) && val > 0) return val;
  }
  const hufMatch = cleaned.match(/(\d{1,3}(?:[\s\u00a0.]\d{3})+|\d{3,7})\s*(?:Ft|HUF|€|EUR|\$|USD)/i);
  if (hufMatch) {
    const val = Number(hufMatch[1].replace(/[\s\u00a0.]/g, ''));
    if (Number.isFinite(val) && val > 0) return val;
  }
  return null;
}

export function addPriceWatchItem(input: {
  name: string;
  url: string;
  targetPrice: number;
  currency?: string;
}): PriceWatchItem {
  if (!input.name?.trim() || !input.url?.trim()) throw new Error('Termék név és URL kötelező.');
  assertUrlSafeForEgress(input.url);
  const item: PriceWatchItem = {
    id: `pw-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    url: input.url.trim(),
    currency: input.currency || 'HUF',
    targetPrice: Number(input.targetPrice) || 0,
    lastPrice: null,
    priceHistory: [],
    lastCheckedAt: null,
  };
  updateState((s) => {
    s.priceWatches.unshift(item);
  });
  return item;
}

export async function checkPriceWatchItem(id: string, fetchImpl: typeof fetch = fetch): Promise<{
  item: PriceWatchItem;
  alertTriggered: boolean;
}> {
  const item = getState().priceWatches.find((p) => p.id === id);
  if (!item) throw new Error('Árfigyelő tétel nem található.');
  assertUrlSafeForEgress(item.url);

  let detected: number | null = null;
  let errorMsg: string | undefined;
  try {
    const res = await fetchImpl(item.url, {
      headers: { 'User-Agent': 'NovaSwarm-PriceWatch/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    detected = extractPriceFromHtml(html);
    if (detected === null) errorMsg = 'Nem található egyértelmű ár az oldalon.';
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const now = new Date().toISOString();
  let updated!: PriceWatchItem;
  updateState((s) => {
    const ref = s.priceWatches.find((p) => p.id === id);
    if (!ref) return;
    ref.lastCheckedAt = now;
    ref.lastError = errorMsg;
    if (detected !== null) {
      ref.lastPrice = detected;
      ref.priceHistory = [...ref.priceHistory, { price: detected, checkedAt: now }].slice(-40);
    }
    updated = { ...ref };
  });

  const alertTriggered = detected !== null && item.targetPrice > 0 && detected <= item.targetPrice;
  return { item: updated, alertTriggered };
}

// ============================================================================
// Ú212: "Mi van a hűtőben?" Pantry Recipe & Calorie Matcher
// ============================================================================

const BUILTIN_RECIPES = [
  {
    name: 'Csirkés Zöldséges Wok',
    ingredients: ['csirkemell', 'paprika', 'hagyma', 'szójaszósz', 'rizs'],
    calories: 540,
    minutes: 20,
  },
  {
    name: 'Klasszikus Bolognai Spagetti',
    ingredients: ['tészta', 'darált hús', 'paradicsom', 'hagyma', 'fokhagyma', 'sajt'],
    calories: 650,
    minutes: 30,
  },
  {
    name: 'Sajtos Tojásrántotta Teljes Kiőrlésű Pirítóssal',
    ingredients: ['tojás', 'sajt', 'vaj', 'kenyér', 'paradicsom'],
    calories: 410,
    minutes: 10,
  },
  {
    name: 'Tejszínes Gombás Csirke Rizzsel',
    ingredients: ['csirkemell', 'gomba', 'tejszín', 'rizs', 'hagyma'],
    calories: 590,
    minutes: 25,
  },
  {
    name: 'Túrós Tészta Pirított Szalonnával',
    ingredients: ['tészta', 'túró', 'tejföl', 'szalonna'],
    calories: 620,
    minutes: 15,
  },
  {
    name: 'Zabkása Banánnal és Mézzel',
    ingredients: ['zabpehely', 'tej', 'banán', 'méz'],
    calories: 360,
    minutes: 8,
  },
];

export function suggestRecipesFromPantry(): Array<{
  name: string;
  matchPercent: number;
  matchedIngredients: string[];
  missingIngredients: string[];
  calories: number;
  minutes: number;
}> {
  const pantryNames = getState().homeInventory.map((i) => i.name.toLowerCase());
  return BUILTIN_RECIPES.map((r) => {
    const matched = r.ingredients.filter((ing) => pantryNames.some((p) => p.includes(ing) || ing.includes(p)));
    const missing = r.ingredients.filter((ing) => !matched.includes(ing));
    const matchPercent = Math.round((matched.length / r.ingredients.length) * 100);
    return {
      name: r.name,
      matchPercent,
      matchedIngredients: matched,
      missingIngredients: missing,
      calories: r.calories,
      minutes: r.minutes,
    };
  }).sort((a, b) => b.matchPercent - a.matchPercent);
}

// ============================================================================
// Ú226: Multi-Agent Debate Theater (Pro / Contra / Judge)
// ============================================================================

export async function runMultiAgentDebate(topic: string): Promise<SwarmDebateRun> {
  if (!topic?.trim()) throw new Error('Vita téma megadása kötelező.');
  let proArgument = `MELLETTE érvek ("${topic}"):\n- Magas hosszú távú megtérülés és automatizálhatóság.\n- Helyi ellenőrzés és rugalmas bővíthetőség.`;
  let contraArgument = `ELLENE érvek ("${topic}"):\n- Kezdeti komplexitás és karbantartási teher.\n- Erőforrás-korlátok (RAM/idő) kockázata.`;
  let judgeVerdict = `BÍRÓI ÍTÉLET: Kis lépéses (MVP) bevezetés javasolt mérhető KPI-okkal, mert így a kockázat minimális, a nyereség pedig azonnal tesztelhető.`;
  let winnerSide: SwarmDebateRun['winnerSide'] = 'balanced';

  try {
    const [proRes, contraRes] = await Promise.all([
      invokeWithFailover({
        prompt: `Képviseld a PRO (támogató) álláspontot tömören (3-4 pontban) magyarul ebben a témában: "${topic}"`,
        complexity: 'simple',
        bypassCache: true,
      }),
      invokeWithFailover({
        prompt: `Képviseld a KONTRA (kritikus/ellenző) álláspontot tömören (3-4 pontban) magyarul ebben a témában: "${topic}"`,
        complexity: 'simple',
        bypassCache: true,
      }),
    ]);
    proArgument = proRes.text.trim();
    contraArgument = contraRes.text.trim();

    const judgeRes = await invokeWithFailover({
      prompt: `Te vagy a független Bíró. Értékeld a két álláspontot és hozz végső döntést magyarul!\nTéma: ${topic}\nPRO:\n${proArgument}\nKONTRA:\n${contraArgument}\nZárd így az utolsó sort: GYŐZTES: PRO vagy GYŐZTES: KONTRA vagy GYŐZTES: EGYENSÚLY`,
      complexity: 'complex',
      bypassCache: true,
    });
    judgeVerdict = judgeRes.text.trim();
    if (/GYŐZTES:\s*PRO/i.test(judgeVerdict)) winnerSide = 'pro';
    else if (/GYŐZTES:\s*KONTRA/i.test(judgeVerdict)) winnerSide = 'contra';
  } catch {
    // Structured deterministic fallback already prepared when no external API key configured
  }

  const run: SwarmDebateRun = {
    id: `debate-${crypto.randomUUID().slice(0, 8)}`,
    topic: topic.trim(),
    proArgument,
    contraArgument,
    judgeVerdict,
    winnerSide,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.debateRuns.unshift(run);
    s.debateRuns = s.debateRuns.slice(0, 30);
  });
  awardUserXp('Raj Vita Színház futtatva', 20);
  return run;
}

// ============================================================================
// M219 & Ú227: LoRA / ShareGPT JSONL Exporter
// ============================================================================

export function exportChatAsJsonl(): string {
  const msgs = getState().messages;
  const pairs: string[] = [];
  for (let i = 0; i < msgs.length - 1; i++) {
    if (msgs[i].senderType === 'user' && msgs[i + 1].senderType === 'agent') {
      pairs.push(
        JSON.stringify({
          conversations: [
            { from: 'human', value: msgs[i].content },
            { from: 'gpt', value: msgs[i + 1].content },
          ],
          model: msgs[i + 1].modelUsed || 'novaswarm',
        })
      );
    }
  }
  return pairs.join('\n');
}

// ============================================================================
// Ú232: Vector SVG Logo & Banner Generator
// ============================================================================

export function generateVectorLogoSvg(input: {
  title: string;
  subtitle?: string;
  primaryColor?: string;
  accentColor?: string;
  shape?: 'shield' | 'hexagon' | 'circle';
}): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const title = esc(input.title.trim() || 'NovaSwarm');
  const sub = esc(input.subtitle?.trim() || 'Autonóm AI Rendszer');
  const p = /^#[0-9a-f]{3,8}$/i.test(input.primaryColor || '') ? input.primaryColor! : '#0f172a';
  const a = /^#[0-9a-f]{3,8}$/i.test(input.accentColor || '') ? input.accentColor! : '#10b981';

  const emblem =
    input.shape === 'circle'
      ? `<circle cx="70" cy="70" r="36" fill="${a}" opacity="0.9"/><circle cx="70" cy="70" r="18" fill="#ffffff"/>`
      : input.shape === 'shield'
      ? `<path d="M70 30 L104 45 V72 C104 94 70 112 70 112 C70 112 36 94 36 72 V45 Z" fill="${a}"/><path d="M58 70 L67 79 L84 60" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round"/>`
      : `<polygon points="70,32 103,51 103,89 70,108 37,89 37,51" fill="${a}"/><circle cx="70" cy="70" r="12" fill="#ffffff"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" viewBox="0 0 520 140">
  <rect width="520" height="140" rx="18" fill="${p}" />
  ${emblem}
  <text x="132" y="68" fill="#ffffff" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${title}</text>
  <text x="132" y="96" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="14">${sub}</text>
</svg>`;
}

// ============================================================================
// Ú234: Safe Mathematical Function Evaluator & SVG Coordinate Plotter
// ============================================================================

type MathToken =
  | { kind: 'num'; val: number }
  | { kind: 'id'; val: string }
  | { kind: 'op'; val: string }
  | { kind: 'paren'; val: '(' | ')' }
  | { kind: 'comma' };

function tokenizeMath(expr: string): MathToken[] {
  const tokens: MathToken[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let end = i;
      while (end < expr.length && /[0-9.]/.test(expr[end])) end++;
      const numStr = expr.slice(i, end);
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) throw new Error(`Érvénytelen szám: ${numStr}`);
      tokens.push({ kind: 'num', val: parsed });
      i = end;
      continue;
    }
    if (/[a-z_]/i.test(ch)) {
      let end = i;
      while (end < expr.length && /[a-z0-9_]/i.test(expr[end])) end++;
      tokens.push({ kind: 'id', val: expr.slice(i, end).toLowerCase() });
      i = end;
      continue;
    }
    if (ch === '*' && expr[i + 1] === '*') {
      tokens.push({ kind: 'op', val: '**' });
      i += 2;
      continue;
    }
    if ('+-*/^%'.includes(ch)) {
      tokens.push({ kind: 'op', val: ch === '^' ? '**' : ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', val: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
      continue;
    }
    throw new Error(`Nem megengedett karakter a kifejezésben: ${ch}`);
  }
  return tokens;
}

const SAFE_MATH_FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
};

export function evaluateMathExpression(expr: string, xValue: number): number {
  const tokens = tokenizeMath(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (true) {
      const t = peek();
      if (!t || t.kind !== 'op' || (t.val !== '+' && t.val !== '-')) break;
      consume();
      const right = parseMulDiv();
      left = t.val === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePower();
    while (true) {
      const t = peek();
      if (!t || t.kind !== 'op' || (t.val !== '*' && t.val !== '/' && t.val !== '%')) break;
      consume();
      const right = parsePower();
      left = t.val === '*' ? left * right : t.val === '/' ? left / right : left % right;
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    const t = peek();
    if (t && t.kind === 'op' && t.val === '**') {
      consume();
      return Math.pow(base, parsePower());
    }
    return base;
  }

  function parseUnary(): number {
    const t = peek();
    if (t && t.kind === 'op' && (t.val === '+' || t.val === '-')) {
      consume();
      const val = parseUnary();
      return t.val === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error('Váratlan kifejezés-vége.');
    if (tok.kind === 'num') {
      consume();
      return tok.val;
    }
    if (tok.kind === 'paren' && tok.val === '(') {
      consume();
      const inner = parseAddSub();
      const close = consume();
      if (!close || close.kind !== 'paren' || close.val !== ')') {
        throw new Error('Hiányzó záró zárójel.');
      }
      return inner;
    }
    if (tok.kind === 'id') {
      consume();
      if (tok.val === 'x') return xValue;
      if (tok.val === 'pi') return Math.PI;
      if (tok.val === 'e') return Math.E;
      const fn = SAFE_MATH_FUNCS[tok.val];
      if (!fn) throw new Error(`Ismeretlen függvény vagy azonosító: ${tok.val}`);
      const open = consume();
      if (!open || open.kind !== 'paren' || open.val !== '(') {
        throw new Error(`Zárójel szükséges a(z) ${tok.val}() függvényhez.`);
      }
      const args: number[] = [];
      const afterOpen = peek();
      if (!(afterOpen && afterOpen.kind === 'paren' && afterOpen.val === ')')) {
        args.push(parseAddSub());
        while (peek()?.kind === 'comma') {
          consume();
          args.push(parseAddSub());
        }
      }
      const close = consume();
      if (!close || close.kind !== 'paren' || close.val !== ')') {
        throw new Error(`Hiányzó záró zárójel a(z) ${tok.val}() hívásnál.`);
      }
      return fn(...args);
    }
    throw new Error('Nem megengedett matematikai kifejezés.');
  }

  const out = parseAddSub();
  if (pos < tokens.length) {
    throw new Error('Váratlan extra token a matematikai kifejezés végén.');
  }
  return out;
}

export function plotMathFunctionSvg(expr: string, xMin = -10, xMax = 10): {
  svg: string;
  samples: Array<{ x: number; y: number }>;
} {
  const steps = 80;
  const samples: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    const y = evaluateMathExpression(expr, x);
    if (Number.isFinite(y) && Math.abs(y) < 1e6) {
      samples.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
    }
  }
  if (samples.length === 0) throw new Error('A függvény ebben a tartományban nem értelmezhető.');

  const yVals = samples.map((s) => s.y);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals) === yMin ? yMin + 1 : Math.max(...yVals);
  const W = 480;
  const H = 220;
  const pad = 24;

  const pts = samples
    .map((s) => {
      const px = pad + ((s.x - xMin) / (xMax - xMin || 1)) * (W - pad * 2);
      const py = H - pad - ((s.y - yMin) / (yMax - yMin || 1)) * (H - pad * 2);
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="10" fill="#ffffff" stroke="#cbd5e1"/>
  <line x1="${pad}" y1="${H / 2}" x2="${W - pad}" y2="${H / 2}" stroke="#e2e8f0" stroke-dasharray="4 3"/>
  <line x1="${W / 2}" y1="${pad}" x2="${W / 2}" y2="${H - pad}" stroke="#e2e8f0" stroke-dasharray="4 3"/>
  <polyline fill="none" stroke="#2563eb" stroke-width="2.5" points="${pts}"/>
  <text x="12" y="18" font-family="monospace" font-size="11" fill="#0f172a">f(x) = ${expr.replace(/[<>&]/g, '')} [${xMin}..${xMax}]</text>
</svg>`;

  return { svg, samples };
}

// ============================================================================
// Ú237: Gamified Productivity XP & Streak Engine
// ============================================================================

export function awardUserXp(reason: string, points = 10): UserXpProfile {
  const today = new Date().toISOString().slice(0, 10);
  let updated!: UserXpProfile;

  updateState((s) => {
    const profile = s.userXp;
    if (profile.lastAwardDate !== today) {
      if (profile.lastAwardDate) {
        const diffDays = Math.round(
          (Date.parse(today) - Date.parse(profile.lastAwardDate)) / 86_400_000
        );
        profile.streakDays = diffDays === 1 ? profile.streakDays + 1 : 1;
      } else {
        profile.streakDays = 1;
      }
      profile.lastAwardDate = today;
    }

    profile.xp += Math.max(1, points);
    profile.level = Math.max(1, Math.floor(profile.xp / 100) + 1);
    if (profile.level >= 3 && !profile.badges.includes('Haladó Parancsnok')) {
      profile.badges.push('Haladó Parancsnok');
    }
    if (profile.streakDays >= 7 && !profile.badges.includes('7 Napos Széria')) {
      profile.badges.push('7 Napos Széria');
    }
    profile.recentEvents = [
      { reason, points, at: new Date().toISOString() },
      ...profile.recentEvents,
    ].slice(0, 20);
    updated = { ...profile };
  });

  return updated;
}

// ============================================================================
// Ú238 & Ú239: Interactive HTML Slide Deck & Quiz Generator
// ============================================================================

export function generateInteractiveSlideDeck(title: string, rawBullets: string): string {
  const slides = rawBullets
    .split(/\n---\n|\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const slideBlocks = (slides.length > 0 ? slides : [rawBullets || 'Első dia']).map((block, idx) => {
    const lines = block.split('\n').filter(Boolean);
    const heading = (lines[0] || `Dia ${idx + 1}`).replace(/^#+\s*/, '');
    const items = lines
      .slice(1)
      .map((l) => `<li>${l.replace(/^[-*]\s*/, '').replace(/[<>&]/g, '')}</li>`)
      .join('');
    return `<section class="slide" style="display:${idx === 0 ? 'flex' : 'none'}"><h1>${heading.replace(/[<>&]/g, '')}</h1><ul>${items}</ul><div class="num">${idx + 1} / ${Math.max(1, slides.length)}</div></section>`;
  });

  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, '')}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;height:100vh;display:flex;align-items:center;justify-content:center}.slide{max-width:780px;width:90%;padding:48px;background:#1e293b;border-radius:18px;flex-direction:column;gap:18px;box-shadow:0 20px 50px rgba(0,0,0,.4)}h1{margin:0;font-size:32px;color:#38bdf8}ul{font-size:20px;line-height:1.6}.num{font-size:13px;color:#94a3b8;text-align:right}.nav{position:fixed;bottom:24px;display:flex;gap:12px}button{padding:10px 18px;border:0;border-radius:8px;background:#38bdf8;color:#0f172a;font-weight:700;cursor:pointer}</style></head>
<body>${slideBlocks.join('')}<div class="nav"><button onclick="go(-1)">Előző</button><button onclick="go(1)">Következő</button></div>
<script>let i=0;const s=[...document.querySelectorAll('.slide')];function go(d){s[i].style.display='none';i=(i+d+s.length)%s.length;s[i].style.display='flex';}document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1);});</script></body></html>`;
}

export function generateInteractiveQuizHtml(
  topic: string,
  questions: Array<{ question: string; options: string[]; answerIndex: number }>
): string {
  const payload = JSON.stringify(questions).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const safeTopic = topic.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${safeTopic} — Kvíz</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:32px auto;padding:16px;background:#f8fafc;color:#0f172a}.card{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:18px;margin-bottom:14px}button.opt{display:block;width:100%;text-align:left;padding:10px;margin:6px 0;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer}button.ok{background:#dcfce7;border-color:#16a34a}button.bad{background:#fee2e2;border-color:#dc2626}</style></head>
<body><h2>${safeTopic}</h2><div id="root"></div><h3 id="score"></h3>
<script>const qs=${payload};let score=0;const root=document.getElementById('root');qs.forEach((q,qi)=>{const c=document.createElement('div');c.className='card';const title=document.createElement('b');title.textContent=(qi+1)+'. '+String(q.question||'');c.appendChild(title);(q.options||[]).forEach((o,oi)=>{const b=document.createElement('button');b.className='opt';b.textContent=String(o);b.onclick=()=>{if(c.dataset.done)return;c.dataset.done='1';b.classList.add(oi===q.answerIndex?'ok':'bad');if(oi===q.answerIndex)score++;document.getElementById('score').textContent='Pontszám: '+score+' / '+qs.length;};c.appendChild(b);});root.appendChild(c);});</script></body></html>`;
}

// ============================================================================
// Ú244 & Ú257: Once-Time Secret ("Égő Cetli") & Expiring Temp Vault (/burn/:token)
// ============================================================================

export function createEphemeralNote(input: {
  title: string;
  content: string;
  oneTimeRead?: boolean;
  ttlMinutes?: number;
}): EphemeralNote {
  if (!input.content?.trim()) throw new Error('Titkos tartalom megadása kötelező.');
  const ttlMs = Math.max(1, Math.min(43200, Number(input.ttlMinutes || 60))) * 60_000;
  const note: EphemeralNote = {
    id: `eph-${crypto.randomUUID().slice(0, 8)}`,
    token: crypto.randomBytes(24).toString('base64url'),
    title: input.title?.trim() || 'Égő Cetli',
    content: input.content,
    oneTimeRead: input.oneTimeRead !== false,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    readCount: 0,
    burned: false,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.ephemeralNotes.unshift(note);
  });
  return note;
}

export function consumeEphemeralNote(token: string): {
  ok: boolean;
  title?: string;
  content?: string;
  burnedNow?: boolean;
  reason?: string;
} {
  let outcome: {
    ok: boolean;
    title?: string;
    content?: string;
    burnedNow?: boolean;
    reason?: string;
  } = { ok: false, reason: 'A cetli nem található vagy már törlődött.' };

  updateState((s) => {
    const ref = s.ephemeralNotes.find((n) => constantTimeEqual(n.token, token));
    if (!ref) {
      outcome = { ok: false, reason: 'A cetli nem található vagy már törlődött.' };
      return;
    }
    if (ref.burned) {
      outcome = { ok: false, reason: 'Ez a cetli egyszeri megnyitás után már megsemmisült.' };
      return;
    }
    if (Date.parse(ref.expiresAt) <= Date.now()) {
      ref.burned = true;
      ref.content = '';
      outcome = { ok: false, reason: 'A cetli élettartama lejárt.' };
      return;
    }
    const content = ref.content;
    const title = ref.title;
    const burnedNow = ref.oneTimeRead;
    ref.readCount += 1;
    if (ref.oneTimeRead) {
      ref.burned = true;
      ref.content = '';
    }
    outcome = { ok: true, title, content, burnedNow };
  });

  return outcome;
}

export function pruneExpiredEphemeralNotes(): number {
  const now = Date.now();
  const before = getState().ephemeralNotes.length;
  const active = getState().ephemeralNotes.filter((n) => !n.burned && Date.parse(n.expiresAt) > now);
  const removed = before - active.length;
  if (removed > 0) {
    updateState((s) => {
      s.ephemeralNotes = active;
    });
  }
  return removed;
}

// ============================================================================
// Ú254: Life Compass OKR -> Weekly Kanban Breakdown
// ============================================================================

export function createLifeGoalOkrAndKanban(input: {
  title: string;
  quarter: string;
  milestones: string[];
}): LifeGoalOkr {
  if (!input.title?.trim()) throw new Error('Cél megnevezése kötelező.');
  const now = new Date().toISOString();
  const createdMilestones: LifeGoalOkr['milestones'] = [];

  updateState((s) => {
    for (const mTitle of input.milestones.map((x) => x.trim()).filter(Boolean)) {
      const cardId = `card-${crypto.randomUUID().slice(0, 8)}`;
      const card: KanbanCard = {
        id: cardId,
        title: `[${input.quarter || 'OKR'}] ${mTitle}`,
        description: `Élet-Iránytű célból generálva: ${input.title}`,
        status: 'todo',
        assignedAgentId: s.agents.find((a) => !a.isSupervisor && a.active)?.id || null,
        priority: 'medium',
        project: input.title,
        createdAt: now,
        updatedAt: now,
      };
      s.kanban.unshift(card);
      createdMilestones.push({
        id: `ms-${crypto.randomUUID().slice(0, 6)}`,
        title: mTitle,
        done: false,
        kanbanCardId: cardId,
      });
    }
  });

  const goal: LifeGoalOkr = {
    id: `okr-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title.trim(),
    quarter: input.quarter?.trim() || 'Q4',
    progressPercent: 0,
    milestones: createdMilestones,
    createdAt: now,
  };
  updateState((s) => {
    s.lifeGoals.unshift(goal);
  });
  awardUserXp(`Új Élet-Iránytű OKR: ${goal.title}`, 15);
  return goal;
}

// ============================================================================
// Ú259: Global Omnisearch Across ALL Entities + SQLite FTS5
// ============================================================================

export interface OmnisearchHit {
  source: string;
  id: string;
  title: string;
  snippet: string;
}

export function runGlobalOmnisearch(query: string, limit = 30): {
  query: string;
  totalHits: number;
  hits: OmnisearchHit[];
} {
  const q = query.trim().toLowerCase();
  if (!q) return { query, totalHits: 0, hits: [] };

  const state = getState();
  const hits: OmnisearchHit[] = [];

  for (const r of searchWalFullText(query, 12)) {
    hits.push({ source: `sqlite_${r.kind}`, id: r.docId, title: r.title, snippet: r.body.slice(0, 180) });
  }

  for (const c of state.kanban) {
    if (`${c.title} ${c.description}`.toLowerCase().includes(q)) {
      hits.push({ source: 'kanban', id: c.id, title: c.title, snippet: c.description.slice(0, 160) });
    }
  }
  for (const m of state.memories) {
    if (`${m.entity} ${m.content} ${m.tags.join(' ')}`.toLowerCase().includes(q)) {
      hits.push({ source: 'memory', id: m.id, title: m.entity, snippet: m.content.slice(0, 160) });
    }
  }
  for (const c of state.crmContacts) {
    if (`${c.name} ${c.relation} ${c.notes || ''}`.toLowerCase().includes(q)) {
      hits.push({ source: 'crm', id: c.id, title: c.name, snippet: `${c.relation} · ${c.notes || ''}` });
    }
  }
  for (const b of state.bookmarks) {
    if (`${b.title} ${b.url} ${b.archivedExcerpt}`.toLowerCase().includes(q)) {
      hits.push({ source: 'bookmark', id: b.id, title: b.title, snippet: b.url });
    }
  }
  for (const d of state.documentSafe) {
    if (`${d.title} ${d.issuer || ''} ${d.notes || ''}`.toLowerCase().includes(q)) {
      hits.push({ source: 'document_safe', id: d.id, title: d.title, snippet: `Lejárat: ${d.expiresAt}` });
    }
  }
  for (const msg of state.messages.slice(-150)) {
    if (msg.content.toLowerCase().includes(q)) {
      hits.push({ source: 'chat', id: msg.id, title: msg.senderName, snippet: msg.content.slice(0, 160) });
    }
  }

  // Deduplicate by source+id
  const deduped: OmnisearchHit[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const key = `${h.source}:${h.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(h);
    }
  }

  return {
    query: query.trim(),
    totalHits: deduped.length,
    hits: deduped.slice(0, limit),
  };
}

// ============================================================================
// M245: Two-Way Standards-Compliant iCal (.ics) Feed Generator
// ============================================================================

export function buildCalendarIcsFeed(): string {
  const events = getState().calendarEvents;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NovaSwarm//Autonomous Calendar//HU',
    'CALSCALE:GREGORIAN',
  ];
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@novaswarm.local`,
      `DTSTAMP:${fmt(ev.createdAt)}`,
      `DTSTART:${fmt(ev.startAt)}`,
      ...(ev.endAt ? [`DTEND:${fmt(ev.endAt)}`] : []),
      `SUMMARY:${ev.title.replace(/\r?\n/g, ' ')}`,
      ...(ev.location ? [`LOCATION:${ev.location.replace(/\r?\n/g, ' ')}`] : []),
      ...(ev.notes ? [`DESCRIPTION:${ev.notes.replace(/\r?\n/g, ' ')}`] : []),
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ============================================================================
// Ú248 & Ú260: Portable Migration Bundle & Autopilot 24/7 Summary
// ============================================================================

export function buildPortableMigrationBundle(): {
  exportedAt: string;
  schemaVersion: number;
  instanceName: string;
  counts: Record<string, number>;
  payload: Record<string, unknown>;
} {
  const s = getState();
  const safeSettings = {
    ...s.settings,
    providerKeys: { gemini: [], openai: [], anthropic: [], openrouter: [], ollama: [] },
  };
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: s.settings.schemaVersion,
    instanceName: s.settings.instanceName,
    counts: {
      agents: s.agents.length,
      memories: s.memories.length,
      kanban: s.kanban.length,
      crmContacts: s.crmContacts.length,
      documentSafe: s.documentSafe.length,
      hostedMiniApps: s.hostedMiniApps.length,
    },
    payload: {
      settings: safeSettings,
      agents: s.agents,
      memories: s.memories,
      kanban: s.kanban,
      ideas: s.ideas,
      crmContacts: s.crmContacts,
      documentSafe: s.documentSafe,
      priceWatches: s.priceWatches,
      hostedMiniApps: s.hostedMiniApps,
      lifeGoals: s.lifeGoals,
      sharedLists: s.sharedLists,
      userXp: s.userXp,
    },
  };
}

export function getAutopilotSummary(): {
  fullAutonomousMode: boolean;
  zeroDefaultSecurity: boolean;
  nightShiftEnabled: boolean;
  completedNightTasks: number;
  activeAgents: number;
  openKanban: number;
  memoriesCount: number;
  expiringDocsCount: number;
  xpLevel: number;
  xpTotal: number;
  recentAutonomousActions: string[];
  nextAutonomousPlans: string[];
} {
  const s = getState();
  const completedNightTasks = s.nightShiftRuns.reduce((sum, r) => sum + r.tasksCompleted, 0);
  const openKanban = s.kanban.filter((k) => !k.archived && k.status !== 'done').length;
  const expiringDocsCount = checkExpiringDocuments(30).length;
  const recentAutonomousActions = s.auditLogs
    .slice(-6)
    .reverse()
    .map((l) => `[${l.type}] ${l.sourceAgentName}: ${l.message}`);

  const nextAutonomousPlans: string[] = [];
  if (openKanban > 0) nextAutonomousPlans.push(`${openKanban} nyitott Kanban feladat automatikus feldolgozása az Éjszakai Műszakban`);
  if (expiringDocsCount > 0) nextAutonomousPlans.push(`${expiringDocsCount} közelgő okmány/garancia lejárat értesítés`);
  if (s.priceWatches.length > 0) nextAutonomousPlans.push(`${s.priceWatches.length} webshop árfigyelő ellenőrzése`);
  if (nextAutonomousPlans.length === 0) nextAutonomousPlans.push('Folyamatos LAN/Ollama/Telegram készenlét & memóriakonszolidáció');

  return {
    fullAutonomousMode: s.settings.fullAutonomousMode,
    zeroDefaultSecurity: !s.settings.webAuthEnabled && s.settings.hostPermissionsGranted && !s.settings.guardrailsEnabled,
    nightShiftEnabled: s.settings.nightShiftEnabled,
    completedNightTasks,
    activeAgents: s.agents.filter((a) => !a.isSupervisor && a.active).length,
    openKanban,
    memoriesCount: s.memories.length,
    expiringDocsCount,
    xpLevel: s.userXp.level,
    xpTotal: s.userXp.xp,
    recentAutonomousActions,
    nextAutonomousPlans,
  };
}

export function auditBatch4Action(message: string): void {
  appendAuditLog({
    type: 'action',
    sourceAgentId: 'omni-studio',
    sourceAgentName: 'NovaSwarm Omni Stúdió',
    message,
    verifiedExecution: true,
  });
}

// Keep unused fs/path imported cleanly if future direct file snapshot hooks use them
export function ensureTempDir(name: string): string {
  const dir = path.join(process.cwd(), name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
