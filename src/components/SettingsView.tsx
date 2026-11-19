import React, { useState } from 'react';
import { KeyRound, OctagonAlert, Save } from 'lucide-react';
import type { LanguageCode, Settings } from '../../shared/types';
import { SUPPORTED_LANGUAGES, tr } from '../locales/translations';

interface Props {
  language: LanguageCode;
  settings: Settings;
  onRefreshState: () => Promise<void>;
}

export const SettingsView: React.FC<Props> = ({ language, settings, onRefreshState }) => {
  const [form, setForm] = useState<Settings>(settings);
  const [telegramToken, setTelegramToken] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

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
        }),
      });
      if (res.ok) {
        setTelegramToken('');
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
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'navSettings')}</h2>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
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
            <label htmlFor="set-lang" className="block text-xs font-medium text-slate-700 mb-1">
              Felület és Hangkimenet Nyelve (11 nyelv)
            </label>
            <select
              id="set-lang"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as LanguageCode })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="set-backup" className="block text-xs font-medium text-slate-700 mb-1">
              Biztonsági Mentés Ütemezése
            </label>
            <select
              id="set-backup"
              value={form.backupSchedule}
              onChange={(e) =>
                setForm({ ...form, backupSchedule: e.target.value as Settings['backupSchedule'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="manual">Manuális</option>
              <option value="daily">Napi</option>
              <option value="weekly">Heti</option>
              <option value="monthly">Havi</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-budget" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-dream-idle" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-temp" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-bat" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-ollama-url" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-ollama-model" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-tg-chat" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-tg-token" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-instance-name" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-heartbeat-int" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-kanban-wip" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-kanban-aging" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-cache-ttl" className="block text-xs font-medium text-slate-700 mb-1">
              Gateway Cache TTL (másodperc)
            </label>
            <input
              id="set-cache-ttl"
              type="number"
              min="10"
              value={form.responseCacheTtlSec}
              onChange={(e) => setForm({ ...form, responseCacheTtlSec: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="set-emb-mode" className="block text-xs font-medium text-slate-700 mb-1">
              Memória Embedding Mód
            </label>
            <select
              id="set-emb-mode"
              value={form.embeddingMode || 'local_ngram'}
              onChange={(e) =>
                setForm({ ...form, embeddingMode: e.target.value as Settings['embeddingMode'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="local_ngram">Helyi n-gram + BM25 (Offline gyors)</option>
              <option value="ollama">Ollama Neurális Embedding (nomic-embed-text)</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-emb-model" className="block text-xs font-medium text-slate-700 mb-1">
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

          <div>
            <label htmlFor="set-ota-repo" className="block text-xs font-medium text-slate-700 mb-1">
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
            <label htmlFor="set-ota-hours" className="block text-xs font-medium text-slate-700 mb-1">
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
              checked={form.ttsHostSpeakerEnabled}
              onChange={(e) => setForm({ ...form, ttsHostSpeakerEnabled: e.target.checked })}
            />
            <span>Gazdagép hangszóró TTS (espeak-ng)</span>
          </label>
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

      {/* Intentionally unobtrusive Emergency Kill Switch at the bottom of Settings (Section 8.4 & 15.4) */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{tr(language, 'killSwitchTitle')}</span> — vészhelyzetben minden ágens-folyamat és MCP szerver azonnali leállítása (Telegram: <span className="font-mono">/stop</span>).
        </div>
        <button
          type="button"
          onClick={handleToggleKillSwitch}
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
