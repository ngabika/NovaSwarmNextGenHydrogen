import React, { useState } from 'react';
import {
  Activity,
  BellRing,
  Cpu,
  Network,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Wifi,
  Workflow,
  Zap,
} from 'lucide-react';
import type {
  AutonomyRule,
  AutonomyRuleActionKind,
  AutonomyRuleTriggerKind,
  MacroStepKind,
  NovaSwarmState,
} from '../../shared/types';

interface Props {
  state?: NovaSwarmState;
  onRefreshState: () => Promise<void>;
}

const TRIGGER_LABELS: Record<AutonomyRuleTriggerKind, string> = {
  ram_above: 'RAM % felett (>=)',
  cpu_above: 'CPU % felett (>=)',
  temp_above: 'Hőmérséklet °C felett (>=)',
  disk_above: 'Lemez % felett (>=)',
  uptime_down: 'Leállt Uptime célpont (>= db)',
  new_lan_mac: 'Ismeretlen LAN MAC (>= db)',
  manual_event: 'Kézi / API esemény',
};

const ACTION_LABELS: Record<AutonomyRuleActionKind, string> = {
  ram_cleanup: 'RAM & Cache felszabadítás',
  telegram_notify: 'Telegram riasztás küldése',
  run_agent_prompt: 'AI Ágens prompt futtatása',
  gpio_set: 'GPIO tüske vezérlés (pin:0|1)',
  wol_wake: 'Wake-on-LAN ébresztés (MAC/név)',
  docker_heal: 'Docker konténerek újraindítása',
  speak_tts: 'LAN hangszóró TTS bemondás',
};

export const Batch6ApexLabPanel: React.FC<Props> = ({ state, onRefreshState }) => {
  // 1. Rules
  const [ruleName, setRuleName] = useState('');
  const [triggerKind, setTriggerKind] = useState<AutonomyRuleTriggerKind>('ram_above');
  const [thresholdValue, setThresholdValue] = useState(85);
  const [actionKind, setActionKind] = useState<AutonomyRuleActionKind>('telegram_notify');
  const [actionTarget, setActionTarget] = useState('Magas terhelés észlelve');
  const [cooldownMinutes, setCooldownMinutes] = useState(10);
  const [ruleOut, setRuleOut] = useState<string | null>(null);

  // 2. Reminders
  const [remTime, setRemTime] = useState('15m');
  const [remMsg, setRemMsg] = useState('');
  const [remErr, setRemErr] = useState<string | null>(null);

  // 3. Macros
  const [macroName, setMacroName] = useState('');
  const [macroSlug, setMacroSlug] = useState('');
  const [macroSteps, setMacroSteps] = useState<MacroStepKind[]>(['ram_watchdog', 'forensic_snapshot']);
  const [macroOut, setMacroOut] = useState<string | null>(null);

  // 4. Mesh Dispatch
  const [meshPrompt, setMeshPrompt] = useState('Készíts rövid, 2 mondatos státuszjelentést a csomópont terhelhetőségéről.');
  const [meshBusy, setMeshBusy] = useState(false);

  // 5. LAN Sentinel & Docker Heal
  const [netBusy, setNetBusy] = useState(false);
  const [dockerMsg, setDockerMsg] = useState<string | null>(null);
  const [trustMacInput, setTrustMacInput] = useState('');

  // 6. Forensics
  const [forensicBusy, setForensicBusy] = useState(false);

  const rules: AutonomyRule[] = state?.autonomyRules || [];
  const reminders = state?.smartReminders || [];
  const macros = state?.quickMacros || [];
  const networkSpeeds = state?.networkSpeeds || [];
  const meshDispatches = state?.meshDispatches || [];
  const forensic = state?.lastForensicReport || null;

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;
    setRuleOut(null);
    const res = await fetch('/api/v6/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ruleName.trim(),
        triggerKind,
        thresholdValue,
        actionKind,
        actionTarget,
        cooldownMinutes,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setRuleOut(`Hiba: ${data.error || 'Sikertelen szabálymentés'}`);
    } else {
      setRuleName('');
      setRuleOut('Új autonóm szabály elmentve.');
      await onRefreshState();
    }
  };

  const handleEvaluateRules = async () => {
    const res = await fetch('/api/v6/rules/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualTrigger: false }),
    });
    const data = (await res.json()) as {
      checkedRules: number;
      triggered: Array<{ ruleName: string; actionResult: string }>;
    };
    setRuleOut(
      data.triggered.length > 0
        ? `${data.triggered.length} szabály lépett életbe: ${data.triggered.map((t) => t.ruleName).join(', ')}`
        : `${data.checkedRules} szabály ellenőrizve — jelenleg minden küszöbérték alatt.`
    );
    await onRefreshState();
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setRemErr(null);
    const res = await fetch('/api/v6/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeExpr: remTime, message: remMsg, channel: 'both' }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setRemErr(data.error || 'Érvénytelen emlékeztető formátum.');
    } else {
      setRemMsg('');
      await onRefreshState();
    }
  };

  const handleRunMacro = async (idOrSlug: string) => {
    setMacroOut(null);
    const res = await fetch(`/api/v6/macros/${encodeURIComponent(idOrSlug)}/run`, { method: 'POST' });
    const data = (await res.json()) as { ok?: boolean; summary?: string; error?: string };
    setMacroOut(data.ok ? data.summary || 'Makró lefutott.' : `Hiba: ${data.error}`);
    await onRefreshState();
  };

  const handleCreateMacro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macroName.trim() || !macroSlug.trim() || macroSteps.length === 0) return;
    const res = await fetch('/api/v6/macros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: macroName.trim(),
        slug: macroSlug.trim(),
        description: `Egyéni ${macroSteps.length} lépéses makró`,
        steps: macroSteps,
      }),
    });
    if (res.ok) {
      setMacroName('');
      setMacroSlug('');
      await onRefreshState();
    }
  };

  const handleMeshDispatch = async () => {
    if (!meshPrompt.trim()) return;
    setMeshBusy(true);
    try {
      await fetch('/api/v6/mesh/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: meshPrompt.trim(), preferredRole: 'gpu_ollama' }),
      });
      await onRefreshState();
    } finally {
      setMeshBusy(false);
    }
  };

  const handleRunSentinel = async (runSpeedtest: boolean) => {
    setNetBusy(true);
    try {
      await fetch('/api/v6/network/sentinel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runSpeedtest }),
      });
      await onRefreshState();
    } finally {
      setNetBusy(false);
    }
  };

  const handleDockerHeal = async () => {
    const res = await fetch('/api/v6/docker/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoRestartExited: true }),
    });
    const data = (await res.json()) as { summary?: string };
    setDockerMsg(data.summary || 'Docker ellenőrzés kész.');
    await onRefreshState();
  };

  const handleRunForensic = async () => {
    setForensicBusy(true);
    try {
      await fetch('/api/v6/forensic/run', { method: 'POST' });
      await onRefreshState();
    } finally {
      setForensicBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 1-Tap Quick Macros + Smart Time Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Zap className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                1-Kattintásos Kompozit Makrók (/makro)
              </h3>
              <p className="text-xs text-slate-500">
                Többlépcsős karbantartási és diagnosztikai rutinok egy gombnyomással vagy Telegramon.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {macros.map((m) => (
              <div
                key={m.id}
                className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{m.name}</span>
                    <span className="font-mono text-[11px] font-normal text-slate-500">/makro {m.slug}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {m.description} ({m.steps.join(' → ')}) · Futás: {m.runCount}x
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRunMacro(m.slug)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" />
                  Futtatás
                </button>
              </div>
            ))}
          </div>

          {macroOut && (
            <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono whitespace-pre-wrap max-h-36 overflow-auto">
              {macroOut}
            </pre>
          )}

          <form onSubmit={handleCreateMacro} className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input
              type="text"
              aria-label="Új makró neve"
              placeholder="Új makró neve"
              value={macroName}
              onChange={(e) => setMacroName(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <input
              type="text"
              aria-label="Makró parancs slug"
              placeholder="slug (pl. gyors_teszt)"
              value={macroSlug}
              onChange={(e) => setMacroSlug(e.target.value)}
              className="px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Makró Mentése
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {(
              [
                ['ram_watchdog', 'RAM Őrszem'],
                ['sd_flush', 'SD Puffer'],
                ['ollama_unload', 'Ollama Ürítés'],
                ['docker_heal', 'Docker Javítás'],
                ['lan_sentinel', 'LAN Őrszem'],
                ['forensic_snapshot', 'Kórkép'],
                ['self_heal', 'Öngyógyítás'],
              ] as Array<[MacroStepKind, string]>
            ).map(([step, label]) => {
              const active = macroSteps.includes(step);
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() =>
                    setMacroSteps((prev) => (prev.includes(step) ? prev.filter((x) => x !== step) : [...prev, step]))
                  }
                  className={`px-2 py-1 rounded border transition-colors ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BellRing className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              Okos Időzített Emlékeztetők (/emlekezteto)
            </h3>
            <p className="text-xs text-slate-500">
              Relatív (15m, 2h, 30s) vagy pontos (08:30) időzítés, amely Telegramon és hangszórón is jelez.
            </p>
          </div>

          <form onSubmit={handleAddReminder} className="flex flex-wrap sm:flex-nowrap gap-2 text-xs">
            <input
              type="text"
              aria-label="Időpont vagy késleltetés"
              value={remTime}
              onChange={(e) => setRemTime(e.target.value)}
              placeholder="15m vagy 08:30"
              className="w-28 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <input
              type="text"
              aria-label="Emlékeztető üzenet"
              value={remMsg}
              onChange={(e) => setRemMsg(e.target.value)}
              placeholder="Mit ne felejts el?"
              className="flex-1 min-w-[160px] px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="submit"
              className="px-3 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-slate-800 whitespace-nowrap"
            >
              Időzítés
            </button>
          </form>

          {remErr && <div className="text-xs text-red-700 font-mono">{remErr}</div>}

          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {reminders.length === 0 ? (
              <p className="text-xs text-slate-500">Még nincs aktív emlékeztető.</p>
            ) : (
              reminders.slice(0, 12).map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className={`font-medium ${r.fired ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                      {r.message}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {new Date(r.triggerAt).toLocaleString('hu-HU')} · {r.fired ? 'Teljesítve' : 'Várakozik'}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Emlékeztető törlése: ${r.message}`}
                    onClick={async () => {
                      await fetch(`/api/v6/reminders/${r.id}`, { method: 'DELETE' });
                      await onRefreshState();
                    }}
                    className="p-1.5 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 2. Natural Event-Action Autonomy Rules ("Ha ez történik -> Csináld ezt") */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Workflow className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              Eseményvezérelt Autonóm Szabálymotor („Ha ez történik → Csináld ezt”)
            </h3>
            <p className="text-xs text-slate-500">
              Cooldown védett szabályok: a rendszer 60 másodpercenként önállóan kiértékeli a feltételeket és végrehajtja a reakciót.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleEvaluateRules()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Szabályok Kiértékelése Most
          </button>
        </div>

        <form onSubmit={handleCreateRule} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 text-xs">
          <input
            type="text"
            aria-label="Szabály neve"
            placeholder="Szabály neve (pl. Túlmelegedés védő)"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            className="lg:col-span-3 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <select
            aria-label="Kiváltó feltétel"
            value={triggerKind}
            onChange={(e) => setTriggerKind(e.target.value as AutonomyRuleTriggerKind)}
            className="lg:col-span-2 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
          >
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="number"
            aria-label="Küszöbérték"
            value={thresholdValue}
            onChange={(e) => setThresholdValue(Number(e.target.value))}
            className="lg:col-span-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
          />
          <select
            aria-label="Végrehajtandó akció"
            value={actionKind}
            onChange={(e) => setActionKind(e.target.value as AutonomyRuleActionKind)}
            className="lg:col-span-3 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
          >
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="lg:col-span-3 flex gap-2">
            <input
              type="text"
              aria-label="Akció célpont vagy paraméter"
              placeholder="Cél / pin:1 / prompt"
              value={actionTarget}
              onChange={(e) => setActionTarget(e.target.value)}
              className="flex-1 min-w-0 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="submit"
              className="px-3 py-1.5 font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-slate-800 whitespace-nowrap"
            >
              Hozzáadás
            </button>
          </div>
        </form>

        {ruleOut && (
          <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono">
            {ruleOut}
          </div>
        )}

        <div className="space-y-2">
          {rules.map((r) => (
            <div
              key={r.id}
              className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</div>
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  HA {TRIGGER_LABELS[r.triggerKind]} ({r.thresholdValue}) → {ACTION_LABELS[r.actionKind]} [{r.actionTarget}] · Cooldown {r.cooldownMinutes}p · Futott: {r.triggerCount}x
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/v6/rules/${r.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: !r.enabled }),
                    });
                    await onRefreshState();
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                    r.enabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  {r.enabled ? 'Aktív' : 'Szünet'}
                </button>
                <button
                  type="button"
                  aria-label={`Szabály törlése: ${r.name}`}
                  onClick={async () => {
                    await fetch(`/api/v6/rules/${r.id}`, { method: 'DELETE' });
                    await onRefreshState();
                  }}
                  className="p-1.5 text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Swarm Mesh Offload + LAN Sentinel & Speedtest + Docker Watchtower + Forensic Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Swarm Mesh Offload */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Network className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            Swarm Mesh GPU / Node Feladat-Kiosztó (/mesh)
          </h3>
          <p className="text-xs text-slate-500">
            Automatikusan kiválasztja a leggyorsabb online GPU/Workstation csomópontot (vagy helyi fallbacket használ). Online node-ok:{' '}
            <span className="font-mono font-semibold">
              {(state?.clusterNodes || []).filter((n) => n.status === 'online').length}/{(state?.clusterNodes || []).length}
            </span>
          </p>
          <div className="flex gap-2 text-xs">
            <input
              type="text"
              aria-label="Mesh feladat prompt"
              value={meshPrompt}
              onChange={(e) => setMeshPrompt(e.target.value)}
              className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="button"
              disabled={meshBusy}
              onClick={() => void handleMeshDispatch()}
              className="px-3 py-1.5 font-medium bg-slate-900 text-white rounded hover:bg-slate-800 whitespace-nowrap"
            >
              {meshBusy ? 'Küldés...' : 'Kiosztás'}
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {meshDispatches.slice(0, 5).map((d) => (
              <div key={d.id} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-xs">
                <div className="font-mono font-semibold flex justify-between">
                  <span>{d.nodeName} ({d.status})</span>
                  <span>{d.latencyMs} ms</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{d.responsePreview}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LAN Sentinel, Speedtest & Docker Watchtower */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            LAN Őrszem, Sebességmérés & Docker Watchtower
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              disabled={netBusy}
              onClick={() => void handleRunSentinel(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
            >
              <Activity className="h-3.5 w-3.5" />
              {netBusy ? 'Mérés...' : 'LAN & Sebességmérés'}
            </button>
            <button
              type="button"
              onClick={() => void handleDockerHeal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Docker Watchtower Javítás
            </button>
          </div>
          {dockerMsg && (
            <div className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono">
              {dockerMsg}
            </div>
          )}
          <div className="flex gap-2 text-xs">
            <input
              type="text"
              aria-label="Megbízható MAC cím"
              placeholder="MAC elfogadása (pl. aa:bb:cc:dd:ee:ff)"
              value={trustMacInput}
              onChange={(e) => setTrustMacInput(e.target.value)}
              className="flex-1 px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded bg-transparent"
            />
            <button
              type="button"
              onClick={async () => {
                if (!trustMacInput.trim()) return;
                await fetch('/api/v6/network/trust-mac', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mac: trustMacInput.trim() }),
                });
                setTrustMacInput('');
                await onRefreshState();
              }}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50"
            >
              MAC Elfogadás
            </button>
          </div>
          {networkSpeeds.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto text-xs font-mono">
              {networkSpeeds.slice(0, 4).map((ns) => (
                <div key={ns.id} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded">
                  Ping: {ns.pingMs ?? 'n/a'} ms · DL: {ns.downloadMbps ?? 'n/a'} Mbps · LAN: {ns.lanDeviceCount} eszköz ({ns.unknownMacCount} ismeretlen)
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Forensic Root-Cause Doctor ("/korkep") */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              Forenzikus Rendszer Kórkép (/korkep)
            </h3>
            <p className="text-xs text-slate-500">
              Élő ps memória-toplistát, kernel OOM / feszültség naplókat, hibás systemd unitokat és inode-okat elemez.
            </p>
          </div>
          <button
            type="button"
            disabled={forensicBusy}
            onClick={() => void handleRunForensic()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            <Cpu className="h-3.5 w-3.5" />
            {forensicBusy ? 'Elemzés...' : 'Teljes Kórkép Futtatása'}
          </button>
        </div>

        {forensic && (
          <div className="space-y-2 text-xs">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono">
              {forensic.diagnosisSummary}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 border border-slate-200 dark:border-slate-700 rounded">
                <div className="font-semibold mb-1">Top RAM Folyamatok (ps)</div>
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                  {forensic.topMemoryProcesses.join('\n') || '(nincs adat)'}
                </pre>
              </div>
              <div className="p-3 border border-slate-200 dark:border-slate-700 rounded space-y-1">
                <div className="font-semibold">Javaslatok & Inode</div>
                {forensic.recommendations.map((rec, idx) => (
                  <div key={idx} className="text-slate-700 dark:text-slate-300">• {rec}</div>
                ))}
                {forensic.inodeUsageLines.length > 0 && (
                  <div className="font-mono text-[11px] text-slate-500 pt-1">{forensic.inodeUsageLines[0]}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
