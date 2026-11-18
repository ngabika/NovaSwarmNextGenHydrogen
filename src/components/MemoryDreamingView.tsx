import React, { useEffect, useMemo, useState } from 'react';
import { GitFork, Layers, Moon, Plus, RefreshCw, Search } from 'lucide-react';
import type {
  DreamJournalEntry,
  LanguageCode,
  MemoryEntry,
  MemoryTier,
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

interface GraphNode {
  id: string;
  label: string;
  kind: 'entity' | 'tag' | 'link';
  tier?: MemoryTier;
  weight: number;
}

interface GraphEdge {
  source: string;
  target: string;
  kind: 'tagged' | 'wikilink';
}

export const MemoryDreamingView: React.FC<Props> = ({
  language,
  memories,
  dreamJournal,
  settings,
  onRefreshState,
}) => {
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<MemoryTier | 'all'>('all');
  const [searchResults, setSearchResults] = useState<Array<MemoryEntry & { score?: number }> | null>(null);
  const [vaultNotes, setVaultNotes] = useState<Array<{ path: string; content: string }>>([]);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);
  const [newContent, setNewContent] = useState('');
  const [newEntity, setNewEntity] = useState('');
  const [newTags, setNewTags] = useState('memory, skill');
  const [newTier, setNewTier] = useState<MemoryTier>('hot');
  const [dreamRunning, setDreamRunning] = useState(false);
  const [dreamMsg, setDreamMsg] = useState<string | null>(null);
  const [decayMsg, setDecayMsg] = useState<string | null>(null);

  const loadVaultAndGraph = async () => {
    try {
      const [vaultRes, graphRes] = await Promise.all([
        fetch('/api/memory/vault'),
        fetch('/api/memory/graph'),
      ]);
      if (vaultRes.ok) {
        const data = (await vaultRes.json()) as { notes: Array<{ path: string; content: string }> };
        setVaultNotes(data.notes || []);
      }
      if (graphRes.ok) {
        const g = (await graphRes.json()) as { nodes: GraphNode[]; edges: GraphEdge[] };
        setGraphData({ nodes: g.nodes || [], edges: g.edges || [] });
      }
    } catch {
      // ignore transient network error
    }
  };

  useEffect(() => {
    void loadVaultAndGraph();
  }, [memories.length]);

  const handleSearch = async (e?: React.FormEvent, nextTier?: MemoryTier | 'all') => {
    if (e) e.preventDefault();
    const activeTier = nextTier ?? tierFilter;
    if (!query.trim() && activeTier === 'all') {
      setSearchResults(null);
      return;
    }
    const res = await fetch('/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), tier: activeTier }),
    });
    const data = (await res.json()) as { results: Array<MemoryEntry & { score: number }> };
    setSearchResults(data.results || []);
  };

  const handleTierSelect = (next: MemoryTier | 'all') => {
    setTierFilter(next);
    if (query.trim()) {
      void handleSearch(undefined, next);
    } else {
      setSearchResults(null);
    }
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
        tier: newTier,
        tags: newTags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
      }),
    });
    setNewContent('');
    setNewEntity('');
    await onRefreshState();
    await loadVaultAndGraph();
  };

  const handleRunDream = async () => {
    setDreamRunning(true);
    setDreamMsg(null);
    try {
      const res = await fetch('/api/dreaming/run', { method: 'POST' });
      const data = (await res.json()) as {
        executed: boolean;
        skippedReason?: string;
        lightCount: number;
        deepPromotedCount: number;
      };
      setDreamMsg(
        data.executed
          ? `Álmodás kész: Light=${data.lightCount}, Deep tartósítva=${data.deepPromotedCount}`
          : `Kihagyva: ${data.skippedReason}`
      );
      await onRefreshState();
      await loadVaultAndGraph();
    } finally {
      setDreamRunning(false);
    }
  };

  const handleRunDecay = async () => {
    setDecayMsg(null);
    const res = await fetch('/api/memory/decay', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as {
        decayed: number;
        warmedToWarm: number;
        cooledToCold: number;
      };
      setDecayMsg(
        `Salience frissítve: ${data.decayed} csökkent · Hot→Warm: ${data.warmedToWarm} · Warm→Cold: ${data.cooledToCold} (törlés nélkül)`
      );
      await onRefreshState();
      await loadVaultAndGraph();
    }
  };

  const spendPercent = Math.min(
    100,
    Math.round((settings.dailySpendUsd / Math.max(0.01, settings.dailyCostLimitUsd)) * 100)
  );

  const displayedMemories = useMemo(() => {
    if (searchResults !== null) return searchResults;
    if (tierFilter === 'all') return memories;
    return memories.filter((m) => (m.tier ?? 'warm') === tierFilter);
  }, [memories, searchResults, tierFilter]);

  const tierCounts = useMemo(() => {
    const counts: Record<MemoryTier, number> = { hot: 0, warm: 0, cold: 0, shared: 0 };
    for (const m of memories) {
      const t = m.tier ?? 'warm';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [memories]);

  const graphLayout = useMemo(() => {
    const width = 680;
    const height = 260;
    const nodes = graphData.nodes.slice(0, 32);
    const entities = nodes.filter((n) => n.kind === 'entity');
    const tags = nodes.filter((n) => n.kind === 'tag');
    const links = nodes.filter((n) => n.kind === 'link');

    const pos = new Map<string, { x: number; y: number; node: GraphNode }>();
    const placeColumn = (list: GraphNode[], x: number) => {
      const count = list.length;
      list.forEach((n, idx) => {
        const y = count === 1 ? height / 2 : 28 + (idx * (height - 56)) / Math.max(1, count - 1);
        pos.set(n.id, { x, y, node: n });
      });
    };

    placeColumn(entities, 130);
    placeColumn(tags, 355);
    placeColumn(links, 560);

    return { width, height, pos };
  }, [graphData.nodes]);

  return (
    <div className="space-y-6">
      {/* Top Row: Global Daily Spend & Dreaming + Salience Decay */}
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
          <div className="h-2.5 bg-slate-100 rounded overflow-hidden">
            <div
              className={`h-full transition-all ${
                spendPercent >= 90 ? 'bg-red-600' : spendPercent >= 70 ? 'bg-amber-500' : 'bg-slate-900'
              }`}
              style={{ width: `${spendPercent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Minden AI API hívásra érvényes közös napi keret. 85% felett automatikus Ollama átállás.
            </span>
            <span className="font-mono tabular-nums text-slate-700">
              Hot:{tierCounts.hot} · Warm:{tierCounts.warm} · Cold:{tierCounts.cold} · Shared:{tierCounts.shared}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Álmodási Ciklus (Light · Deep · REM) & Salience
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatikus indulás {settings.dreamingIdleMinutes} perc inaktivitás után · Hőkorlát: {settings.thermalThrottleCelsius}°C
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunDecay}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Salience Decay
              </button>
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
          </div>
          {dreamMsg && <div className="text-xs text-slate-700 font-mono">{dreamMsg}</div>}
          {decayMsg && <div className="text-xs text-slate-700 font-mono">{decayMsg}</div>}
        </div>
      </div>

      {/* Middle: Hybrid RRF Search, Tier Filters & Add Memory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Layers className="h-4 w-4 text-slate-500" />
              Rétegzett Memória (RRF Hibrid Keresés)
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'hot', 'warm', 'cold', 'shared'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => handleTierSelect(tier)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border uppercase ${
                    tierFilter === tier
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tier === 'all' ? `Mind (${memories.length})` : tier}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => void handleSearch(e)} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hibrid keresés (vektor + lexikális RRF + salience)..."
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
                Törlés
              </button>
            )}
          </form>

          <div className="space-y-3 max-h-[340px] overflow-y-auto">
            {displayedMemories.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Még nincs rögzített tartós memória ebben a rétegben.</p>
            ) : (
              displayedMemories.map((m) => {
                const tier = m.tier ?? 'warm';
                const salience = m.salience ?? m.importanceScore;
                const tierStyle =
                  tier === 'hot'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : tier === 'shared'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : tier === 'cold'
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-blue-50 text-blue-800 border-blue-200';
                return (
                  <div key={m.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase border rounded ${tierStyle}`}>
                          {tier}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {m.entity} · {m.tags.map((t) => `#${t}`).join(' ')}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums">
                        sal={salience.toFixed(2)}
                        {'score' in m && m.score !== undefined ? ` · rrf=${m.score}` : ` · ${m.createdAt.slice(0, 10)}`}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.content}</p>
                    {m.obsidianPath && (
                      <div className="text-[11px] font-mono text-slate-500">{m.obsidianPath}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <form onSubmit={handleAddMemory} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit">
          <h3 className="text-base font-semibold text-slate-900">Új Tartós Memória & Obsidian Jegyzet</h3>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={newEntity}
              onChange={(e) => setNewEntity(e.target.value)}
              placeholder="Entitás / Téma"
              className="col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value as MemoryTier)}
              aria-label="Memory tier"
              className="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white uppercase"
            >
              <option value="hot">HOT</option>
              <option value="warm">WARM</option>
              <option value="cold">COLD</option>
              <option value="shared">SHARED</option>
            </select>
          </div>
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

      {/* Knowledge Graph Visualization */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <GitFork className="h-4 w-4 text-slate-600" />
            Interaktív Tudásgráf (Entitások · #Címkék · [[Wikilinkek]])
          </h3>
          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500">
            <span>Entitás (bal)</span>
            <span>#Címke (közép)</span>
            <span>[[Hivatkozás]] (jobb)</span>
            <span className="tabular-nums">
              {graphData.nodes.length} csomópont · {graphData.edges.length} él
            </span>
          </div>
        </div>

        {graphData.nodes.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            A tudásgráf automatikusan épül, amint memóriabejegyzések kerülnek a vektoros tárba.
          </p>
        ) : (
          <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-x-auto">
            <svg
              viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
              className="w-full min-w-[560px] h-64"
              role="img"
              aria-label="Knowledge graph visualization"
            >
              {graphData.edges.map((edge, idx) => {
                const src = graphLayout.pos.get(edge.source);
                const dst = graphLayout.pos.get(edge.target);
                if (!src || !dst) return null;
                const active =
                  !selectedGraphNode ||
                  selectedGraphNode === edge.source ||
                  selectedGraphNode === edge.target;
                return (
                  <line
                    key={`${edge.source}-${edge.target}-${idx}`}
                    x1={src.x}
                    y1={src.y}
                    x2={dst.x}
                    y2={dst.y}
                    stroke={edge.kind === 'wikilink' ? '#0f172a' : '#94a3b8'}
                    strokeWidth={active ? 1.6 : 0.7}
                    strokeDasharray={edge.kind === 'wikilink' ? undefined : '4 3'}
                    opacity={active ? 0.75 : 0.2}
                  />
                );
              })}

              {Array.from(graphLayout.pos.values()).map(({ x, y, node }) => {
                const isSelected = selectedGraphNode === node.id;
                const fill =
                  node.kind === 'entity'
                    ? '#0f172a'
                    : node.kind === 'tag'
                    ? '#1e40af'
                    : '#047857';
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedGraphNode(isSelected ? null : node.id)}
                  >
                    <rect
                      x={x - 68}
                      y={y - 11}
                      width={136}
                      height={22}
                      rx={4}
                      fill={isSelected ? fill : '#ffffff'}
                      stroke={fill}
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    <text
                      x={x}
                      y={y + 3.5}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="monospace"
                      fill={isSelected ? '#ffffff' : '#0f172a'}
                    >
                      {node.label.slice(0, 18)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
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
