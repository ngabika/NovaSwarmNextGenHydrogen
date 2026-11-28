import React, { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, OctagonAlert, Save, ShieldAlert } from 'lucide-react';
import type {
  ExecutionPreset,
  LanguageCode,
  PhoenixAutonomyStatus,
  SandboxCapabilities,
  Settings,
  SudoCheckStatus,
} from '../../shared/types';
import { InfoHint } from './InfoHint';
import { SUPPORTED_LANGUAGES, useLocale } from '../locales/translations';

interface Props {
  language?: LanguageCode;
  settings: Settings;
  sandboxCapabilities?: SandboxCapabilities | null;
  sudoStatus?: SudoCheckStatus | null;
  phoenixAutonomy?: PhoenixAutonomyStatus | null;
  onRefreshState: () => Promise<void>;
}

export const SettingsView: React.FC<Props> = ({
  settings,
  sandboxCapabilities,
  sudoStatus,
  phoenixAutonomy,
  onRefreshState,
}) => {
  const { t, tx, setLang } = useLocale();
  const [form, setForm] = useState<Settings>(settings);
  const [telegramToken, setTelegramToken] = useState('');
  const [braveSearchKey, setBraveSearchKey] = useState('');
  const [homeAssistantToken, setHomeAssistantToken] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // Full Autonomy profile activation modal state
  const [autonomyModalOpen, setAutonomyModalOpen] = useState(false);
  const [autonomyPassword, setAutonomyPassword] = useState('');
  const [autonomyBusy, setAutonomyBusy] = useState(false);
  const [autonomyMsg, setAutonomyMsg] = useState<string | null>(null);
  const [autonomyErr, setAutonomyErr] = useState<string | null>(null);

  // Total Autonomy mode activation modal state
  const [totalModalOpen, setTotalModalOpen] = useState(false);
  const [totalPassword, setTotalPassword] = useState('');
  const [totalBusy, setTotalBusy] = useState(false);
  const [totalMsg, setTotalMsg] = useState<string | null>(null);
  const [totalErr, setTotalErr] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setSaveError(null);
    try {
      const {
        fullAutonomyProfileEnabled: _ignoredProfileFlag,
        fullAutonomyPreviousFlags: _ignoredPrevFlags,
        totalAutonomyEnabled: _ignoredTotalFlag,
        lockdownActive: _ignoredLockFlag,
        lockdownReason: _ignoredLockReason,
        lockdownActivatedAt: _ignoredLockAt,
        ...restForm
      } = form;
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...restForm,
          telegramToken: telegramToken.trim() || undefined,
          braveSearchKey: braveSearchKey.trim() || undefined,
          homeAssistantToken: homeAssistantToken.trim() || undefined,
        }),
      });
      if (res.ok) {
        setTelegramToken('');
        setBraveSearchKey('');
        setHomeAssistantToken('');
        setLang(restForm.language);
        setSavedMsg(tx('Beállítások mentve és azonnal érvényesítve.'));
        await onRefreshState();
      } else {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(errBody.error || tx('Mentési hiba (HTTP {0})', res.status));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutonomyProfile = async (enableTarget: boolean) => {
    setAutonomyBusy(true);
    setAutonomyErr(null);
    setAutonomyMsg(null);
    try {
      const res = await fetch('/api/autonomy-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: enableTarget,
          password: enableTarget ? autonomyPassword : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setAutonomyErr(body.error || tx('Hiba a profil váltásakor (HTTP {0}).', res.status));
        return;
      }
      setAutonomyPassword('');
      setAutonomyModalOpen(false);
      setAutonomyMsg(
        enableTarget
          ? tx('Teljes autonómia profil BEKAPCSOLVA (Host + Autonóm + Veszélyes Zóna aktív).')
          : tx('Teljes autonómia profil KIKAPCSOLVA, az előző jogosultságok visszaállítva.')
      );
      await onRefreshState();
    } catch (err) {
      setAutonomyErr(err instanceof Error ? err.message : tx('Hálózati hiba'));
    } finally {
      setAutonomyBusy(false);
    }
  };

  const handleToggleTotalAutonomy = async (enableTarget: boolean) => {
    setTotalBusy(true);
    setTotalErr(null);
    setTotalMsg(null);
    try {
      const res = await fetch('/api/total-autonomy/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: enableTarget,
          password: enableTarget ? totalPassword : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setTotalErr(body.error || tx('Hiba a Totális autonómia váltásakor (HTTP {0}).', res.status));
        return;
      }
      setTotalPassword('');
      setTotalModalOpen(false);
      setTotalMsg(
        enableTarget
          ? tx('Totális autonómia BEKAPCSOLVA. A 3 sérthetetlen garancia (append-only audit + napi anchor, LOCKDOWN, visszaállítási pontok) aktív.')
          : tx('Totális autonómia KIKAPCSOLVA.')
      );
      await onRefreshState();
    } catch (err) {
      setTotalErr(err instanceof Error ? err.message : tx('Hálózati hiba'));
    } finally {
      setTotalBusy(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !settings.killSwitchActive }),
    });
    await onRefreshState();
  };

  const handleSaveOperatorAuth = async (enableFlag: boolean) => {
    setAuthMsg(null);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: operatorPassword.trim() || undefined,
        setupCode: setupCode.trim() || undefined,
        enable: enableFlag,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      webAuthEnabled?: boolean;
      webAuthHasPassword?: boolean;
    };
    if (!res.ok) {
      setAuthMsg(data.error || tx('Hiba a LAN zár beállításakor'));
      return;
    }
    setOperatorPassword('');
    setSetupCode('');
    setForm((prev) => ({
      ...prev,
      webAuthEnabled: Boolean(data.webAuthEnabled),
      webAuthHasPassword: Boolean(data.webAuthHasPassword),
    }));
    setAuthMsg(
      data.webAuthEnabled
        ? tx('Operátori jelszó mentve és LAN jelszózár BEKAPCSOLVA.')
        : tx('Operátori jelszó mentve (LAN jelszózár jelenleg KIKAPCSOLVA).')
    );
    await onRefreshState();
  };

  return (
    <div className="max-w-4xl space-y-8">
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('navSettings')}</h2>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 whitespace-nowrap shrink-0"
          >
            <Save className="h-4 w-4" />
            {t('saveSettings')}
          </button>
        </div>

        {savedMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
            {savedMsg}
          </div>
        )}
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="set-lang" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>{tx('Felület és Hangkimenet Nyelve')}</span>
              <InfoHint theme="light" label={tx('Nyelv')} description={tx('A felület gombjai, értesítései és a felolvasó hang is ezen a nyelven szólal meg.')} />
            </label>
            <select
              id="set-lang"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as LanguageCode })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="set-backup" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Biztonsági Mentés Ütemezése')}
            </label>
            <select
              id="set-backup"
              value={form.backupSchedule}
              onChange={(e) =>
                setForm({ ...form, backupSchedule: e.target.value as Settings['backupSchedule'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="manual">{tx('Manuális')}</option>
              <option value="daily">{tx('Napi')}</option>
              <option value="weekly">{tx('Heti')}</option>
              <option value="monthly">{tx('Havi')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-preset" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Alapértelmezett Végrehajtási Mód (Preset)')}
            </label>
            <select
              id="set-preset"
              value={form.defaultPreset || 'fast'}
              onChange={(e) => setForm({ ...form, defaultPreset: e.target.value as ExecutionPreset })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="fast">{tx('Gyors (Fast)')}</option>
              <option value="deep">{tx('Mély kutatás (Deep)')}</option>
              <option value="precise">{tx('Precíziós (Precise)')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-tool-steps" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Maximális Eszközlánc Mélység (ReAct lépések)')}
            </label>
            <input
              id="set-tool-steps"
              type="number"
              min="1"
              max="12"
              value={form.maxToolSteps || 6}
              onChange={(e) => setForm({ ...form, maxToolSteps: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-budget" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>{tx('Globális Napi Költséglimit (USD)')}</span>
              <InfoHint theme="light" label={tx('Napi költséglimit')} description={tx('Maximális napi dollárkeret fizetős AI modellekre. Ha eléri, automatikusan átvált ingyenes vagy helyi modellre.')} />
            </label>
            <input
              id="set-budget"
              type="number"
              step="0.1"
              min="0"
              value={form.dailyCostLimitUsd}
              onChange={(e) => setForm({ ...form, dailyCostLimitUsd: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-monthly-alert" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Havi Várható Költség Riasztás (USD)')}
            </label>
            <input
              id="set-monthly-alert"
              type="number"
              step="1"
              min="0"
              value={form.monthlyBudgetAlertUsd || 25}
              onChange={(e) => setForm({ ...form, monthlyBudgetAlertUsd: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-dream-idle" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Álmodás Indulási Inaktivitás (perc)')}
            </label>
            <input
              id="set-dream-idle"
              type="number"
              min="1"
              value={form.dreamingIdleMinutes}
              onChange={(e) => setForm({ ...form, dreamingIdleMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-temp" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Termikus Lassítási Küszöb (°C)')}
            </label>
            <input
              id="set-temp"
              type="number"
              value={form.thermalThrottleCelsius}
              onChange={(e) => setForm({ ...form, thermalThrottleCelsius: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-bat" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Akkumulátor Kímélő Küszöb (%)')}
            </label>
            <input
              id="set-bat"
              type="number"
              value={form.batteryThrottlePercent}
              onChange={(e) => setForm({ ...form, batteryThrottlePercent: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ollama-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Lokális Ollama URL')}
            </label>
            <input
              id="set-ollama-url"
              type="text"
              value={form.ollamaUrl}
              onChange={(e) => setForm({ ...form, ollamaUrl: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ollama-model" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Lokális Ollama Modell')}
            </label>
            <input
              id="set-ollama-model"
              type="text"
              value={form.ollamaModel}
              onChange={(e) => setForm({ ...form, ollamaModel: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ollama-ctx" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Ollama Kontextus Méret (num_ctx)')}
            </label>
            <input
              id="set-ollama-ctx"
              type="number"
              step="256"
              min="512"
              value={form.ollamaNumCtx || 2048}
              onChange={(e) => setForm({ ...form, ollamaNumCtx: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ollama-ka" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Ollama Keep Alive (pl. 10m, 0)')}
            </label>
            <input
              id="set-ollama-ka"
              type="text"
              value={form.ollamaKeepAlive || '10m'}
              onChange={(e) => setForm({ ...form, ollamaKeepAlive: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ollama-unload" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Ollama Automatikus RAM Kiürítés (perc, 0 = ki)')}
            </label>
            <input
              id="set-ollama-unload"
              type="number"
              min="0"
              max="240"
              value={form.ollamaAutoUnloadMinutes ?? 15}
              onChange={(e) => setForm({ ...form, ollamaAutoUnloadMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-weather-loc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Időjárás Település (Open-Meteo, kulcs nélküli)')}
            </label>
            <input
              id="set-weather-loc"
              type="text"
              value={form.weatherLocation || 'Budapest'}
              onChange={(e) => setForm({ ...form, weatherLocation: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-piper-bin" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Piper Neurális TTS Parancs / Útvonal (opcionális)')}
            </label>
            <input
              id="set-piper-bin"
              type="text"
              value={form.piperTtsBinary || 'piper'}
              onChange={(e) => setForm({ ...form, piperTtsBinary: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-wake-phrase" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>{tx('Ébresztőszó (Hangvezérléshez)')}</span>
              <InfoHint theme="light" label={tx('Ébresztőszó')} description={tx('Ha bekapcsolod a folyamatos figyelést, erre a szóra indul el a hangfelismerés.')} />
            </label>
            <input
              id="set-wake-phrase"
              type="text"
              value={form.wakeWordPhrase || 'szia nova'}
              onChange={(e) => setForm({ ...form, wakeWordPhrase: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-tg-chat" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>{tx('Fő Telegram Chat ID')}</span>
              <InfoHint theme="light" label="Telegram Chat ID" description={tx('A saját Telegram fiókod vagy csoportod azonosítója. Biztonsági okból csak az itt megadott azonosítók vezérelhetik a botot.')} />
            </label>
            <input
              id="set-tg-chat"
              type="text"
              value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              placeholder={tx('pl. 582910394')}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-tg-allowed" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>{tx('Engedélyezett Telegram Chat ID-k (vesszővel)')}</span>
              <InfoHint theme="light" label={tx('Telegram Engedélylista')} description={tx('Ha több embernek vagy csoportnak is engedélyeznéd a bot használatát, írd be ide az azonosítóikat vesszővel elválasztva. Üres listánál a bot minden idegent elutasít.')} />
            </label>
            <input
              id="set-tg-allowed"
              type="text"
              value={(form.telegramAllowedChatIds || []).join(', ')}
              onChange={(e) =>
                setForm({
                  ...form,
                  telegramAllowedChatIds: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder={tx('pl. 582910394, -1001234567')}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-tg-token" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Telegram Bot Token {settings.telegramHasToken ? tx('(konfigurálva)') : ''}
            </label>
            <input
              id="set-tg-token"
              type="password"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder={tx('Új token megadása...')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-search-prov" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Web Keresőmotor')}
            </label>
            <select
              id="set-search-prov"
              value={form.searchProvider || 'duckduckgo'}
              onChange={(e) =>
                setForm({ ...form, searchProvider: e.target.value as Settings['searchProvider'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="duckduckgo">{tx('DuckDuckGo (Kulcs nélküli)')}</option>
              <option value="searxng">{tx('Lokális SearXNG')}</option>
              <option value="brave">Brave Search API</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-searx" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('SearXNG URL / Brave Search Kulcs')} {settings.braveHasKey ? tx('(Brave mentve)') : ''}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="set-searx"
                type="text"
                value={form.searxngUrl || ''}
                onChange={(e) => setForm({ ...form, searxngUrl: e.target.value })}
                placeholder="http://localhost:8080"
                className="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="password"
                value={braveSearchKey}
                onChange={(e) => setBraveSearchKey(e.target.value)}
                placeholder="Brave API Key..."
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="set-ha-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Home Assistant URL &amp; Token {settings.homeAssistantHasToken ? tx('(mentve)') : ''}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="set-ha-url"
                type="text"
                value={form.homeAssistantUrl || ''}
                onChange={(e) => setForm({ ...form, homeAssistantUrl: e.target.value })}
                placeholder="http://homeassistant.local:8123"
                className="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="password"
                value={homeAssistantToken}
                onChange={(e) => setHomeAssistantToken(e.target.value)}
                placeholder="Long-lived Token"
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="set-mqtt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              MQTT Broker Host &amp; Port
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                id="set-mqtt"
                type="text"
                value={form.mqttBrokerHost || ''}
                onChange={(e) => setForm({ ...form, mqttBrokerHost: e.target.value })}
                placeholder="192.168.1.10"
                className="col-span-2 px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                value={form.mqttBrokerPort || 1883}
                onChange={(e) => setForm({ ...form, mqttBrokerPort: Number(e.target.value) })}
                className="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="set-rsync" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Külső Rsync / NAS Mentési Célmappa')}
            </label>
            <input
              id="set-rsync"
              type="text"
              value={form.backupRsyncTarget || ''}
              onChange={(e) => setForm({ ...form, backupRsyncTarget: e.target.value })}
              placeholder="/mnt/usb/novaswarm-backup"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-caldav" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('CalDAV Naptár URL (opcionális)')}
            </label>
            <input
              id="set-caldav"
              type="text"
              value={form.caldavUrl || ''}
              onChange={(e) => setForm({ ...form, caldavUrl: e.target.value })}
              placeholder="https://nextcloud.local/remote.php/dav"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-instance-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Föderációs Csomópont Neve')}
            </label>
            <input
              id="set-instance-name"
              type="text"
              value={form.instanceName}
              onChange={(e) => setForm({ ...form, instanceName: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-heartbeat-int" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Autonóm Heartbeat Intervallum (perc)')}
            </label>
            <input
              id="set-heartbeat-int"
              type="number"
              min="1"
              value={form.heartbeatIntervalMinutes}
              onChange={(e) => setForm({ ...form, heartbeatIntervalMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-kanban-wip" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Kanban Folyamatban WIP Limit')}
            </label>
            <input
              id="set-kanban-wip"
              type="number"
              min="1"
              value={form.kanbanWipLimit}
              onChange={(e) => setForm({ ...form, kanbanWipLimit: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-kanban-aging" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Kanban Elakadás (Aging) Küszöb (óra)')}
            </label>
            <input
              id="set-kanban-aging"
              type="number"
              min="1"
              value={form.kanbanAgingHours}
              onChange={(e) => setForm({ ...form, kanbanAgingHours: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ota-repo" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              GitHub OTA Repository (owner/repo)
            </label>
            <input
              id="set-ota-repo"
              type="text"
              value={form.otaRepoSlug || 'ngabika/NovaSwarmNextGenHydrogen'}
              onChange={(e) => setForm({ ...form, otaRepoSlug: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-ota-hours" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('OTA Automatikus Ellenőrzés (óra)')}
            </label>
            <input
              id="set-ota-hours"
              type="number"
              min="1"
              max="168"
              value={form.autoUpdateCheckHours || 6}
              onChange={(e) => setForm({ ...form, autoUpdateCheckHours: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-emb-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Memória Embedding Mód')}
            </label>
            <select
              id="set-emb-mode"
              value={form.embeddingMode || 'local_ngram'}
              onChange={(e) =>
                setForm({ ...form, embeddingMode: e.target.value as Settings['embeddingMode'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="local_ngram">{tx('Helyi n-gram + BM25 (Offline gyors)')}</option>
              <option value="ollama">{tx('Ollama Neurális Embedding')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-emb-model" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tx('Ollama Embedding Modell')}
            </label>
            <input
              id="set-emb-model"
              type="text"
              value={form.ollamaEmbeddingModel || 'nomic-embed-text'}
              onChange={(e) => setForm({ ...form, ollamaEmbeddingModel: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.hostPermissionsGranted}
                onChange={(e) => setForm({ ...form, hostPermissionsGranted: e.target.checked })}
              />
              <span>{tx('Géphez való hozzáférés engedélyezése (fájlok, parancsok, terminál)')}</span>
            </label>
            <InfoHint
              label={tx('Géphez való hozzáférés')}
              text={tx('Ha bekapcsolod, az asszisztens képes fájlokat olvasni/írni és parancsokat futtatni ezen a gépen. Alapból biztonsági okból ki van kapcsolva.')}
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.dailyCostLimitEnabled}
              onChange={(e) => setForm({ ...form, dailyCostLimitEnabled: e.target.checked })}
            />
            <span>{tx('Globális napi költséglimit aktív')}</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramEnabled}
                onChange={(e) => setForm({ ...form, telegramEnabled: e.target.checked })}
              />
              <span>{tx('Kétirányú Telegram gateway aktív')}</span>
            </label>
            <InfoHint
              label="Telegram gateway"
              text={tx('Telefonról is tudsz parancsokat küldeni és értesítéseket kapni. Csak a fent megadott Telegram Chat ID-kről fogad el üzenetet.')}
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.heartbeatEnabled}
              onChange={(e) => setForm({ ...form, heartbeatEnabled: e.target.checked })}
            />
            <span>{tx('Automatikus állapotfigyelés (elakadt feladatok és szerver elérhetőség figyelése)')}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.autonomousKanbanWorkerEnabled)}
              onChange={(e) => setForm({ ...form, autonomousKanbanWorkerEnabled: e.target.checked })}
            />
            <span>{tx('Önálló feladat-végrehajtó (üresjáratban automatikusan dolgozik a várólistás kártyákon)')}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.autoUpdateEnabled)}
              onChange={(e) => setForm({ ...form, autoUpdateEnabled: e.target.checked })}
            />
            <span>{tx('GitHub Automatikus Frissítés engedélyezve (biztonsági mentéssel és visszaállítással)')}</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.channelPairingRequired}
                onChange={(e) => setForm({ ...form, channelPairingRequired: e.target.checked })}
              />
              <span>{tx('Csatorna Párosítási Kapu (6 jegyű kód ismeretlen feladóknak)')}</span>
            </label>
            <InfoHint
              label={tx('Csatorna párosítási kapu')}
              text={tx('Idegen feladó nem tudja használni a botot, amíg a hatjegyű párosító kódot jóvá nem hagyod.')}
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.federationEnabled}
              onChange={(e) => setForm({ ...form, federationEnabled: e.target.checked })}
            />
            <span>{tx('Több gépes összekapcsolás (P2P Föderáció) engedélyezve')}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.ttsEnabled}
              onChange={(e) => setForm({ ...form, ttsEnabled: e.target.checked })}
            />
            <span>{tx('Böngészőoldali szövegfelolvasás (WebSpeech TTS)')}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.continuousVoiceMode)}
              onChange={(e) => setForm({ ...form, continuousVoiceMode: e.target.checked })}
            />
            <span>{tx('Folyamatos kézmentes hangmód alapértelmezett (felolvasás után automatikus hallgatás)')}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.ttsHostSpeakerEnabled}
              onChange={(e) => setForm({ ...form, ttsHostSpeakerEnabled: e.target.checked })}
            />
            <span>{tx('Gazdagép hangszóró felolvasás (Piper / espeak-ng)')}</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.wakeWordEnabled)}
              onChange={(e) => setForm({ ...form, wakeWordEnabled: e.target.checked })}
            />
            <span>{tx('Kézmentes ébresztőszó figyelés aktív a chatben')}</span>
          </label>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {tx('Önállóság, Megjelenés & Adatvédelem')}
            </h3>
            <InfoHint
              label={tx('Önállóság és megjelenés')}
              text={tx('Itt állíthatod be a felület kinézetét, az adatvédelmi maszkot, valamint azt, hogy az asszisztens mennyire önállóan cselekedjen jóváhagyás nélkül.')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="set-theme-mode" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>{tx('Megjelenési Téma')}</span>
                <InfoHint label={tx('Megjelenési téma')} text={tx('Világos, sötét vagy nagy kontrasztú megjelenés választása.')} />
              </label>
              <select
                id="set-theme-mode"
                value={form.themeMode || 'light'}
                onChange={(e) => setForm({ ...form, themeMode: e.target.value as Settings['themeMode'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="light">{tx('Világos (Light)')}</option>
                <option value="dark">{tx('Sötét Mód (Dark)')}</option>
                <option value="high_contrast">{tx('Magas Kontraszt')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-sup-strict" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>{tx('Felügyelő Szigorúság')}</span>
                <InfoHint label={tx('Felügyelő szigorúság')} text={tx('Mennyire szigorúan ellenőrizze a rendszer a kockázatos műveleteket.')} />
              </label>
              <select
                id="set-sup-strict"
                value={form.supervisorStrictness || 'balanced'}
                onChange={(e) =>
                  setForm({ ...form, supervisorStrictness: e.target.value as Settings['supervisorStrictness'] })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="permissive">{tx('Megengedő')}</option>
                <option value="balanced">{tx('Kiegyensúlyozott (Ajánlott)')}</option>
                <option value="paranoid">{tx('Szigorú')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-currency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Alapértelmezett Pénznem')}
              </label>
              <select
                id="set-currency"
                value={form.defaultCurrency || 'HUF'}
                onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value as Settings['defaultCurrency'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="HUF">HUF</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-ns-int" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Éjszakai Műszak Gyakorisága (perc)')}
              </label>
              <input
                id="set-ns-int"
                type="number"
                min="15"
                value={form.nightShiftIntervalMinutes ?? 30}
                onChange={(e) => setForm({ ...form, nightShiftIntervalMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="set-retention" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Napló & Vágólap Megőrzés (nap)')}
              </label>
              <input
                id="set-retention"
                type="number"
                min="1"
                value={form.retentionDays ?? 90}
                onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
          </div>

          {/* Crimson Total Autonomy Card */}
          <div className="p-4 rounded-xl border-2 border-red-400 dark:border-red-700 bg-red-50/80 dark:bg-red-950/35 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <OctagonAlert className="h-4 w-4 text-red-700 dark:text-red-400" />
                  <h4 className="text-sm font-bold text-red-950 dark:text-red-100">
                    {tx('Totális autonómia')}
                  </h4>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                      settings.totalAutonomyEnabled
                        ? 'bg-red-700 text-white'
                        : 'bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {settings.totalAutonomyEnabled ? tx('AKTÍV') : tx('Inaktív')}
                  </span>
                </div>
                <p className="text-xs text-red-950/90 dark:text-red-200 max-w-2xl">
                  {tx('Önálló célvégrehajtás, beállítás-adminisztráció, helyi hálózati felderítés/eszközvezérlés és öngyógyító Security Watchdog.')}{' '}
                  <strong>{tx('3 sérthetetlen garancia:')}</strong> {tx('(1) hamisításbiztos append-only audit + napi Telegram anchor, (2) többcsatornás')}{' '}
                  <span className="font-mono">/stop</span> {tx('LOCKDOWN csak tulajdonosi jelszóval oldható fel, (3) automatikus biztonsági visszaállítási pontok.')}
                </p>
              </div>
              {settings.totalAutonomyEnabled ? (
                <button
                  type="button"
                  disabled={totalBusy}
                  onClick={() => void handleToggleTotalAutonomy(false)}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {tx('Totális autonómia Kikapcsolása')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTotalErr(null);
                    setTotalPassword('');
                    setTotalModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 whitespace-nowrap shrink-0"
                >
                  {tx('Totális autonómia Bekapcsolása...')}
                </button>
              )}
            </div>
            {totalMsg && (
              <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-900/70 border border-red-300 text-xs text-slate-900 dark:text-slate-100">
                {totalMsg}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 items-end">
              <div>
                <label htmlFor="set-wd-timeout" className="block text-xs font-medium text-red-950 dark:text-red-200 mb-1">
                  {tx('Watchdog Próba Időablak (mp)')}
                </label>
                <input
                  id="set-wd-timeout"
                  type="number"
                  min={15}
                  max={600}
                  value={form.watchdogTimeoutSeconds ?? 120}
                  onChange={(e) => setForm({ ...form, watchdogTimeoutSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-red-300 dark:border-red-800 rounded-lg bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label htmlFor="set-cb-max" className="block text-xs font-medium text-red-950 dark:text-red-200 mb-1">
                  {tx('Circuit Breaker Limit (hiba)')}
                </label>
                <input
                  id="set-cb-max"
                  type="number"
                  min={2}
                  max={10}
                  value={form.circuitBreakerMaxFailures ?? 3}
                  onChange={(e) => setForm({ ...form, circuitBreakerMaxFailures: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-red-300 dark:border-red-800 rounded-lg bg-white dark:bg-slate-900"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-red-950 dark:text-red-200 cursor-pointer pb-1.5">
                <input
                  type="checkbox"
                  checked={form.autoWatchdogRollbackEnabled !== false}
                  onChange={(e) => setForm({ ...form, autoWatchdogRollbackEnabled: e.target.checked })}
                />
                <span>{tx('Watchdog automata rollback')}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-red-950 dark:text-red-200 cursor-pointer pb-1.5">
                <input
                  type="checkbox"
                  checked={form.dailyCloudCostFallbackToOllama !== false}
                  onChange={(e) => setForm({ ...form, dailyCloudCostFallbackToOllama: e.target.checked })}
                />
                <span>{tx('Felhő keret után Ollama váltás')}</span>
              </label>
            </div>
          </div>

          <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-800 dark:text-amber-300" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tx('„Teljes autonómia” Profil (1-kattintásos csomag)')}
                  </h4>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                      settings.fullAutonomyProfileEnabled
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {settings.fullAutonomyProfileEnabled ? tx('AKTÍV') : tx('Inaktív')}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 max-w-2xl">
                  {tx('Bekapcsolja együtt a')} <strong>{tx('Host jogosultságot')}</strong>, a <strong>{tx('Teljes autonóm módot')}</strong> {tx('és a')} <strong>{tx('Veszélyes Zónát')}</strong> {tx('(exec jóváhagyás nélkül). Kikapcsoláskor visszaállítja a korábbi egyéni értékeket. A Telegram engedélylista, a Web operátori jelszó és a')}{' '}
                  <span className="font-mono">/stop</span> {tx('vészleállító ezalatt is aktív marad.')}
                </p>
              </div>
              {settings.fullAutonomyProfileEnabled ? (
                <button
                  type="button"
                  disabled={autonomyBusy}
                  onClick={() => void handleToggleAutonomyProfile(false)}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {tx('Teljes autonómia Kikapcsolása')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAutonomyErr(null);
                    setAutonomyPassword('');
                    setAutonomyModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 whitespace-nowrap"
                >
                  {tx('Teljes autonómia Bekapcsolása...')}
                </button>
              )}
            </div>
            {autonomyMsg && (
              <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-900/70 border border-amber-300 text-xs text-slate-900 dark:text-slate-100">
                {autonomyMsg}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 items-end">
              <div>
                <label htmlFor="set-exec-timeout" className="block text-xs font-medium text-slate-800 dark:text-slate-200 mb-1">
                  {tx('Exec Parancs Időkorlát (mp, 5–3600)')}
                </label>
                <input
                  id="set-exec-timeout"
                  type="number"
                  min={5}
                  max={3600}
                  value={form.execTimeoutSeconds ?? 12}
                  onChange={(e) => setForm({ ...form, execTimeoutSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label htmlFor="set-long-exec-timeout" className="block text-xs font-medium text-slate-800 dark:text-slate-200 mb-1">
                  {tx('Hosszú Parancs (apt/npm/build) Időkorlát (mp, 30–7200)')}
                </label>
                <input
                  id="set-long-exec-timeout"
                  type="number"
                  min={30}
                  max={7200}
                  value={form.longExecTimeoutSeconds ?? 600}
                  onChange={(e) => setForm({ ...form, longExecTimeoutSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                />
              </div>
              <div className="flex flex-col justify-end text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-0.5">
                <span>
                  Sudo NOPASSWD:{' '}
                  <strong className={sudoStatus?.hasNopasswd ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                    {sudoStatus ? (sudoStatus.hasNopasswd ? tx('AKTÍV') : tx('HIÁNYZIK')) : '—'}
                  </strong>
                </span>
                <span>
                  {tx('Phoenix mentés:')}{' '}
                  <strong className={phoenixAutonomy?.staleWarning ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
                    {phoenixAutonomy?.lastSnapshotAt
                      ? tx('{0} órája', phoenixAutonomy.ageHours ?? 0)
                      : tx('még nincs')}
                  </strong>
                </span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoPhoenixSnapshotInFullAutonomy !== false}
                onChange={(e) => setForm({ ...form, autoPhoenixSnapshotInFullAutonomy: e.target.checked })}
              />
              <span>{tx('Napi automatikus Phoenix pillanatkép készítése Teljes autonómia alatt (24 óránként figyelmeztet, ha hiányzik)')}</span>
            </label>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.fullAutonomousMode)}
                  onChange={(e) => setForm({ ...form, fullAutonomousMode: e.target.checked })}
                />
                <span>{tx('Teljesen Önálló Mód — jóváhagyás kérése nélkül hajtsa végre a feladatokat (haladó, alapból KI)')}</span>
              </label>
              <InfoHint
                label={tx('Teljesen önálló mód')}
                text={tx('Alapértelmezés szerint kikapcsolva van a biztonságod érdekében. A parancssori (shell) futtatások ettől függetlenül továbbra is jóváhagyást kérnek — azt csak a lenti Veszélyes Zóna kapcsolóval lehet feloldani.')}
              />
            </div>
            <div className="p-3 rounded-lg border border-red-200 bg-red-50/70 dark:bg-red-950/30 dark:border-red-900 space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2.5 text-sm font-semibold text-red-900 dark:text-red-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.dangerousExecAutoApprove)}
                    onChange={(e) => setForm({ ...form, dangerousExecAutoApprove: e.target.checked })}
                  />
                  <span>{tx('Veszélyes Zóna: Parancssor jóváhagyás nélküli futtatása (alapból KI — szigorúan naplózva)')}</span>
                </label>
                <InfoHint
                  label={tx('Veszélyes Zóna (exec jóváhagyás nélkül)')}
                  text={tx('Figyelem: ha bekapcsolod, az engedélylistán (ls, cat, df, uptime) kívüli rendszerparancsok is Telegram/UI jóváhagyás nélkül futhatnak, teljes biztonsági naplózás mellett. Éles gépen hagyd kikapcsolva!')}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {tx('Sandbox Izolációs Állapot (')}<code>sandbox_js</code> &amp; Supervisor)
                  </span>
                  <InfoHint
                    label={tx('JS Sandbox izoláció')}
                    text={tx('A megbízhatatlan dinamikus JS eszközök (sandbox_js) kizárólag Docker (--network=none) vagy Bubblewrap (bwrap --tmpfs / --unshare-all) konténerben futhatnak. Ha egyik sincs telepítve, a sandbox_js biztonsági okból letiltva marad (nem esik vissza unshare-re).')}
                  />
                </div>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                    sandboxCapabilities?.jsSandboxAvailable
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
                  }`}
                >
                  {sandboxCapabilities
                    ? sandboxCapabilities.jsSandboxAvailable
                      ? `sandbox_js: ${sandboxCapabilities.jsSandboxBackend}`
                      : tx('sandbox_js: letiltva (nincs Docker/bwrap)')
                    : tx('sandbox_js: ellenőrzés...')}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Supervisor dry-run: <strong>{sandboxCapabilities?.supervisorBackend || '—'}</strong>
                </span>
                <span>
                  Node --permission:{' '}
                  <strong>
                    {sandboxCapabilities
                      ? sandboxCapabilities.nodePermissionSupported
                        ? `${sandboxCapabilities.nodePermissionFlag} (Node ${sandboxCapabilities.nodeVersion})`
                        : tx('nem támogatott ({0})', sandboxCapabilities.nodeVersion)
                      : '—'}
                  </strong>
                </span>
              </div>
              {sandboxCapabilities && !sandboxCapabilities.jsSandboxAvailable && (
                <div className="text-[11px] text-amber-900 dark:text-amber-200">
                  {tx('Telepítés Raspberry Pi / Debian rendszeren:')} <code>sudo apt update &amp;&amp; sudo apt install -y bubblewrap</code>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.sendAuditAnchorToTelegram)}
                  onChange={(e) => setForm({ ...form, sendAuditAnchorToTelegram: e.target.checked })}
                />
                <span>{tx('Napi Audit Fej-Hash küldése Telegramra (külső hamisítás-horgony)')}</span>
              </label>
              <InfoHint
                label={tx('Külső audit horgony')}
                text={tx('Naponta egyszer elküldi az audit napló HMAC-SHA256 zárólenyomatát Telegramra, így utólag sem módosíthatók észrevétlenül a helyi naplók.')}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.privacyMaskEnabled)}
                  onChange={(e) => setForm({ ...form, privacyMaskEnabled: e.target.checked })}
                />
                <span>{tx('Kávézó Mód (Privacy Mask) — költések és érzékeny összegek elrejtése a képernyőn')}</span>
              </label>
              <InfoHint
                label={tx('Kávézó mód')}
                text={tx('Ha nyilvános helyen dolgozol vagy képernyőt osztasz meg, elhomályosítja az érzékeny összegeket és adatokat.')}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.nightShiftEnabled)}
                  onChange={(e) => setForm({ ...form, nightShiftEnabled: e.target.checked })}
                />
                <span>{tx('Éjszakai Automata Műszak engedélyezve (alapból KI)')}</span>
              </label>
              <InfoHint
                label={tx('Éjszakai műszak')}
                text={tx('Ha bekapcsolod, az asszisztens éjszaka automatikusan átnézi a várólistát és jelentést készít.')}
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.softDowngradeOnBudget !== false}
                onChange={(e) => setForm({ ...form, softDowngradeOnBudget: e.target.checked })}
              />
              <span>{tx('Költséglimitnél automatikus váltás ingyenes helyi Ollama modellre leállás helyett')}</span>
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.guardrailsEnabled !== false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      guardrailsEnabled: e.target.checked,
                      guardrailBlockPii: e.target.checked,
                      guardrailBlockSecrets: e.target.checked,
                      guardrailBlockPromptInjection: e.target.checked,
                    })
                  }
                />
                <span>{tx('Biztonsági Védőkorlátok (személyes adatok, jelszavak és injekciók szűrése — ajánlott: BE)')}</span>
              </label>
              <InfoHint
                label={tx('Biztonsági védőkorlátok')}
                text={tx('Megakadályozza, hogy véletlenül jelszavak vagy titkos kulcsok szivárogjanak ki az AI válaszokban, és szűri a gyanús utasításokat.')}
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramInlineButtons !== false}
                onChange={(e) => setForm({ ...form, telegramInlineButtons: e.target.checked })}
              />
              <span>{tx('Telegram gyorsgombok megjelenítése a válaszokban')}</span>
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {tx('Hardver-Optimalizáló, Pi Védelem & Napi Összefoglalók')}
              </h3>
              <InfoHint
                label={tx('Hardver és napi összefoglalók')}
                text={tx('Automatikusan figyeli a gép memóriáját (különösen Raspberry Pi-n), valamint reggeli és esti rövid áttekintést küld.')}
              />
            </div>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
              {tx('Profil:')} {form.detectedHardwareTier || 'auto'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="set-ram-wd" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('RAM/OOM Őrszem Küszöb (%)')}
              </label>
              <input
                id="set-ram-wd"
                type="number"
                min="55"
                max="98"
                value={form.ramWatchdogThresholdPercent ?? 85}
                onChange={(e) => setForm({ ...form, ramWatchdogThresholdPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="set-morning-brief" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Reggeli Brief Időpont (HH:MM)')}
              </label>
              <input
                id="set-morning-brief"
                type="text"
                value={form.morningBriefTime || '07:30'}
                onChange={(e) => setForm({ ...form, morningBriefTime: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="set-evening-brief" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Esti Összefoglaló Időpont (HH:MM)')}
              </label>
              <input
                id="set-evening-brief"
                type="text"
                value={form.eveningBriefTime || '21:00'}
                onChange={(e) => setForm({ ...form, eveningBriefTime: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="set-gpio-fan" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('GPIO Termikus Ventilátor Pin (opc.)')}
              </label>
              <input
                id="set-gpio-fan"
                type="number"
                min="0"
                max="53"
                value={form.gpioFanPin ?? ''}
                placeholder={tx('pl. 17')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gpioFanPin: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.hardwareAutoOptimize !== false}
                onChange={(e) => setForm({ ...form, hardwareAutoOptimize: e.target.checked })}
              />
              <span>{tx('Hardver-Adaptív Auto-Optimalizáló aktív induláskor (CPU/RAM/GPU alapú finomhangolás)')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.sdCardSparingMode)}
                onChange={(e) => setForm({ ...form, sdCardSparingMode: e.target.checked })}
              />
              <span>{tx('SD-kártya Kímélő Mód (gyors telemetria pufferelése memóriában íráscsökkentéssel)')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.hybridLocalFirst !== false}
                onChange={(e) => setForm({ ...form, hybridLocalFirst: e.target.checked })}
              />
              <span>{tx('Hibrid Kontextus Routing (egyszerű feladatok helyi Ollama modellen, nehéz kódolás felhőben)')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramVoiceReplyEnabled !== false}
                onChange={(e) => setForm({ ...form, telegramVoiceReplyEnabled: e.target.checked })}
              />
              <span>{tx('Telegram Walkie-Talkie (hangüzenetre automatikus Opus hangválasz küldése)')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.selfHealingDaemonEnabled !== false}
                onChange={(e) => setForm({ ...form, selfHealingDaemonEnabled: e.target.checked })}
              />
              <span>{tx('Eseményvezérelt Öngyógyító Démon + Automatikus Inbox Triage')}</span>
            </label>
          </div>
        </div>

        {/* LAN Sentinel, Docker Auto-Heal & Mesh Offload */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tx('Hálózat-Őrszem, Konténer-újraindító & Gép-megosztás')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="set-speed-int" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('LAN & Sebességmérés Intervallum (perc)')}
              </label>
              <input
                id="set-speed-int"
                type="number"
                min="10"
                max="1440"
                value={form.speedtestIntervalMinutes ?? 60}
                onChange={(e) => setForm({ ...form, speedtestIntervalMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.lanSentinelAutoAlert !== false}
                onChange={(e) => setForm({ ...form, lanSentinelAutoAlert: e.target.checked })}
              />
              <span>{tx('LAN Őrszem azonnali Telegram riasztás ismeretlen MAC-cím csatlakozásakor')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.dockerAutoHealEnabled !== false}
                onChange={(e) => setForm({ ...form, dockerAutoHealEnabled: e.target.checked })}
              />
              <span>{tx('Docker Watchtower automatikus leállt / hibás konténer újraindítás')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.meshOffloadEnabled !== false}
                onChange={(e) => setForm({ ...form, meshOffloadEnabled: e.target.checked })}
              />
              <span>{tx('Swarm Mesh automatikus GPU / workstation node feladat-kiosztás engedélyezve')}</span>
            </label>
          </div>
        </div>

        {/* Universal OS, Local LLM Tuning & UI Density */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tx('Üzemmódok, Helyi AI Hangolás & Felület Sűrűsége')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="set-op-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Üzemmód Profil')}
              </label>
              <select
                id="set-op-mode"
                value={form.operatingMode || 'normal'}
                onChange={(e) => setForm({ ...form, operatingMode: e.target.value as Settings['operatingMode'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="normal">{tx('Normál')}</option>
                <option value="focus">{tx('Mély Fókusz')}</option>
                <option value="travel">{tx('Utazás / Távoli')}</option>
                <option value="emergency">{tx('Vészhelyzeti')}</option>
                <option value="chill">{tx('Pihenő / Hétvége')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-timezone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Időzóna (IANA)')}
              </label>
              <input
                id="set-timezone"
                type="text"
                value={form.timezone || 'Europe/Budapest'}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="set-fx-alert" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('EUR/HUF Riasztási Küszöb')}
              </label>
              <input
                id="set-fx-alert"
                type="number"
                step="0.5"
                min="0"
                value={form.currencyAlertThresholdHuf ?? 410}
                onChange={(e) => setForm({ ...form, currencyAlertThresholdHuf: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
            <div>
              <label htmlFor="set-tg-debounce" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Telegram Debounce (ms)
              </label>
              <input
                id="set-tg-debounce"
                type="number"
                min="0"
                max="10000"
                step="100"
                value={form.telegramMessageDebounceMs ?? 1200}
                onChange={(e) => setForm({ ...form, telegramMessageDebounceMs: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.compactUiMode)}
                onChange={(e) => setForm({ ...form, compactUiMode: e.target.checked })}
              />
              <span>{tx('Kompakt UI sűrűség (kisebb margók laptopon és mobilon)')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.compactLocalPrompt)}
                onChange={(e) => setForm({ ...form, compactLocalPrompt: e.target.checked })}
              />
              <span>{tx('Tömör helyi 1.5B–3B Ollama rendszerprompt (gyorsabb válasz kisebb kontextusban)')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramStreamEdit !== false}
                onChange={(e) => setForm({ ...form, telegramStreamEdit: e.target.checked })}
              />
              <span>{tx('Telegram élő szerkesztett streaming (válasz fokozatos frissítése)')}</span>
            </label>
          </div>

          {/* Agent Personalization & Behavior */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {tx('Ágens Személyre Szabás & Válaszstílus')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="set-default-tone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tx('Alapértelmezett Válaszstílus')}
                </label>
                <select
                  id="set-default-tone"
                  value={form.defaultResponseTone || 'balanced'}
                  onChange={(e) => setForm({ ...form, defaultResponseTone: e.target.value as Settings['defaultResponseTone'] })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="balanced">{tx('Kiegyensúlyozott (Balanced)')}</option>
                  <option value="concise">{tx('Tömör, lényegre törő (Concise)')}</option>
                  <option value="executive">{tx('Vezetői összefoglaló (Executive / BLUF)')}</option>
                  <option value="technical">{tx('Mély technikai (Technical)')}</option>
                  <option value="didactic">{tx('Tanító / magyarázó (Didactic)')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="set-adaptive-verbosity" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tx('Válasz Részletessége (Adaptív Mélység)')}
                </label>
                <select
                  id="set-adaptive-verbosity"
                  value={form.adaptiveVerbosity || 'balanced'}
                  onChange={(e) => setForm({ ...form, adaptiveVerbosity: e.target.value as Settings['adaptiveVerbosity'] })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="concise">{tx('Tömör (Concise)')}</option>
                  <option value="balanced">{tx('Kiegyensúlyozott (Balanced)')}</option>
                  <option value="exhaustive">{tx('Kimerítő, mély (Exhaustive)')}</option>
                </select>
              </div>
              <div className="flex flex-col justify-end text-xs text-slate-500 dark:text-slate-400">
                <span>{tx('Aktív Persona ID:')} <span className="font-mono">{form.activePersonaId || '-'}</span></span>
                <span>{tx('Aktív Kontextus ID:')} <span className="font-mono">{form.activeUserContextId || '-'}</span></span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoInjectFactVault !== false}
                  onChange={(e) => setForm({ ...form, autoInjectFactVault: e.target.checked })}
                />
                <span>{tx('Személyes Ténybank (Fact Vault) automatikus betöltése az ágensek rendszerpromptjába')}</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.agentSelfCritiquePass !== false}
                  onChange={(e) => setForm({ ...form, agentSelfCritiquePass: e.target.checked })}
                />
                <span>{tx('Ágens önellenőrző kritikai menet válaszadás előtt (pontosság és biztonság)')}</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.proactiveFollowUpSuggestions !== false}
                  onChange={(e) => setForm({ ...form, proactiveFollowUpSuggestions: e.target.checked })}
                />
                <span>{tx('Proaktív következő lépési javaslatok felajánlása válaszok végén')}</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoExtractActionItems !== false}
                  onChange={(e) => setForm({ ...form, autoExtractActionItems: e.target.checked })}
                />
                <span>{tx('Akciópontok automatikus felismerése megbeszélés- és chat-jegyzetekből')}</span>
              </label>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(true);
                  setResetMsg(null);
                }}
                className="px-3.5 py-2 text-xs font-medium border border-amber-300 text-amber-800 bg-amber-50 rounded-lg hover:bg-amber-100"
              >
                {tx('Adatok Törlése (Beállítások & Titkok Megtartásával)')}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/v7/system/reset-data', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keepSecretsAndSettings: true }),
                    });
                    setConfirmReset(false);
                    if (r.ok) {
                      setResetMsg(tx('Futásidejű adatok törölve; az API kulcsok, Telegram token és beállítások megmaradtak.'));
                      await onRefreshState();
                    }
                  }}
                  className="px-3.5 py-2 text-xs font-medium bg-red-700 text-white rounded-lg hover:bg-red-800"
                >
                  {tx('Megerősítem: Adatok Visszaállítása')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  {tx('Mégse')}
                </button>
              </div>
            )}
            {resetMsg && <span className="text-xs font-mono text-emerald-700">{resetMsg}</span>}
          </div>
        </div>
      </form>

      {/* LAN Operator Auth Lock Section */}
      <div id="lan-operator-password-section" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-700" />
            <h3 className="text-base font-semibold text-slate-900">{tx('Hálózati Operátori Jelszó Zár')}</h3>
            <InfoHint theme="light" label={tx('Operátori jelszó zár')} description={tx('Ha helyi hálózaton (LAN) vagy internetről is elérhető a gép, ez a jelszó védi meg a teljes vezérlőpultot idegenektől.')} />
          </div>
          <span
            className={`text-xs font-mono font-semibold ${
              settings.webAuthEnabled ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {settings.webAuthEnabled ? tx('VÉDELEM AKTÍV') : tx('Nyitott (Jelszó nélküli LAN mód)')}
          </span>
        </div>
        <p className="text-xs text-slate-600">
          {tx('Titkosított munkamenet-sütivel védi a felületet és minden API-hívást (min. 8 karakteres, erős jelszó javasolt).')}
        </p>
        {authMsg && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
            {authMsg}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!settings.webAuthHasPassword && settings.webAuthEnabled && (
            <input
              type="text"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              placeholder={tx('Egyszeri Setup-Kód (konzol / .novaswarm-setup.log)')}
              aria-label={tx('Egyszeri Setup-Kód (konzol / .novaswarm-setup.log)')}
              className="w-60 px-3 py-2 text-sm font-mono uppercase border border-amber-300 bg-amber-50 rounded-lg"
            />
          )}
          <input
            id="operator-password-input"
            type="password"
            value={operatorPassword}
            onChange={(e) => setOperatorPassword(e.target.value)}
            placeholder={
              settings.webAuthHasPassword
                ? tx('Új operátori jelszó (vagy hagyd üresen a kapcsoláshoz)...')
                : tx('Új operátori jelszó (min. 8 karakter)...')
            }
            aria-label={tx('Új operátori jelszó')}
            className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={() => void handleSaveOperatorAuth(true)}
            className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            {tx('Jelszó mentése és Zár BE')}
          </button>
          {settings.webAuthEnabled && (
            <button
              type="button"
              onClick={() => void handleSaveOperatorAuth(false)}
              className="px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              {tx('LAN Zár KI')}
            </button>
          )}
        </div>
      </div>

      {/* Emergency Kill Switch */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-2 bg-slate-50">
        <div className="text-xs text-slate-600 flex items-center gap-2">
          <span>
            <span className="font-semibold text-slate-800">{t('killSwitchTitle')}</span> {tx('— vészhelyzetben minden AI folyamat azonnali leállítása (Telegramról:')} <span className="font-mono">/stop</span>).
          </span>
          <InfoHint theme="light" label={tx('Vészleállító')} description={tx('Egyetlen gombnyomással megállítja az összes háttérben futó ágenst és automatikus műveletet.')} />
        </div>
        <button
          type="button"
          onClick={() => void handleToggleKillSwitch()}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${
            settings.killSwitchActive
              ? 'bg-emerald-700 text-white border-emerald-700'
              : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
          }`}
        >
          <OctagonAlert className="h-3.5 w-3.5" />
          {settings.killSwitchActive
            ? t('killSwitchDeactivate')
            : t('killSwitchActivate')}
        </button>
      </div>

      {autonomyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="autonomy-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 id="autonomy-modal-title" className="text-base font-bold">
                {tx('Teljes autonómia profil megerősítése')}
              </h3>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                {tx('A profil bekapcsolása egyszerre engedélyezi a géphez való hozzáférést, a jóváhagyás nélküli önálló feladatvégrehajtást és a parancssori')}{' '}
                <strong>{tx('Veszélyes Zónát')}</strong>.
              </p>
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-200">
                <strong>{tx('Kockázati figyelmeztetés:')}</strong>{' '}
                {tx('külső weboldalból, e-mailből vagy üzenetből származó prompt injection esetén az ágensek jóváhagyás nélkül futtathatnak rendszerparancsokat!')}
              </div>
              <p>
                {tx('A Telegram chat-ID engedélylista, a webes jelszózár, a napi Phoenix mentés és a')}{' '}
                <span className="font-mono">/stop</span> {tx('vészleállító ezalatt is aktív marad.')}
              </p>
            </div>
            {!settings.webAuthHasPassword && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900">
                {tx('Előbb állíts be egy operátori jelszót lent a „Hálózati Operátori Jelszó Zár” szekcióban!')}
              </div>
            )}
            {autonomyErr && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-300 text-xs text-red-900">
                {autonomyErr}
              </div>
            )}
            <div>
              <label htmlFor="autonomy-confirm-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tx('Operátori jelszó megerősítése')}
              </label>
              <input
                id="autonomy-confirm-pw"
                type="password"
                value={autonomyPassword}
                onChange={(e) => setAutonomyPassword(e.target.value)}
                placeholder={tx('Add meg az operátori jelszót...')}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAutonomyModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {tx('Mégse')}
              </button>
              <button
                type="button"
                disabled={autonomyBusy || !settings.webAuthHasPassword || !autonomyPassword.trim()}
                onClick={() => void handleToggleAutonomyProfile(true)}
                className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {autonomyBusy ? tx('Aktiválás...') : tx('Értem a kockázatot, Bekapcsolás')}
              </button>
            </div>
          </div>
        </div>
      )}
      {totalModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="total-autonomy-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 rounded-xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <OctagonAlert className="h-5 w-5 shrink-0" />
              <h3 id="total-autonomy-modal-title" className="text-base font-bold">
                {tx('Totális autonómia bekapcsolása')}
              </h3>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                {tx('A Totális autonómia engedélyezi az ágenseknek az önálló célciklust, a LAN felderítést/eszközvezérlést, a')}{' '}
                <span className="font-mono">settings_admin</span> {tx('módosításokat és a teljes gazdagép-parancsok futtatását.')}
              </p>
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-200">
                <strong>{tx('Sérthetetlen garanciák:')}</strong>{' '}
                {tx('az ágens sem tudja kikapcsolni az append-only auditot, a napi Telegram hash-horgonyt, a')}{' '}
                <span className="font-mono">/stop</span> {tx('LOCKDOWN vészleállítót és az automatikus biztonsági visszaállítási pontokat.')}
              </div>
            </div>
            {totalErr && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-300 text-xs text-red-900">
                {totalErr}
              </div>
            )}
            {settings.webAuthHasPassword && (
              <div>
                <label htmlFor="total-confirm-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tx('Operátori jelszó megerősítése')}
                </label>
                <input
                  id="total-confirm-pw"
                  type="password"
                  value={totalPassword}
                  onChange={(e) => setTotalPassword(e.target.value)}
                  placeholder={tx('Add meg az operátori jelszót...')}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTotalModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {tx('Mégse')}
              </button>
              <button
                type="button"
                disabled={totalBusy || (settings.webAuthHasPassword && !totalPassword.trim())}
                onClick={() => void handleToggleTotalAutonomy(true)}
                className="px-4 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50"
              >
                {totalBusy ? tx('Aktiválás...') : tx('Saját felelősségre Bekapcsolom')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
