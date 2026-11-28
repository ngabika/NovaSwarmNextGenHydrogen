import React, { useState } from 'react';
import {
  BarChart3,
  Clipboard,
  FileCheck2,
  Palette,
  QrCode,
  Shield,
  Table2,
} from 'lucide-react';
import type { NovaSwarmState } from '../../shared/types';
import { useLocale } from '../locales/translations';
import { InfoHint } from './InfoHint';

export const Batch3DataCreativePanel: React.FC<{
  state: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}> = ({ state, onRefreshState }) => {
  const { tx } = useLocale();
  const [wrangleRaw, setWrangleRaw] = useState('nev,kategoria,osszeg\nSzerver,Infra,12000\nDomain,Infra,4500\nKávé,Étel,1800');
  const [wrangleFmt, setWrangleFmt] = useState<'csv' | 'json'>('csv');
  const [wrangleGroup, setWrangleGroup] = useState('kategoria');
  const [wrangleOut, setWrangleOut] = useState<string>('');

  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const chartTitle = tx('Havi Kiadás Eloszlás');
  const [chartSvg, setChartSvg] = useState<string>('');

  const [qrText, setQrText] = useState('https://github.com/ngabika/NovaSwarmNextGenHydrogen');
  const [qrSvg, setQrSvg] = useState<string>('');

  const [txMode, setTxMode] = useState<'json_pretty' | 'json_minify' | 'sql_format' | 'base64_encode' | 'base64_decode' | 'jwt_decode' | 'sha256'>('json_pretty');
  const [txInput, setTxInput] = useState('{"nev":"NovaSwarm","autonom":true,"biztonsag":"minimal"}');
  const [txOutput, setTxOutput] = useState('');

  const [fgHex, setFgHex] = useState('#0f172a');
  const [bgHex, setBgHex] = useState('#f8fafc');
  const [wcag, setWcag] = useState<{ ratio: number; aaNormal: boolean; aaaNormal: boolean } | null>(null);

  const [notaryName, setNotaryName] = useState('szerzodes-v1.txt');
  const [notaryBody, setNotaryBody] = useState(() => tx('NovaSwarm hitelesitett dokumentum tartalom'));

  const [exifMsg, setExifMsg] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Table2 className="h-4 w-4" />
          <span>{tx('Táblázat Elemző & SVG Grafikon Rajzoló')}</span>
          <InfoHint
            label={tx('Táblázat elemző')}
            text={tx('CSV vagy JSON táblázatos adatokat csoportosít és készít belőlük tiszta oszlop-, vonal- vagy kördiagramot.')}
          />
        </h3>
        <textarea
          rows={3}
          value={wrangleRaw}
          onChange={(e) => setWrangleRaw(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={wrangleFmt}
            onChange={(e) => setWrangleFmt(e.target.value as 'csv' | 'json')}
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <input
            type="text"
            value={wrangleGroup}
            onChange={(e) => setWrangleGroup(e.target.value)}
            placeholder={tx('Csoportosítás oszlop')}
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/data-wrangle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: wrangleRaw, format: wrangleFmt, groupBy: wrangleGroup }),
              });
              if (r.ok) setWrangleOut(JSON.stringify(await r.json(), null, 2));
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('Elemzés')}
          </button>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
          >
            <option value="bar">{tx('Oszlop')}</option>
            <option value="line">{tx('Vonal')}</option>
            <option value="pie">{tx('Kör')}</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/chart-svg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: chartType, title: chartTitle, labels: ['Infra', 'Domain', 'AI'], values: [12000, 4500, 8200] }),
              });
              if (r.ok) {
                const d = await r.json();
                setChartSvg(d.svg);
              }
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {tx('SVG Grafikon')}
          </button>
        </div>
        {wrangleOut && <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono max-h-28 overflow-auto">{wrangleOut}</pre>}
        {chartSvg && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-white overflow-hidden">
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(chartSvg)}`}
              alt={chartTitle || tx('Grafikon')}
              className="w-full h-auto"
            />
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <QrCode className="h-4 w-4" />
          <span>{tx('Offline QR Kód Készítő & Kép-Metaadat Tisztító')}</span>
          <InfoHint
            label={tx('QR kód és metaadat tisztító')}
            text={tx('Bármilyen linkből helyben QR kódot csinál, a feltöltött fotókból pedig törli a rejtett GPS és kameraadatokat.')}
          />
        </h3>
        <div className="flex gap-2 text-xs">
          <input
            type="text"
            value={qrText}
            onChange={(e) => setQrText(e.target.value)}
            className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/qr-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: qrText, size: 180 }),
              });
              if (r.ok) {
                const d = await r.json();
                setQrSvg(d.svg);
              }
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('QR Generálás')}
          </button>
        </div>
        {qrSvg && (
          <div className="inline-block border border-slate-200 rounded p-2 bg-white">
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
              alt={tx('Generált QR kód')}
              className="w-[180px] h-[180px]"
            />
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <label className="block font-medium text-slate-700 dark:text-slate-300">
            {tx('JPEG / PNG rejtett helyadatok (EXIF & GPS) törlése:')}
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                const res = await fetch('/api/v3/exif-strip', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dataBase64: String(reader.result || '') }),
                });
                const d = await res.json();
                setExifMsg(
                  d.ok
                    ? tx('Tisztítva ({0}): {1} bájt metaadat eltávolítva ({2} -> {3} B).', d.format.toUpperCase(), d.removedBytes, d.originalBytes, d.strippedBytes)
                    : tx('Nem JPEG/PNG formátum.')
                );
              };
              reader.readAsDataURL(file);
            }}
            className="text-xs"
          />
          {exifMsg && <div className="font-mono text-emerald-700 dark:text-emerald-400">{exifMsg}</div>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Clipboard className="h-4 w-4" />
          <span>{tx('Szöveg, JSON, SQL & JWT Átalakító')}</span>
          <InfoHint
            label={tx('Szöveg átalakító')}
            text={tx('Egy kattintással szépen formázza a JSON/SQL szövegeket, dekódolja a tokeneket és elmenti a vágólap-előzménybe.')}
          />
        </h3>
        <textarea
          rows={3}
          value={txInput}
          onChange={(e) => setTxInput(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={txMode}
            onChange={(e) => setTxMode(e.target.value as typeof txMode)}
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
          >
            <option value="json_pretty">{tx('JSON Formázás')}</option>
            <option value="json_minify">{tx('JSON Tömörítés')}</option>
            <option value="sql_format">{tx('SQL Formázás')}</option>
            <option value="base64_encode">{tx('Base64 Kódolás')}</option>
            <option value="base64_decode">{tx('Base64 Dekódolás')}</option>
            <option value="jwt_decode">{tx('JWT Dekódolás')}</option>
            <option value="sha256">SHA-256 Hash</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/text-transform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: txMode, input: txInput, saveToClipboard: true }),
              });
              if (r.ok) {
                const d = await r.json();
                setTxOutput(d.output);
                await onRefreshState();
              }
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('Átalakítás & Mentés')}
          </button>
        </div>
        {txOutput && <pre className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono max-h-28 overflow-auto">{txOutput}</pre>}
        {(state.clipboardHistory || []).length > 0 && (
          <div className="text-[11px] text-slate-500">{tx('Mentett vágólap előzmények: {0} db', state.clipboardHistory.length)}</div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Palette className="h-4 w-4" />
          <span>{tx('Színkontraszt Ellenőrző & Digitális Hitelesítő')}</span>
          <InfoHint
            label={tx('Kontraszt és hitelesítő')}
            text={tx('Ellenőrzi, hogy két szín jól olvasható-e egymáson, alul pedig egyedi ujjlenyomatot (SHA-256) készít fontos szövegekről.')}
          />
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input type="color" value={fgHex} onChange={(e) => setFgHex(e.target.value)} aria-label={tx('Előtérszín')} />
          <input type="text" value={fgHex} onChange={(e) => setFgHex(e.target.value)} className="w-24 px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="color" value={bgHex} onChange={(e) => setBgHex(e.target.value)} aria-label={tx('Háttérszín')} />
          <input type="text" value={bgHex} onChange={(e) => setBgHex(e.target.value)} className="w-24 px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/wcag-contrast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fg: fgHex, bg: bgHex }),
              });
              if (r.ok) setWcag(await r.json());
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            {tx('WCAG Teszt')}
          </button>
        </div>
        {wcag && (
          <div className="text-xs font-mono">
            {tx('Arány: {0}:1', wcag.ratio)} · AA: {wcag.aaNormal ? tx('MEGFELEL') : tx('GYENGE')} · AAA: {wcag.aaaNormal ? tx('MEGFELEL') : tx('NEM')}
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <FileCheck2 className="h-3.5 w-3.5" />
            {tx('Dokumentum Ujjlenyomat Rögzítése')}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={notaryName}
              onChange={(e) => setNotaryName(e.target.value)}
              className="w-40 px-2 py-1 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <input
              type="text"
              value={notaryBody}
              onChange={(e) => setNotaryBody(e.target.value)}
              className="flex-1 px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v3/notary/stamp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filename: notaryName, content: notaryBody }),
                });
                await onRefreshState();
              }}
              className="inline-flex items-center gap-1 px-3 py-1 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              <Shield className="h-3 w-3" />
              {tx('Hitelesítés')}
            </button>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto font-mono text-[11px]">
            {(state.notaryRecords || []).slice(0, 4).map((n) => (
              <div key={n.id} className="truncate text-slate-600 dark:text-slate-400">
                {n.fileName} · SHA256: {n.sha256.slice(0, 24)}...
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
