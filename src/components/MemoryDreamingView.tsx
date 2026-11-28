import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  GitFork,
  Layers,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  DreamJournalEntry,
  DreamSkillDraft,
  LanguageCode,
  MemoryEntry,
  MemoryTier,
  ReflexionSuggestion,
  Settings,
} from '../../shared/types';
import { useLocale } from '../locales/translations';

interface Props {
  language?: LanguageCode;
  memories: MemoryEntry[];
  dreamJournal: DreamJournalEntry[];
  dreamSkillDrafts: DreamSkillDraft[];
  reflexionSuggestions: ReflexionSuggestion[];
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

interface RagDoc {
  name: string;
  sizeBytes: number;
  updatedAt: string;
}

interface OfflineStats {
  ragDocsCount: number;
  memoryCount: number;
  vaultFilesCount: number;
}

interface OfflineSearchResult {
  memoryHits: Array<{ entity: string; content: string; score: number }>;
  localDocHits: Array<{ file: string; excerpt: string }>;
  manPageExcerpt: string | null;
}

export const MemoryDreamingView: React.FC<Props> = ({
  memories,
  dreamJournal,
  dreamSkillDrafts,
  reflexionSuggestions,
  settings,
  onRefreshState,
}) => {
  const { t, tx, intlLocale } = useLocale();
  const [subTab, setSubTab] = useState<'memory' | 'evolution' | 'rag' | 'wiki'>('memory');
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

  // RAG & Offline Survival Pack
  const [ragDocs, setRagDocs] = useState<RagDoc[]>([]);
  const [ragStatus, setRagStatus] = useState<string | null>(null);
  const [offlineQuery, setOfflineQuery] = useState('');
  const [offlineStats, setOfflineStats] = useState<OfflineStats | null>(null);
  const [offlineResult, setOfflineResult] = useState<OfflineSearchResult | null>(null);

  // Graph pan/zoom & filter (M44)
  const [graphFilter, setGraphFilter] = useState('');
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphPanX, setGraphPanX] = useState(0);

  // Wiki Editor, Search, Backlinks & Daily Note (M47)
  const [wikiSelectedPath, setWikiSelectedPath] = useState('');
  const [wikiDraftPath, setWikiDraftPath] = useState('');
  const [wikiDraftContent, setWikiDraftContent] = useState('');
  const [wikiMsg, setWikiMsg] = useState<string | null>(null);
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiHits, setWikiHits] = useState<Array<{ path: string; line: number; excerpt: string }>>([]);
  const [wikiBacklinks, setWikiBacklinks] = useState<string[]>([]);

  const loadVaultAndGraph = async () => {
    try {
      const [vaultRes, graphRes, ragRes, offRes] = await Promise.all([
        fetch('/api/memory/vault'),
        fetch('/api/memory/graph'),
        fetch('/api/rag/documents'),
        fetch('/api/offline/search'),
      ]);
      if (vaultRes.ok) {
        const data = (await vaultRes.json()) as { notes: Array<{ path: string; content: string }> };
        setVaultNotes(data.notes || []);
        if (!wikiSelectedPath && data.notes?.length) {
          setWikiSelectedPath(data.notes[0].path);
          setWikiDraftPath(data.notes[0].path);
          setWikiDraftContent(data.notes[0].content);
        }
      }
      if (graphRes.ok) {
        const g = (await graphRes.json()) as { nodes: GraphNode[]; edges: GraphEdge[] };
        setGraphData({ nodes: g.nodes || [], edges: g.edges || [] });
      }
      if (ragRes.ok) {
        const rd = (await ragRes.json()) as { documents?: RagDoc[] };
        setRagDocs(rd.documents || []);
      }
      if (offRes.ok) {
        const os = (await offRes.json()) as { stats?: OfflineStats };
        if (os.stats) setOfflineStats(os.stats);
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
        entity: newEntity.trim() || tx('Tudásbázis'),
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
          ? tx('Álmodás kész: Light={0}, Deep tartósítva={1}', data.lightCount, data.deepPromotedCount)
          : tx('Kihagyva: {0}', data.skippedReason || '')
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
        tx('Salience frissítve: {0} csökkent · Hot→Warm: {1} · Warm→Cold: {2}', data.decayed, data.warmedToWarm, data.cooledToCold)
      );
      await onRefreshState();
      await loadVaultAndGraph();
    }
  };

  const handleRagUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) return;
      const base64 = result.slice(commaIdx + 1);
      setRagStatus(tx('Indexelés: {0}...', file.name));
      const res = await fetch('/api/rag/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentBase64: base64 }),
      });
      const data = (await res.json()) as { chunksCreated?: number; error?: string };
      setRagStatus(
        res.ok
          ? tx('Sikeresen indexelve: {0} ({1} vektoros darab)', file.name, data.chunksCreated ?? 0)
          : data.error || tx('RAG indexelési hiba')
      );
      await onRefreshState();
      await loadVaultAndGraph();
    };
    reader.readAsDataURL(file);
  };

  const handleOfflineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/offline/search?q=${encodeURIComponent(offlineQuery.trim())}`);
    if (res.ok) {
      const data = (await res.json()) as {
        stats?: OfflineStats;
        memoryHits?: OfflineSearchResult['memoryHits'];
        localDocHits?: OfflineSearchResult['localDocHits'];
        manPageExcerpt?: string | null;
      };
      if (data.stats) setOfflineStats(data.stats);
      setOfflineResult({
        memoryHits: data.memoryHits || [],
        localDocHits: data.localDocHits || [],
        manPageExcerpt: data.manPageExcerpt || null,
      });
    }
  };

  const handleSaveWiki = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wikiDraftPath.trim()) return;
    const res = await fetch('/api/memory/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: wikiDraftPath.trim(), content: wikiDraftContent }),
    });
    if (res.ok) {
      setWikiMsg(`${tx('Fájl elmentve.')} (${wikiDraftPath.trim()})`);
      setWikiSelectedPath(wikiDraftPath.trim());
      await loadVaultAndGraph();
    }
  };

  const handleDeleteWiki = async (relPath: string) => {
    await fetch(`/api/memory/wiki?path=${encodeURIComponent(relPath)}`, { method: 'DELETE' });
    setWikiMsg(`${tx('Törlés')}: ${relPath}`);
    setWikiSelectedPath('');
    setWikiDraftPath('');
    setWikiDraftContent('');
    setWikiBacklinks([]);
    await loadVaultAndGraph();
  };

  const handleLoadBacklinks = async (relPath: string) => {
    const r = await fetch(`/api/memory/wiki/backlinks?path=${encodeURIComponent(relPath)}`);
    if (r.ok) {
      const d = (await r.json()) as { backlinks?: string[] };
      setWikiBacklinks(d.backlinks || []);
    }
  };

  const handleWikiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wikiQuery.trim()) {
      setWikiHits([]);
      return;
    }
    const r = await fetch(`/api/memory/wiki/search?q=${encodeURIComponent(wikiQuery.trim())}`);
    if (r.ok) {
      const d = (await r.json()) as { hits?: Array<{ path: string; line: number; excerpt: string }> };
      setWikiHits(d.hits || []);
    }
  };

  const handleCreateDailyNote = async () => {
    const r = await fetch('/api/memory/wiki/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (r.ok) {
      const d = (await r.json()) as { note: { path: string; content: string } };
      setWikiSelectedPath(d.note.path);
      setWikiDraftPath(d.note.path);
      setWikiDraftContent(d.note.content);
      setWikiMsg(`${tx('Mai Napi Jegyzet')}: ${d.note.path}`);
      await handleLoadBacklinks(d.note.path);
      await loadVaultAndGraph();
    }
  };

  const handleRestoreMemory = async (id: string) => {
    await fetch(`/api/memories/${id}/restore`, { method: 'POST' });
    await onRefreshState();
    await loadVaultAndGraph();
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
    const f = graphFilter.trim().toLowerCase();
    const nodes = graphData.nodes
      .filter((n) => !f || n.label.toLowerCase().includes(f))
      .slice(0, 32);
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
  }, [graphData.nodes, graphFilter]);

  return (
    <div className="space-y-6">
      {/* Top Row: Global Daily Spend & Dreaming + Salience Decay */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {t('dailyBudget')}
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
            <span>{tx('85% felett automatikus Ollama átállás.')}</span>
            <span className="font-mono tabular-nums text-slate-700">
              Hot:{tierCounts.hot} · Warm:{tierCounts.warm} · Cold:{tierCounts.cold} · Shared:{tierCounts.shared}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {tx('Álmodási Ciklus (Light · Deep · REM) & Salience')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Idle: {settings.dreamingIdleMinutes} {tx('perc · Hőkorlát:')} {settings.thermalThrottleCelsius}°C
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunDecay}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {tx('Salience Decay')}
              </button>
              <button
                type="button"
                disabled={dreamRunning}
                onClick={handleRunDream}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Moon className="h-3.5 w-3.5" />
                {t('runDreaming')}
              </button>
            </div>
          </div>
          {dreamMsg && <div className="text-xs text-slate-700 font-mono">{dreamMsg}</div>}
          {decayMsg && <div className="text-xs text-slate-700 font-mono">{decayMsg}</div>}
        </div>
      </div>

      {/* Subtab Bar */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        {(
          [
            { id: 'memory', label: tx('Memória & Tudásgráf') },
            { id: 'evolution', label: tx('Álmodás, SkillDraft ({0}) & Reflexion ({1})', dreamSkillDrafts.length, reflexionSuggestions.length) },
            { id: 'rag', label: tx('Lokális RAG ({0}) & Offline Tudástár', ragDocs.length) },
            { id: 'wiki', label: tx('Obsidian Wiki ({0})', vaultNotes.length) },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subTab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {subTab === 'memory' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <Layers className="h-4 w-4 text-slate-500" />
                  {tx('Rétegzett Memória (RRF Hibrid Keresés)')}
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'hot', 'warm', 'cold', 'shared'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleTierSelect(tier)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border uppercase whitespace-nowrap shrink-0 ${
                        tierFilter === tier
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {tier === 'all' ? tx('Mind ({0})', memories.length) : tier}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={(e) => void handleSearch(e)} className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tx('Hibrid keresés (vektor + lexikális RRF + salience)...')}
                  aria-label={tx('Search memories')}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Search className="h-4 w-4" />
                  {tx('Keresés')}
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
                    {tx('Törlés')}
                  </button>
                )}
              </form>

              <div className="space-y-3 max-h-[340px] overflow-y-auto">
                {displayedMemories.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">{tx('Még nincs rögzített tartós memória ebben a rétegben.')}</p>
                ) : (
                  displayedMemories.map((m) => {
                    const tier = m.tier ?? 'warm';
                    const salience = m.salience ?? m.importanceScore;
                    return (
                      <div key={m.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <div className="font-mono">
                            <span className="font-semibold uppercase text-slate-900">{tier}</span> ·{' '}
                            <span className="font-semibold text-slate-800">{m.entity}</span> ·{' '}
                            <span>{(m.tags || []).map((tag) => `#${tag}`).join(' ')}</span>
                          </div>
                          <span className="font-mono tabular-nums">
                            sal={salience.toFixed(2)}
                            {'score' in m && m.score !== undefined ? ` · rrf=${m.score}` : ` · ${m.createdAt.slice(0, 10)}`}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.content}</p>
                        {m.relations && m.relations.length > 0 && (
                          <div className="text-[11px] font-mono text-slate-600">
                            {tx('Kapcsolatok:')} {m.relations.map((r) => `${r.relation} -> ${r.target}`).join(' · ')}
                          </div>
                        )}
                        {m.supersededBy && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-amber-800">
                            <span>{tx('Felülírva újabb ténnyel:')} {m.supersededBy}</span>
                            <button
                              type="button"
                              onClick={() => void handleRestoreMemory(m.id)}
                              className="px-2 py-0.5 bg-white border border-amber-300 rounded text-amber-900 hover:bg-amber-50 whitespace-nowrap shrink-0"
                            >
                              {tx('Visszaállítás')}
                            </button>
                          </div>
                        )}
                        {m.supersedesId && (
                          <div className="text-[11px] font-mono text-emerald-800">
                            {tx('Frissíti a régebbi emléket:')} {m.supersedesId}
                          </div>
                        )}
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
              <h3 className="text-base font-semibold text-slate-900">{tx('Új Tartós Memória & Obsidian Jegyzet')}</h3>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newEntity}
                  onChange={(e) => setNewEntity(e.target.value)}
                  placeholder={tx('Entitás / Téma')}
                  className="col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value as MemoryTier)}
                  aria-label={tx('Memory tier')}
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
                placeholder={tx('Címkék vesszővel (memory, skill, error)')}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <textarea
                rows={4}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={tx('Tudáselem tartalma...')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                {tx('Rögzítés Vektor DB-be & Obsidianba')}
              </button>
            </form>
          </div>

          {/* Knowledge Graph Visualization */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <GitFork className="h-4 w-4 text-slate-600" />
                {tx('Interaktív Tudásgráf (Entitások · #Címkék · [[Wikilinkek]])')}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 tabular-nums">
                <input
                  type="text"
                  value={graphFilter}
                  onChange={(e) => setGraphFilter(e.target.value)}
                  placeholder={tx('Csomópont szűrő...')}
                  className="px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setGraphPanX((x) => x - 40)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setGraphPanX((x) => x + 40)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setGraphZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
                  className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setGraphZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))))}
                  className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50"
                >
                  +
                </button>
                <span>{graphData.nodes.length} {tx('csomópont ·')} {graphData.edges.length} {tx('él')}</span>
              </div>
            </div>

            {graphData.nodes.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                {tx('A tudásgráf automatikusan épül, amint memóriabejegyzések kerülnek a vektoros tárba.')}
              </p>
            ) : (
              <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                <svg
                  viewBox={`${graphPanX} 0 ${Math.round(graphLayout.width / graphZoom)} ${Math.round(graphLayout.height / graphZoom)}`}
                  className="w-full min-w-[560px] h-64"
                  role="img"
                  aria-label={tx('Knowledge graph visualization')}
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
        </>
      )}

      {subTab === 'evolution' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">{tx('REM Álomnapló')}</h3>
            {dreamJournal.length === 0 ? (
              <p className="text-xs text-slate-500">{tx('Még nem futott le álmodási ciklus.')}</p>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto">
                {dreamJournal.map((j) => (
                  <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      {new Date(j.timestamp).toLocaleString(intlLocale)} · Light:{j.phaseSummary.lightCandidates} · Deep:{j.phaseSummary.deepPromoted}
                    </div>
                    <p className="text-sm text-slate-800">{j.narrative}</p>
                    {j.morningDigest && (
                      <div className="p-2 bg-white border border-slate-200 rounded text-xs text-slate-700 whitespace-pre-wrap">
                        <span className="font-semibold text-slate-900">{tx('Reggeli Összefoglaló:')} </span>
                        {j.morningDigest}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-700" />
              {tx('Álmodásból Javasolt Skillek')}
            </h3>
            {dreamSkillDrafts.length === 0 ? (
              <p className="text-xs text-slate-500">{tx('Az álmodási ciklus ismétlődő témákból automatikusan Skill vázlatokat javasol.')}</p>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto">
                {dreamSkillDrafts.map((d) => (
                  <div key={d.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="font-semibold text-slate-900">{d.name}</div>
                    <div className="text-slate-600">{d.description}</div>
                    <pre className="p-2 bg-white border border-slate-200 rounded font-mono text-[11px] overflow-x-auto">
                      {d.suggestedCode}
                    </pre>
                    {d.testCode && (
                      <pre className="p-2 bg-emerald-50/50 border border-emerald-200 rounded font-mono text-[10px] overflow-x-auto text-slate-700">
                        {tx('// Egységteszt {0}', `\n${d.testCode}`)}
                      </pre>
                    )}
                    {d.testReport && (
                      <div className="font-mono text-[10px] text-slate-600 whitespace-pre-wrap">{d.testReport}</div>
                    )}
                    {d.promotedSkillId ? (
                      <div className="font-mono text-emerald-700">
                        {tx('Előléptetve (')}{d.promotedSkillId}) {d.testPassed === true ? tx('· Önteszt OK ✅') : ''}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/dreaming/drafts/${d.id}/promote`, { method: 'POST' });
                          await onRefreshState();
                        }}
                        className="px-3 py-1 bg-slate-900 text-white rounded font-medium"
                      >
                        {tx('1-Kattintásos Skill Aktiválás & Teszt')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">{tx('Reflexion Öntanuló Prompt Javaslatok')}</h3>
            {reflexionSuggestions.length === 0 ? (
              <p className="text-xs text-slate-500">{tx('Ha egy ágens ismétlődő hibát vagy eszközkudarcot vét, a Reflexion motor javaslatot készít.')}</p>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto">
                {reflexionSuggestions.map((r) => (
                  <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="font-semibold text-slate-900">
                      {r.agentName} · <span className="font-normal text-slate-600">{r.reason}</span>
                    </div>
                    <div className="p-2 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-700">
                      {r.proposedPrompt}
                    </div>
                    {r.applied ? (
                      <div className="font-mono text-emerald-700">{tx('Alkalmazva az ágens promptjára')}</div>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/reflexion/${r.id}/apply`, { method: 'POST' });
                          await onRefreshState();
                        }}
                        className="px-3 py-1 bg-slate-900 text-white rounded font-medium"
                      >
                        {tx('Javaslat Alkalmazása')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'rag' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-700" />
                {tx('Lokális Dokumentum RAG (.pdf, .md, .txt, .csv, .json)')}
              </h3>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer hover:bg-slate-800 whitespace-nowrap shrink-0">
                <Upload className="h-3.5 w-3.5" />
                {tx('Fájl Indexelése')}
                <input
                  type="file"
                  accept=".txt,.md,.pdf,.csv,.json,.log,.ts,.js"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleRagUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {ragStatus && <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs font-mono">{ragStatus}</div>}
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {ragDocs.length === 0 ? (
                <p className="text-xs text-slate-500">{tx('Nincs még feltöltött dokumentum a rag-docs/ mappában.')}</p>
              ) : (
                ragDocs.map((d) => (
                  <div key={d.name} className="p-3 bg-slate-50 border border-slate-200 rounded flex justify-between text-xs">
                    <span className="font-mono font-semibold text-slate-900">{d.name}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {(d.sizeBytes / 1024).toFixed(1)} KB · {new Date(d.updatedAt).toLocaleDateString(intlLocale)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-slate-700" />
                {tx('Offline Túlélő Tudáscsomag (Internet nélkül is elérhető)')}
              </h3>
              {offlineStats && (
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {offlineStats.ragDocsCount} {tx('doksi ·')} {offlineStats.memoryCount} {tx('memória ·')} {offlineStats.vaultFilesCount} wiki
                </span>
              )}
            </div>
            <form onSubmit={handleOfflineSearch} className="flex gap-2">
              <input
                type="text"
                value={offlineQuery}
                onChange={(e) => setOfflineQuery(e.target.value)}
                placeholder={tx('Pl. systemd, docker, ssh, raspberry, git, ufw...')}
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg">
                {tx('Keresés')}
              </button>
            </form>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {!offlineResult ? (
                <p className="text-xs text-slate-500">
                  {tx('Helyi keresés internet nélkül a tartós memóriákban, feltöltött RAG dokumentumokban, Obsidian jegyzetekben és a Linux man oldalakban.')}
                </p>
              ) : offlineResult.memoryHits.length === 0 &&
                offlineResult.localDocHits.length === 0 &&
                !offlineResult.manPageExcerpt ? (
                <p className="text-xs text-slate-500">{tx('Nincs találat erre a kifejezésre a helyi tudástárban.')}</p>
              ) : (
                <>
                  {offlineResult.memoryHits.map((m, idx) => (
                    <div key={`mem-${idx}`} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
                      <div className="font-semibold text-slate-900">
                        {tx('Memória:')} {m.entity} · <span className="font-mono text-slate-500">score={m.score}</span>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{m.content}</p>
                    </div>
                  ))}
                  {offlineResult.localDocHits.map((d, idx) => (
                    <div key={`doc-${idx}`} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
                      <div className="font-mono font-semibold text-slate-900">{d.file}</div>
                      <p className="text-slate-700 whitespace-pre-wrap">{d.excerpt}</p>
                    </div>
                  ))}
                  {offlineResult.manPageExcerpt && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
                      <div className="font-semibold text-slate-900">{tx('Linux man oldal kivonat')}</div>
                      <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                        {offlineResult.manPageExcerpt}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'wiki' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{tx('Markdown Jegyzetek')}</h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCreateDailyNote()}
                  className="px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  {tx('Mai Napi Jegyzet')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWikiSelectedPath('');
                    setWikiDraftPath(`jegyzet-${new Date().toISOString().slice(0, 10)}.md`);
                    setWikiDraftContent(`${tx('# Új Wiki Jegyzet')}\n\n`);
                    setWikiBacklinks([]);
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
                >
                  {tx('+ Új fájl')}
                </button>
              </div>
            </div>

            <form onSubmit={handleWikiSearch} className="flex gap-1.5">
              <input
                type="text"
                value={wikiQuery}
                onChange={(e) => setWikiQuery(e.target.value)}
                placeholder={tx('Keresés a jegyzetekben...')}
                className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded"
              />
              <button type="submit" className="px-2.5 py-1 text-xs bg-slate-900 text-white rounded">
                {tx('Keresés')}
              </button>
            </form>

            {wikiHits.length > 0 && (
              <div className="p-2 bg-slate-50 border border-slate-200 rounded space-y-1 max-h-36 overflow-y-auto text-[11px]">
                <div className="font-semibold text-slate-700 flex justify-between">
                  <span>{tx('Keresési találatok (')}{wikiHits.length})</span>
                  <button type="button" onClick={() => setWikiHits([])} className="text-slate-400">×</button>
                </div>
                {wikiHits.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const found = vaultNotes.find((vn) => vn.path === h.path);
                      if (found) {
                        setWikiSelectedPath(found.path);
                        setWikiDraftPath(found.path);
                        setWikiDraftContent(found.content);
                        void handleLoadBacklinks(found.path);
                      }
                    }}
                    className="w-full text-start p-1 hover:bg-white rounded"
                  >
                    <div className="font-mono font-semibold text-slate-900">{h.path}:{h.line}</div>
                    <div className="text-slate-600 truncate">{h.excerpt}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {vaultNotes.map((n) => (
                <div key={n.path} className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setWikiSelectedPath(n.path);
                      setWikiDraftPath(n.path);
                      setWikiDraftContent(n.content);
                      void handleLoadBacklinks(n.path);
                    }}
                    className={`flex-1 text-start px-2.5 py-1.5 rounded font-mono truncate ${
                      wikiSelectedPath === n.path ? 'bg-slate-900 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    {n.path}
                  </button>
                  <button
                    type="button"
                    aria-label={tx('Delete wiki {0}', n.path)}
                    onClick={() => void handleDeleteWiki(n.path)}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {wikiSelectedPath && (
              <div className="pt-2 border-t border-slate-100 text-xs">
                <div className="font-semibold text-slate-700 mb-1">
                  {tx('Hivatkozó Jegyzetek (Backlinks:')} {wikiBacklinks.length})
                </div>
                {wikiBacklinks.length === 0 ? (
                  <p className="text-[11px] text-slate-500">{tx('Nincs bejövő [[wikilink]] erre a jegyzetre.')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {wikiBacklinks.map((bl) => (
                      <button
                        key={bl}
                        type="button"
                        onClick={() => {
                          const found = vaultNotes.find((vn) => vn.path === bl);
                          if (found) {
                            setWikiSelectedPath(found.path);
                            setWikiDraftPath(found.path);
                            setWikiDraftContent(found.content);
                            void handleLoadBacklinks(found.path);
                          }
                        }}
                        className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 border border-slate-200 rounded hover:bg-slate-200"
                      >
                        {bl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSaveWiki} className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={wikiDraftPath}
                onChange={(e) => setWikiDraftPath(e.target.value)}
                placeholder={tx('fájlnév.md (a memory-vault/ alá)')}
                className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                <Save className="h-3.5 w-3.5" />
                {tx('Mentés Vaultba')}
              </button>
            </div>
            {wikiMsg && <div className="text-xs font-mono text-emerald-700">{wikiMsg}</div>}
            <textarea
              rows={15}
              value={wikiDraftContent}
              onChange={(e) => setWikiDraftContent(e.target.value)}
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg"
              placeholder={tx('# Markdown tartalom...')}
            />
          </form>
        </div>
      )}
    </div>
  );
};
