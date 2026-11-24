import React, { useEffect, useMemo, useState } from 'react';
import { Command, Search, X } from 'lucide-react';
import type { Agent, KanbanCard, MemoryEntry, PromptTemplate } from '../../shared/types';

export interface CommandPaletteAction {
  id: string;
  group: string;
  label: string;
  hint?: string;
  onRun: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  templates: PromptTemplate[];
  memories?: MemoryEntry[];
  kanban?: KanbanCard[];
  onNavigate: (tab: string) => void;
  onApplyTemplate: (body: string) => void;
  onQuickAction: (actionId: string) => void;
}

export const CommandPalette: React.FC<Props> = ({
  open,
  onClose,
  agents,
  templates,
  memories = [],
  kanban = [],
  onNavigate,
  onApplyTemplate,
  onQuickAction,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const items = useMemo<CommandPaletteAction[]>(() => {
    const list: CommandPaletteAction[] = [
      { id: 'nav-overview', group: 'Navigáció', label: 'Áttekintő Főoldal', hint: 'Főoldal', onRun: () => onNavigate('overview') },
      { id: 'nav-swarm', group: 'Navigáció', label: 'Csapat Chat & Feladatok', hint: 'Chat', onRun: () => onNavigate('swarm') },
      { id: 'nav-workbench', group: 'Navigáció', label: 'Munkapad & Eszközök', hint: 'Munkapad', onRun: () => onNavigate('workbench') },
      { id: 'nav-agents', group: 'Navigáció', label: 'Ágensek & Csapat', hint: 'Csapat', onRun: () => onNavigate('agents') },
      { id: 'nav-memory', group: 'Navigáció', label: 'Memória & Jegyzetek', hint: 'Tudástár', onRun: () => onNavigate('memory') },
      { id: 'nav-models', group: 'Navigáció', label: 'AI Modellek & Költség', hint: 'Modellek', onRun: () => onNavigate('models') },
      { id: 'nav-mcp', group: 'Navigáció', label: 'Képességek & Csatornák', hint: 'Bővítmények', onRun: () => onNavigate('mcp') },
      { id: 'nav-eco', group: 'Navigáció', label: 'Életvitel & Automatizálás', hint: 'Mindennapok', onRun: () => onNavigate('ecosystem') },
      { id: 'nav-term', group: 'Navigáció', label: 'Linux Parancssor', hint: 'Parancssor', onRun: () => onNavigate('terminal') },
      { id: 'nav-sys', group: 'Navigáció', label: 'Rendszer & Költöztetés', hint: 'Rendszer', onRun: () => onNavigate('system') },
      { id: 'nav-set', group: 'Navigáció', label: 'Beállítások', hint: 'Beállítások', onRun: () => onNavigate('settings') },
      { id: 'act-dream', group: 'Gyorsművelet', label: 'Éjszakai összegző indítása most', hint: 'Memória', onRun: () => onQuickAction('run_dream') },
      { id: 'act-audit', group: 'Gyorsművelet', label: 'Rendszerfelügyelő gyors ellenőrzése', hint: 'Biztonság', onRun: () => onQuickAction('run_audit') },
      { id: 'act-doctor', group: 'Gyorsművelet', label: 'Rendszer Gyorsjavító futtatása', hint: 'Javítás', onRun: () => onQuickAction('run_doctor') },
      { id: 'act-ota', group: 'Gyorsművelet', label: 'Frissítések ellenőrzése (GitHub)', hint: 'Frissítés', onRun: () => onQuickAction('check_ota') },
      { id: 'act-backup', group: 'Gyorsművelet', label: 'Biztonsági mentés létrehozása most', hint: 'Mentés', onRun: () => onQuickAction('create_backup') },
      { id: 'act-warm', group: 'Gyorsművelet', label: 'Helyi Ollama modell előmelegítése', hint: 'Ollama', onRun: () => onQuickAction('warm_ollama') },
      { id: 'act-unload', group: 'Gyorsművelet', label: 'Ollama modell kiürítése memóriából', hint: 'Memória', onRun: () => onQuickAction('unload_ollama') },
    ];

    for (const ag of agents) {
      if (ag.isSupervisor) continue;
      list.push({
        id: `ag-${ag.id}`,
        group: 'Ágens megszólítása',
        label: `@${ag.name} — ${ag.role}`,
        hint: ag.providerId,
        onRun: () => {
          onNavigate('swarm');
          onApplyTemplate(`@${ag.name} `);
        },
      });
    }

    for (const tpl of templates) {
      list.push({
        id: `tpl-${tpl.id}`,
        group: 'Prompt sablon',
        label: `${tpl.command} — ${tpl.title}`,
        hint: tpl.category,
        onRun: () => {
          onNavigate('swarm');
          onApplyTemplate(tpl.body);
        },
      });
    }

    for (const card of kanban.filter((c) => !c.archived).slice(0, 15)) {
      list.push({
        id: `kb-${card.id}`,
        group: 'Kanban',
        label: card.title,
        hint: card.status,
        onRun: () => onNavigate('swarm'),
      });
    }

    for (const mem of memories.slice(-15)) {
      list.push({
        id: `mem-${mem.id}`,
        group: 'Memória',
        label: `${mem.entity}: ${mem.content.slice(0, 64)}`,
        hint: mem.tier ?? 'warm',
        onRun: () => onNavigate('memory'),
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q) ||
        (i.hint || '').toLowerCase().includes(q)
    );
  }, [query, agents, templates, memories, kanban, onNavigate, onApplyTemplate, onQuickAction]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault();
      items[selectedIndex].onRun();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Parancspaletta"
    >
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ugrás nézetre, /sablon, @ágens vagy gyorsművelet..."
            className="flex-1 text-sm text-slate-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Bezárás"
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">Nincs találat erre: &ldquo;{query}&rdquo;</div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onRun();
                  onClose();
                }}
                className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 text-xs transition-colors ${
                  idx === selectedIndex ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <span className={`font-mono mr-2 ${idx === selectedIndex ? 'text-slate-300' : 'text-slate-400'}`}>
                    {item.group}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.hint && (
                  <span className={`font-mono shrink-0 ${idx === selectedIndex ? 'text-slate-300' : 'text-slate-400'}`}>
                    {item.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Command className="h-3 w-3" /> Ctrl+K / Cmd+K
          </span>
          <span>↑↓ választás · Enter futtatás · Esc bezárás</span>
        </div>
      </div>
    </div>
  );
};
