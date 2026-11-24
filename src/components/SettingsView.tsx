import React, { useEffect, useState } from 'react';
import { KeyRound, OctagonAlert, Save } from 'lucide-react';
import type { ExecutionPreset, LanguageCode, Settings } from '../../shared/types';
import { InfoHint } from './InfoHint';
import { SUPPORTED_LANGUAGES, tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  settings: Settings;
  onRefreshState: () => Promise<void>;
}

export const SettingsView: React.FC<Props> = ({ language, settings, onRefreshState }) => {
  const [form, setForm] = useState<Settings>(settings);
  const [telegramToken, setTelegramToken] = useState('');
  const [braveSearchKey, setBraveSearchKey] = useState('');
  const [homeAssistantToken, setHomeAssistantToken] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          telegramToken: telegramToken.trim() || undefined,
          braveSearchKey: braveSearchKey.trim() || undefined,
          homeAssistantToken: homeAssistantToken.trim() || undefined,
        }),
      });
      if (res.ok) {
        setTelegramToken('');
        setBraveSearchKey('');
        setHomeAssistantToken('');
        setSavedMsg('Beállítások mentve és azonnal érvényesítve.');
        await onRefreshState();
      }
    } finally {
      setSaving(false);
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
      setAuthMsg(data.error || 'Hiba a LAN zár beállításakor');
      return;
    }
    setOperatorPassword('');
    setForm((prev) => ({
      ...prev,
      webAuthEnabled: Boolean(data.webAuthEnabled),
      webAuthHasPassword: Boolean(data.webAuthHasPassword),
    }));
    setAuthMsg(
      data.webAuthEnabled
        ? 'Operátori jelszó mentve és LAN jelszózár BEKAPCSOLVA.'
        : 'Operátori jelszó mentve (LAN jelszózár jelenleg KIKAPCSOLVA).'
    );
    await onRefreshState();
  };

  return (
    <div className="max-w-4xl space-y-8">
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tr(language, 'navSettings')}</h2>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 whitespace-nowrap shrink-0"
          >
            <Save className="h-4 w-4" />
            {tr(language, 'saveSettings')}
          </button>
        </div>

        {savedMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
            {savedMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="set-lang" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>Felület és Hangkimenet Nyelve</span>
              <InfoHint theme="light" label="Nyelv" description="A felület gombjai, értesítései és a felolvasó hang is ezen a nyelven szólal meg." />
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
              Biztonsági Mentés Ütemezése
            </label>
            <select
              id="set-backup"
              value={form.backupSchedule}
              onChange={(e) =>
                setForm({ ...form, backupSchedule: e.target.value as Settings['backupSchedule'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="manual">Manuális</option>
              <option value="daily">Napi</option>
              <option value="weekly">Heti</option>
              <option value="monthly">Havi</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-preset" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Alapértelmezett Végrehajtási Mód (Preset)
            </label>
            <select
              id="set-preset"
              value={form.defaultPreset || 'fast'}
              onChange={(e) => setForm({ ...form, defaultPreset: e.target.value as ExecutionPreset })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="fast">Gyors (Fast)</option>
              <option value="deep">Mély kutatás (Deep)</option>
              <option value="precise">Precíziós (Precise)</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-tool-steps" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Maximális Eszközlánc Mélység (ReAct lépések)
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
              <span>Globális Napi Költséglimit (USD)</span>
              <InfoHint theme="light" label="Napi költséglimit" description="Maximális napi dollárkeret fizetős AI modellekre. Ha eléri, automatikusan átvált ingyenes vagy helyi modellre." />
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
              Havi Várható Költség Riasztás (USD)
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
              Álmodás Indulási Inaktivitás (perc)
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
              Termikus Lassítási Küszöb (°C)
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
              Akkumulátor Kímélő Küszöb (%)
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
              Lokális Ollama URL
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
              Lokális Ollama Modell
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
              Ollama Kontextus Méret (num_ctx)
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
              Ollama Keep Alive (pl. 10m, 0)
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
              Ollama Automatikus RAM Kiürítés (perc, 0 = ki)
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
              Időjárás Település (Open-Meteo, kulcs nélküli)
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
              Piper Neurális TTS Parancs / Útvonal (opcionális)
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
              <span>Ébresztőszó (Hangvezérléshez)</span>
              <InfoHint theme="light" label="Ébresztőszó" description="Ha bekapcsolod a folyamatos figyelést, erre a szóra indul el a hangfelismerés." />
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
              <span>Fő Telegram Chat ID</span>
              <InfoHint theme="light" label="Telegram Chat ID" description="A saját Telegram fiókod vagy csoportod azonosítója. Biztonsági okból csak az itt megadott azonosítók vezérelhetik a botot." />
            </label>
            <input
              id="set-tg-chat"
              type="text"
              value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              placeholder="pl. 582910394"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-tg-allowed" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>Engedélyezett Telegram Chat ID-k (vesszővel)</span>
              <InfoHint theme="light" label="Telegram Engedélylista" description="Ha több embernek vagy csoportnak is engedélyeznéd a bot használatát, írd be ide az azonosítóikat vesszővel elválasztva. Üres listánál a bot minden idegent elutasít." />
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
              placeholder="pl. 582910394, -1001234567"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-tg-token" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Telegram Bot Token {settings.telegramHasToken ? '(konfigurálva)' : ''}
            </label>
            <input
              id="set-tg-token"
              type="password"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="Új token megadása..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-search-prov" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Web Keresőmotor
            </label>
            <select
              id="set-search-prov"
              value={form.searchProvider || 'duckduckgo'}
              onChange={(e) =>
                setForm({ ...form, searchProvider: e.target.value as Settings['searchProvider'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="duckduckgo">DuckDuckGo (Kulcs nélküli)</option>
              <option value="searxng">Lokális SearXNG</option>
              <option value="brave">Brave Search API</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-searx" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              SearXNG URL / Brave Search Kulcs {settings.braveHasKey ? '(Brave mentve)' : ''}
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
              Home Assistant URL & Token {settings.homeAssistantHasToken ? '(mentve)' : ''}
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
              MQTT Broker Host & Port
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
              Külső Rsync / NAS Mentési Célmappa
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
              CalDAV Naptár URL (opcionális)
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
              Föderációs Csomópont Neve
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
              Autonóm Heartbeat Intervallum (perc)
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
              Kanban Folyamatban WIP Limit
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
              Kanban Elakadás (Aging) Küszöb (óra)
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
              OTA Automatikus Ellenőrzés (óra)
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
              Memória Embedding Mód
            </label>
            <select
              id="set-emb-mode"
              value={form.embeddingMode || 'local_ngram'}
              onChange={(e) =>
                setForm({ ...form, embeddingMode: e.target.value as Settings['embeddingMode'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="local_ngram">Helyi n-gram + BM25 (Offline gyors)</option>
              <option value="ollama">Ollama Neurális Embedding</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-emb-model" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ollama Embedding Modell
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
              <span>Géphez való hozzáférés engedélyezése (fájlok, parancsok, terminál)</span>
            </label>
            <InfoHint
              label="Géphez való hozzáférés"
              text="Ha bekapcsolod, az asszisztens képes fájlokat olvasni/írni és parancsokat futtatni ezen a gépen. Alapból biztonsági okból ki van kapcsolva."
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.dailyCostLimitEnabled}
              onChange={(e) => setForm({ ...form, dailyCostLimitEnabled: e.target.checked })}
            />
            <span>Globális napi költséglimit aktív</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramEnabled}
                onChange={(e) => setForm({ ...form, telegramEnabled: e.target.checked })}
              />
              <span>Kétirányú Telegram gateway aktív</span>
            </label>
            <InfoHint
              label="Telegram gateway"
              text="Telefonról is tudsz parancsokat küldeni és értesítéseket kapni. Csak a fent megadott Telegram Chat ID-kről fogad el üzenetet."
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.heartbeatEnabled}
              onChange={(e) => setForm({ ...form, heartbeatEnabled: e.target.checked })}
            />
            <span>Automatikus állapotfigyelés (elakadt feladatok és szerver elérhetőség figyelése)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.autonomousKanbanWorkerEnabled)}
              onChange={(e) => setForm({ ...form, autonomousKanbanWorkerEnabled: e.target.checked })}
            />
            <span>Önálló feladat-végrehajtó (üresjáratban automatikusan dolgozik a várólistás kártyákon)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.autoUpdateEnabled)}
              onChange={(e) => setForm({ ...form, autoUpdateEnabled: e.target.checked })}
            />
            <span>GitHub Automatikus Frissítés engedélyezve (biztonsági mentéssel és visszaállítással)</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.channelPairingRequired}
                onChange={(e) => setForm({ ...form, channelPairingRequired: e.target.checked })}
              />
              <span>Csatorna Párosítási Kapu (6 jegyű kód ismeretlen feladóknak)</span>
            </label>
            <InfoHint
              label="Csatorna párosítási kapu"
              text="Idegen feladó nem tudja használni a botot, amíg a hatjegyű párosító kódot jóvá nem hagyod."
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.federationEnabled}
              onChange={(e) => setForm({ ...form, federationEnabled: e.target.checked })}
            />
            <span>Több gépes összekapcsolás (P2P Föderáció) engedélyezve</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.ttsEnabled}
              onChange={(e) => setForm({ ...form, ttsEnabled: e.target.checked })}
            />
            <span>Böngészőoldali szövegfelolvasás (WebSpeech TTS)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.continuousVoiceMode)}
              onChange={(e) => setForm({ ...form, continuousVoiceMode: e.target.checked })}
            />
            <span>Folyamatos kézmentes hangmód alapértelmezett (felolvasás után automatikus hallgatás)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.ttsHostSpeakerEnabled}
              onChange={(e) => setForm({ ...form, ttsHostSpeakerEnabled: e.target.checked })}
            />
            <span>Gazdagép hangszóró felolvasás (Piper / espeak-ng)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.wakeWordEnabled)}
              onChange={(e) => setForm({ ...form, wakeWordEnabled: e.target.checked })}
            />
            <span>Kézmentes ébresztőszó figyelés aktív a chatben</span>
          </label>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Önállóság, Megjelenés &amp; Adatvédelem
            </h3>
            <InfoHint
              label="Önállóság és megjelenés"
              text="Itt állíthatod be a felület kinézetét, az adatvédelmi maszkot, valamint azt, hogy az asszisztens mennyire önállóan cselekedjen jóváhagyás nélkül."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="set-theme-mode" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Megjelenési Téma</span>
                <InfoHint label="Megjelenési téma" text="Világos, sötét vagy nagy kontrasztú megjelenés választása." />
              </label>
              <select
                id="set-theme-mode"
                value={form.themeMode || 'light'}
                onChange={(e) => setForm({ ...form, themeMode: e.target.value as Settings['themeMode'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="light">Világos (Light)</option>
                <option value="dark">Sötét Mód (Dark)</option>
                <option value="high_contrast">Magas Kontraszt</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-sup-strict" className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Felügyelő Szigorúság</span>
                <InfoHint label="Felügyelő szigorúság" text="Mennyire szigorúan ellenőrizze a rendszer a kockázatos műveleteket." />
              </label>
              <select
                id="set-sup-strict"
                value={form.supervisorStrictness || 'balanced'}
                onChange={(e) =>
                  setForm({ ...form, supervisorStrictness: e.target.value as Settings['supervisorStrictness'] })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="permissive">Megengedő</option>
                <option value="balanced">Kiegyensúlyozott (Ajánlott)</option>
                <option value="paranoid">Szigorú</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-currency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Alapértelmezett Pénznem
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
                Éjszakai Műszak Gyakorisága (perc)
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
                Napló &amp; Vágólap Megőrzés (nap)
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

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.fullAutonomousMode)}
                  onChange={(e) => setForm({ ...form, fullAutonomousMode: e.target.checked })}
                />
                <span>Teljesen Önálló Mód — jóváhagyás kérése nélkül hajtsa végre a feladatokat (haladó, alapból KI)</span>
              </label>
              <InfoHint
                label="Teljesen önálló mód"
                text="Alapértelmezés szerint kikapcsolva van a biztonságod érdekében. Csak akkor kapcsold be, ha teljesen elszigetelt tesztkörnyezetben futtatod."
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.privacyMaskEnabled)}
                  onChange={(e) => setForm({ ...form, privacyMaskEnabled: e.target.checked })}
                />
                <span>Kávézó Mód (Privacy Mask) — költések és érzékeny összegek elrejtése a képernyőn</span>
              </label>
              <InfoHint
                label="Kávézó mód"
                text="Ha nyilvános helyen dolgozol vagy képernyőt osztasz meg, elhomályosítja az érzékeny összegeket és adatokat."
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.nightShiftEnabled)}
                  onChange={(e) => setForm({ ...form, nightShiftEnabled: e.target.checked })}
                />
                <span>Éjszakai Automata Műszak engedélyezve (alapból KI)</span>
              </label>
              <InfoHint
                label="Éjszakai műszak"
                text="Ha bekapcsolod, az asszisztens éjszaka automatikusan átnézi a várólistát és jelentést készít."
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.softDowngradeOnBudget !== false}
                onChange={(e) => setForm({ ...form, softDowngradeOnBudget: e.target.checked })}
              />
              <span>Költséglimitnél automatikus váltás ingyenes helyi Ollama modellre leállás helyett</span>
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
                <span>Biztonsági Védőkorlátok (személyes adatok, jelszavak és injekciók szűrése — ajánlott: BE)</span>
              </label>
              <InfoHint
                label="Biztonsági védőkorlátok"
                text="Megakadályozza, hogy véletlenül jelszavak vagy titkos kulcsok szivárogjanak ki az AI válaszokban, és szűri a gyanús utasításokat."
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramInlineButtons !== false}
                onChange={(e) => setForm({ ...form, telegramInlineButtons: e.target.checked })}
              />
              <span>Telegram gyorsgombok megjelenítése a válaszokban</span>
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Hardver-Optimalizáló, Pi Védelem &amp; Napi Összefoglalók
              </h3>
              <InfoHint
                label="Hardver és napi összefoglalók"
                text="Automatikusan figyeli a gép memóriáját (különösen Raspberry Pi-n), valamint reggeli és esti rövid áttekintést küld."
              />
            </div>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
              Profil: {form.detectedHardwareTier || 'auto'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="set-ram-wd" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                RAM/OOM Őrszem Küszöb (%)
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
                Reggeli Brief Időpont (HH:MM)
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
                Esti Összefoglaló Időpont (HH:MM)
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
                GPIO Termikus Ventilátor Pin (opc.)
              </label>
              <input
                id="set-gpio-fan"
                type="number"
                min="0"
                max="53"
                value={form.gpioFanPin ?? ''}
                placeholder="pl. 17"
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
              <span>Hardver-Adaptív Auto-Optimalizáló aktív induláskor (CPU/RAM/GPU alapú finomhangolás)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.sdCardSparingMode)}
                onChange={(e) => setForm({ ...form, sdCardSparingMode: e.target.checked })}
              />
              <span>SD-kártya Kímélő Mód (gyors telemetria pufferelése memóriában íráscsökkentéssel)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.hybridLocalFirst !== false}
                onChange={(e) => setForm({ ...form, hybridLocalFirst: e.target.checked })}
              />
              <span>Hibrid Kontextus Routing (egyszerű feladatok helyi Ollama modellen, nehéz kódolás felhőben)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramVoiceReplyEnabled !== false}
                onChange={(e) => setForm({ ...form, telegramVoiceReplyEnabled: e.target.checked })}
              />
              <span>Telegram Walkie-Talkie (hangüzenetre automatikus Opus hangválasz küldése)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.selfHealingDaemonEnabled !== false}
                onChange={(e) => setForm({ ...form, selfHealingDaemonEnabled: e.target.checked })}
              />
              <span>Eseményvezérelt Öngyógyító Démon + Automatikus Inbox Triage</span>
            </label>
          </div>
        </div>

        {/* LAN Sentinel, Docker Auto-Heal & Mesh Offload */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Hálózat-Őrszem, Konténer-újraindító &amp; Gép-megosztás
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="set-speed-int" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                LAN & Sebességmérés Intervallum (perc)
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
              <span>LAN Őrszem azonnali Telegram riasztás ismeretlen MAC-cím csatlakozásakor</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.dockerAutoHealEnabled !== false}
                onChange={(e) => setForm({ ...form, dockerAutoHealEnabled: e.target.checked })}
              />
              <span>Docker Watchtower automatikus leállt / hibás konténer újraindítás</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.meshOffloadEnabled !== false}
                onChange={(e) => setForm({ ...form, meshOffloadEnabled: e.target.checked })}
              />
              <span>Swarm Mesh automatikus GPU / workstation node feladat-kiosztás engedélyezve</span>
            </label>
          </div>
        </div>

        {/* Universal OS, Local LLM Tuning & UI Density */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Üzemmódok, Helyi AI Hangolás &amp; Felület Sűrűsége
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="set-op-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Üzemmód Profil
              </label>
              <select
                id="set-op-mode"
                value={form.operatingMode || 'normal'}
                onChange={(e) => setForm({ ...form, operatingMode: e.target.value as Settings['operatingMode'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="normal">Normál</option>
                <option value="focus">Mély Fókusz</option>
                <option value="travel">Utazás / Távoli</option>
                <option value="emergency">Vészhelyzeti</option>
                <option value="chill">Pihenő / Hétvége</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-timezone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Időzóna (IANA)
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
                EUR/HUF Riasztási Küszöb
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
              <span>Kompakt UI sűrűség (kisebb margók laptopon és mobilon)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.compactLocalPrompt)}
                onChange={(e) => setForm({ ...form, compactLocalPrompt: e.target.checked })}
              />
              <span>Tömör helyi 1.5B–3B Ollama rendszerprompt (gyorsabb válasz kisebb kontextusban)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramStreamEdit !== false}
                onChange={(e) => setForm({ ...form, telegramStreamEdit: e.target.checked })}
              />
              <span>Telegram élő szerkesztett streaming (válasz fokozatos frissítése)</span>
            </label>
          </div>

          {/* Agent Personalization & Behavior */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ágens Személyre Szabás &amp; Válaszstílus
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="set-default-tone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alapértelmezett Válaszstílus
                </label>
                <select
                  id="set-default-tone"
                  value={form.defaultResponseTone || 'balanced'}
                  onChange={(e) => setForm({ ...form, defaultResponseTone: e.target.value as Settings['defaultResponseTone'] })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="balanced">Kiegyensúlyozott (Balanced)</option>
                  <option value="concise">Tömör, lényegre törő (Concise)</option>
                  <option value="executive">Vezetői összefoglaló (Executive / BLUF)</option>
                  <option value="technical">Mély technikai (Technical)</option>
                  <option value="didactic">Tanító / magyarázó (Didactic)</option>
                </select>
              </div>
              <div>
                <label htmlFor="set-adaptive-verbosity" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Válasz Részletessége (Adaptív Mélység)
                </label>
                <select
                  id="set-adaptive-verbosity"
                  value={form.adaptiveVerbosity || 'balanced'}
                  onChange={(e) => setForm({ ...form, adaptiveVerbosity: e.target.value as Settings['adaptiveVerbosity'] })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="concise">Tömör (Concise)</option>
                  <option value="balanced">Kiegyensúlyozott (Balanced)</option>
                  <option value="exhaustive">Kimerítő, mély (Exhaustive)</option>
                </select>
              </div>
              <div className="flex flex-col justify-end text-xs text-slate-500 dark:text-slate-400">
                <span>Aktív Persona ID: <span className="font-mono">{form.activePersonaId || 'nincs'}</span></span>
                <span>Aktív Kontextus ID: <span className="font-mono">{form.activeUserContextId || 'nincs'}</span></span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoInjectFactVault !== false}
                  onChange={(e) => setForm({ ...form, autoInjectFactVault: e.target.checked })}
                />
                <span>Személyes Ténybank (Fact Vault) automatikus betöltése az ágensek rendszerpromptjába</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.agentSelfCritiquePass !== false}
                  onChange={(e) => setForm({ ...form, agentSelfCritiquePass: e.target.checked })}
                />
                <span>Ágens önellenőrző kritikai menet válaszadás előtt (pontosság és biztonság)</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.proactiveFollowUpSuggestions !== false}
                  onChange={(e) => setForm({ ...form, proactiveFollowUpSuggestions: e.target.checked })}
                />
                <span>Proaktív következő lépési javaslatok felajánlása válaszok végén</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoExtractActionItems !== false}
                  onChange={(e) => setForm({ ...form, autoExtractActionItems: e.target.checked })}
                />
                <span>Akciópontok automatikus felismerése megbeszélés- és chat-jegyzetekből</span>
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
                Adatok Törlése (Beállítások &amp; Titkok Megtartásával)
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
                      setResetMsg('Futásidejű adatok törölve; az API kulcsok, Telegram token és beállítások megmaradtak.');
                      await onRefreshState();
                    }
                  }}
                  className="px-3.5 py-2 text-xs font-medium bg-red-700 text-white rounded-lg hover:bg-red-800"
                >
                  Megerősítem: Adatok Visszaállítása
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Mégse
                </button>
              </div>
            )}
            {resetMsg && <span className="text-xs font-mono text-emerald-700">{resetMsg}</span>}
          </div>
        </div>
      </form>

      {/* LAN Operator Auth Lock Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-700" />
            <h3 className="text-base font-semibold text-slate-900">Hálózati Operátori Jelszó Zár</h3>
            <InfoHint theme="light" label="Operátori jelszó zár" description="Ha helyi hálózaton (LAN) vagy internetről is elérhető a gép, ez a jelszó védi meg a teljes vezérlőpultot idegenektől." />
          </div>
          <span
            className={`text-xs font-mono font-semibold ${
              settings.webAuthEnabled ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {settings.webAuthEnabled ? 'VÉDELEM AKTÍV' : 'Nyitott (Helyi mód)'}
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Titkosított munkamenet-sütivel védi a felületet és minden API-hívást (min. 8 karakteres jelszó ajánlott).
        </p>
        {authMsg && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
            {authMsg}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={operatorPassword}
            onChange={(e) => setOperatorPassword(e.target.value)}
            placeholder={
              settings.webAuthHasPassword
                ? 'Új operátori jelszó (vagy hagyd üresen a kapcsoláshoz)...'
                : 'Új operátori jelszó (min. 8 karakter)...'
            }
            aria-label="New operator password"
            className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={() => void handleSaveOperatorAuth(true)}
            className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            Jelszó mentése és Zár BE
          </button>
          {settings.webAuthEnabled && (
            <button
              type="button"
              onClick={() => void handleSaveOperatorAuth(false)}
              className="px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              LAN Zár KI
            </button>
          )}
        </div>
      </div>

      {/* Emergency Kill Switch */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-2 bg-slate-50">
        <div className="text-xs text-slate-600 flex items-center gap-2">
          <span>
            <span className="font-semibold text-slate-800">{tr(language, 'killSwitchTitle')}</span> — vészhelyzetben minden AI folyamat azonnali leállítása (Telegramról: <span className="font-mono">/stop</span>).
          </span>
          <InfoHint theme="light" label="Vészleállító" description="Egyetlen gombnyomással megállítja az összes háttérben futó ágenst és automatikus műveletet." />
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
            ? tr(language, 'killSwitchDeactivate')
            : tr(language, 'killSwitchActivate')}
        </button>
      </div>
    </div>
  );
};
