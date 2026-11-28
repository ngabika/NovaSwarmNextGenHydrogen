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
import { useLocale } from '../locales/translations';
import { InfoHint } from './InfoHint';

const Batch3LifePortalPanel = lazy(() =>
  import('./Batch3LifePortalPanel').then((m) => ({ default: m.Batch3LifePortalPanel }))
);
const Batch4LifeAndAutopilotPanel = lazy(() =>
  import('./Batch4LifeAndAutopilotPanel').then((m) => ({ default: m.Batch4LifeAndAutopilotPanel }))
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
  | 'life_os_b4'
  | 'bundle';

export const EcosystemView: React.FC<Props> = ({ state, onRefreshState }) => {
  const { tx, intlLocale } = useLocale();
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
  const [whTpl, setWhTpl] = useState(() => tx('Bejövő webhook ({{slug}}): {{payload}}'));

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
  const [focusLabel, setFocusLabel] = useState(() => tx('Mély fókusz blokk'));
  const [focusMins, setFocusMins] = useState(25);

  // Expenses (Ú25)
  const [expMerchant, setExpMerchant] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('HUF');
  const [csvText, setCsvText] = useState('');

  // Watchdog & Media (Ú36, Ú43, Ú44)
  const [wpName, setWpName] = useState('');
  const [wpUrl, setWpUrl] = useState('');
  const [audioTitle, setAudioTitle] = useState(() => tx('Hangjegyzet'));
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
  const [listName, setListName] = useState(() => tx('Bevásárlólista'));
  const [listItemText, setListItemText] = useState('');
  const [subName, setSubName] = useState('');
  const [subCategory, setSubCategory] = useState(() => tx('Szoftver'));
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

  const tabs: Array<{ id: EcoTab; label: string; icon: React.ReactNode; hint: string }> = [
    { id: 'workflows', label: tx('Automatizmusok'), icon: <Workflow className="h-3.5 w-3.5" />, hint: tx('„Ha ez történik, akkor csináld azt” szabályok: időzítőre vagy eseményre automatikus feladatok indítása.') },
    { id: 'webhooks', label: tx('Külső Értesítők'), icon: <Webhook className="h-3.5 w-3.5" />, hint: tx('Egyedi webcímek (webhookok), amelyeken külső appok értesíteni tudják a rendszeredet.') },
    { id: 'rss', label: tx('Hírek & Briefing'), icon: <Rss className="h-3.5 w-3.5" />, hint: tx('Kedvenc híroldalaid követése és napi összefoglaló készítése a friss cikkekből.') },
    { id: 'email', label: tx('Email Postafiók'), icon: <Mail className="h-3.5 w-3.5" />, hint: tx('Bejövő levelek olvasása és válaszok küldése a saját IMAP/SMTP postafiókodon keresztül.') },
    { id: 'calendar', label: tx('Naptár'), icon: <Calendar className="h-3.5 w-3.5" />, hint: tx('Események, határidők és emlékeztetők kezelése vagy .ics naptárfájl beolvasása.') },
    { id: 'smarthome', label: tx('Okosotthon'), icon: <Home className="h-3.5 w-3.5" />, hint: tx('Home Assistant és MQTT eszközök (lámpák, szenzorok, kapcsolók) állapotának lekérdezése és vezérlése.') },
    { id: 'repos', label: tx('Kódfigyelő'), icon: <GitBranch className="h-3.5 w-3.5" />, hint: tx('GitHub projektek követése, hogy azonnal lásd az új változtatásokat.') },
    { id: 'watchdog_media', label: tx('Weboldal-figyelő & Hang/YouTube'), icon: <Eye className="h-3.5 w-3.5" />, hint: tx('Weboldalak változásainak figyelése, hangjegyzetek szöveggé alakítása és YouTube videók összegzése.') },
    { id: 'journal', label: tx('Napi Napló'), icon: <BookOpen className="h-3.5 w-3.5" />, hint: tx('Hangulat, energiaszint és napi gondolatok feljegyzése.') },
    { id: 'lists_subs', label: tx('Bevásárlólista & Előfizetések'), icon: <ListChecks className="h-3.5 w-3.5" />, hint: tx('Közös listák (pl. bevásárlás) és havi előfizetések, lejárati határidők nyomon követése.') },
    { id: 'habits', label: tx('Szokások & Fókusz'), icon: <Timer className="h-3.5 w-3.5" />, hint: tx('Napi jó szokások pipálása és fókuszidőzítő (Pomodoro) elindítása.') },
    { id: 'expenses', label: tx('Kiadások & CSV'), icon: <Wallet className="h-3.5 w-3.5" />, hint: tx('Napi költések rögzítése vagy banki CSV kivonat gyors összesítése.') },
    { id: 'life_portal', label: tx('Ismerősök, Csomagok & Valuta'), icon: <Package className="h-3.5 w-3.5" />, hint: tx('Személyes névjegyek, csomagkövetés, heti étrend, devizaváltó és nyilvános megosztási linkek.') },
    { id: 'life_os_b4', label: tx('Okmányszéf, Árfigyelő & Receptek'), icon: <CheckCircle2 className="h-3.5 w-3.5" />, hint: tx('Garanciák és iratok lejárati figyelője, webshop árfigyelés, otthoni hozzávalókból receptötletek és céltervező.') },
    { id: 'bundle', label: tx('Adatmentés Export/Import'), icon: <Download className="h-3.5 w-3.5" />, hint: tx('Beállítások és adatok biztonságos (jelszavak és kulcsok nélküli) mentése vagy áttöltése fájlba.') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2">
        {tabs.map((tabItem) => (
          <div key={tabItem.id} className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setTab(tabItem.id);
                setStatusMsg(null);
                if (tabItem.id === 'lists_subs') {
                  void loadSubSummary();
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                tab === tabItem.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tabItem.icon}
              {tabItem.label}
            </button>
            <InfoHint theme="light" label={tabItem.label} description={tabItem.hint} />
          </div>
        ))}
      </div>

      {statusMsg && (
        <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">{statusMsg}</div>
      )}

      {tab === 'workflows' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{tx('Automatizált Munkafolyamatok (Trigger → Feltétel → Többlépcsős Művelet)')}</h2>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/smarthome/ha/evaluate', { method: 'POST' });
                const d = (await r.json()) as { triggered?: number };
                setStatusMsg(tx('Home Assistant trigger kiértékelés kész: {0} folyamat indult.', d.triggered ?? 0));
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {tx('HA Trigger Kiértékelés')}
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
              placeholder={tx('Munkafolyamat neve')}
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
            <select
              value={wfTrigger}
              onChange={(e) => setWfTrigger(e.target.value as typeof wfTrigger)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="manual">{tx('Manuális')}</option>
              <option value="cron">{tx('Időzített (perc)')}</option>
              <option value="webhook">{tx('Webhook')}</option>
              <option value="uptime_down">{tx('Uptime hiba')}</option>
              <option value="feed_item">{tx('Új RSS hír')}</option>
              <option value="ha_state">{tx('Home Assistant állapot')}</option>
            </select>
            <input
              type="text"
              value={wfTrigCfg}
              onChange={(e) => setWfTrigCfg(e.target.value)}
              placeholder={wfTrigger === 'ha_state' ? tx('pl. sensor.temp>28') : tx('Intervallum (perc)')}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <select
              value={wfAction}
              onChange={(e) => setWfAction(e.target.value as typeof wfAction)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="agent_prompt">{tx('Ágens futtatás')}</option>
              <option value="kanban_create">{tx('Kanban kártya')}</option>
              <option value="notify">{tx('Telegram értesítés')}</option>
            </select>
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">
              {tx('+ Létrehozás')}
            </button>
            <input
              type="text"
              value={wfCond}
              onChange={(e) => setWfCond(e.target.value)}
              placeholder={tx('Feltétel kulcsszó (opcionális)')}
              className="sm:col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded"
            />
            <input
              type="text"
              value={wfPayload}
              onChange={(e) => setWfPayload(e.target.value)}
              placeholder={tx('Prompt / Üzenet ({{payload}} behelyettesítéssel)...')}
              className="sm:col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
          </form>

          {/* M51 Multi-step sequential workflow pipeline builder */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {tx('Többlépcsős Munkafolyamat Lánc ({0} lépés · opcionális, {{prev}} továbbadással)', wfSteps.length)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
              <select
                value={stepType}
                onChange={(e) => setStepType(e.target.value as WorkflowStep['type'])}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="web_search">{tx('Web Keresés')}</option>
                <option value="http_call">{tx('HTTP Hívás')}</option>
                <option value="agent_prompt">{tx('Ágens Prompt')}</option>
                <option value="kanban_create">{tx('Kanban Létrehozás')}</option>
                <option value="notify">{tx('Telegram Értesítés')}</option>
              </select>
              <input
                type="text"
                value={stepTarget}
                onChange={(e) => setStepTarget(e.target.value)}
                placeholder={tx('Cél (ágens ID / URL / opc.)')}
                className="px-2 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <input
                type="text"
                value={stepPayload}
                onChange={(e) => setStepPayload(e.target.value)}
                placeholder={tx('Lépés tartalma ({{prev}} / {{payload}})...')}
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
                {tx('+ Lépés')}
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
              <p className="text-xs text-slate-500">{tx('Nincs még felvett munkafolyamat.')}</p>
            ) : (
              state.workflows.map((wf) => (
                <div key={wf.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {wf.name} · <span className="font-mono text-slate-600">{wf.triggerType}{wf.triggerConfig ? `(${wf.triggerConfig})` : ''} → {wf.steps?.length ? tx('{0} lépéses lánc', wf.steps.length) : wf.actionType}</span>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {tx('Futások:')} {wf.runCount} · {tx('Utolsó:')} {wf.lastStatus || tx('még nem futott')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await fetch(`/api/workflows/${wf.id}/run`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ payload: tx('Manuális tesztindítás') }),
                        });
                        const d = (await r.json()) as { status?: string; output?: string };
                        setStatusMsg(tx('Workflow eredmény: {0} — {1}', d.status || '', d.output || ''));
                        await onRefreshState();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3 w-3" />
                      {tx('Futtatás')}
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
          <h2 className="text-base font-semibold text-slate-900">{tx('Egyéni Bejövő Webhookok (/hooks/:slug)')}</h2>
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
              placeholder={tx('slug (pl. github-push)')}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
            />
            <input
              type="text"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              placeholder={tx('Webhook neve')}
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
              {tx('+ Webhook felvétel')}
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
                  <div className="font-mono text-[11px] text-slate-500">{tx('Hívások:')} {h.hitCount} · {tx('Titkos kulcs:')} {h.hasSecret ? tx('Beállítva') : tx('Nincs')}</div>
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
            <h2 className="text-base font-semibold text-slate-900">{tx('RSS / Atom Hírfigyelő & Napi Briefing')}</h2>
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
                {tx('Frissítés')}
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
                {tx('AI Briefing Generálása')}
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
              placeholder={tx('Feed neve')}
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
              {tx('+ Feed')}
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
            <h2 className="text-base font-semibold text-slate-900">{tx('IMAP Beállítás & Beérkező E-mailek')}</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <input type="text" value={emImapHost} onChange={(e) => setEmImapHost(e.target.value)} placeholder={tx('IMAP host (pl. imap.gmail.com)')} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="number" value={emImapPort} onChange={(e) => setEmImapPort(Number(e.target.value))} placeholder="993" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="text" value={emSmtpHost} onChange={(e) => setEmSmtpHost(e.target.value)} placeholder={tx('SMTP host (pl. smtp.gmail.com)')} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="number" value={emSmtpPort} onChange={(e) => setEmSmtpPort(Number(e.target.value))} placeholder="465" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="text" value={emUser} onChange={(e) => setEmUser(e.target.value)} placeholder={tx('E-mail / felhasználónév')} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="password" value={emPass} onChange={(e) => setEmPass(e.target.value)} placeholder={state.emailConfig.hasPassword ? tx('App jelszó (tárolva)') : tx('App jelszó')} className="px-2.5 py-1.5 border border-slate-300 rounded" />
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
                  setStatusMsg(tx('Email beállítások mentve a titkosított tárolóba.'));
                  await onRefreshState();
                }}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded"
              >
                {tx('Konfig Mentése')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/email/sync', { method: 'POST' });
                  const d = (await r.json()) as { ok: boolean; error?: string; emails: unknown[] };
                  setStatusMsg(d.ok ? tx('IMAP szinkron kész: {0} levél.', d.emails.length) : tx('IMAP hiba: {0}', d.error ?? ''));
                  await onRefreshState();
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded"
              >
                {tx('IMAP Szinkron')}
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
                        body: d.ok ? d.body || tx('(üres levéltörzs)') : d.error || tx('Nem sikerült betölteni a levelet.'),
                      });
                    } finally {
                      setLoadingEmailUid(null);
                    }
                  }}
                  className="w-full text-start p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs transition-colors"
                >
                  <div className="font-semibold truncate flex items-center justify-between gap-2">
                    <span className="truncate">{em.subject}</span>
                    {loadingEmailUid === em.uid && <span className="font-mono text-[10px] text-slate-500">{tx('Betöltés...')}</span>}
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
                    {tx('Válasz')}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-slate-700 max-h-40 overflow-y-auto">{selectedEmail.body}</pre>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">{tx('E-mail Küldés (SMTP · Jóváhagyással)')}</h2>
            <input type="email" value={emTo} onChange={(e) => setEmTo(e.target.value)} placeholder={tx('Címzett e-mail...')} className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="text" value={emSubject} onChange={(e) => setEmSubject(e.target.value)} placeholder={tx('Tárgy...')} className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            {emInReplyTo && (
              <div className="text-[11px] font-mono text-slate-500 flex items-center justify-between">
                <span>{tx('Válasz hivatkozás: {0}', emInReplyTo)}</span>
                <button type="button" onClick={() => setEmInReplyTo('')} className="underline">{tx('Törlés')}</button>
              </div>
            )}
            <textarea rows={5} value={emBody} onChange={(e) => setEmBody(e.target.value)} placeholder={tx('Üzenet...')} className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
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
                setStatusMsg(d.message || d.error || tx('Küldve'));
                setEmInReplyTo('');
              }}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
            >
              {tx('Küldés SMTP-vel')}
            </button>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{tx('Naptár Események, Emlékeztetők & ICS Import')}</h2>
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
            <input type="text" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder={tx('Esemény címe')} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="datetime-local" value={calStart} onChange={(e) => setCalStart(e.target.value)} className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="number" min="0" value={calRem} onChange={(e) => setCalRem(Number(e.target.value))} placeholder={tx('Értesítés előtte (perc)')} className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">{tx('+ Esemény')}</button>
          </form>

          <div className="flex gap-2">
            <textarea rows={2} value={icsText} onChange={(e) => setIcsText(e.target.value)} placeholder={tx('VEVENT / .ics tartalom beillesztése importáláshoz...')} className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
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
                setStatusMsg(tx('{0} ICS esemény importálva.', d.imported));
                setIcsText('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded"
            >
              {tx('ICS Import')}
            </button>
          </div>

          <div className="space-y-2">
            {state.calendarEvents.map((ev) => (
              <div key={ev.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold">{ev.title}</span> · <span className="font-mono">{new Date(ev.startAt).toLocaleString(intlLocale)}</span> · {tx('{0} p előtt', ev.reminderMinutes)}
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
            <h2 className="text-base font-semibold text-slate-900">{tx('Okosotthon (Home Assistant REST & MQTT)')}</h2>
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/smarthome/ha/states');
                const d = (await r.json()) as { ok: boolean; entities: Array<{ entity_id: string; state: string }>; error?: string };
                if (d.ok) setHaStates(d.entities);
                else setStatusMsg(d.error || tx('HA nem érhető el'));
              }}
              className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded"
            >
              {tx('HA Entitások Lekérése')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" value={mqttTopic} onChange={(e) => setMqttTopic(e.target.value)} placeholder="MQTT Topic" className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="text" value={mqttMsg} onChange={(e) => setMqttMsg(e.target.value)} placeholder={tx('MQTT Üzenet')} className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/smarthome/mqtt/publish', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ topic: mqttTopic, message: mqttMsg }),
                });
                const d = (await r.json()) as { message?: string };
                setStatusMsg(d.message || tx('MQTT küldve'));
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded"
            >
              {tx('MQTT Publikálás')}
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
            <input type="text" value={shName} onChange={(e) => setShName(e.target.value)} placeholder={tx('Eszköz neve')} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
            <select value={shKind} onChange={(e) => setShKind(e.target.value as typeof shKind)} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white">
              <option value="home_assistant">Home Assistant</option>
              <option value="mqtt">MQTT Topic</option>
            </select>
            <input type="text" value={shEntity} onChange={(e) => setShEntity(e.target.value)} placeholder={tx('light.nappali vagy topic')} className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">{tx('+ Mentés')}</button>
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
                    {tx('Átkapcsolás')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'repos' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{tx('Figyelt GitHub Repository-k')}</h2>
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
            <input type="text" value={repoSlug} onChange={(e) => setRepoSlug(e.target.value)} placeholder={tx('owner/repo (pl. ngabika/NovaSwarmNextGenHydrogen)')} className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="text" value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="main" className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">{tx('+ Figyelés')}</button>
          </form>
          <div className="space-y-2">
            {state.watchedRepos.map((r) => (
              <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <div className="font-mono font-semibold">{r.slug} ({r.branch})</div>
                  <div className="text-slate-600">
                    {r.lastCommitSha ? `${r.lastCommitSha} · ${r.lastCommitMsg}` : r.lastError || tx('Szinkronra vár')}
                    {typeof r.openIssuesCount === 'number' ? ` · ${tx('Nyitott issue: {0}', r.openIssuesCount)}` : ''}
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
                    {tx('Szinkron')}
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
            <h2 className="text-base font-semibold text-slate-900">{tx('Napi Szokások Követése')}</h2>
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
              <input type="text" value={habName} onChange={(e) => setHabName(e.target.value)} placeholder={tx('Szokás neve (pl. Olvasás)')} className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="number" min="1" max="7" value={habTarget} onChange={(e) => setHabTarget(Number(e.target.value))} className="w-16 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">{tx('+ Felvétel')}</button>
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
                      className="flex items-center gap-2 text-start"
                    >
                      <CheckCircle2 className={`h-4 w-4 ${done ? 'text-emerald-700' : 'text-slate-300'}`} />
                      <span className={done ? 'line-through text-slate-500' : 'font-medium text-slate-900'}>{h.name}</span>
                      <span className="font-mono text-[11px] text-slate-500">({tx('{0} nap · {1} perc', h.completedDates.length, h.totalMinutes)})</span>
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
            <h2 className="text-base font-semibold text-slate-900">{tx('Pomodoro & Fókusz Napló')}</h2>
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
                {tx('Rögzítés')}
              </button>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {state.focusSessions.map((f) => (
                <div key={f.id} className="p-2 bg-slate-50 border border-slate-200 rounded text-xs flex justify-between font-mono">
                  <span>{f.label}</span>
                  <span>{tx('{0} perc', f.minutes)} · {new Date(f.completedAt).toLocaleTimeString(intlLocale)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{tx('Személyes Kiadáskövető & CSV Banki Import')}</h2>
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
            <input type="text" value={expMerchant} onChange={(e) => setExpMerchant(e.target.value)} placeholder={tx('Partner / Bolt (pl. SPAR)')} className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="number" step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder={tx('Összeg')} className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <input type="text" value={expCurrency} onChange={(e) => setExpCurrency(e.target.value)} className="w-20 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
            <button type="submit" className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded inline-flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" />
              {tx('Rögzítés')}
            </button>
          </form>

          <div className="flex gap-2">
            <textarea rows={2} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={tx('CSV sorok (dátum;partner;összeg)...')} className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
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
                setStatusMsg(tx('{0} kiadási tétel importálva és kategorizálva.', d.imported));
                setCsvText('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded"
            >
              {tx('CSV Import')}
            </button>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-start text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1.5">{tx('Dátum')}</th>
                  <th className="py-1.5">{tx('Partner')}</th>
                  <th className="py-1.5">{tx('Kategória')}</th>
                  <th className="py-1.5 text-end">{tx('Összeg')}</th>
                  <th className="py-1.5 text-end"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td className="py-1.5 font-mono text-slate-600">{ex.date}</td>
                    <td className="py-1.5 font-medium">{ex.merchant}</td>
                    <td className="py-1.5 text-slate-600">{ex.category}</td>
                    <td className="py-1.5 text-end font-mono tabular-nums">
                      {ex.amount.toLocaleString(intlLocale)} {ex.currency}
                    </td>
                    <td className="py-1.5 text-end">
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
                {tx('Weboldal Változás-figyelő (Watchdog)')}
              </h2>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch('/api/watchdog/check', { method: 'POST' });
                  const d = (await r.json()) as { pages?: unknown[] };
                  setStatusMsg(tx('Oldalellenőrzés lefutott ({0} figyelt URL).', d.pages?.length ?? 0));
                  await onRefreshState();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {tx('Mind Ellenőrzése')}
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
              <input type="text" value={wpName} onChange={(e) => setWpName(e.target.value)} placeholder={tx('Oldal neve (pl. Árlista)')} className="w-48 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="url" value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://example.com/status" className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">{tx('+ Figyelés')}</button>
            </form>
            <div className="space-y-2">
              {state.watchedPages.length === 0 ? (
                <p className="text-xs text-slate-500">{tx('Nincs még figyelt weboldal.')}</p>
              ) : (
                state.watchedPages.map((p) => (
                  <div key={p.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{p.name} · <span className="font-mono text-slate-500">{p.url}</span></div>
                      <div className="font-mono tabular-nums text-[11px] text-slate-600">
                        {tx('Változások: {0}', p.changeCount)} · {tx('Utolsó ellenőrzés:')} {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString(intlLocale) : '-'}
                        {p.lastError ? ` · ${tx('Hiba: {0}', p.lastError)}` : ''}
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
                {tx('Podcast & Hanganyag Fejezet-elemző')}
              </h3>
              <input
                type="text"
                value={audioTitle}
                onChange={(e) => setAudioTitle(e.target.value)}
                placeholder={tx('Hanganyag címe')}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={audioSaveVault} onChange={(e) => setAudioSaveVault(e.target.checked)} />
                {tx('Mentés a napi Obsidian jegyzetbe is')}
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
                        setStatusMsg(d.error || tx('Hangfeldolgozási hiba.'));
                      }
                    } finally {
                      setAudioBusy(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="block w-full text-xs text-slate-600 file:me-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:bg-slate-50"
              />
              {audioBusy && <div className="text-xs font-mono text-slate-500">{tx('Hanganyag átírása és fejezetezése...')}</div>}
              {audioResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="font-mono text-slate-600">{tx('Motor: {0}', audioResult.engine)}{audioResult.obsidianPath ? ` · Vault: ${audioResult.obsidianPath}` : ''}</div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 max-h-44 overflow-y-auto">{audioResult.summaryMarkdown}</pre>
                </div>
              )}
            </div>

            {/* Ú44: YouTube Video Analyzer + SM-2 Flashcard Generator */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Youtube className="h-4 w-4 text-slate-700" />
                {tx('YouTube Videó Elemző & SM-2 Kártya Készítő')}
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
                      setStatusMsg(d.error || tx('YouTube elemzési hiba.'));
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
                    {tx('SM-2 tanulókártyák automatikus létrehozása')}
                  </label>
                  <button
                    type="submit"
                    disabled={ytBusy}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {ytBusy ? tx('Elemzés...') : tx('Videó Elemzése')}
                  </button>
                </div>
              </form>
              {ytResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-900">{ytResult.title}</div>
                  <div className="font-mono text-[11px] text-slate-600">{tx('Létrehozott tanulókártyák: {0}', ytResult.createdCardsCount)}</div>
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
              {tx('Második Agy — Napi Napló (Obsidian Szinkronnal)')}
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
                  setStatusMsg(tx('Napi napló mentve az Obsidian Vaultba.'));
                  await onRefreshState();
                }
              }}
              className="space-y-2.5 text-xs"
            >
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-slate-600">{tx('Dátum')}</span>
                  <input type="date" value={jrDate} onChange={(e) => setJrDate(e.target.value)} className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600">{tx('Hangulat (1–5)')}</span>
                  <input type="number" min="1" max="5" value={jrMood} onChange={(e) => setJrMood(Number(e.target.value))} className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded" />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600">{tx('Energia (1–5)')}</span>
                  <input type="number" min="1" max="5" value={jrEnergy} onChange={(e) => setJrEnergy(Number(e.target.value))} className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded" />
                </label>
              </div>
              <input type="text" value={jrGoals} onChange={(e) => setJrGoals(e.target.value)} placeholder={tx('Mai fő célok (vesszővel elválasztva)...')} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <textarea rows={2} value={jrCompleted} onChange={(e) => setJrCompleted(e.target.value)} placeholder={tx('Elvégzett feladatok és sikerek...')} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <textarea rows={2} value={jrNotes} onChange={(e) => setJrNotes(e.target.value)} placeholder={tx('Gondolatok, tanulságok, hála...')} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
              <button type="submit" className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg">
                {tx('Naplóbejegyzés Mentése')}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">{tx('Korábbi Naplóbejegyzések ({0})', state.dailyJournals.length)}</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {state.dailyJournals.length === 0 ? (
                <p className="text-xs text-slate-500">{tx('Még nincs rögzített naplóbejegyzés.')}</p>
              ) : (
                state.dailyJournals.map((j) => (
                  <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                    <div className="flex flex-wrap justify-between gap-2 font-mono">
                      <span className="font-semibold text-slate-900">{j.date}</span>
                      <span className="tabular-nums text-slate-600">{tx('Hangulat: {0}/5 · Energia: {1}/5', j.mood, j.energy)}</span>
                    </div>
                    {j.topGoals.length > 0 && <div className="text-slate-800">{tx('Célok:')} {j.topGoals.join(' · ')}</div>}
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
                {tx('Megosztott Listák (Telegram /lista szinkron)')}
              </h2>
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/lists/default');
                  await onRefreshState();
                }}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {tx('Alaplista')}
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!listItemText.trim()) return;
                await fetch('/api/lists/items', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ listIdOrName: listName.trim() || tx('Bevásárlólista'), text: listItemText.trim(), addedBy: 'Web' }),
                });
                setListItemText('');
                await onRefreshState();
              }}
              className="flex flex-wrap gap-2"
            >
              <input type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder={tx('Lista neve')} className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <input type="text" value={listItemText} onChange={(e) => setListItemText(e.target.value)} placeholder={tx('Új tétel (pl. Tej 2L)...')} className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">{tx('+ Tétel')}</button>
            </form>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {state.sharedLists.length === 0 ? (
                <p className="text-xs text-slate-500">{tx('Adj hozzá egy tételt a megosztott lista létrehozásához.')}</p>
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
                          className="flex items-center gap-2 text-start min-w-0"
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
                {tx('Előfizetések & Garanciák')}
              </h2>
              <button
                type="button"
                onClick={() => void loadSubSummary()}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {tx('Összesítő Frissítése')}
              </button>
            </div>
            {subSummary && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono tabular-nums flex flex-wrap justify-between gap-2">
                <span>
                  {tx('Havi átlag:')}{' '}
                  {Object.entries(subSummary.monthlyByCurrency)
                    .map(([cur, val]) => `${val} ${cur}`)
                    .join(' · ') || '0'}
                </span>
                <span>{tx('Közelgő lejáratok: {0}', subSummary.upcomingRenewals.length)}</span>
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
              <input type="text" value={subName} onChange={(e) => setSubName(e.target.value)} placeholder={tx('Név (pl. Hetzner / Garancia)')} className="col-span-2 px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="text" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder={tx('Kategória')} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <select value={subCycle} onChange={(e) => setSubCycle(e.target.value as typeof subCycle)} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                <option value="monthly">{tx('Havi')}</option>
                <option value="yearly">{tx('Éves')}</option>
                <option value="once">{tx('Egyszeri / Garancia')}</option>
              </select>
              <input type="number" step="0.01" value={subAmount} onChange={(e) => setSubAmount(e.target.value)} placeholder={tx('Összeg')} className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="text" value={subCurrency} onChange={(e) => setSubCurrency(e.target.value)} placeholder="HUF" className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <input type="date" aria-label={tx('Következő esedékesség')} value={subDueDate} onChange={(e) => setSubDueDate(e.target.value)} className="px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
              <div className="flex items-center gap-1 px-2 py-1.5 border border-slate-300 rounded bg-white">
                <input type="number" min="0" aria-label={tx('Értesítés ennyi nappal előtte')} title={tx('Értesítés ennyi nappal lejárat előtt')} value={subReminderDays} onChange={(e) => setSubReminderDays(Number(e.target.value))} className="w-10 font-mono outline-none" />
                <span className="text-[11px] text-slate-500 whitespace-nowrap">{tx('nap előtte')}</span>
              </div>
              <input type="text" value={subNotes} onChange={(e) => setSubNotes(e.target.value)} placeholder={tx('Megjegyzés (opcionális)')} className="col-span-2 sm:col-span-3 px-2.5 py-1.5 border border-slate-300 rounded" />
              <button type="submit" className="px-3 py-1.5 font-medium bg-slate-900 text-white rounded whitespace-nowrap shrink-0">{tx('+ Mentés')}</button>
            </form>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {state.subscriptions.map((sub) => (
                <div key={sub.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{sub.name} · <span className="text-slate-600">{sub.category}</span></div>
                    <div className="font-mono tabular-nums text-[11px] text-slate-500">
                      {sub.amount} {sub.currency} ({sub.billingCycle}) · {tx('Következő: {0}', sub.nextDueDate)}
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
              <h2 className="text-base font-semibold text-slate-900">{tx('Ágens, Skill & Workflow Csomag Export / Import')}</h2>
              <p className="text-xs text-slate-500">{tx('Titkoktól és API kulcsoktól teljesen megtisztított hordozható JSON csomag.')}</p>
            </div>
            <a
              href="/api/bundle/export"
              download="novaswarm-bundle.json"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
            >
              <Download className="h-3.5 w-3.5" />
              {tx('Csomag Letöltése (.json)')}
            </a>
          </div>
          <textarea
            rows={6}
            value={bundleJson}
            onChange={(e) => setBundleJson(e.target.value)}
            placeholder={tx('Illeszd be egy korábban exportált NovaSwarm csomag JSON tartalmát az importáláshoz...')}
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
                  tx('Import kész: {0} ágens, {1} workflow, {2} sablon.', d.importedAgents, d.importedWorkflows, d.importedTemplates)
                );
                await onRefreshState();
              } catch (err) {
                setStatusMsg(err instanceof Error ? err.message : tx('Érvénytelen JSON'));
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {tx('Csomag Importálása')}
          </button>
        </div>
      )}

      {tab === 'life_portal' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">{tx('Életvitel & CRM modul betöltése...')}</div>}>
          <Batch3LifePortalPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}

      {tab === 'life_os_b4' && (
        <Suspense fallback={<div className="p-6 text-xs text-slate-500">{tx('Okmányszéf & Életmód betöltése...')}</div>}>
          <Batch4LifeAndAutopilotPanel state={state} onRefreshState={onRefreshState} />
        </Suspense>
      )}
    </div>
  );
};
