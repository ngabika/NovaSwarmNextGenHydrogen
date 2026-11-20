import React, { lazy, Suspense, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  GitBranch,
  Home,
  ListChecks,
  Mail,
  Mic,
  Package,
  Play,
  Plus,
  RefreshCw,
  Reply,
  Rss,
  Timer,
  Trash2,
  Upload,
  Wallet,
  Webhook,
  Workflow,
  Youtube,
} from 'lucide-react';
import type { NovaSwarmState, WorkflowStep } from '../../shared/types';

const Batch3LifePortalPanel = lazy(() =>
  import('./Batch3LifePortalPanel').then((m) => ({ default: m.Batch3LifePortalPanel }))
);

interface Props {
  state: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

type EcoTab =
  | 'workflows'
  | 'webhooks'
  | 'rss'
  | 'email'
  | 'calendar'
  | 'smarthome'
  | 'repos'
  | 'habits'
  | 'expenses'
  | 'watchdog_media'
  | 'journal'
  | 'lists_subs'
  | 'life_portal'
  | 'bundle';

export const EcosystemView: React.FC<Props> = ({ state, onRefreshState }) => {
  const [tab, setTab] = useState<EcoTab>('workflows');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Workflows (Ú17, M51, M57)
  const [wfName, setWfName] = useState('');
  const [wfTrigger, setWfTrigger] = useState<'manual' | 'cron' | 'webhook' | 'uptime_down' | 'feed_item' | 'ha_state'>('manual');
  const [wfTrigCfg, setWfTrigCfg] = useState('60');
  const [wfCond, setWfCond] = useState('');
  const [wfAction, setWfAction] = useState<'agent_prompt' | 'kanban_create' | 'notify'>('agent_prompt');
  const [wfPayload, setWfPayload] = useState('');
  const [wfSteps, setWfSteps] = useState<WorkflowStep[]>([]);
  const [stepType, setStepType] = useState<WorkflowStep['type']>('web_search');
  const [stepTarget, setStepTarget] = useState('');
  const [stepPayload, setStepPayload] = useState('');

  // Webhooks (Ú19)
  const [whSlug, setWhSlug] = useState('');
  const [whName, setWhName] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [whTpl, setWhTpl] = useState('Bejövő webhook ({{slug}}): {{payload}}');

  // RSS (Ú6)
  const [rssName, setRssName] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [briefing, setBriefing] = useState<string | null>(null);

  // Email (Ú7)
  const [emImapHost, setEmImapHost] = useState(state.emailConfig.imapHost || '');
  const [emImapPort, setEmImapPort] = useState(state.emailConfig.imapPort || 993);
  const [emSmtpHost, setEmSmtpHost] = useState(state.emailConfig.smtpHost || '');
  const [emSmtpPort, setEmSmtpPort] = useState(state.emailConfig.smtpPort || 465);
  const [emUser, setEmUser] = useState(state.emailConfig.username || '');
  const [emPass, setEmPass] = useState('');
  const [emTo, setEmTo] = useState('');
  const [emSubject, setEmSubject] = useState('');
  const [emBody, setEmBody] = useState('');
  const [emInReplyTo, setEmInReplyTo] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<{ uid: number; subject: string; from: string; date: string; body: string } | null>(null);
  const [loadingEmailUid, setLoadingEmailUid] = useState<number | null>(null);

  // Calendar (Ú8)
  const [calTitle, setCalTitle] = useState('');
  const [calStart, setCalStart] = useState('');
  const [calRem, setCalRem] = useState(15);
  const [icsText, setIcsText] = useState('');

  // Smart Home (Ú13)
  const [shName, setShName] = useState('');
  const [shKind, setShKind] = useState<'home_assistant' | 'mqtt'>('home_assistant');
  const [shEntity, setShEntity] = useState('');
  const [haStates, setHaStates] = useState<Array<{ entity_id: string; state: string }>>([]);
  const [mqttTopic, setMqttTopic] = useState('novaswarm/cmd');
  const [mqttMsg, setMqttMsg] = useState('ping');

  // GitHub Repos (Ú16)
  const [repoSlug, setRepoSlug] = useState('');
  const [repoBranch, setRepoBranch] = useState('main');

  // Habits & Focus (Ú24)
  const [habName, setHabName] = useState('');
  const [habTarget, setHabTarget] = useState(5);
  const [focusLabel, setFocusLabel] = useState('Mély fókusz blokk');
  const [focusMins, setFocusMins] = useState(25);

  // Expenses (Ú25)
  const [expMerchant, setExpMerchant] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('HUF');
  const [csvText, setCsvText] = useState('');

  // Watchdog & Media (Ú36, Ú43, Ú44)
  const [wpName, setWpName] = useState('');
  const [wpUrl, setWpUrl] = useState('');
  const [audioTitle, setAudioTitle] = useState('Hangjegyzet');
  const [audioSaveVault, setAudioSaveVault] = useState(true);
  const [audioResult, setAudioResult] = useState<{ transcript: string; engine: string; summaryMarkdown: string; obsidianPath?: string } | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytCreateCards, setYtCreateCards] = useState(true);
  const [ytResult, setYtResult] = useState<{ title: string; summaryMarkdown: string; createdCardsCount: number } | null>(null);
  const [ytBusy, setYtBusy] = useState(false);

  // Daily Journal (Ú50)
  const [jrDate, setJrDate] = useState(new Date().toISOString().slice(0, 10));
  const [jrMood, setJrMood] = useState(4);
  const [jrEnergy, setJrEnergy] = useState(4);
  const [jrGoals, setJrGoals] = useState('');
  const [jrCompleted, setJrCompleted] = useState('');
  const [jrNotes, setJrNotes] = useState('');

  // Shared Lists & Subscriptions (Ú51, Ú52)
  const [listName, setListName] = useState('Bevásárlólista');
  const [listItemText, setListItemText] = useState('');
  const [subName, setSubName] = useState('');
  const [subCategory, setSubCategory] = useState('Szoftver');
  const [subAmount, setSubAmount] = useState('');
  const [subCurrency, setSubCurrency] = useState('HUF');
  const [subCycle, setSubCycle] = useState<'monthly' | 'yearly' | 'once'>('monthly');
  const [subDueDate, setSubDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [subReminderDays, setSubReminderDays] = useState(5);
  const [subNotes, setSubNotes] = useState('');
  const [subSummary, setSubSummary] = useState<{ monthlyByCurrency: Record<string, number>; upcomingRenewals: Array<{ id: string; name: string; nextDueDate: string; amount: number; currency: string }> } | null>(null);

  // Bundle (Ú29)
  const [bundleJson, setBundleJson] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const loadSubSummary = async () => {
    try {
      const r = await fetch('/api/subscriptions/summary');
      if (r.ok) {
        const d = await r.json();
        setSubSummary(d);
      }
    } catch {
      // ignore
    }
  };

  const tabs: Array<{ id: EcoTab; label: string; icon: React.ReactNode }> = [
    { id: 'workflows', label: 'Munkafolyamatok', icon: <Workflow className="h-3.5 w-3.5" /> },
    { id: 'webhooks', label: 'Webhookok', icon: <Webhook className="h-3.5 w-3.5" /> },
    { id: 'rss', label: 'RSS & Briefing', icon: <Rss className="h-3.5 w-3.5" /> },
    { id: 'email', label: 'Email IMAP/SMTP', icon: <Mail className="h-3.5 w-3.5" /> },
    { id: 'calendar', label: 'Naptár & ICS', icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'smarthome', label: 'Okosotthon HA/MQTT', icon: <Home className="h-3.5 w-3.5" /> },
    { id: 'repos', label: 'GitHub Figyelő', icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: 'watchdog_media', label: 'Oldalfigyelő & Média', icon: <Eye className="h-3.5 w-3.5" /> },
    { id: 'journal', label: 'Napi Napló', icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: 'lists_subs', label: 'Listák & Előfizetések', icon: <ListChecks className="h-3.5 w-3.5" /> },
    { id: 'habits', label: 'Szokások & Fókusz', icon: <Timer className="h-3.5 w-3.5" /> },
    { id: 'expenses', label: 'Pénzügyek & CSV', icon: <Wallet className="h-3.5 w-3.5" /> },
    { id: 'life_portal', label: 'CRM, Csomagok & Deviza', icon: <Package className="h-3.5 w-3.5" /> },
    { id: 'bundle', label: 'Csomag Export/Import', icon: <Download className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setStatusMsg(null);
              if (t.id === 'lists_subs') {
                void loadSubSummary();
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">{statusMsg}</div>
      )}

      {tab === 'workflows' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Automatizált Munkafolyamatok (Trigger → Feltétel → Többlépcsős Művelet)</h2>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/smarthome/ha/evaluate', { method: 'POST' });
                const d = (await r.json()) as { triggered?: number };
                setStatusMsg(`Home Assistant trigger kiértékelés kész: ${d.triggered ?? 0} folyamat indult.`);
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              HA Trigger Kiértékelés
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wfName.trim() || (!wfPayload.trim() && wfSteps.length === 0)) return;
              await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: wfName,
                  triggerType: wfTrigger,
                  triggerConfig: wfTrigCfg,
                  conditionExpr: wfCond,
                  actionType: wfAction,
                  actionPayload: wfPayload || wfSteps[0]?.payload || '',
                  steps: wfSteps.length > 0 ? wfSteps : undefined,
                }),
              });
              setWfName('');
              setWfPayload('');
              setWfSteps([]);
              await onRefreshState();
            }}
            className="grid grid-cols-1 sm:grid-cols-6 gap-2"
          >
            <input
              type="text"
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="Munkafolyamat neve"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <select
              value={wfTrigger}
              onChange={(e) => setWfTrigger(e.target.value as typeof wfTrigger)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="manual">Manuális</option>
              <option value="cron">Időzített (perc)</option>
              <option value="webhook">Webhook</option>
              <option value="uptime_down">Uptime hiba</option>
              <option value="feed_item">Új RSS hír</option>
              <option value="ha_state">Home Assistant állapot</option>
            </select>
            <input
              type="text"
              value={wfTrigCfg}
              onChange={(e) => setWfTrigCfg(e.target.value)}
              placeholder={wfTrigger === 'ha_state' ? 'pl. sensor.temp>28' : 'Intervallum (perc)'}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <select
              value={wfAction}
              onChange={(e) => setWfAction(e.target.value as typeof wfAction)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="agent_prompt">Ágens futtatás</option>
              <option value="kanban_create">Kanban kártya</option>
              <option value="notify">Telegram értesítés</option>
            </select>
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">
              + Létrehozás
            </button>
            <input
              type="text"
              value={wfCond}
              onChange={(e) => setWfCond(e.target.value)}
              placeholder="Feltétel kulcsszó (opcionális)"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded"
            />
            <input
              type="text"
              value={wfPayload}
              onChange={(e) => setWfPayload(e.target.value)}
              placeholder="Prompt / Üzenet ({{payload}} behelyettesítéssel)..."
              className="sm:col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
          </form>

          {/* M51 Multi-step sequential workflow pipeline builder */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              Többlépcsős Munkafolyamat Lánc ({wfSteps.length} lépés · opcionális, {'{{prev}}'} továbbadással)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
              <select
                value={stepType}
                onChange={(e) => setStepType(e.target.value as WorkflowStep['type'])}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="web_search">Web Keresés</option>
                <option value="http_call">HTTP Hívás</option>
                <option value="agent_prompt">Ágens Prompt</option>
                <option value="kanban_create">Kanban Létrehozás</option>
                <option value="notify">Telegram Értesítés</option>
              </select>
              <input
                type="text"
                value={stepTarget}
                onChange={(e) => setStepTarget(e.target.value)}
                placeholder="Cél (ágens ID / URL / opc.)"
                className="px-2 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <input
                type="text"
                value={stepPayload}
                onChange={(e) => setStepPayload(e.target.value)}
                placeholder="Lépés tartalma ({{prev}} / {{payload}})..."
                className="sm:col-span-3 px-2 py-1.5 text-xs border border-slate-300 rounded"
              />
              <button
                type="button"
                onClick={() => {
                  if (!stepPayload.trim() && !stepTarget.trim()) return;
                  setWfSteps((prev) => [...prev, { type: stepType, target: stepTarget.trim(), payload: stepPayload.trim() }]);
                  setStepTarget('');
                  setStepPayload('');
                }}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white rounded hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                + Lépés
              </button>
            </div>
            {wfSteps.length > 0 && (
              <div className="space-y-1">
                {wfSteps.map((st, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-xs font-mono bg-white border border-slate-200 px-2.5 py-1.5 rounded">
                    <span className="truncate">
                      {idx + 1}. [{st.type}] {st.target ? `(${st.target}) ` : ''}{st.payload}
                    </span>
                    <button
                      type="button"
                      onClick={() => setWfSteps((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-600 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {state.workflows.length === 0 ? (
              <p className="text-xs text-slate-500">Nincs még felvett munkafolyamat.</p>
            ) : (
              state.workflows.map((wf) => (
                <div key={wf.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {wf.name} · <span className="font-mono text-slate-600">{wf.triggerType}{wf.triggerConfig ? `(${wf.triggerConfig})` : ''} → {wf.steps?.length ? `${wf.steps.length} lépéses lánc` : wf.actionType}</span>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      Futások: {wf.runCount} · Utolsó: {wf.lastStatus || 'még nem futott'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await fetch(`/api/workflows/${wf.id}/run`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ payload: 'Manuális tesztindítás' }),
                        });
                        const d = (await r.json()) as { status?: string; output?: string };
                        setStatusMsg(`Workflow eredmény: ${d.status} — ${d.output || ''}`);
                        await onRefreshState();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3 w-3" />
                      Futtatás
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/workflows/${wf.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Egyéni Bejövő Webhookok (/hooks/:slug)</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!whSlug.trim() || !whName.trim()) return;
              await fetch('/api/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: whSlug, name: whName, secret: whSecret, promptTemplate: whTpl }),
              });
              setWhSlug('');
              setWhName('');
              setWhSecret('');
              await onRefreshState();
            }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <input
              type="text"
              value={whSlug}
              onChange={(e) => setWhSlug(e.target.value)}
              placeholder="slug (pl. github-push)"
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <input
              type="text"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              placeholder="Webhook neve"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <input
              type="password"
              value={whSecret}
              onChange={(e) => setWhSecret(e.target.value)}
              placeholder="x-webhook-secret (opc.)"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">
              + Webhook felvétel
            </button>
            <input
              type="text"
              value={whTpl}
              onChange={(e) => setWhTpl(e.target.value)}
              className="sm:col-span-4 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded"
            />
          </form>

          <div className="space-y-2">
            {state.customWebhooks.map((h) => (
              <div key={h.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold">{h.name} · <span className="font-mono">{window.location.origin}/hooks/{h.slug}</span></div>
                  <div className="font-mono text-[11px] text-slate-500">Hívások: {h.hitCount} · Titkos kulcs: {h.hasSecret ? 'Beállítva' : 'Nincs'}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/webhooks/${h.id}`, { method: 'DELETE' });
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
      )}

      {tab === 'rss' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">RSS / Atom Hírfigyelő & Napi Briefing</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/rss/refresh', { method: 'POST' });
                  await onRefreshState();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Frissítés
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/rss/briefing');
                  const d = (await r.json()) as { briefing: string };
                  setBriefing(d.briefing);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                AI Briefing Generálása
              </button>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rssName.trim() || !rssUrl.trim()) return;
              await fetch('/api/rss/feeds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: rssName, url: rssUrl }),
              });
              setRssName('');
              setRssUrl('');
              await onRefreshState();
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={rssName}
              onChange={(e) => setRssName(e.target.value)}
              placeholder="Feed neve"
              className="w-44 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <input
              type="url"
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="https://.../feed.xml"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">
              + Feed
            </button>
          </form>

          {briefing && (
            <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs whitespace-pre-wrap font-sans">
              {briefing}
            </pre>
          )}

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {state.rssFeedItems.map((it) => (
              <div key={it.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs">
                <div className="font-semibold text-slate-900">{it.title}</div>
                <div className="text-[11px] font-mono text-slate-500">{it.feedName} · {it.publishedAt.slice(0, 16)}</div>
                {it.summary && <p className="text-slate-600 mt-1">{it.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">IMAP Beállítás & Beérkező E-mailek</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <input type="text" value={emImapHost} onChange={(e) => setEmImapHost(e.target.value)} placeholder="IMAP host (pl. imap.gmail.com)" className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="number" value={emImapPort} onChange={(e) => setEmImapPort(Number(e.target.value))} placeholder="993" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="text" value={emSmtpHost} onChange={(e) => setEmSmtpHost(e.target.value)} placeholder="SMTP host (pl. smtp.gmail.com)" className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="number" value={emSmtpPort} onChange={(e) => setEmSmtpPort(Number(e.target.value))} placeholder="465" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="text" value={emUser} onChange={(e) => setEmUser(e.target.value)} placeholder="E-mail / felhasználónév" className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="password" value={emPass} onChange={(e) => setEmPass(e.target.value)} placeholder={state.emailConfig.hasPassword ? 'App jelszó (tárolva)' : 'App jelszó'} className="px-2.5 py-1.5 border border-slate-300 rounded" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/email/config', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      enabled: true,
                      imapHost: emImapHost,
                      imapPort: emImapPort,
                      smtpHost: emSmtpHost,
                      smtpPort: emSmtpPort,
                      username: emUser,
                      password: emPass || undefined,
                      tls: true,
                    }),
                  });
                  setEmPass('');
                  setStatusMsg('Email beállítások mentve a titkosított tárolóba.');
                  await onRefreshState();
                }}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded"
              >
                Konfig Mentése
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/email/sync', { method: 'POST' });
                  const d = (await r.json()) as { ok: boolean; error?: string; emails: unknown[] };
                  setStatusMsg(d.ok ? `IMAP szinkron kész: ${d.emails.length} levél.` : `IMAP hiba: ${d.error}`);
                  await onRefreshState();
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
              >
                IMAP Szinkron
              </button>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
              {state.emailConfig.recentEmails.map((em) => (
                <button
                  key={em.uid}
                  type="button"
                  onClick={async () => {
                    setLoadingEmailUid(em.uid);
                    try {
                      const r = await fetch(`/api/email/body/${em.uid}`);
                      const d = (await r.json()) as { ok?: boolean; body?: string; error?: string };
                      setSelectedEmail({
                        uid: em.uid,
                        subject: em.subject,
                        from: em.from,
                        date: em.date,
                        body: d.ok ? d.body || '(üres levéltörzs)' : d.error || 'Nem sikerült betölteni a levelet.',
                      });
                    } finally {
                      setLoadingEmailUid(null);
                    }
                  }}
                  className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs transition-colors"
                >
                  <div className="font-semibold truncate flex items-center justify-between gap-2">
                    <span className="truncate">{em.subject}</span>
                    {loadingEmailUid === em.uid && <span className="font-mono text-[10px] text-slate-500">Betöltés...</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{em.from} · {em.date}</div>
                </button>
              ))}
            </div>
            {selectedEmail && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{selectedEmail.subject}</div>
                    <div className="text-[11px] text-slate-500 truncate">{selectedEmail.from} · {selectedEmail.date}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const angleMatch = selectedEmail.from.match(/<([^>]+)>/);
                      setEmTo(angleMatch ? angleMatch[1] : selectedEmail.from);
                      setEmSubject(selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`);
                      setEmInReplyTo(`uid-${selectedEmail.uid}`);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
                  >
                    <Reply className="h-3 w-3" />
                    Válasz
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-slate-700 max-h-40 overflow-y-auto">{selectedEmail.body}</pre>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">E-mail Küldés (SMTP · Jóváhagyással)</h2>
            <input type="email" value={emTo} onChange={(e) => setEmTo(e.target.value)} placeholder="Címzett e-mail..." className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="text" value={emSubject} onChange={(e) => setEmSubject(e.target.value)} placeholder="Tárgy..." className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            {emInReplyTo && (
              <div className="text-[11px] font-mono text-slate-500 flex items-center justify-between">
                <span>Válasz hivatkozás: {emInReplyTo}</span>
                <button type="button" onClick={() => setEmInReplyTo('')} className="underline">Törlés</button>
              </div>
            )}
            <textarea rows={5} value={emBody} onChange={(e) => setEmBody(e.target.value)} placeholder="Üzenet..." className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/email/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: emTo,
                    subject: emSubject,
                    text: emBody,
                    inReplyTo: emInReplyTo || undefined,
                    requireApproval: false,
                  }),
                });
                const d = (await r.json()) as { message?: string; error?: string };
                setStatusMsg(d.message || d.error || 'Küldve');
                setEmInReplyTo('');
              }}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
            >
              Küldés SMTP-vel
            </button>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Naptár Események, Emlékeztetők & ICS Import</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!calTitle.trim() || !calStart.trim()) return;
              await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: calTitle, startAt: calStart, reminderMinutes: calRem }),
              });
              setCalTitle('');
              await onRefreshState();
            }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <input type="text" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Esemény címe" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="datetime-local" value={calStart} onChange={(e) => setCalStart(e.target.value)} className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="number" min="0" value={calRem} onChange={(e) => setCalRem(Number(e.target.value))} placeholder="Értesítés előtte (perc)" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">+ Esemény</button>
          </form>

          <div className="flex gap-2">
            <textarea rows={2} value={icsText} onChange={(e) => setIcsText(e.target.value)} placeholder="VEVENT / .ics tartalom beillesztése importáláshoz..." className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button
              type="button"
              onClick={async () => {
                if (!icsText.trim()) return;
                const r = await fetch('/api/calendar/import-ics', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ icsText }),
                });
                const d = (await r.json()) as { imported: number };
                setStatusMsg(`${d.imported} ICS esemény importálva.`);
                setIcsText('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded"
            >
              ICS Import
            </button>
          </div>

          <div className="space-y-2">
            {state.calendarEvents.map((ev) => (
              <div key={ev.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold">{ev.title}</span> · <span className="font-mono">{new Date(ev.startAt).toLocaleString()}</span> · {ev.reminderMinutes}p előtt
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/calendar/events/${ev.id}`, { method: 'DELETE' });
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
      )}

      {tab === 'smarthome' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Okosotthon (Home Assistant REST & MQTT)</h2>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/smarthome/ha/states');
                const d = (await r.json()) as { ok: boolean; entities: Array<{ entity_id: string; state: string }>; error?: string };
                if (d.ok) setHaStates(d.entities);
                else setStatusMsg(d.error || 'HA nem érhető el');
              }}
              className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded"
            >
              HA Entitások Lekérése
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" value={mqttTopic} onChange={(e) => setMqttTopic(e.target.value)} placeholder="MQTT Topic" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="text" value={mqttMsg} onChange={(e) => setMqttMsg(e.target.value)} placeholder="MQTT Üzenet" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/smarthome/mqtt/publish', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ topic: mqttTopic, message: mqttMsg }),
                });
                const d = (await r.json()) as { message?: string };
                setStatusMsg(d.message || 'MQTT küldve');
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded"
            >
              MQTT Publikálás
            </button>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!shName.trim() || !shEntity.trim()) return;
              await fetch('/api/smarthome/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: shName, kind: shKind, entityOrTopic: shEntity }),
              });
              setShName('');
              setShEntity('');
              await onRefreshState();
            }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <input type="text" value={shName} onChange={(e) => setShName(e.target.value)} placeholder="Eszköz neve" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
            <select value={shKind} onChange={(e) => setShKind(e.target.value as typeof shKind)} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white">
              <option value="home_assistant">Home Assistant</option>
              <option value="mqtt">MQTT Topic</option>
            </select>
            <input type="text" value={shEntity} onChange={(e) => setShEntity(e.target.value)} placeholder="light.nappali vagy topic" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">+ Mentés</button>
          </form>

          {haStates.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {haStates.map((e) => (
                <div key={e.entity_id} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between text-xs font-mono">
                  <span>{e.entity_id} = {e.state}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const domain = e.entity_id.split('.')[0];
                      await fetch('/api/smarthome/ha/call', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain, service: 'toggle', entityId: e.entity_id }),
                      });
                    }}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded"
                  >
                    Toggle
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'repos' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Figyelt GitHub Repository-k</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!repoSlug.trim()) return;
              await fetch('/api/repos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: repoSlug, branch: repoBranch }),
              });
              setRepoSlug('');
              await onRefreshState();
            }}
            className="flex gap-2"
          >
            <input type="text" value={repoSlug} onChange={(e) => setRepoSlug(e.target.value)} placeholder="owner/repo (pl. ngabika/NovaSwarmNextGenHydrogen)" className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="text" value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="main" className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">+ Figyelés</button>
          </form>
          <div className="space-y-2">
            {state.watchedRepos.map((r) => (
              <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <div className="font-mono font-semibold">{r.slug} ({r.branch})</div>
                  <div className="text-slate-600">
                    {r.lastCommitSha ? `${r.lastCommitSha} · ${r.lastCommitMsg}` : r.lastError || 'Szinkronra vár'}
                    {typeof r.openIssuesCount === 'number' ? ` · Nyitott issue: ${r.openIssuesCount}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/repos/${r.id}/sync`, { method: 'POST' });
                      await onRefreshState();
                    }}
                    className="px-2.5 py-1 border border-slate-300 bg-white rounded"
                  >
                    Szinkron
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/repos/${r.id}`, { method: 'DELETE' });
                      await onRefreshState();
                    }}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'habits' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Napi Szokások Követése</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!habName.trim()) return;
                await fetch('/api/habits', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: habName, targetPerWeek: habTarget }),
                });
                setHabName('');
                await onRefreshState();
              }}
              className="flex gap-2"
            >
              <input type="text" value={habName} onChange={(e) => setHabName(e.target.value)} placeholder="Szokás neve (pl. Olvasás)" className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="number" min="1" max="7" value={habTarget} onChange={(e) => setHabTarget(Number(e.target.value))} className="w-16 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">+ Felvétel</button>
            </form>
            <div className="space-y-2">
              {state.habits.map((h) => {
                const done = h.completedDates.includes(today);
                return (
                  <div key={h.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex justify-between items-center text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/habits/${h.id}/toggle`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({}),
                        });
                        await onRefreshState();
                      }}
                      className="flex items-center gap-2 text-left"
                    >
                      <CheckCircle2 className={`h-4 w-4 ${done ? 'text-emerald-700' : 'text-slate-300'}`} />
                      <span className={done ? 'line-through text-slate-500' : 'font-medium text-slate-900'}>{h.name}</span>
                      <span className="font-mono text-[11px] text-slate-500">({h.completedDates.length} nap · {h.totalMinutes} perc)</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/habits/${h.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Pomodoro & Fókusz Napló</h2>
            <div className="flex gap-2">
              <input type="text" value={focusLabel} onChange={(e) => setFocusLabel(e.target.value)} className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="number" min="5" max="180" value={focusMins} onChange={(e) => setFocusMins(Number(e.target.value))} className="w-20 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/focus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label: focusLabel, minutes: focusMins }),
                  });
                  await onRefreshState();
                }}
                className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded"
              >
                Rögzítés
              </button>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {state.focusSessions.map((f) => (
                <div key={f.id} className="p-2 bg-slate-50 border border-slate-200 rounded text-xs flex justify-between font-mono">
                  <span>{f.label}</span>
                  <span>{f.minutes} perc · {new Date(f.completedAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Személyes Kiadáskövető & CSV Banki Import</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!expMerchant.trim() || !expAmount) return;
              await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  merchant: expMerchant,
                  amount: Number(expAmount),
                  currency: expCurrency,
                }),
              });
              setExpMerchant('');
              setExpAmount('');
              await onRefreshState();
            }}
            className="flex flex-wrap gap-2"
          >
            <input type="text" value={expMerchant} onChange={(e) => setExpMerchant(e.target.value)} placeholder="Partner / Bolt (pl. SPAR)" className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="number" step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="Összeg" className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="text" value={expCurrency} onChange={(e) => setExpCurrency(e.target.value)} className="w-20 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded inline-flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" />
              Rögzítés
            </button>
          </form>

          <div className="flex gap-2">
            <textarea rows={2} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="CSV sorok (dátum;partner;összeg)..." className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button
              type="button"
              onClick={async () => {
                if (!csvText.trim()) return;
                const r = await fetch('/api/expenses/import-csv', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ csvText, defaultCurrency: expCurrency }),
                });
                const d = (await r.json()) as { imported: number };
                setStatusMsg(`${d.imported} kiadási tétel importálva és kategorizálva.`);
                setCsvText('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded"
            >
              CSV Import
            </button>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1.5">Dátum</th>
                  <th className="py-1.5">Partner</th>
                  <th className="py-1.5">Kategória</th>
                  <th className="py-1.5 text-right">Összeg</th>
                  <th className="py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td className="py-1.5 font-mono text-slate-600">{ex.date}</td>
                    <td className="py-1.5 font-medium">{ex.merchant}</td>
                    <td className="py-1.5 text-slate-600">{ex.category}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {ex.amount.toLocaleString()} {ex.currency}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/expenses/${ex.id}`, { method: 'DELETE' });
                          await onRefreshState();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'watchdog_media' && (
        <div className="space-y-6">
          {/* Ú36: Web Page Change Watchdog */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Eye className="h-4 w-4 text-slate-700" />
                Weboldal Változás-figyelő (Watchdog)
              </h2>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/watchdog/check', { method: 'POST' });
                  const d = (await r.json()) as { pages?: unknown[] };
                  setStatusMsg(`Oldalellenőrzés lefutott (${d.pages?.length ?? 0} figyelt URL).`);
                  await onRefreshState();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Mind Ellenőrzése
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!wpName.trim() || !wpUrl.trim()) return;
                await fetch('/api/watchdog/pages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: wpName.trim(), url: wpUrl.trim() }),
                });
                setWpName('');
                setWpUrl('');
                await onRefreshState();
              }}
              className="flex flex-wrap gap-2"
            >
              <input type="text" value={wpName} onChange={(e) => setWpName(e.target.value)} placeholder="Oldal neve (pl. Árlista)" className="w-48 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="url" value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://example.com/status" className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">+ Figyelés</button>
            </form>
            <div className="space-y-2">
              {state.watchedPages.length === 0 ? (
                <p className="text-xs text-slate-500">Nincs még figyelt weboldal.</p>
              ) : (
                state.watchedPages.map((p) => (
                  <div key={p.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{p.name} · <span className="font-mono text-slate-500">{p.url}</span></div>
                      <div className="font-mono tabular-nums text-[11px] text-slate-600">
                        Változások: {p.changeCount} · Utolsó ellenőrzés: {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString() : '-'}
                        {p.lastError ? ` · Hiba: ${p.lastError}` : ''}
                      </div>
                      {p.lastExcerpt && <div className="text-slate-600 mt-1 truncate max-w-2xl">{p.lastExcerpt}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/watchdog/pages/${p.id}`, { method: 'DELETE' });
                        await onRefreshState();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ú43: Podcast / Audio Chapterizer */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Mic className="h-4 w-4 text-slate-700" />
                Podcast & Hanganyag Fejezet-elemző
              </h3>
              <input
                type="text"
                value={audioTitle}
                onChange={(e) => setAudioTitle(e.target.value)}
                placeholder="Hanganyag címe"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={audioSaveVault} onChange={(e) => setAudioSaveVault(e.target.checked)} />
                Mentés a napi Obsidian jegyzetbe is
              </label>
              <input
                type="file"
                accept="audio/*"
                disabled={audioBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setAudioBusy(true);
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const raw = String(reader.result || '');
                      const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
                      const r = await fetch('/api/media/chapters', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          mimeType: file.type || 'audio/mpeg',
                          dataBase64: base64,
                          title: audioTitle || file.name,
                          saveToVault: audioSaveVault,
                        }),
                      });
                      const d = await r.json();
                      if (r.ok) {
                        setAudioResult(d);
                        await onRefreshState();
                      } else {
                        setStatusMsg(d.error || 'Hangfeldolgozási hiba.');
                      }
                    } finally {
                      setAudioBusy(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:bg-slate-50"
              />
              {audioBusy && <div className="text-xs font-mono text-slate-500">Hanganyag átírása és fejezetezése...</div>}
              {audioResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="font-mono text-slate-600">Motor: {audioResult.engine}{audioResult.obsidianPath ? ` · Vault: ${audioResult.obsidianPath}` : ''}</div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 max-h-44 overflow-y-auto">{audioResult.summaryMarkdown}</pre>
                </div>
              )}
            </div>

            {/* Ú44: YouTube Video Analyzer + SM-2 Flashcard Generator */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Youtube className="h-4 w-4 text-slate-700" />
                YouTube Videó Elemző & SM-2 Kártya Készítő
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!ytUrl.trim()) return;
                  setYtBusy(true);
                  try {
                    const r = await fetch('/api/media/youtube', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ url: ytUrl.trim(), createCards: ytCreateCards }),
                    });
                    const d = await r.json();
                    if (r.ok) {
                      setYtResult({
                        title: d.title,
                        summaryMarkdown: d.summaryMarkdown,
                        createdCardsCount: Array.isArray(d.createdCards) ? d.createdCards.length : 0,
                      });
                      await onRefreshState();
                    } else {
                      setStatusMsg(d.error || 'YouTube elemzési hiba.');
                    }
                  } finally {
                    setYtBusy(false);
                  }
                }}
                className="space-y-2"
              >
                <input
                  type="url"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={ytCreateCards} onChange={(e) => setYtCreateCards(e.target.checked)} />
                    SM-2 tanulókártyák automatikus létrehozása
                  </label>
                  <button
                    type="submit"
                    disabled={ytBusy}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {ytBusy ? 'Elemzés...' : 'Videó Elemzése'}
                  </button>
                </div>
              </form>
              {ytResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-900">{ytResult.title}</div>
                  <div className="font-mono text-[11px] text-slate-600">Létrehozott tanulókártyák: {ytResult.createdCardsCount}</div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 max-h-44 overflow-y-auto">{ytResult.summaryMarkdown}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-700" />
              Második Agy — Napi Napló (Obsidian Szinkronnal)
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const goals = jrGoals
                  .split(/\n|,/)
                  .map((x) => x.trim())
                  .filter(Boolean);
                const r = await fetch('/api/journal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    date: jrDate,
                    mood: jrMood,
                    energy: jrEnergy,
                    topGoals: goals,
                    completedNotes: jrCompleted,
                    gratitudeOrNotes: jrNotes,
                  }),
                });
                if (r.ok) {
                  setJrCompleted('');
                  setJrNotes('');
                  setStatusMsg('Napi napló mentve az Obsidian Vaultba.');
                  await onRefreshState();
                }
              }}
              className="space-y-2.5 text-xs"
            >
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-slate-600">Dátum</span>
                  <input type="date" value={jrDate} onChange={(e) => setJrDate(e.target.value)} className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600">Hangulat (1–5)</span>
                  <input type="number" min="1" max="5" value={jrMood} onChange={(e) => setJrMood(Number(e.target.value))} className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600">Energia (1–5)</span>
                  <input type="number" min="1" max="5" value={jrEnergy} onChange={(e) => setJrEnergy(Number(e.target.value))} className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded" />
                </label>
              </div>
              <input type="text" value={jrGoals} onChange={(e) => setJrGoals(e.target.value)} placeholder="Mai fő célok (vesszővel elválasztva)..." className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <textarea rows={2} value={jrCompleted} onChange={(e) => setJrCompleted(e.target.value)} placeholder="Elvégzett feladatok és sikerek..." className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <textarea rows={2} value={jrNotes} onChange={(e) => setJrNotes(e.target.value)} placeholder="Gondolatok, tanulságok, hála..." className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <button type="submit" className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg">
                Naplóbejegyzés Mentése
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Korábbi Naplóbejegyzések ({state.dailyJournals.length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {state.dailyJournals.length === 0 ? (
                <p className="text-xs text-slate-500">Még nincs rögzített naplóbejegyzés.</p>
              ) : (
                state.dailyJournals.map((j) => (
                  <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                    <div className="flex flex-wrap justify-between gap-2 font-mono">
                      <span className="font-semibold text-slate-900">{j.date}</span>
                      <span className="tabular-nums text-slate-600">Hangulat: {j.mood}/5 · Energia: {j.energy}/5</span>
                    </div>
                    {j.topGoals.length > 0 && <div className="text-slate-800">Célok: {j.topGoals.join(' · ')}</div>}
                    {j.completedNotes && <div className="text-slate-700">{j.completedNotes}</div>}
                    {j.gratitudeOrNotes && <div className="text-slate-600">{j.gratitudeOrNotes}</div>}
                    {j.obsidianPath && <div className="font-mono text-[11px] text-slate-500">Obsidian: {j.obsidianPath}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'lists_subs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ú51: Shared Lists synced with Telegram /lista */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-slate-700" />
                Megosztott Listák (Telegram /lista szinkron)
              </h2>
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/lists/default');
                  await onRefreshState();
                }}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Alaplista
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!listItemText.trim()) return;
                await fetch('/api/lists/items', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ listIdOrName: listName.trim() || 'Bevásárlólista', text: listItemText.trim(), addedBy: 'Web' }),
                });
                setListItemText('');
                await onRefreshState();
              }}
              className="flex flex-wrap gap-2"
            >
              <input type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Lista neve" className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="text" value={listItemText} onChange={(e) => setListItemText(e.target.value)} placeholder="Új tétel (pl. Tej 2L)..." className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">+ Tétel</button>
            </form>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {state.sharedLists.length === 0 ? (
                <p className="text-xs text-slate-500">Adj hozzá egy tételt a megosztott lista létrehozásához.</p>
              ) : (
                state.sharedLists.map((lst) => (
                  <div key={lst.id} className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-800">{lst.name} ({lst.items.length})</div>
                    {lst.items.map((it) => (
                      <div key={it.id} className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/lists/${lst.id}/items/${it.id}/toggle`, { method: 'POST' });
                            await onRefreshState();
                          }}
                          className="flex items-center gap-2 text-left min-w-0"
                        >
                          <CheckCircle2 className={`h-4 w-4 shrink-0 ${it.done ? 'text-emerald-700' : 'text-slate-300'}`} />
                          <span className={it.done ? 'line-through text-slate-500 truncate' : 'text-slate-900 truncate'}>{it.text}</span>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">· {it.addedBy}</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/lists/${lst.id}/items/${it.id}`, { method: 'DELETE' });
                            await onRefreshState();
                          }}
                          className="text-slate-400 hover:text-red-600 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ú52: Subscriptions & Warranties Tracker */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-700" />
                Előfizetések & Garanciák
              </h2>
              <button
                type="button"
                onClick={() => void loadSubSummary()}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Összesítő Frissítése
              </button>
            </div>
            {subSummary && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono tabular-nums flex flex-wrap justify-between gap-2">
                <span>
                  Havi átlag:{' '}
                  {Object.entries(subSummary.monthlyByCurrency)
                    .map(([cur, val]) => `${val} ${cur}`)
                    .join(' · ') || '0'}
                </span>
                <span>Közelgő lejáratok: {subSummary.upcomingRenewals.length}</span>
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!subName.trim()) return;
                await fetch('/api/subscriptions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: subName.trim(),
                    category: subCategory.trim(),
                    amount: Number(subAmount || 0),
                    currency: subCurrency.trim() || 'HUF',
                    billingCycle: subCycle,
                    nextDueDate: subDueDate,
                    reminderDaysBefore: subReminderDays,
                    notes: subNotes.trim() || undefined,
                  }),
                });
                setSubName('');
                setSubAmount('');
                setSubNotes('');
                await onRefreshState();
                await loadSubSummary();
              }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
            >
              <input type="text" value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Név (pl. Hetzner / Garancia)" className="col-span-2 px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="text" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="Kategória" className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <select value={subCycle} onChange={(e) => setSubCycle(e.target.value as typeof subCycle)} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                <option value="monthly">Havi</option>
                <option value="yearly">Éves</option>
                <option value="once">Egyszeri / Garancia</option>
              </select>
              <input type="number" step="0.01" value={subAmount} onChange={(e) => setSubAmount(e.target.value)} placeholder="Összeg" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="text" value={subCurrency} onChange={(e) => setSubCurrency(e.target.value)} placeholder="HUF" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="date" aria-label="Következő esedékesség" value={subDueDate} onChange={(e) => setSubDueDate(e.target.value)} className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <div className="flex items-center gap-1 px-2 py-1.5 border border-slate-300 rounded bg-white">
                <input type="number" min="0" aria-label="Értesítés ennyi nappal előtte" title="Értesítés ennyi nappal lejárat előtt" value={subReminderDays} onChange={(e) => setSubReminderDays(Number(e.target.value))} className="w-10 font-mono outline-none" />
                <span className="text-[11px] text-slate-500 whitespace-nowrap">nap előtte</span>
              </div>
              <input type="text" value={subNotes} onChange={(e) => setSubNotes(e.target.value)} placeholder="Megjegyzés (opcionális)" className="col-span-2 sm:col-span-3 px-2.5 py-1.5 border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">+ Mentés</button>
            </form>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {state.subscriptions.map((sub) => (
                <div key={sub.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{sub.name} · <span className="text-slate-600">{sub.category}</span></div>
                    <div className="font-mono tabular-nums text-[11px] text-slate-500">
                      {sub.amount} {sub.currency} ({sub.billingCycle}) · Következő: {sub.nextDueDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/subscriptions/${sub.id}`, { method: 'DELETE' });
                      await onRefreshState();
                      await loadSubSummary();
                    }}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'bundle' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Ágens, Skill & Workflow Csomag Export / Import</h2>
              <p className="text-xs text-slate-500">Titkoktól és API kulcsoktól teljesen megtisztított hordozható JSON csomag.</p>
            </div>
            <a
              href="/api/bundle/export"
              download="novaswarm-bundle.json"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
            >
              <Download className="h-3.5 w-3.5" />
              Csomag Letöltése (.json)
            </a>
          </div>
          <textarea
            rows={6}
            value={bundleJson}
            onChange={(e) => setBundleJson(e.target.value)}
            placeholder='Illeszd be egy korábban exportált NovaSwarm csomag JSON tartalmát az importáláshoz...'
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const parsed = JSON.parse(bundleJson);
                const r = await fetch('/api/bundle/import', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(parsed),
                });
                const d = (await r.json()) as {
                  importedAgents: number;
                  importedWorkflows: number;
                  importedTemplates: number;
                };
                setStatusMsg(
                  `Import kész: ${d.importedAgents} ágens, ${d.importedWorkflows} workflow, ${d.importedTemplates} sablon.`
                );
                await onRefreshState();
              } catch (err) {
                setStatusMsg(err instanceof Error ? err.message : 'Érvénytelen JSON');
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Csomag Importálása
          </button>
        </div>
      )}

      {tab === 'life_portal' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">Életvitel & CRM modul betöltése...</div>}>
          <Batch3LifePortalPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
    </div>
  );
};
