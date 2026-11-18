import React, { useEffect, useState } from 'react';
import { Moon, Plus, Search } from 'lucide-react';
import type {
  DreamJournalEntry,
  LanguageCode,
  MemoryEntry,
  Settings,
} from '../../shared/types';
import { tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  memories: MemoryEntry[];
  dreamJournal: DreamJournalEntry[];
  settings: Settings;
  onRefreshState: () => Promise<void>;
}

export const MemoryDreamingView: React.FC<Props> = ({
  language,
  memories,
  dreamJournal,
  settings,
  onRefreshState,
}) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<MemoryEntry & { score?: number }> | null>(null);
  const [vaultNotes, setVaultNotes] = useState<Array<{ path: string; content: string }>>([]);
  const [newContent, setNewContent] = useState('');
  const [newEntity, setNewEntity] = useState('');
  const [newTags, setNewTags] = useState('memory, skill');
  const [dreamRunning, setDreamRunning] = useState(false);
  const [dreamMsg, setDreamMsg] = useState<string | null>(null);

  const loadVault = async () => {
    const res = await fetch('/api/memory/vault');
    if (res.ok) {
      const data = (await res.json()) as { notes: Array<{ path: string; content: string }> };
      setVaultNotes(data.notes || []);
    }
  };

  useEffect(() => {
    void loadVault();
  }, [memories.length]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = (await res.json()) as { results: Array<MemoryEntry & { score: number }> };
    setSearchResults(data.results || []);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    await fetch('/api/memory/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newContent.trim(),
        entity: newEntity.trim() || 'Tudásbázis',
        tags: newTags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
      }),
    });
    setNewContent('');
    setNewEntity('');
    await onRefreshState();
    await loadVault();
  };

  const handleRunDream = async () => {
    setDreamRunning(true);
    setDreamMsg(null);
    try {
      const res = await fetch('/api/dreaming/run', { method: 'POST' });
      const data = (await res.json()) as { executed: boolean; skippedReason?: string; lightCount: number; deepPromotedCount: number };
      setDreamMsg(
        data.executed
          ? `Álmodás kész: Light=${data.lightCount}, Deep tartósítva=${data.deepPromotedCount}`
          : `Kihagyva: ${data.skippedReason}`
      );
      await onRefreshState();
      await loadVault();
    } finally {
      setDreamRunning(false);
    }
  };

  const spendPercent = Math.min(
    100,
    Math.round((settings.dailySpendUsd / Math.max(0.01, settings.dailyCostLimitUsd)) * 100)
  );
  const displayedMemories = searchResults ?? memories;

  return (
    <div className="space-y-6">
      {/* Top Row: Global Daily Spend & Dreaming Trigger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {tr(language, 'dailyBudget')}
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              ${settings.dailySpendUsd.toFixed(4)} / ${settings.dailyCostLimitUsd.toFixed(2)} USD ({spendPercent}%)
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                spendPercent >= 90 ? 'bg-red-600' : spendPercent >= 70 ? 'bg-amber-500' : 'bg-slate-900'
              }`}
              style={{ width: `${spendPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Minden AI API hívásra (nappali és álmodási fázisokra is) érvényes közös napi keret. 85% felett automatikus Ollama átállás.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Álmodási Ciklus (Light · Deep · REM)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatikus indulás {settings.dreamingIdleMinutes} perc inaktivitás után · Hőkorlát: {settings.thermalThrottleCelsius}°C
              </p>
            </div>
            <button
              type="button"
              disabled={dreamRunning}
              onClick={handleRunDream}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Moon className="h-3.5 w-3.5" />
              {tr(language, 'runDreaming')}
            </button>
          </div>
          {dreamMsg && <div className="text-xs text-slate-700 font-mono">{dreamMsg}</div>}
        </div>
      </div>

      {/* Middle: Vector Search & Add Memory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szemantikus vektoros keresés a memóriában..."
              aria-label="Search memories"
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Search className="h-4 w-4" />
              Keresés
            </button>
            {searchResults && (
              <button
                type="button"
                onClick={() => {
                  setSearchResults(null);
                  setQuery('');
                }}
                className="px-3 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg"
              >
                Mind
              </button>
            )}
          </form>

          <div className="space-y-3 max-h-[340px] overflow-y-auto">
            {displayedMemories.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Még nincs rögzített tartós memória.</p>
            ) : (
              displayedMemories.map((m) => (
                <div key={m.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">
                      {m.entity} · {m.tags.map((t) => `#${t}`).join(' ')}
                    </span>
                    <span className="font-mono tabular-nums">
                      {'score' in m && m.score !== undefined ? `sim=${m.score}` : m.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800">{m.content}</p>
                  {m.obsidianPath && (
                    <div className="text-[11px] font-mono text-slate-500">{m.obsidianPath}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleAddMemory} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit">
          <h3 className="text-base font-semibold text-slate-900">Új Tartós Memória & Obsidian Jegyzet</h3>
          <input
            type="text"
            value={newEntity}
            onChange={(e) => setNewEntity(e.target.value)}
            placeholder="Entitás / Téma (pl. Hálózati Architektúra)"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Címkék vesszővel (memory, skill, error)"
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
          <textarea
            rows={4}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Tudáselem tartalma..."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Rögzítés Vektor DB-be & Obsidianba
          </button>
        </form>
      </div>

      {/* Bottom: Dream Journal & Obsidian Vault Files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">REM Álomnapló (emberi összefoglaló)</h3>
          {dreamJournal.length === 0 ? (
            <p className="text-xs text-slate-500">Még nem futott le álmodási ciklus.</p>
          ) : (
            <div className="space-y-3 max-h-[260px] overflow-y-auto">
              {dreamJournal.map((j) => (
                <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    {new Date(j.timestamp).toLocaleString()} · Light: {j.phaseSummary.lightCandidates} · Deep: {j.phaseSummary.deepPromoted}
                    {j.usedLocalOllama ? ' · Ollama' : ''}
                  </div>
                  <p className="text-sm text-slate-800">{j.narrative}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Obsidian Markdown Vault (memory-vault/)</h3>
          {vaultNotes.length === 0 ? (
            <p className="text-xs text-slate-500">Még nincs Markdown fájl a memory-vault mappában.</p>
          ) : (
            <div className="space-y-3 max-h-[260px] overflow-y-auto">
              {vaultNotes.map((n) => (
                <div key={n.path} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="text-xs font-mono font-semibold text-slate-700">{n.path}</div>
                  <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap">{n.content}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
