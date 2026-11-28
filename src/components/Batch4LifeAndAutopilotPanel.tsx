import React, { useState } from 'react';
import {
  Award,
  ChefHat,
  Compass,
  Download,
  FileWarning,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import type { NovaSwarmState } from '../../shared/types';
import { InfoHint } from './InfoHint';
import { useLocale } from '../locales/translations';

interface Props {
  state: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

export const Batch4LifeAndAutopilotPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  const { tx } = useLocale();

  // Omnisearch (Ú259)
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<Array<{ source: string; title: string; snippet: string }>>([]);

  // Document Safe (Ú209)
  const [docTitle, setDocTitle] = useState('');
  const [docCat, setDocCat] = useState<'warranty' | 'contract' | 'identity' | 'insurance' | 'other'>('warranty');
  const [docExp, setDocExp] = useState('2027-06-01');

  // Price Watch (Ú210)
  const [pwName, setPwName] = useState('');
  const [pwUrl, setPwUrl] = useState('');
  const [pwTarget, setPwTarget] = useState('25000');

  // Pantry Recipes (Ú212)
  const [recipes, setRecipes] = useState<
    Array<{ name: string; matchPercent: number; missingIngredients: string[]; calories: number; minutes: number }>
  >([]);

  // OKR Life Compass (Ú254)
  const [okrTitle, setOkrTitle] = useState('');
  const [okrQuarter, setOkrQuarter] = useState('2026-Q4');
  const [okrMiles, setOkrMiles] = useState(() => tx('Rendszer finomhangolás, Automatikus backup teszt'));

  const xp = state.userXp || { xp: 0, level: 1, streakDays: 0, badges: [] };

  const docCatLabel = (cat: string) => {
    if (cat === 'warranty') return tx('Garancia');
    if (cat === 'contract') return tx('Szerződés');
    if (cat === 'identity') return tx('Okmány');
    if (cat === 'insurance') return tx('Biztosítás');
    return tx('Egyéb');
  };

  return (
    <div className="space-y-6">
      {/* Autopilot 24/7 + RPG XP Banner */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>{tx('Önálló Állapot, Szint & Mentési Csomag')}</span>
              <InfoHint
                label={tx('Önálló állapot és szint')}
                text={tx('Itt látod a gyűjtött pontjaidat, és egy kattintással letöltheted a teljes mentési csomagot másik gépre költözéshez.')}
              />
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {tx('Autonóm Mód')}: <b>{state.settings.fullAutonomousMode ? tx('100% AKTÍV') : tx('Kikérdezős')}</b> ·{' '}
              {tx('Szint')}: <b>{xp.level}</b> ({xp.xp} XP) · {tx('Széria')}: <b>{tx('{0} nap', xp.streakDays)}</b> ·{' '}
              {tx('Jelvények')}: {(xp.badges || []).join(', ')}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/v4/export/jsonl"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <Download className="h-3.5 w-3.5" />
              {tx('LoRA JSONL Export')}
            </a>
            <a
              href="/api/v4/export/migration-bundle"
              download="novaswarm-migration.json"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              <Award className="h-3.5 w-3.5" />
              {tx('Költöztető Csomag')}
            </a>
          </div>
        </div>
      </section>

      {/* Ú259: Global Omnisearch */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span>{tx('Mindenben Kereső (Memória, Feladatok, Névjegyek, Chat)')}</span>
          <InfoHint
            label={tx('Mindenben kereső')}
            text={tx('Egyetlen kulcsszóval átkutathatod az összes elmentett emléket, beszélgetést, teendőt és névjegyet.')}
          />
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={tx('Keresés bármiben...')}
            className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={async () => {
              const r = await fetch(`/api/v4/omnisearch?q=${encodeURIComponent(searchQ)}`);
              const d = (await r.json()) as { hits?: Array<{ source: string; title: string; snippet: string }> };
              setSearchHits(d.hits || []);
            }}
            className="px-4 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
          >
            {tx('Keresés')}
          </button>
        </div>
        {searchHits.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {searchHits.map((h, i) => (
              <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs">
                <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded me-2">
                  {h.source}
                </span>
                <b>{h.title}</b>: {h.snippet}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ú209: Warranty & Document Safe */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-amber-600" />
            <span>{tx('Garancia-, Szerződés- & Okmányszéf')}</span>
            <InfoHint
              label={tx('Okmányszéf')}
              text={tx('Felírhatod a garanciák, biztosítások és igazolványok lejáratát, hogy időben szóljon a megújításról.')}
            />
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder={tx('Pl. Műszaki vizsga')}
              className="col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <select
              aria-label={tx('Okmány kategória')}
              value={docCat}
              onChange={(e) => setDocCat(e.target.value as typeof docCat)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <option value="warranty">{tx('Garancia')}</option>
              <option value="contract">{tx('Szerződés')}</option>
              <option value="identity">{tx('Okmány')}</option>
              <option value="insurance">{tx('Biztosítás')}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={docExp}
              onChange={(e) => setDocExp(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                if (!docTitle.trim()) return;
                await fetch('/api/v4/documents', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: docTitle, category: docCat, expiresAt: docExp }),
                });
                setDocTitle('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              {tx('Mentés Széfbe')}
            </button>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {(state.documentSafe || []).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded">
                <span>
                  <b>{d.title}</b> ({docCatLabel(d.category)}) — {tx('Lejárat')}: <span className="font-mono">{d.expiresAt}</span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/v4/documents/${d.id}`, { method: 'DELETE' });
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

        {/* Ú210: Webshop Price Watch */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Tag className="h-4 w-4 text-emerald-600" />
            <span>{tx('Webshop Árfigyelő & Akcióvadász')}</span>
            <InfoHint
              label={tx('Webshop árfigyelő')}
              text={tx('Megadhatsz egy termék linket és egy célárat; gombnyomásra leellenőrzi, csökkent-e már az ár.')}
            />
          </h3>
          <input
            type="text"
            value={pwName}
            onChange={(e) => setPwName(e.target.value)}
            placeholder={tx('Termék neve')}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
          />
          <div className="flex gap-2">
            <input
              type="url"
              value={pwUrl}
              onChange={(e) => setPwUrl(e.target.value)}
              placeholder="https://example.com/product"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <input
              type="number"
              value={pwTarget}
              onChange={(e) => setPwTarget(e.target.value)}
              placeholder={tx('Célár')}
              className="w-24 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                if (!pwName.trim() || !pwUrl.trim()) return;
                await fetch('/api/v4/price-watches', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: pwName, url: pwUrl, targetPrice: Number(pwTarget) }),
                });
                setPwName('');
                setPwUrl('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              {tx('Figyel')}
            </button>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {(state.priceWatches || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded">
                <span>
                  <b>{p.name}</b> — {tx('Jelenlegi: {0} {1} (cél: {2})', p.lastPrice ?? '?', p.currency, p.targetPrice)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/v4/price-watches/${p.id}/check`, { method: 'POST' });
                      await onRefreshState();
                    }}
                    className="text-blue-700 dark:text-blue-400 underline"
                  >
                    {tx('Frissít')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/v4/price-watches/${p.id}`, { method: 'DELETE' });
                      await onRefreshState();
                    }}
                    className="text-red-600"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ú212: Pantry Recipes */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-orange-600" />
              <span>{tx('„Mi van a hűtőben?” Recept Párosító')}</span>
              <InfoHint
                label={tx('Recept párosító')}
                text={tx('A közös listáid és otthoni hozzávalóid alapján ajánl gyorsan elkészíthető ételeket.')}
              />
            </h3>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/v4/recipes/pantry');
                const d = (await r.json()) as { recipes?: typeof recipes };
                setRecipes(d.recipes || []);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
            >
              {tx('Receptek Keresése')}
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {recipes.map((rec, idx) => (
              <div key={idx} className="p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs">
                <div className="flex justify-between font-semibold">
                  <span>{rec.name}</span>
                  <span>{tx('{0}% egyezés · {1} kcal · {2}p', rec.matchPercent, rec.calories, rec.minutes)}</span>
                </div>
                {rec.missingIngredients.length > 0 && (
                  <div className="text-[11px] text-slate-500">{tx('Hiányzik: {0}', rec.missingIngredients.join(', '))}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Ú254: Life Compass OKR -> Kanban */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Compass className="h-4 w-4 text-indigo-600" />
            <span>{tx('Célkitűző → Automatikus Feladatkártyák')}</span>
            <InfoHint
              label={tx('Célkitűző')}
              text={tx('Egy nagyobb negyedéves célból automatikusan apró, követhető teendő kártyákat készít a táblára.')}
            />
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={okrTitle}
              onChange={(e) => setOkrTitle(e.target.value)}
              placeholder={tx('Fő cél (pl. Otthoni szerver 100% automatizálás)')}
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={okrQuarter}
              onChange={(e) => setOkrQuarter(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <input
            type="text"
            value={okrMiles}
            onChange={(e) => setOkrMiles(e.target.value)}
            placeholder={tx('Mérföldkövek vesszővel elválasztva')}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={async () => {
              if (!okrTitle.trim()) return;
              await fetch('/api/v4/okrs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: okrTitle,
                  quarter: okrQuarter,
                  milestones: okrMiles.split(',').map((s) => s.trim()).filter(Boolean),
                }),
              });
              setOkrTitle('');
              await onRefreshState();
            }}
            className="w-full px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg"
          >
            {tx('OKR Rögzítése & Kanban Generálás')}
          </button>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {(state.lifeGoals || []).map((g) => (
              <div key={g.id} className="text-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded flex justify-between">
                <span>[{g.quarter}] {g.title}</span>
                <span>{tx('{0} mérföldkő', g.milestones.length)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
