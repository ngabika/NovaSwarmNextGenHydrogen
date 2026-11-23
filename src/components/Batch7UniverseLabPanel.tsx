import React, { useEffect, useState } from 'react';
import {
  Activity,
  Briefcase,
  Car,
  Check,
  Code2,
  Coins,
  Cpu,
  FileText,
  Globe,
  Luggage,
  Pill,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Repeat,
  Save,
  Search,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import type {
  MediaBacklogItem,
  NovaSwarmState,
  OperatingModeId,
} from '../../shared/types';

interface Props {
  state?: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

type SubPanelId = 'modes_timers' | 'knowledge_lab' | 'homelab_net' | 'finance_life';

const OPERATING_MODES: Array<{ id: OperatingModeId; label: string; hint: string }> = [
  { id: 'normal', label: 'Normál', hint: '15p heartbeat · alapértelmezett' },
  { id: 'focus', label: 'Mély Fókusz', hint: '45p heartbeat · csendes éjszaka' },
  { id: 'travel', label: 'Utazás / Távoli', hint: '30p heartbeat · aktív Telegram' },
  { id: 'emergency', label: 'Vészhelyzeti', hint: '5p heartbeat · azonnali riasztás' },
  { id: 'chill', label: 'Pihenő', hint: '60p heartbeat · kímélő mód' },
];

export const Batch7UniverseLabPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  const [tab, setTab] = useState<SubPanelId>('modes_timers');

  // Tab 1: Modes, Natural Automation, Timers, Top 3, Scratchpad
  const [naturalCmd, setNaturalCmd] = useState('ha a ram 85% felett akkor tisztítás');
  const [naturalOut, setNaturalOut] = useState<string | null>(null);
  const [timerExpr, setTimerExpr] = useState('10p tészta');
  const [timerErr, setTimerErr] = useState<string | null>(null);
  const [top3Draft, setTop3Draft] = useState('');
  const [scratchDraft, setScratchDraft] = useState(state?.sharedScratchpad || '');
  const [scratchSaved, setScratchSaved] = useState<string | null>(null);

  useEffect(() => {
    if (typeof state?.sharedScratchpad === 'string') {
      setScratchDraft(state.sharedScratchpad);
    }
  }, [state?.sharedScratchpad]);

  // Tab 2: QR, Diff, Mindmap/Slides, Regex/Cron, CSV, Decisions, Quotes, Shadow, Retro, Scaffold, Changelog
  const [qrInput, setQrInput] = useState('http://novaswarm.local:3000');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [qrResult, setQrResult] = useState<{ payload: string; svg: string; version: number; modules: number } | null>(null);
  const [diffA, setDiffA] = useState('port=3000\nmode=normal\ncache=off');
  const [diffB, setDiffB] = useState('port=3000\nmode=focus\ncache=on');
  const [diffResult, setDiffResult] = useState<{
    added: number;
    removed: number;
    unchanged: number;
    lines: Array<{ type: 'same' | 'del' | 'add'; text: string }>;
  } | null>(null);
  const [regexKind, setRegexKind] = useState<'regex' | 'cron'>('cron');
  const [regexPattern, setRegexPattern] = useState('*/15 8-18 * * 1-5');
  const [regexText, setRegexText] = useState('IP: 192.168.1.50');
  const [regexOut, setRegexOut] = useState<string | null>(null);
  const [csvRaw, setCsvRaw] = useState('nap,fogyasztas_kwh,koltseg_huf\nHetfo,8.4,590\nKedd,9.1,637\nSzerda,7.8,546');
  const [csvStats, setCsvStats] = useState<Array<{ column: string; min: number; max: number; avg: number; sum: number }> | null>(null);
  const [slideTitle, setSlideTitle] = useState('NovaSwarm Rendszerbemutató');
  const [slideBody, setSlideBody] = useState('## 1. Architektúra\n- Teljes helyi kontroll\n- Telegram + Web UI\n---\n## 2. Hardver Adaptáció\n- Pi 2GB optimalizálás\n- SSH 1-lépéses költöztető');
  const [slideMsg, setSlideMsg] = useState<string | null>(null);
  const [decTitle, setDecTitle] = useState('');
  const [decChoice, setDecChoice] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [autonomyInsight, setAutonomyInsight] = useState<string | null>(null);
  const [scaffoldKind, setScaffoldKind] = useState<'node-ts' | 'react-vite' | 'python-fastapi' | 'esp32'>('node-ts');
  const [scaffoldName, setScaffoldName] = useState('homelab-sensor');
  const [scaffoldFiles, setScaffoldFiles] = useState<Array<{ path: string; content: string }>>([]);

  // Tab 3: Port Scan, UDP Ping, Journal, RAM/ZRAM, SQLite, npm audit, Webhook Replay, Drop Tokens, Migration Dry-Run
  const [scanHost, setScanHost] = useState('127.0.0.1');
  const [scanBusy, setScanBusy] = useState(false);
  const [sysDiagOut, setSysDiagOut] = useState<string | null>(null);
  const [dropFileName, setDropFileName] = useState('');
  const [dropLinkOut, setDropLinkOut] = useState<string | null>(null);
  const [replayMsg, setReplayMsg] = useState<string | null>(null);

  // Tab 4: Rates, Fixed Expenses, Savings, Fuel, Meds, Trips, Lent, Media Backlog, Official Letter
  const [rateMsg, setRateMsg] = useState<string | null>(null);
  const [fixName, setFixName] = useState('');
  const [fixAmount, setFixAmount] = useState('');
  const [savTitle, setSavTitle] = useState('');
  const [savTarget, setSavTarget] = useState('');
  const [fuelKm, setFuelKm] = useState('520');
  const [fuelLiters, setFuelLiters] = useState('34.5');
  const [fuelCost, setFuelCost] = useState('21500');
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('1000 IU');
  const [medTime, setMedTime] = useState('08:00');
  const [tripDest, setTripDest] = useState('');
  const [tripStart, setTripStart] = useState(new Date().toISOString().slice(0, 10));
  const [tripEnd, setTripEnd] = useState(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  const [lentItemName, setLentItemName] = useState('');
  const [lentPerson, setLentPerson] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaKind, setMediaKind] = useState<MediaBacklogItem['kind']>('book');
  const [letterKind, setLetterKind] = useState<'felmondas' | 'reklamacio' | 'kerelem' | 'meghatalmazas'>('reklamacio');
  const [letterRecipient, setLetterRecipient] = useState('');
  const [letterSubject, setLetterSubject] = useState('');
  const [letterPoints, setLetterPoints] = useState('');
  const [letterResult, setLetterResult] = useState<string | null>(null);

  const activeMode = state?.settings.operatingMode || 'normal';
  const timers = state?.countdownTimers || [];
  const top3 = state?.dailyTop3;
  const portScans = state?.lanPortScans || [];
  const webhookHistory = state?.webhookHistory || [];
  const dropTokens = state?.dropShareTokens || [];
  const rates = state?.currencyRates;
  const fixedExpenses = state?.fixedExpenses || [];
  const fixedTotal = fixedExpenses.reduce((acc, f) => acc + f.amount, 0);
  const fixedPaid = fixedExpenses.filter((f) => f.paidThisMonth).reduce((acc, f) => acc + f.amount, 0);
  const fixedRemaining = Math.max(0, fixedTotal - fixedPaid);
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleSetMode = async (mode: OperatingModeId) => {
    await fetch('/api/v7/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    await onRefreshState();
  };

  const handleNaturalParse = async (e: React.FormEvent) => {
    e.preventDefault();
    setNaturalOut(null);
    const res = await fetch('/api/v7/natural-parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: naturalCmd }),
    });
    const data = (await res.json()) as { ok?: boolean; summary?: string; error?: string };
    setNaturalOut(data.ok ? data.summary || 'Kész.' : `Hiba: ${data.error}`);
    await onRefreshState();
  };

  const handleCreateTimer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTimerErr(null);
    const res = await fetch('/api/v7/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expr: timerExpr }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      setTimerErr(data.error || 'Hiba az időzítő indításakor.');
      return;
    }
    setTimerExpr('');
    await onRefreshState();
  };

  const handleSaveScratch = async () => {
    setScratchSaved(null);
    const res = await fetch('/api/v7/scratchpad', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: scratchDraft }),
    });
    if (res.ok) {
      setScratchSaved('Szinkronizálva');
      await onRefreshState();
    }
  };

  const handleGenerateQr = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v7/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: qrInput,
        wifiSsid: wifiSsid.trim() || undefined,
        wifiPassword: wifiPass || undefined,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; payload?: string; svg?: string; version?: number; modules?: number };
    if (data.ok && data.svg) {
      setQrResult({
        payload: data.payload || '',
        svg: data.svg,
        version: data.version || 1,
        modules: data.modules || 21,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Univerzális OS, Tudás Labor & Személyes Élet-központ
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Üzemmód: {activeMode} · Aktív időzítők: {timers.filter((t) => !t.completed).length} · Árfolyam:{' '}
            {rates?.rates?.HUF ? `${rates.rates.HUF.toFixed(1)} HUF/EUR` : 'nincs lekérve'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: 'modes_timers', label: 'Módok, Jegyzet & Időzítők' },
              { id: 'knowledge_lab', label: 'Tudás & AI Labor' },
              { id: 'homelab_net', label: 'Homelab, IoT & Hálózat' },
              { id: 'finance_life', label: 'Pénzügy & Élet-OS' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: MODES, NATURAL PARSER, TIMERS, TOP 3, SHARED SCRATCHPAD      */}
      {/* =================================================================== */}
      {tab === 'modes_timers' && (
        <div className="space-y-6">
          {/* Operating Modes */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Intelligens Üzemmód Profilok
              </h3>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Aktív: {activeMode}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {OPERATING_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void handleSetMode(m.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    activeMode === m.id
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-xs font-semibold whitespace-nowrap">{m.label}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      activeMode === m.id ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500'
                    }`}
                  >
                    {m.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Natural Automation Parser + Timers */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Magyar Természetes Szabály & Időzítő (/ha)
              </h3>
              <form onSubmit={handleNaturalParse} className="flex gap-2">
                <label htmlFor="b7-nat-cmd" className="sr-only">
                  Magyar automatizálási utasítás
                </label>
                <input
                  id="b7-nat-cmd"
                  type="text"
                  value={naturalCmd}
                  onChange={(e) => setNaturalCmd(e.target.value)}
                  placeholder='pl. "ha a hőmérséklet 75 fok felett akkor telegram riasztás"'
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                >
                  Értelmezés
                </button>
              </form>
              {naturalOut && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono">
                  {naturalOut}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" />
                    Párhuzamos Visszaszámlálók ({timers.length})
                  </span>
                </div>
                <form onSubmit={handleCreateTimer} className="flex gap-2">
                  <label htmlFor="b7-timer-expr" className="sr-only">
                    Időzítő kifejezés
                  </label>
                  <input
                    id="b7-timer-expr"
                    type="text"
                    value={timerExpr}
                    onChange={(e) => setTimerExpr(e.target.value)}
                    placeholder="pl. 10p tészta vagy 45mp tea"
                    className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Indítás
                  </button>
                </form>
                {timerErr && <div className="text-xs text-red-700">{timerErr}</div>}
                {timers.length === 0 ? (
                  <p className="text-xs text-slate-500">Nincs aktív visszaszámláló. Indíts egyet a fenti mezőből.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {timers.map((tm) => (
                      <div
                        key={tm.id}
                        className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{tm.label}</span>
                          <span className="text-slate-500 ml-2 font-mono tabular-nums">
                            · {tm.durationSec}s · {tm.completed ? 'Lejárt' : new Date(tm.endsAt).toLocaleTimeString('hu-HU')}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Törlés: ${tm.label}`}
                          onClick={async () => {
                            await fetch(`/api/v7/timers/${tm.id}`, { method: 'DELETE' });
                            await onRefreshState();
                          }}
                          className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Daily Top 3 + Shared Scratchpad */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Check className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Napi Top 3 Fókusz Feladat
                </h3>
                <div className="flex gap-2">
                  <label htmlFor="b7-top3-input" className="sr-only">
                    Napi Top 3 feladat vesszővel elválasztva
                  </label>
                  <input
                    id="b7-top3-input"
                    type="text"
                    value={top3Draft}
                    onChange={(e) => setTop3Draft(e.target.value)}
                    placeholder="3 fő cél vesszővel elválasztva..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const items = top3Draft.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
                      if (items.length === 0) return;
                      await fetch('/api/v7/top3', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items }),
                      });
                      setTop3Draft('');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Mentés
                  </button>
                </div>
                {top3 && top3.items.length > 0 ? (
                  <div className="space-y-1.5">
                    {top3.items.map((it) => (
                      <label
                        key={it.id}
                        className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={it.done}
                          onChange={async () => {
                            await fetch(`/api/v7/top3/${it.id}/toggle`, { method: 'POST' });
                            await onRefreshState();
                          }}
                        />
                        <span className={it.done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}>
                          {it.text}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Még nincs beállítva a mai Top 3 fókusz lista.</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="b7-shared-scratch" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    LAN Eszközközi Szinkron Jegyzet (Shared Scratchpad)
                  </label>
                  <div className="flex items-center gap-2">
                    {scratchSaved && <span className="text-[11px] text-emerald-700 font-mono">{scratchSaved}</span>}
                    <button
                      type="button"
                      onClick={() => void handleSaveScratch()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <Save className="h-3 w-3" />
                      Szinkron
                    </button>
                  </div>
                </div>
                <textarea
                  id="b7-shared-scratch"
                  rows={4}
                  value={scratchDraft}
                  onChange={(e) => setScratchDraft(e.target.value)}
                  placeholder="Másold ide bármelyik LAN eszközről a megosztani kívánt vázlatot vagy parancsot..."
                  className="w-full p-2.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: KNOWLEDGE & AI LAB (QR, Diff, Regex/Cron, CSV, Slides, Log)   */}
      {/* =================================================================== */}
      {tab === 'knowledge_lab' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Offline Reed-Solomon QR SVG Generator */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <QrCode className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Offline Wi-Fi & URL QR Kód Generátor
              </h3>
              <form onSubmit={handleGenerateQr} className="space-y-2 text-xs">
                <div>
                  <label htmlFor="b7-qr-url" className="block text-[11px] text-slate-500 mb-0.5">
                    Szöveg vagy URL
                  </label>
                  <input
                    id="b7-qr-url"
                    type="text"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="b7-wifi-ssid" className="block text-[11px] text-slate-500 mb-0.5">
                      Wi-Fi SSID (opc.)
                    </label>
                    <input
                      id="b7-wifi-ssid"
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="OtthonWiFi"
                      className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                    />
                  </div>
                  <div>
                    <label htmlFor="b7-wifi-pass" className="block text-[11px] text-slate-500 mb-0.5">
                      Wi-Fi Jelszó (opc.)
                    </label>
                    <input
                      id="b7-wifi-pass"
                      type="text"
                      value={wifiPass}
                      onChange={(e) => setWifiPass(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium whitespace-nowrap"
                >
                  QR Generálása
                </button>
              </form>
              {qrResult && (
                <div className="flex items-center gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <img
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(qrResult.svg)}`}
                    alt={`QR kód: ${qrResult.payload}`}
                    className="w-28 h-28 border border-slate-200 rounded bg-white p-1 shrink-0"
                  />
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 min-w-0 break-all space-y-1">
                    <div>Verzió: v{qrResult.version} ({qrResult.modules}x{qrResult.modules})</div>
                    <div>Tartalom: {qrResult.payload}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Line Diff & Regex/Cron Explainer */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    Dokumentum Diff Összehasonlító
                  </h3>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v7/studio/diff', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ textA: diffA, textB: diffB }),
                      });
                      const d = await r.json();
                      if (d.ok) setDiffResult(d);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap shrink-0"
                  >
                    Összevetés
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <textarea
                    rows={3}
                    aria-label="Szöveg A"
                    value={diffA}
                    onChange={(e) => setDiffA(e.target.value)}
                    className="p-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <textarea
                    rows={3}
                    aria-label="Szöveg B"
                    value={diffB}
                    onChange={(e) => setDiffB(e.target.value)}
                    className="p-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
                {diffResult && (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono space-y-0.5 max-h-32 overflow-y-auto">
                    <div className="text-slate-500 mb-1 tabular-nums">
                      +{diffResult.added} hozzáadva · -{diffResult.removed} törölve · {diffResult.unchanged} változatlan
                    </div>
                    {diffResult.lines.map((l, idx) => (
                      <div
                        key={idx}
                        className={
                          l.type === 'add'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : l.type === 'del'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                        {l.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Elemző típus"
                    value={regexKind}
                    onChange={(e) => setRegexKind(e.target.value as 'regex' | 'cron')}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="cron">Cron magyarázó</option>
                    <option value="regex">Regex tesztelő</option>
                  </select>
                  <input
                    type="text"
                    aria-label="Minta vagy cron kifejezés"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    className="flex-1 min-w-[140px] px-2.5 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
                  />
                  {regexKind === 'regex' && (
                    <input
                      type="text"
                      aria-label="Teszt szöveg"
                      value={regexText}
                      onChange={(e) => setRegexText(e.target.value)}
                      className="flex-1 min-w-[120px] px-2.5 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
                    />
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v7/studio/regex-cron', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ kind: regexKind, pattern: regexPattern, testText: regexText }),
                      });
                      const d = await r.json();
                      setRegexOut(
                        d.ok
                          ? `${d.explanation}${d.matches?.length ? ` · Találatok: ${d.matches.join(', ')}` : ''}`
                          : d.error
                      );
                    }}
                    className="px-3 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Elemzés
                  </button>
                </div>
                {regexOut && <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{regexOut}</div>}
              </div>
            </div>
          </div>

          {/* CSV Playground + Slides Builder + Decision/Quote */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  CSV / JSON Adat Játszótér & Statisztika
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/studio/tabular', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ raw: csvRaw }),
                    });
                    const d = await r.json();
                    if (d.ok) setCsvStats(d.numericStats || []);
                  }}
                  className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap shrink-0"
                >
                  Elemzés
                </button>
              </div>
              <textarea
                rows={4}
                aria-label="CSV vagy JSON adat"
                value={csvRaw}
                onChange={(e) => setCsvRaw(e.target.value)}
                className="w-full p-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
              />
              {csvStats && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse tabular-nums font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                        <th className="py-1">Oszlop</th>
                        <th className="py-1 text-right">Min</th>
                        <th className="py-1 text-right">Átlag</th>
                        <th className="py-1 text-right">Max</th>
                        <th className="py-1 text-right">Össz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvStats.map((st) => (
                        <tr key={st.column} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-1 font-semibold">{st.column}</td>
                          <td className="py-1 text-right">{st.min}</td>
                          <td className="py-1 text-right">{st.avg}</td>
                          <td className="py-1 text-right">{st.max}</td>
                          <td className="py-1 text-right">{st.sum}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Diavetítés (Slide Deck) & Mini-App Publikálás
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/studio/slides', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: slideTitle, source: slideBody, publishMiniApp: true }),
                    });
                    const d = await r.json();
                    if (d.ok && d.miniApp) {
                      setSlideMsg(`Publikálva (${d.slideCount} dia): /apps/${d.miniApp.slug}`);
                      await onRefreshState();
                    }
                  }}
                  className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap shrink-0"
                >
                  Dia Publikálása
                </button>
              </div>
              <input
                type="text"
                aria-label="Prezentáció címe"
                value={slideTitle}
                onChange={(e) => setSlideTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded"
              />
              <textarea
                rows={4}
                aria-label="Prezentáció diák"
                value={slideBody}
                onChange={(e) => setSlideBody(e.target.value)}
                className="w-full p-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
              />
              {slideMsg && <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{slideMsg}</div>}
            </div>
          </div>

          {/* Decisions, Quotes, Shadow Pattern & Scaffold */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Döntési Napló & Idézetgyűjtő ({(state?.decisionLogs || []).length} / {(state?.quoteDeck || []).length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <input
                  type="text"
                  value={decTitle}
                  onChange={(e) => setDecTitle(e.target.value)}
                  placeholder="Döntés tárgya..."
                  className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                />
                <input
                  type="text"
                  value={decChoice}
                  onChange={(e) => setDecChoice(e.target.value)}
                  placeholder="Választott megoldás..."
                  className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!decTitle.trim() || !decChoice.trim()) return;
                    await fetch('/api/v7/decisions', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: decTitle, choiceMade: decChoice }),
                    });
                    setDecTitle('');
                    setDecChoice('');
                    await onRefreshState();
                  }}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded font-medium whitespace-nowrap"
                >
                  + Döntés
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <input
                  type="text"
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  placeholder="Idézet / gondolat..."
                  className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                />
                <input
                  type="text"
                  value={quoteAuthor}
                  onChange={(e) => setQuoteAuthor(e.target.value)}
                  placeholder="Szerző..."
                  className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!quoteText.trim()) return;
                    await fetch('/api/v7/quotes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ quote: quoteText, author: quoteAuthor || 'Saját' }),
                    });
                    setQuoteText('');
                    setQuoteAuthor('');
                    await onRefreshState();
                  }}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded font-medium whitespace-nowrap"
                >
                  + Idézet
                </button>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs">
                {(state?.decisionLogs || []).slice(0, 5).map((d) => (
                  <div key={d.id} className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-semibold">{d.title}</span> → {d.choiceMade}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">{d.reviewDate}</span>
                  </div>
                ))}
                {(state?.quoteDeck || []).slice(0, 4).map((q) => (
                  <div key={q.id} className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded italic text-slate-700 dark:text-slate-300">
                    „{q.quote}” — {q.author}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Code2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Árnyék-Minta Bányász, Retrospektív & Projekt Váz
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v7/autonomy/shadow-patterns');
                      const d = await r.json();
                      const sug = (d.suggestions || []) as Array<{ pattern: string; count: number; recommendedAction: string }>;
                      setAutonomyInsight(
                        sug.length > 0
                          ? sug.map((s) => `(${s.count}x) "${s.pattern}" → ${s.recommendedAction}`).join('\n')
                          : `Átvizsgálva ${d.scannedEvents} esemény: még nincs ismétlődő rutin.`
                      );
                    }}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Minták keresése
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v7/autonomy/retrospective');
                      const d = await r.json();
                      setAutonomyInsight(d.summaryMarkdown || '');
                    }}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Heti Retro
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v7/dev/changelog');
                      const d = await r.json();
                      setAutonomyInsight(d.markdown || '');
                    }}
                    className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Git Changelog
                  </button>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <select
                  aria-label="Projekt sablon típus"
                  value={scaffoldKind}
                  onChange={(e) => setScaffoldKind(e.target.value as typeof scaffoldKind)}
                  className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="node-ts">Node.js + TS</option>
                  <option value="react-vite">React + Vite</option>
                  <option value="python-fastapi">Python FastAPI</option>
                  <option value="esp32">ESP32 PlatformIO</option>
                </select>
                <input
                  type="text"
                  aria-label="Új projekt neve"
                  value={scaffoldName}
                  onChange={(e) => setScaffoldName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/dev/scaffold', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ kind: scaffoldKind, projectName: scaffoldName }),
                    });
                    const d = await r.json();
                    if (d.ok) setScaffoldFiles(d.files || []);
                  }}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded font-medium whitespace-nowrap"
                >
                  Sablon
                </button>
              </div>
              {autonomyInsight && (
                <pre className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {autonomyInsight}
                </pre>
              )}
              {scaffoldFiles.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {scaffoldFiles.map((f) => (
                    <div key={f.path} className="p-2 bg-slate-950 text-slate-100 rounded text-[11px] font-mono">
                      <div className="text-slate-400 mb-0.5">{f.path}</div>
                      <pre className="whitespace-pre-wrap">{f.content}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: HOMELAB, IOT & NETWORK                                       */}
      {/* =================================================================== */}
      {tab === 'homelab_net' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LAN Port Scanner + UDP Discovery */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  LAN Port-Térképező & UDP Peer Discovery
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/net/udp-ping', { method: 'POST' });
                    const d = await r.json();
                    setSysDiagOut(
                      `${d.note}\nHelyi IP-k: ${(d.localInterfaces || []).join(', ') || 'localhost'}\nIsmert csomópontok: ${(d.knownPeers || []).length} db`
                    );
                  }}
                  className="px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  UDP LAN Ping
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setScanBusy(true);
                  try {
                    await fetch('/api/v7/net/port-scan', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ host: scanHost }),
                    });
                    await onRefreshState();
                  } finally {
                    setScanBusy(false);
                  }
                }}
                className="flex gap-2"
              >
                <label htmlFor="b7-scan-host" className="sr-only">
                  Cél IP-cím portvizsgálathoz
                </label>
                <input
                  id="b7-scan-host"
                  type="text"
                  value={scanHost}
                  onChange={(e) => setScanHost(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="submit"
                  disabled={scanBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" />
                  {scanBusy ? 'Vizsgálat...' : 'Port Scan'}
                </button>
              </form>
              {portScans.length === 0 ? (
                <p className="text-xs text-slate-500">Még nem futott portvizsgálat. Teszteld a 127.0.0.1 vagy router IP-címet.</p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {portScans.slice(0, 5).map((ps) => (
                    <div key={ps.id} className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs">
                      <div className="flex justify-between font-mono text-[11px] text-slate-500 mb-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{ps.host}</span>
                        <span className="tabular-nums">{new Date(ps.scannedAt).toLocaleTimeString('hu-HU')}</span>
                      </div>
                      <div className="font-mono text-slate-700 dark:text-slate-300">
                        {ps.openPorts.length > 0
                          ? ps.openPorts.map((p) => `${p.port} (${p.service} · ${p.latencyMs}ms)`).join(' · ')
                          : 'Nincs nyitott alap port.'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deep System Diagnostics: Journal, RAM/ZRAM, SQLite, npm audit, Migration Dry-Run */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Mélységi Gazdagép & Költöztetés Diagnosztika
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/system/journal-anomalies');
                    const d = await r.json();
                    setSysDiagOut(
                      `Forrás: ${d.source} (${d.linesInspected} sor)\nOOM: ${d.counts?.oom} · Error: ${d.counts?.error} · Failed: ${d.counts?.failed}\n${(d.samples || []).slice(0, 5).join('\n')}`
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Journalctl Anomália
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/system/memory-diag');
                    const d = await r.json();
                    setSysDiagOut(
                      `RSS: ${d.processRssMb} MB | Heap: ${d.heapUsedMb}/${d.heapTotalMb} MB\nSwappiness: ${d.swappiness ?? 'N/A'}\nZRAM/Swap:\n${d.zramSummary}`
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  RAM / ZRAM
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/system/sqlite-check', { method: 'POST' });
                    const d = await r.json();
                    setSysDiagOut(`SQLite PRAGMA quick_check: ${d.quickCheck} (${d.ok ? 'ÉP' : 'FIGYELEM'})`);
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  SQLite Quick Check
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/system/npm-audit');
                    const d = await r.json();
                    setSysDiagOut(`npm audit: ${d.summary}`);
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  npm Audit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/migrate/dry-run', { method: 'POST' });
                    const d = await r.json();
                    setSysDiagOut(
                      `Költöztető Szimuláció (Dry-Run): ${d.fileCount} fájl · becsült átviteli méret: ${d.totalMb} MB`
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded font-medium whitespace-nowrap"
                >
                  Költöztető Dry-Run
                </button>
              </div>
              <pre className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono whitespace-pre-wrap min-h-[100px] max-h-48 overflow-y-auto">
                {sysDiagOut || 'Válassz egy diagnosztikai ellenőrzést a fenti gombok közül.'}
              </pre>
            </div>
          </div>

          {/* Webhook Replay & LAN Drop Expiring Share Tokens */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Webhook Replay Napló ({webhookHistory.length})
                </h3>
                {replayMsg && <span className="text-xs font-mono text-emerald-700">{replayMsg}</span>}
              </div>
              {webhookHistory.length === 0 ? (
                <p className="text-xs text-slate-500">Még nem érkezett webhook kérés (/hooks/:slug). Minden bejövő payload visszajátszható lesz itt.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {webhookHistory.slice(0, 10).map((wh) => (
                    <div key={wh.id} className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 truncate font-mono">
                        <span className="font-semibold">/hooks/{wh.slug}</span>
                        <span className="text-slate-500 ml-2">· {wh.replayCount}x replay</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await fetch(`/api/v7/webhooks/${wh.id}/replay`, { method: 'POST' });
                          const d = await r.json();
                          setReplayMsg(d.ok ? 'Újrajátszva' : d.error);
                          await onRefreshState();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        Replay
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Lejáró LAN Drop Letöltési Token (/drop/:token)
              </h3>
              <div className="flex gap-2">
                <label htmlFor="b7-drop-file" className="sr-only">
                  LAN Drop fájlnév
                </label>
                <input
                  id="b7-drop-file"
                  type="text"
                  value={dropFileName}
                  onChange={(e) => setDropFileName(e.target.value)}
                  placeholder="Fájlnév a lan-drop/ mappából..."
                  className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/drop-tokens', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fileName: dropFileName, ttlMinutes: 60, maxDownloads: 5 }),
                    });
                    const d = await r.json();
                    setDropLinkOut(d.ok ? `Megosztási link: ${d.downloadPath}` : `Hiba: ${d.error}`);
                    await onRefreshState();
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap shrink-0"
                >
                  Link generálása
                </button>
              </div>
              {dropLinkOut && <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{dropLinkOut}</div>}
              {dropTokens.length > 0 && (
                <div className="space-y-1 text-[11px] font-mono">
                  {dropTokens.slice(0, 5).map((t) => (
                    <div key={t.token} className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded flex justify-between">
                      <span>/drop/{t.token} ({t.fileName})</span>
                      <span className="tabular-nums">{t.downloads}/{t.maxDownloads}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: FINANCE, HEALTH, TRIPS, FUEL & OFFICIAL LETTERS               */}
      {/* =================================================================== */}
      {tab === 'finance_life' && (
        <div className="space-y-6">
          {/* Currency + Monthly Fixed Expenses + Fuel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Coins className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Élő Deviza Árfolyamok
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/finance/rates/refresh', { method: 'POST' });
                    const d = await r.json();
                    setRateMsg(d.ok ? `1 EUR = ${d.eurToHuf} HUF · 1 USD = ${d.usdToHuf} HUF` : 'Frissítve');
                    await onRefreshState();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <RefreshCw className="h-3 w-3" />
                  Frissítés
                </button>
              </div>
              {rates ? (
                <div className="space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    1 EUR = {rates.rates.HUF?.toFixed(2)} HUF
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    1 USD = {((rates.rates.HUF || 406) / (rates.rates.USD || 1.07)).toFixed(2)} HUF · CHF:{' '}
                    {rates.rates.CHF}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {rates.date} · {rates.source}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Kattints a Frissítésre az élő EKB árfolyamok lekéréséhez.</p>
              )}
              {rateMsg && <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{rateMsg}</div>}
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Havi Fix Kiadások & Hátralévő
              </h3>
              <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                Össz: {fixedTotal.toLocaleString('hu-HU')} · Fizetve: {fixedPaid.toLocaleString('hu-HU')} · Hátralék:{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {fixedRemaining.toLocaleString('hu-HU')}
                </span>
              </div>
              <div className="flex gap-2 text-xs">
                <input
                  type="text"
                  value={fixName}
                  onChange={(e) => setFixName(e.target.value)}
                  placeholder="Tétel (pl. Rezsi)"
                  className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                />
                <input
                  type="number"
                  value={fixAmount}
                  onChange={(e) => setFixAmount(e.target.value)}
                  placeholder="Összeg"
                  className="w-24 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!fixName.trim() || !fixAmount) return;
                    await fetch('/api/v7/finance/fixed', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: fixName, amount: Number(fixAmount) }),
                    });
                    setFixName('');
                    setFixAmount('');
                    await onRefreshState();
                  }}
                  className="px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap"
                >
                  +
                </button>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto text-xs">
                {fixedExpenses.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center justify-between gap-2 p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded cursor-pointer"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={f.paidThisMonth}
                        onChange={async () => {
                          await fetch(`/api/v7/finance/fixed/${f.id}/toggle`, { method: 'POST' });
                          await onRefreshState();
                        }}
                      />
                      <span className={f.paidThisMonth ? 'line-through text-slate-400' : ''}>{f.name}</span>
                    </span>
                    <span className="font-mono tabular-nums shrink-0">
                      {f.amount.toLocaleString('hu-HU')} {f.currency}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Car className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                Üzemanyag Fogyasztás (l/100km)
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <input
                  type="number"
                  aria-label="Megtett km"
                  value={fuelKm}
                  onChange={(e) => setFuelKm(e.target.value)}
                  placeholder="km"
                  className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
                <input
                  type="number"
                  step="0.1"
                  aria-label="Tankolt liter"
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(e.target.value)}
                  placeholder="liter"
                  className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
                <input
                  type="number"
                  aria-label="Összeg HUF"
                  value={fuelCost}
                  onChange={(e) => setFuelCost(e.target.value)}
                  placeholder="Ft"
                  className="px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/v7/fuel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      distanceKm: Number(fuelKm),
                      liters: Number(fuelLiters),
                      totalCost: Number(fuelCost),
                    }),
                  });
                  await onRefreshState();
                }}
                className="w-full py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded"
              >
                Tankolás Naplózása
              </button>
              <div className="space-y-1 max-h-28 overflow-y-auto text-xs font-mono tabular-nums">
                {(state?.fuelLogs || []).slice(0, 4).map((fl) => (
                  <div key={fl.id} className="p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded flex justify-between">
                    <span>{fl.consumptionPer100Km} l/100km</span>
                    <span>{fl.costPerKm} Ft/km</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Meds, Savings, Lent Items, Trips, Media Backlog */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Pill className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Napi Vitamin / Gyógyszer Check-in
                </h3>
                <div className="flex gap-2 text-xs">
                  <input
                    type="text"
                    value={medName}
                    onChange={(e) => setMedName(e.target.value)}
                    placeholder="pl. D3-vitamin"
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="text"
                    value={medDose}
                    onChange={(e) => setMedDose(e.target.value)}
                    className="w-24 px-2 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!medName.trim()) return;
                      await fetch('/api/v7/meds', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: medName, dosage: medDose, timeOfDay: medTime }),
                      });
                      setMedName('');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded"
                  >
                    +
                  </button>
                </div>
                <div className="space-y-1 text-xs">
                  {(state?.medicationReminders || []).map((m) => {
                    const taken = m.takenDates.includes(todayStr);
                    return (
                      <label key={m.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded cursor-pointer">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={taken}
                            onChange={async () => {
                              await fetch(`/api/v7/meds/${m.id}/toggle`, { method: 'POST' });
                              await onRefreshState();
                            }}
                          />
                          <span>{m.name} · {m.dosage}</span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{m.timeOfDay}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Kölcsönadott Tárgyak & Megtakarítási Célok
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <input
                    type="text"
                    value={lentItemName}
                    onChange={(e) => setLentItemName(e.target.value)}
                    placeholder="Kölcsön tárgy..."
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="text"
                    value={lentPerson}
                    onChange={(e) => setLentPerson(e.target.value)}
                    placeholder="Kinek?"
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!lentItemName.trim() || !lentPerson.trim()) return;
                      await fetch('/api/v7/lent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ itemName: lentItemName, personName: lentPerson }),
                      });
                      setLentItemName('');
                      setLentPerson('');
                      await onRefreshState();
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    + Kölcsön
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <input
                    type="text"
                    value={savTitle}
                    onChange={(e) => setSavTitle(e.target.value)}
                    placeholder="Megtakarítás cél..."
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="number"
                    value={savTarget}
                    onChange={(e) => setSavTarget(e.target.value)}
                    placeholder="Célösszeg"
                    className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!savTitle.trim() || !savTarget) return;
                      await fetch('/api/v7/finance/savings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: savTitle, targetAmount: Number(savTarget) }),
                      });
                      setSavTitle('');
                      setSavTarget('');
                      await onRefreshState();
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    + Cél
                  </button>
                </div>
                <div className="space-y-1 text-xs">
                  {(state?.lentItems || []).map((li) => (
                    <div key={li.id} className="flex justify-between p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
                      <span className={li.returned ? 'line-through text-slate-400' : ''}>
                        {li.itemName} → {li.personName}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/v7/lent/${li.id}/toggle`, { method: 'POST' });
                          await onRefreshState();
                        }}
                        className="text-[11px] underline text-slate-600"
                      >
                        {li.returned ? 'Visszavéve' : 'Visszakaptam'}
                      </button>
                    </div>
                  ))}
                  {(state?.savingsGoals || []).map((sg) => (
                    <div key={sg.id} className="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono tabular-nums">
                      <span>{sg.title}: {sg.currentAmount.toLocaleString('hu-HU')} / {sg.targetAmount.toLocaleString('hu-HU')} {sg.currency}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/v7/finance/savings/${sg.id}/contribute`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amount: 10000 }),
                          });
                          await onRefreshState();
                        }}
                        className="px-2 py-0.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded text-[11px]"
                      >
                        +10e
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trips, Media Backlog & Hungarian Official Letter Generator */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Luggage className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Utazás Tervező & Könyv/Film Backlog
                </h3>
                <div className="flex gap-2 text-xs">
                  <input
                    type="text"
                    value={tripDest}
                    onChange={(e) => setTripDest(e.target.value)}
                    placeholder="Úticél (pl. Bécs)..."
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!tripDest.trim()) return;
                      await fetch('/api/v7/trips', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ destination: tripDest, startDate: tripStart, endDate: tripEnd }),
                      });
                      setTripDest('');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap"
                  >
                    + Utazás
                  </button>
                </div>
                <div className="flex gap-2 text-xs">
                  <select
                    aria-label="Média típus"
                    value={mediaKind}
                    onChange={(e) => setMediaKind(e.target.value as MediaBacklogItem['kind'])}
                    className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="book">Könyv</option>
                    <option value="movie">Film</option>
                    <option value="series">Sorozat</option>
                    <option value="course">Kurzus</option>
                  </select>
                  <input
                    type="text"
                    value={mediaTitle}
                    onChange={(e) => setMediaTitle(e.target.value)}
                    placeholder="Könyv / film címe..."
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!mediaTitle.trim()) return;
                      await fetch('/api/v7/media-backlog', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: mediaTitle, kind: mediaKind }),
                      });
                      setMediaTitle('');
                      await onRefreshState();
                    }}
                    className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded whitespace-nowrap"
                  >
                    + Lista
                  </button>
                </div>
                {(state?.tripPlans || []).slice(0, 2).map((trp) => (
                  <div key={trp.id} className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs space-y-1">
                    <div className="font-semibold">{trp.destination} · {trp.startDate}</div>
                    <div className="flex flex-wrap gap-2">
                      {trp.packingList.map((pk) => (
                        <label key={pk.id} className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pk.packed}
                            onChange={async () => {
                              await fetch(`/api/v7/trips/${trp.id}/pack/${pk.id}/toggle`, { method: 'POST' });
                              await onRefreshState();
                            }}
                          />
                          <span className={pk.packed ? 'line-through text-slate-400' : ''}>{pk.text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  Magyar Hivatalos Levél / Kérelem Generátor
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <select
                    aria-label="Levél típusa"
                    value={letterKind}
                    onChange={(e) => setLetterKind(e.target.value as typeof letterKind)}
                    className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="reklamacio">Reklamáció</option>
                    <option value="felmondas">Felmondás</option>
                    <option value="kerelem">Kérelem</option>
                    <option value="meghatalmazas">Meghatalmazás</option>
                  </select>
                  <input
                    type="text"
                    value={letterRecipient}
                    onChange={(e) => setLetterRecipient(e.target.value)}
                    placeholder="Címzett..."
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <input
                    type="text"
                    value={letterSubject}
                    onChange={(e) => setLetterSubject(e.target.value)}
                    placeholder="Tárgy..."
                    className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={letterPoints}
                    onChange={(e) => setLetterPoints(e.target.value)}
                    placeholder="Fő indokok / szerződésszám..."
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await fetch('/api/v7/life/official-letter', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          kind: letterKind,
                          recipientName: letterRecipient,
                          subject: letterSubject,
                          keyPoints: letterPoints,
                          senderName: state?.settings.instanceName || 'Feladó',
                        }),
                      });
                      const d = await r.json();
                      if (d.ok) setLetterResult(d.letter);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap"
                  >
                    Generálás
                  </button>
                </div>
                {letterResult && (
                  <pre className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {letterResult}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
