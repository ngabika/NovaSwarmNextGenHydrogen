import React, { useState } from 'react';
import {
  BookMarked,
  Coins,
  GraduationCap,
  Home,
  Package,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import type { NovaSwarmState } from '../../shared/types';
import { InfoHint } from './InfoHint';

export const Batch3LifePortalPanel: React.FC<{
  state: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}> = ({ state, onRefreshState }) => {
  const [crmName, setCrmName] = useState('');
  const [crmRel, setCrmRel] = useState('Partner');
  const [crmEmail, setCrmEmail] = useState('');

  const [pkgTitle, setPkgTitle] = useState('');
  const [pkgTrack, setPkgTrack] = useState('');
  const [pkgCarrier, setPkgCarrier] = useState('Foxpost');

  const [shareTitle, setShareTitle] = useState('Nyilvános Lista');
  const [shareType, setShareType] = useState<'list' | 'report' | 'artifact'>('list');

  const [paperQuery, setPaperQuery] = useState('autonomous multi-agent systems');
  const [papers, setPapers] = useState<Array<{ title: string; authors: string; year: string; url: string }>>([]);

  const [bmUrl, setBmUrl] = useState('');
  const [mealDay, setMealDay] = useState('Hétfő');
  const [mealName, setMealName] = useState('Tejszínes csirkés tészta');
  const [mealIng, setMealIng] = useState('csirkemell, tejszín, tészta, fokhagyma');
  const [mealMsg, setMealMsg] = useState<string | null>(null);

  const [fxAmount, setFxAmount] = useState(100);
  const [fxFrom, setFxFrom] = useState('EUR');
  const [fxTo, setFxTo] = useState('HUF');
  const [fxResult, setFxResult] = useState<string | null>(null);

  const [vatNet, setVatNet] = useState(100000);
  const [calcOut, setCalcOut] = useState<{ vat: { gross: number; vatAmount: number }; compound: { futureValue: number } } | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>Személyes Névjegyzék &amp; Kapcsolatok</span>
          <InfoHint
            label="Személyes névjegyzék"
            text="Egyszerű kapcsolatlista partnerekről, barátokról és ismerősökről gyors elérhetőségekkel."
          />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <input type="text" value={crmName} onChange={(e) => setCrmName(e.target.value)} placeholder="Név..." className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={crmRel} onChange={(e) => setCrmRel(e.target.value)} placeholder="Kapcsolat..." className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="email" value={crmEmail} onChange={(e) => setCrmEmail(e.target.value)} placeholder="Email..." className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!crmName.trim()) return;
            await fetch('/api/v3/crm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: crmName, relation: crmRel, email: crmEmail }),
            });
            setCrmName('');
            setCrmEmail('');
            await onRefreshState();
          }}
          className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
        >
          Névjegy Mentése
        </button>
        <div className="space-y-1 max-h-32 overflow-y-auto text-xs">
          {(state.crmContacts || []).map((c) => (
            <div key={c.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
              <span><strong>{c.name}</strong> ({c.relation}) {c.email ? `· ${c.email}` : ''}</span>
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/v3/crm/${c.id}`, { method: 'DELETE' });
                  await onRefreshState();
                }}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Package className="h-4 w-4" />
          <span>Csomagkövetés &amp; Megosztó Linkek</span>
          <InfoHint
            label="Csomagkövetés és megosztás"
            text="Nyomon követheted a várt csomagok kódját, és ideiglenes megosztó linket adhatsz listákhoz vagy riportokhoz."
          />
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <input type="text" value={pkgTitle} onChange={(e) => setPkgTitle(e.target.value)} placeholder="Csomag leírás..." className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={pkgTrack} onChange={(e) => setPkgTrack(e.target.value)} placeholder="Követési kód..." className="w-32 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <button
            type="button"
            onClick={async () => {
              if (!pkgTitle.trim()) return;
              await fetch('/api/v3/packages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: pkgTitle, trackingNumber: pkgTrack || 'N/A', carrier: pkgCarrier }),
              });
              setPkgTitle('');
              setPkgTrack('');
              await onRefreshState();
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            Csomag Felvétele
          </button>
        </div>
        <div className="space-y-1 max-h-24 overflow-y-auto text-xs font-mono">
          {(state.packages || []).map((p) => (
            <div key={p.id} className="flex justify-between p-1.5 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
              <span>{p.title} ({p.carrier}: {p.trackingNumber})</span>
              <span>{p.status}</span>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex flex-wrap gap-2">
            <input type="text" value={shareTitle} onChange={(e) => setShareTitle(e.target.value)} className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
            <select value={shareType} onChange={(e) => setShareType(e.target.value as 'list' | 'report' | 'artifact')} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800">
              <option value="list">Közös Lista</option>
              <option value="report">Riport</option>
              <option value="artifact">Artifact</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/v3/share-links', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: shareTitle, resourceType: shareType, resourceId: 'default', ttlHours: 72 }),
                });
                await onRefreshState();
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              <Share2 className="h-3.5 w-3.5" />
              Portál Link
            </button>
          </div>
          {(state.sharedLinks || []).slice(0, 3).map((l) => (
            <div key={l.id} className="font-mono text-[11px] flex justify-between">
              <a href={`/share/${l.token}`} target="_blank" rel="noreferrer" className="underline text-indigo-700 dark:text-indigo-400">
                /share/{l.token}
              </a>
              <span>{l.views} megtekintés</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Home className="h-4 w-4" />
          <span>Heti Étrend &amp; Bevásárlólista Szinkron</span>
          <InfoHint
            label="Heti étrend"
            text="Ha megadsz egy receptet és a hozzávalóit, a hiányzó tételeket automatikusan felveszi a közös bevásárlólistára."
          />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <input type="text" value={mealDay} onChange={(e) => setMealDay(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={mealName} onChange={(e) => setMealName(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
        </div>
        <input
          type="text"
          value={mealIng}
          onChange={(e) => setMealIng(e.target.value)}
          placeholder="Hozzávalók vesszővel..."
          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded bg-transparent"
        />
        <button
          type="button"
          onClick={async () => {
            const r = await fetch('/api/v3/home/meals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                day: mealDay,
                mealName,
                ingredients: mealIng.split(',').map((s) => s.trim()).filter(Boolean),
              }),
            });
            const d = await r.json();
            setMealMsg(`Étrend rögzítve — ${d.addedItems} hiányzó hozzávaló hozzáadva a /lista bevásárlólistához.`);
            await onRefreshState();
          }}
          className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
        >
          Étrend Mentése & Bevásárlólista Frissítés
        </button>
        {mealMsg && <div className="text-xs text-emerald-700 dark:text-emerald-400">{mealMsg}</div>}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <BookMarked className="h-3.5 w-3.5" />
            Read-It-Later Offline Archívum ({(state.bookmarks || []).length})
          </div>
          <div className="flex gap-2">
            <input type="url" value={bmUrl} onChange={(e) => setBmUrl(e.target.value)} placeholder="https://..." className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
            <button
              type="button"
              onClick={async () => {
                if (!bmUrl.trim()) return;
                await fetch('/api/v3/bookmarks', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: bmUrl }),
                });
                setBmUrl('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              Archiválás
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Coins className="h-4 w-4" />
          <span>Devizaváltó, ÁFA Kalkulátor &amp; Szakirodalom</span>
          <InfoHint
            label="Pénzügyi kalkulátorok"
            text="Gyorsan átváltja a valutákat (EKB árfolyammal), kiszámolja a 27%-os ÁFÁ-t és tudományos cikkeket keres."
          />
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <input type="number" value={fxAmount} onChange={(e) => setFxAmount(Number(e.target.value))} className="w-24 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={fxFrom} onChange={(e) => setFxFrom(e.target.value)} className="w-16 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <input type="text" value={fxTo} onChange={(e) => setFxTo(e.target.value)} className="w-16 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/finance/fx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: fxAmount, from: fxFrom, to: fxTo }),
              });
              const d = await r.json();
              setFxResult(`${d.amount} ${d.from} = ${d.converted} ${d.to} (árfolyam: ${d.rate}, forrás: ${d.source})`);
            }}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
          >
            Átváltás
          </button>
          <input type="number" value={vatNet} onChange={(e) => setVatNet(Number(e.target.value))} className="w-24 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch('/api/v3/finance/calc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ netAmount: vatNet, vatRatePercent: 27 }),
              });
              if (r.ok) setCalcOut(await r.json());
            }}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            ÁFA 27% + Hozam
          </button>
        </div>
        {fxResult && <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{fxResult}</div>}
        {calcOut && (
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
            Bruttó (27% ÁFA): {calcOut.vat.gross} · 36 hó kamatos megtakarítás: {calcOut.compound.futureValue}
          </div>
        )}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex gap-2">
            <input type="text" value={paperQuery} onChange={(e) => setPaperQuery(e.target.value)} className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent" />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v3/academic-search', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: paperQuery }),
                });
                const d = await r.json();
                setPapers(d.papers || []);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              CrossRef Kereső
            </button>
          </div>
          {papers.slice(0, 3).map((p, i) => (
            <div key={i} className="text-[11px] truncate">
              <a href={p.url} target="_blank" rel="noreferrer" className="underline text-indigo-700 dark:text-indigo-400">
                [{p.year}] {p.title}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
