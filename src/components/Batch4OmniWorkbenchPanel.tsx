import React, { useState } from 'react';
import {
  Activity,
  AppWindow,
  Calculator,
  Flame,
  Presentation,
  Scale,
  Server,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { NovaSwarmState } from '../../shared/types';

interface Props {
  state: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

export const Batch4OmniWorkbenchPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  // App Builder (Ú206)
  const [appTitle, setAppTitle] = useState('');
  const [appDesc, setAppDesc] = useState('');
  const [appUseAi, setAppUseAi] = useState(false);
  const [appMsg, setAppMsg] = useState<string | null>(null);

  // API Mock (Ú218)
  const [mockSlug, setMockSlug] = useState('demo-status');
  const [mockMethod, setMockMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [mockJson, setMockJson] = useState('{"ok": true, "node": "RaspberryPi"}');

  // Debate Theater (Ú226)
  const [debateTopic, setDebateTopic] = useState('');
  const [debateBusy, setDebateBusy] = useState(false);

  // Math Plotter (Ú234) & SVG Logo (Ú232)
  const [mathExpr, setMathExpr] = useState('sin(x) * x');
  const [mathSvg, setMathSvg] = useState<string | null>(null);
  const [logoTitle, setLogoTitle] = useState('NovaSwarm');
  const [logoSvg, setLogoSvg] = useState<string | null>(null);

  // Bank CSV (Ú208) & Decision Matrix (Ú207)
  const [bankCsv, setBankCsv] = useState('2026-11-20;Lidl Bevásárlás;-14500\n2026-11-21;MVM Áram;-18200\n2026-11-22;Munkabér;540000');
  const [bankSummary, setBankSummary] = useState<{ totalIncome: number; totalExpense: number; netCashflow: number; byCategory: Record<string, number> } | null>(null);
  const [matrixOut, setMatrixOut] = useState<string | null>(null);

  // Ephemeral Burn Note (Ú244) & Slide Deck (Ú238)
  const [burnTitle, setBurnTitle] = useState('WiFi Jelszó');
  const [burnText, setBurnText] = useState('');
  const [burnLink, setBurnLink] = useState<string | null>(null);
  const [slideTitle, setSlideTitle] = useState('NovaSwarm Bemutató');
  const [slideBullets, setSlideBullets] = useState('# Bevezetés\n- Teljes autonómia\n- Helyi LAN vezérlés\n---\n# Következő Lépés\n- Telegram integráció');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ú206: Self-Hosted App Builder */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AppWindow className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              App Builder — Önálló Mini-Alkalmazás Hosztoló (Ú206)
            </h3>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={appTitle}
              onChange={(e) => setAppTitle(e.target.value)}
              placeholder="Alkalmazás neve (pl. Kalória Kalkulátor)"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <input
              type="text"
              value={appDesc}
              onChange={(e) => setAppDesc(e.target.value)}
              placeholder="Rövid leírás vagy funkciók"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={appUseAi} onChange={(e) => setAppUseAi(e.target.checked)} />
              Teljes AI HTML generálás (különben azonnali sablon)
            </label>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/apps', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: appTitle, description: appDesc, useAi: appUseAi }),
                });
                const d = (await r.json()) as { url?: string; error?: string };
                setAppMsg(r.ok ? `Elkészült: ${d.url}` : d.error || 'Hiba');
                setAppTitle('');
                await onRefreshState();
              }}
              className="w-full px-3 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              Mini-App Létrehozása & Hosztolása
            </button>
            {appMsg && <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{appMsg}</div>}
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {(state.hostedMiniApps || []).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs"
              >
                <a
                  href={`/apps/${a.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-700 dark:text-blue-400 underline"
                >
                  {a.title} (/apps/{a.slug})
                </a>
                <button
                  type="button"
                  aria-label={`Törlés ${a.title}`}
                  onClick={async () => {
                    await fetch(`/api/v4/apps/${a.id}`, { method: 'DELETE' });
                    await onRefreshState();
                  }}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Ú218: Live API Mock Server */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Pillanatnyi API Mock Szerver (/mock/:slug) (Ú218)
            </h3>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Mock HTTP metódus"
              value={mockMethod}
              onChange={(e) => setMockMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE')}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input
              type="text"
              value={mockSlug}
              onChange={(e) => setMockSlug(e.target.value)}
              placeholder="útvonal (pl. demo-status)"
              className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <textarea
            rows={2}
            value={mockJson}
            onChange={(e) => setMockJson(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/v4/mocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: mockSlug, method: mockMethod, responseJson: mockJson }),
              });
              await onRefreshState();
            }}
            className="w-full px-3 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
          >
            Mock Végpont Aktiválása
          </button>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {(state.apiMocks || []).map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded">
                <span className="font-mono">
                  {m.method} /mock/{m.slug} ({m.hitCount} találat)
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/v4/mocks/${m.id}`, { method: 'DELETE' });
                    await onRefreshState();
                  }}
                  className="text-red-600"
                >
                  Törlés
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Ú226: Multi-Agent Debate Theater */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ágens-Vita Színház — Pro / Kontra / Bíró (Ú226)
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={debateTopic}
              onChange={(e) => setDebateTopic(e.target.value)}
              placeholder="Vita téma (pl. Docker vs natív systemd Pi-n)"
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              disabled={debateBusy}
              onClick={async () => {
                if (!debateTopic.trim()) return;
                setDebateBusy(true);
                try {
                  await fetch('/api/v4/debate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topic: debateTopic }),
                  });
                  setDebateTopic('');
                  await onRefreshState();
                } finally {
                  setDebateBusy(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
            >
              {debateBusy ? 'Folyamatban...' : 'Vita Indítása'}
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(state.debateRuns || []).slice(0, 3).map((d) => (
              <div key={d.id} className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs space-y-1">
                <div className="font-semibold flex justify-between">
                  <span>{d.topic}</span>
                  <span className="uppercase text-emerald-700 dark:text-emerald-400">{d.winnerSide}</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{d.judgeVerdict}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Ú232 & Ú234: Math Plotter & Vector Logo */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Függvényrajzoló & SVG Logó Generátor (Ú232, Ú234)
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={mathExpr}
              onChange={(e) => setMathExpr(e.target.value)}
              placeholder="f(x) = sin(x) * x"
              className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/math/plot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ expr: mathExpr, xMin: -10, xMax: 10 }),
                });
                const d = (await r.json()) as { svg?: string };
                if (d.svg) setMathSvg(d.svg);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              Rajzol
            </button>
          </div>
          {mathSvg && (
            <img
              alt="Matematikai függvény grafikon"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(mathSvg)}`}
              className="w-full rounded border border-slate-200"
            />
          )}
          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <input
              type="text"
              value={logoTitle}
              onChange={(e) => setLogoTitle(e.target.value)}
              placeholder="Logó szöveg"
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/creative/logo-svg', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: logoTitle, shape: 'hexagon' }),
                });
                const d = (await r.json()) as { svg?: string };
                if (d.svg) setLogoSvg(d.svg);
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              SVG Logó
            </button>
          </div>
          {logoSvg && (
            <img
              alt="Generált SVG logó"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`}
              className="w-full max-w-sm rounded"
            />
          )}
        </section>

        {/* Ú207 & Ú208: Bank CSV & Decision Matrix */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Banki CSV Kategorizáló & Döntési Mátrix (Ú207, Ú208)
            </h3>
          </div>
          <textarea
            rows={3}
            value={bankCsv}
            onChange={(e) => setBankCsv(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/bank-csv', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ csv: bankCsv }),
                });
                setBankSummary(await r.json());
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              CSV Elemzése
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/decision-matrix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: 'Szerver Választás',
                    criteria: [
                      { name: 'Ár', weight: 5 },
                      { name: 'Fogyasztás', weight: 4 },
                      { name: 'Teljesítmény', weight: 3 },
                    ],
                    options: [
                      { name: 'Raspberry Pi 5', scores: { Ár: 9, Fogyasztás: 10, Teljesítmény: 6 } },
                      { name: 'Mini PC N100', scores: { Ár: 7, Fogyasztás: 8, Teljesítmény: 9 } },
                    ],
                  }),
                });
                const d = (await r.json()) as { winner: string; ranking: Array<{ name: string; totalScore: number; normalizedPercent: number }> };
                setMatrixOut(`Győztes: ${d.winner} (${d.ranking.map((x) => `${x.name}: ${x.normalizedPercent}%`).join(' | ')})`);
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              Minta Döntési Mátrix
            </button>
          </div>
          {bankSummary && (
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded text-xs space-y-1">
              <div>
                Bevétel: <b>{bankSummary.totalIncome}</b> · Kiadás: <b>{bankSummary.totalExpense}</b> · Egyenleg: <b>{bankSummary.netCashflow}</b>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                {Object.entries(bankSummary.byCategory).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </div>
            </div>
          )}
          {matrixOut && <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{matrixOut}</div>}
        </section>

        {/* Ú244 & Ú238: Once-Time Burn Note & Slide Deck */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Égő Cetli (Once-Time Secret) & Prezentáció (Ú238, Ú244)
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={burnTitle}
              onChange={(e) => setBurnTitle(e.target.value)}
              placeholder="Cím"
              className="w-1/3 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={burnText}
              onChange={(e) => setBurnText(e.target.value)}
              placeholder="Egyszer megtekinthető titkos adat..."
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                if (!burnText.trim()) return;
                const r = await fetch('/api/v4/ephemeral-notes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: burnTitle, content: burnText, oneTimeRead: true, ttlMinutes: 60 }),
                });
                const d = (await r.json()) as { sharePath?: string };
                if (d.sharePath) setBurnLink(d.sharePath);
                setBurnText('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              Égő Link
            </button>
          </div>
          {burnLink && (
            <div className="text-xs font-mono">
              Megosztás: <a href={burnLink} target="_blank" rel="noreferrer" className="text-blue-700 underline">{burnLink}</a>
            </div>
          )}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Presentation className="h-3.5 w-3.5" />
              HTML Slide Deck Generátor
            </div>
            <input
              type="text"
              value={slideTitle}
              onChange={(e) => setSlideTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <textarea
              rows={2}
              value={slideBullets}
              onChange={(e) => setSlideBullets(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/creative/slides', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: slideTitle, bullets: slideBullets }),
                });
                const d = (await r.json()) as { html?: string };
                if (d.html) {
                  const blob = new Blob([d.html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'prezentacio.html';
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Prezentáció Letöltése (.html)
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
