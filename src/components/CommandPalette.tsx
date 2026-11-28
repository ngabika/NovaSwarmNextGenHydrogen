import React, { useEffect, useMemo, useState } from 'react';
import { Command, Search, X } from 'lucide-react';
import type { Agent, KanbanCard, MemoryEntry, PromptTemplate } from '../../shared/types';
import { useLocale } from '../locales/translations';

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
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const items = useMemo<CommandPaletteAction[]>(() => {
    const navGroup = t('cmdGroupNav');
    const quickGroup = t('cmdGroupQuick');
    const list: CommandPaletteAction[] = [
      { id: 'nav-overview', group: navGroup, label: t('navOverview'), onRun: () => onNavigate('overview') },
      { id: 'nav-swarm', group: navGroup, label: t('navSwarm'), onRun: () => onNavigate('swarm') },
      { id: 'nav-workbench', group: navGroup, label: t('navWorkbench'), onRun: () => onNavigate('workbench') },
      { id: 'nav-agents', group: navGroup, label: t('navAgents'), onRun: () => onNavigate('agents') },
      { id: 'nav-memory', group: navGroup, label: t('navMemory'), onRun: () => onNavigate('memory') },
      { id: 'nav-models', group: navGroup, label: t('navModels'), onRun: () => onNavigate('models') },
      { id: 'nav-mcp', group: navGroup, label: t('navMcp'), onRun: () => onNavigate('mcp') },
      { id: 'nav-eco', group: navGroup, label: t('navEcosystem'), onRun: () => onNavigate('ecosystem') },
      { id: 'nav-term', group: navGroup, label: t('navTerminal'), onRun: () => onNavigate('terminal') },
      { id: 'nav-sys', group: navGroup, label: t('navSystem'), onRun: () => onNavigate('system') },
      { id: 'nav-autonomy', group: navGroup, label: t('navAutonomy'), onRun: () => onNavigate('autonomy') },
      { id: 'nav-set', group: navGroup, label: t('navSettings'), onRun: () => onNavigate('settings') },
      { id: 'act-dream', group: quickGroup, label: t('cmdActDream'), onRun: () => onQuickAction('run_dream') },
      { id: 'act-audit', group: quickGroup, label: t('cmdActAudit'), onRun: () => onQuickAction('run_audit') },
      { id: 'act-doctor', group: quickGroup, label: t('cmdActDoctor'), onRun: () => onQuickAction('run_doctor') },
      { id: 'act-ota', group: quickGroup, label: t('cmdActOta'), onRun: () => onQuickAction('check_ota') },
      { id: 'act-backup', group: quickGroup, label: t('cmdActBackup'), onRun: () => onQuickAction('create_backup') },
      { id: 'act-warm', group: quickGroup, label: t('cmdActWarm'), onRun: () => onQuickAction('warm_ollama') },
      { id: 'act-unload', group: quickGroup, label: t('cmdActUnload'), onRun: () => onQuickAction('unload_ollama') },
    ];

    for (const ag of agents) {
      if (ag.isSupervisor) continue;
      list.push({
        id: `ag-${ag.id}`,
        group: t('cmdGroupAgent'),
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
        group: t('cmdGroupTemplate'),
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
        group: t('cmdGroupKanban'),
        label: card.title,
        hint: card.status,
        onRun: () => onNavigate('swarm'),
      });
    }

    for (const mem of memories.slice(-15)) {
      list.push({
        id: `mem-${mem.id}`,
        group: t('cmdGroupMemory'),
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
  }, [query, agents, templates, memories, kanban, onNavigate, onApplyTemplate, onQuickAction, t]);

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
      aria-label={t('cmdPaletteAria')}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cmdPlaceholder')}
            className="flex-1 text-sm text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeBtn')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              {t('cmdNoMatch')} &ldquo;{query}&rdquo;
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onRun();
                  onClose();
                }}
                className={`w-full px-4 py-2.5 text-start flex items-center justify-between gap-3 text-xs transition-colors ${
                  idx === selectedIndex
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <span className={`font-mono me-2 ${idx === selectedIndex ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                    {item.group}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.hint && (
                  <span className={`font-mono shrink-0 ${idx === selectedIndex ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                    {item.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Command className="h-3 w-3" /> Ctrl+K / Cmd+K
          </span>
          <span>{t('cmdFooterKeys')}</span>
        </div>
      </div>
    </div>
  );
};
