import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Download,
  GitBranch,
  Home,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Timer,
  Trash2,
  Upload,
  Wallet,
  Webhook,
  Workflow,
} from 'lucide-react';
import type { NovaSwarmState } from '../../shared/types';

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
  | 'bundle';

export const EcosystemView: React.FC<Props> = ({ state, onRefreshState }) => {
  const [tab, setTab] = useState<EcoTab>('workflows');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Workflows (Ú17)
  const [wfName, setWfName] = useState('');
  const [wfTrigger, setWfTrigger] = useState<'manual' | 'cron' | 'webhook' | 'uptime_down' | 'feed_item'>('manual');
  const [wfTrigCfg, setWfTrigCfg] = useState('60');
  const [wfCond, setWfCond] = useState('');
  const [wfAction, setWfAction] = useState<'agent_prompt' | 'kanban_create' | 'notify'>('agent_prompt');
  const [wfPayload, setWfPayload] = useState('');

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

  // Bundle (Ú29)
  const [bundleJson, setBundleJson] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const tabs: Array<{ id: EcoTab; label: string; icon: React.ReactNode }> = [
    { id: 'workflows', label: 'Munkafolyamatok', icon: <Workflow className="h-3.5 w-3.5" /> },
    { id: 'webhooks', label: 'Webhookok', icon: <Webhook className="h-3.5 w-3.5" /> },
    { id: 'rss', label: 'RSS & Briefing', icon: <Rss className="h-3.5 w-3.5" /> },
    { id: 'email', label: 'Email IMAP/SMTP', icon: <Mail className="h-3.5 w-3.5" /> },
    { id: 'calendar', label: 'Naptár & ICS', icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'smarthome', label: 'Okosotthon HA/MQTT', icon: <Home className="h-3.5 w-3.5" /> },
    { id: 'repos', label: 'GitHub Figyelő', icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: 'habits', label: 'Szokások & Fókusz', icon: <Timer className="h-3.5 w-3.5" /> },
    { id: 'expenses', label: 'Pénzügyek & CSV', icon: <Wallet className="h-3.5 w-3.5" /> },
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
          <h2 className="text-base font-semibold text-slate-900">Automatizált Munkafolyamatok (Trigger → Feltétel → Művelet)</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wfName.trim() || !wfPayload.trim()) return;
              await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: wfName,
                  triggerType: wfTrigger,
                  triggerConfig: wfTrigCfg,
                  conditionExpr: wfCond,
                  actionType: wfAction,
                  actionPayload: wfPayload,
                }),
              });
              setWfName('');
              setWfPayload('');
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
            </select>
            <input
              type="text"
              value={wfTrigCfg}
              onChange={(e) => setWfTrigCfg(e.target.value)}
              placeholder="Intervallum (perc)"
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
            <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded">
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

          <div className="space-y-2">
            {state.workflows.length === 0 ? (
              <p className="text-xs text-slate-500">Nincs még felvett munkafolyamat.</p>
            ) : (
              state.workflows.map((wf) => (
                <div key={wf.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {wf.name} · <span className="font-mono text-slate-600">{wf.triggerType} → {wf.actionType}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded"
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
                <div key={em.uid} className="p-2 bg-slate-50 border border-slate-200 rounded text-xs">
                  <div className="font-semibold truncate">{em.subject}</div>
                  <div className="text-[11px] text-slate-500 truncate">{em.from} · {em.date}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">E-mail Küldés (SMTP · Jóváhagyással)</h2>
            <input type="email" value={emTo} onChange={(e) => setEmTo(e.target.value)} placeholder="Címzett e-mail..." className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            <input type="text" value={emSubject} onChange={(e) => setEmSubject(e.target.value)} placeholder="Tárgy..." className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            <textarea rows={5} value={emBody} onChange={(e) => setEmBody(e.target.value)} placeholder="Üzenet..." className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded" />
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/email/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: emTo, subject: emSubject, text: emBody, requireApproval: false }),
                });
                const d = (await r.json()) as { message?: string; error?: string };
                setStatusMsg(d.message || d.error || 'Küldve');
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
    </div>
  );
};
