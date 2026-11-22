import React, { useEffect, useState } from 'react';
import { KeyRound, OctagonAlert, Save } from 'lucide-react';
import type { ExecutionPreset, LanguageCode, Settings } from '../../shared/types';
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
            <label htmlFor="set-lang" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Felület és Hangkimenet Nyelve (11 nyelv)
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
            <label htmlFor="set-budget" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Globális Napi Költséglimit (USD)
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
            <label htmlFor="set-wake-phrase" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ébresztőszó (Wake Word · Ú45)
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
            <label htmlFor="set-tg-chat" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Telegram Chat / Csoport ID
            </label>
            <input
              id="set-tg-chat"
              type="text"
              value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
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
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.hostPermissionsGranted}
              onChange={(e) => setForm({ ...form, hostPermissionsGranted: e.target.checked })}
            />
            <span>Gazdagép-jogosultsági kapu engedélyezve (fájlok, parancsok, PTY terminál)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.dailyCostLimitEnabled}
              onChange={(e) => setForm({ ...form, dailyCostLimitEnabled: e.target.checked })}
            />
            <span>Globális napi költséglimit aktív</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.telegramEnabled}
              onChange={(e) => setForm({ ...form, telegramEnabled: e.target.checked })}
            />
            <span>Kétirányú Telegram gateway aktív</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.heartbeatEnabled}
              onChange={(e) => setForm({ ...form, heartbeatEnabled: e.target.checked })}
            />
            <span>Autonóm Heartbeat (Kanban elakadás + Uptime monitoring) aktív</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.autonomousKanbanWorkerEnabled)}
              onChange={(e) => setForm({ ...form, autonomousKanbanWorkerEnabled: e.target.checked })}
            />
            <span>Autonóm Kanban Backlog Munkás (üresjáratban automatikusan dolgozik a ToDo kártyákon)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.autoUpdateEnabled)}
              onChange={(e) => setForm({ ...form, autoUpdateEnabled: e.target.checked })}
            />
            <span>GitHub OTA Automatikus Frissítés engedélyezve (git pull + build + rollback védelem)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.channelPairingRequired}
              onChange={(e) => setForm({ ...form, channelPairingRequired: e.target.checked })}
            />
            <span>Csatorna Párosítási Kapu (6 jegyű kód ismeretlen feladóknak)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.federationEnabled}
              onChange={(e) => setForm({ ...form, federationEnabled: e.target.checked })}
            />
            <span>P2P Föderáció engedélyezve</span>
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
            <span>Folyamatos kézmentes hangmód alapértelmezett (TTS után automatikus hallgatás)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.ttsHostSpeakerEnabled}
              onChange={(e) => setForm({ ...form, ttsHostSpeakerEnabled: e.target.checked })}
            />
            <span>Gazdagép hangszóró TTS (Piper neurális / espeak-ng)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.wakeWordEnabled)}
              onChange={(e) => setForm({ ...form, wakeWordEnabled: e.target.checked })}
            />
            <span>Kézmentes Ébresztőszó Figyelés aktív a Raj Chatben (Wake Word)</span>
          </label>
        </div>

        {/* Batch 3: Zero-Friction Full Autonomy, Theme, Privacy & Night Shift */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            100% Autonómia, Megjelenés & Megőrzés (Batch 3)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="set-theme-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Megjelenési Téma (M159)
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
              <label htmlFor="set-sup-strict" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Felügyelő Szigorúság (M118)
              </label>
              <select
                id="set-sup-strict"
                value={form.supervisorStrictness || 'permissive'}
                onChange={(e) =>
                  setForm({ ...form, supervisorStrictness: e.target.value as Settings['supervisorStrictness'] })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="permissive">Megengedő (Privát Autonóm)</option>
                <option value="balanced">Kiegyensúlyozott</option>
                <option value="paranoid">Szigorú</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-currency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Alapértelmezett Pénznem (Ú147)
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
                Éjszakai Műszak Intervallum (perc · Ú61)
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
                Napló/Vágólap Megőrzés (nap · M156)
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
            <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={form.fullAutonomousMode !== false}
                onChange={(e) => setForm({ ...form, fullAutonomousMode: e.target.checked })}
              />
              <span>100% Autonóm Végrehajtás — sose kérdezze az engedélyt, minden parancsot és feladatot azonnal hajtson végre</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.privacyMaskEnabled)}
                onChange={(e) => setForm({ ...form, privacyMaskEnabled: e.target.checked })}
              />
              <span>Kávézó Mód (Privacy Mask) — költések és érzékeny összegek elmosása a felületen (Ú158)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.nightShiftEnabled !== false}
                onChange={(e) => setForm({ ...form, nightShiftEnabled: e.target.checked })}
              />
              <span>Éjszakai Autonóm Műszak (Night Shift Coder) engedélyezve (Ú61)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.softDowngradeOnBudget !== false}
                onChange={(e) => setForm({ ...form, softDowngradeOnBudget: e.target.checked })}
              />
              <span>Költséglimitnél automatikus helyi Ollama fallback leállás helyett (M84)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.guardrailsEnabled)}
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
              <span>Biztonsági Guardrail szűrések (alapértelmezés szerint KI — privát LAN/Telegram módhoz)</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.telegramInlineButtons !== false}
                onChange={(e) => setForm({ ...form, telegramInlineButtons: e.target.checked })}
              />
              <span>Telegram gyorsgombok (Inline Keyboard) a válaszokban</span>
            </label>
          </div>
        </div>

        {/* Batch 5: Hardware-Adaptive Optimization & Proactive Second Self */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Hardver-Adaptív Optimalizáló, Pi Védelem & Proaktív Második Én (Batch 5)
            </h3>
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
      </form>

      {/* LAN Operator Auth Lock Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-700" />
            <h3 className="text-base font-semibold text-slate-900">LAN Operátori Jelszó Zár</h3>
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
          HttpOnly HMAC munkamenet-sütivel védi a Web UI és API végpontokat (a webhook és OpenAI /v1/* proxy kulcsos végpontok továbbra is működnek).
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
                : 'Új operátori jelszó (min. 4 karakter)...'
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
      <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{tr(language, 'killSwitchTitle')}</span> — vészhelyzetben minden ágens-folyamat és MCP szerver azonnali leállítása (Telegram: <span className="font-mono">/stop</span>).
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
