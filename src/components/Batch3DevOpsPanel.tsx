import React, { useState } from 'react';
import {
  Activity,
  Braces,
  FileCode2,
  FolderGit2,
  Globe,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useLocale } from '../locales/translations';
import { InfoHint } from './InfoHint';

export const Batch3DevOpsPanel: React.FC = () => {
  const { tx } = useLocale();
  const [xray, setXray] = useState<{
    totalFiles: number;
    totalLines: number;
    largestFiles: Array<{ file: string; lines: number; bytes: number }>;
    mermaidDependencyGraph: string;
  } | null>(null);
  const [cve, setCve] = useState<{
    packageCount: number;
    summary: string;
    vulnerabilities: Array<{ name: string; severity: string; title: string; source: string }>;
  } | null>(null);
  const [rxPattern, setRxPattern] = useState('(\\w+)@([\\w.]+)');
  const [rxSample, setRxSample] = useState('kapcsolat: dev@novaswarm.local es admin@example.com');
  const [nlCron, setNlCron] = useState(() => tx('minden 15 percben'));
  const [rxOut, setRxOut] = useState<string>('');
  const [sqlIn, setSqlIn] = useState(
    'CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT);\nCREATE TABLE memories (id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id));'
  );
  const [sqlMermaid, setSqlMermaid] = useState('');
  const [loadUrl, setLoadUrl] = useState('http://127.0.0.1:3000/healthz');
  const [loadReq, setLoadReq] = useState(15);
  const [loadOut, setLoadOut] = useState<{
    rps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    successCount: number;
    totalRequests: number;
    error?: string;
  } | null>(null);
  const [changelog, setChangelog] = useState('');
  const [dockerText, setDockerText] = useState('FROM node:latest\nWORKDIR /app\nCOPY . .\nRUN apt-get update && apt-get install -y curl\nCMD ["npm","start"]');
  const [dockerOut, setDockerOut] = useState<{ score: number; findings: Array<{ severity: string; issue: string; fix: string }> } | null>(null);
  const [seoUrl, setSeoUrl] = useState('http://127.0.0.1:3000');
  const [seoOut, setSeoOut] = useState<{ seoScore: number; title?: string; h1Count: number; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FolderGit2 className="h-4 w-4" />
              <span>{tx('Kódbázis Röntgen & Függőségi Gráf')}</span>
              <InfoHint
                label={tx('Kódbázis Röntgen')}
                text={tx('Átnézi a szerver mappát, megmutatja a legnagyobb fájlokat és lerajzolja, melyik modul mire épül.')}
              />
            </h3>
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch('/api/v3/devops/xray?dir=server');
                  if (r.ok) setXray(await r.json());
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('Elemzés Futtatása')}
            </button>
          </div>
          {xray && (
            <div className="space-y-2 text-xs">
              <div className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {tx('Fájlok: {0} · Összes sor: {1}', xray.totalFiles, xray.totalLines)}
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {xray.largestFiles.slice(0, 6).map((f) => (
                  <div key={f.file} className="flex justify-between font-mono text-[11px]">
                    <span className="truncate">{f.file}</span>
                    <span className="tabular-nums text-slate-500">{tx('{0} sor', f.lines)}</span>
                  </div>
                ))}
              </div>
              <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-mono max-h-28 overflow-auto">
                {xray.mermaidDependencyGraph}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <span>{tx('Csomag Sebezhetőségi Vizsgálat (CVE)')}</span>
              <InfoHint
                label={tx('CVE vizsgálat')}
                text={tx('Leellenőrzi a projekt külső programcsomagjait, hogy van-e bennük ismert biztonsági rés.')}
              />
            </h3>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch('/api/v3/cve-scan', { method: 'POST' });
                  if (r.ok) setCve(await r.json());
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('CVE Ellenőrzés')}
            </button>
          </div>
          {cve && (
            <div className="space-y-2 text-xs">
              <div className="font-medium text-slate-800 dark:text-slate-200">{cve.summary}</div>
              <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-[11px]">
                {cve.vulnerabilities.map((v, i) => (
                  <div key={i} className="p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
                    [{v.severity.toUpperCase()} · {v.source}] {v.name}: {v.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Braces className="h-4 w-4" />
            <span>{tx('Szövegminta (Regex) & Időzítés-Generátor')}</span>
            <InfoHint
              label={tx('Regex és időzítés-generátor')}
              text={tx('Tesztelheted a keresőmintákat, vagy természetes mondatból (pl. minden 15 percben) automatikus időzítő kódot készíthetsz.')}
            />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <input
              type="text"
              value={rxPattern}
              onChange={(e) => setRxPattern(e.target.value)}
              placeholder={tx('Regex minta...')}
              className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <input
              type="text"
              value={nlCron}
              onChange={(e) => setNlCron(e.target.value)}
              placeholder={tx('Ütemezés leírása (pl. minden hétfő 09:00)')}
              className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
          </div>
          <input
            type="text"
            value={rxSample}
            onChange={(e) => setRxSample(e.target.value)}
            placeholder={tx('Teszt szöveg...')}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/regex-cron', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: rxPattern, sampleText: rxSample, naturalCronText: nlCron }),
              });
              if (r.ok) setRxOut(JSON.stringify(await r.json(), null, 2));
            }}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('Kiértékelés')}
          </button>
          {rxOut && <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono max-h-32 overflow-auto">{rxOut}</pre>}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>{tx('Weboldal Terhelés- és Sebességteszt')}</span>
            <InfoHint
              label={tx('Weboldal terhelésteszt')}
              text={tx('Több párhuzamos lekéréssel megméri, milyen gyorsan és megbízhatóan válaszol egy webcím.')}
            />
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <input
              type="text"
              value={loadUrl}
              onChange={(e) => setLoadUrl(e.target.value)}
              className="flex-1 min-w-[180px] px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={loadReq}
              onChange={(e) => setLoadReq(Number(e.target.value))}
              className="w-20 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v3/loadtest', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: loadUrl, totalRequests: loadReq, concurrency: 4 }),
                });
                if (r.ok) setLoadOut(await r.json());
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('Terhelés Indítása')}
            </button>
          </div>
          {loadOut && (
            <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
              <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">RPS: {loadOut.rps}</div>
              <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">P50: {loadOut.p50Ms}ms</div>
              <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">P95: {loadOut.p95Ms}ms</div>
              <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">OK: {loadOut.successCount}/{loadOut.totalRequests}</div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileCode2 className="h-4 w-4" />
            <span>{tx('Adatbázis Tervrajz & Dockerfile Ellenőrző')}</span>
            <InfoHint
              label={tx('Adatbázis tervrajz és Dockerfile')}
              text={tx('SQL táblákból vizuális kapcsolati ábrát rajzol, valamint átnézi a Docker fájlt tipikus hibák után.')}
            />
          </h3>
          <textarea
            rows={3}
            value={sqlIn}
            onChange={(e) => setSqlIn(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v3/sql-er', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sql: sqlIn }),
                });
                if (r.ok) {
                  const d = await r.json();
                  setSqlMermaid(d.mermaid);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('ER Diagram Generálás')}
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v3/dockerfile-audit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ content: dockerText }),
                });
                if (r.ok) setDockerOut(await r.json());
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('Dockerfile Audit')}
            </button>
          </div>
          {sqlMermaid && <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono max-h-28 overflow-auto">{sqlMermaid}</pre>}
          <textarea
            rows={2}
            value={dockerText}
            onChange={(e) => setDockerText(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          {dockerOut && (
            <div className="text-xs space-y-1">
              <div className="font-mono font-semibold">{tx('Dockerfile Pontszám: {0}/100', dockerOut.score)}</div>
              {dockerOut.findings.map((f, i) => (
                <div key={i} className="text-[11px] text-slate-600 dark:text-slate-400">
                  • [{f.severity}] {f.issue} → {f.fix}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>{tx('Oldal SEO Ellenőrző & Változásnapló')}</span>
            <InfoHint
              label={tx('SEO ellenőrző és napló')}
              text={tx('Megvizsgálja egy weboldal keresőoptimalizálási beállításait és letölti a projekt friss változásnaplóját.')}
            />
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <input
              type="text"
              value={seoUrl}
              onChange={(e) => setSeoUrl(e.target.value)}
              className="flex-1 min-w-[180px] px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v3/ui-seo-audit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: seoUrl }),
                });
                if (r.ok) setSeoOut(await r.json());
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('UI/SEO Audit')}
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v3/changelog');
                if (r.ok) {
                  const d = await r.json();
                  setChangelog(d.markdown);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
            >
              {tx('Changelog')}
            </button>
            <a
              href="/api/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3 w-3" />
              OpenAPI 3.1
            </a>
          </div>
          {seoOut && (
            <div className="text-xs font-mono space-y-1">
              <div>{tx('SEO Pont: {0}/100', seoOut.seoScore)} · H1: {seoOut.h1Count} · {seoOut.title}</div>
              {seoOut.warnings.map((w, i) => (
                <div key={i} className="text-amber-700 dark:text-amber-400">• {w}</div>
              ))}
            </div>
          )}
          {changelog && (
            <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono max-h-32 overflow-auto">
              {changelog}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
