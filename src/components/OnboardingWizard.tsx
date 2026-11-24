import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, KeyRound, ShieldAlert, ShieldCheck, Terminal } from 'lucide-react';
import type { LanguageCode, ProviderId } from '../../shared/types';
import { InfoHint } from './InfoHint';
import { getLanguageDir, SUPPORTED_LANGUAGES, tr } from '../locales/translations';

interface Archetype {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  keywords: RegExp;
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'general',
    name: 'Központi Asszisztens',
    role: 'Általános Asszisztens',
    systemPrompt:
      'Sokoldalú személyi koordinátor vagy. Átlátod a napi teendőket, kutatsz, rendszerezel, és szükség esetén szakértő alágenseket hozol létre.',
    keywords: /\b(általános|szervezés|napi|asszisztens|general|assistant|schedule)\b/i,
  },
  {
    id: 'developer',
    name: 'Dev Copilot',
    role: 'Fejlesztő Copilot',
    systemPrompt:
      'Senior szoftvermérnök és kódoló copilot vagy. Tiszta TypeScript/Linux megoldásokat szállítasz, teszteket írsz és ellenőrzöd a buildet.',
    keywords: /\b(kód|fejleszt|program|typescript|react|node|git|software|developer|code|linux)\b/i,
  },
  {
    id: 'strategist',
    name: 'Stratégiai Tanácsadó',
    role: 'Üzleti és Stratégiai Tanácsadó',
    systemPrompt:
      'Analitikus üzleti, pénzügyi és stratégiai tanácsadó vagy. Döntési mátrixokat, kockázatelemzést és világos cselekvési terveket készítesz.',
    keywords: /\b(üzlet|stratégia|pénz|projekt|terv|business|strategy|finance)\b/i,
  },
  {
    id: 'sysadmin',
    name: 'Linux Őrszem',
    role: 'Rendszerüzemeltető & Biztonsági Felelős',
    systemPrompt:
      'Linux rendszergazda és biztonsági mérnök vagy. Felügyeled a hardvert, a csomagokat, a folyamatokat, a mentéseket és a hálózati biztonságot.',
    keywords: /\b(szerver|linux|biztonság|hálózat|hardver|ops|sysadmin|security|debian|ubuntu)\b/i,
  },
];

interface Props {
  initialLanguage: LanguageCode;
  hasServerEnvGemini: boolean;
  onComplete: () => Promise<void>;
}

export const OnboardingWizard: React.FC<Props> = ({
  initialLanguage,
  hasServerEnvGemini,
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState<LanguageCode>(initialLanguage);

  // Step 2: Provider keys or Ollama-only
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [ollamaOnlyMode, setOllamaOnlyMode] = useState(false);
  const [primaryProvider, setPrimaryProvider] = useState<ProviderId>('gemini');

  // Step 3: Telegram (optional)
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  // Step 4: User profile
  const [userProfile, setUserProfile] = useState('');

  // Step 5: First Agent
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('general');
  const [agentName, setAgentName] = useState(ARCHETYPES[0].name);
  const [agentRole, setAgentRole] = useState(ARCHETYPES[0].role);
  const [agentPrompt, setAgentPrompt] = useState(ARCHETYPES[0].systemPrompt);

  // Step 6: Host Permissions & Operator Password
  const [hostPermissionsGranted, setHostPermissionsGranted] = useState(false);
  const [operatorPassword, setOperatorPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recommendedArchetypeId = useMemo(() => {
    if (!userProfile.trim()) return 'general';
    for (const arch of ARCHETYPES) {
      if (arch.keywords.test(userProfile)) return arch.id;
    }
    return 'general';
  }, [userProfile]);

  const hasAnyCloudKey = Boolean(
    hasServerEnvGemini ||
      geminiKey.trim() ||
      openaiKey.trim() ||
      anthropicKey.trim() ||
      openrouterKey.trim()
  );

  const handleSelectArchetype = (arch: Archetype) => {
    setSelectedArchetypeId(arch.id);
    setAgentName(arch.name);
    setAgentRole(arch.role);
    setAgentPrompt(arch.systemPrompt);
  };

  const handleNext = () => {
    setError(null);
    if (step === 2 && !ollamaOnlyMode && !hasAnyCloudKey) {
      setError(tr(language, 'step2ValidationErr'));
      return;
    }
    if (step === 4) {
      const rec = ARCHETYPES.find((a) => a.id === recommendedArchetypeId);
      if (rec && agentName === ARCHETYPES[0].name) {
        handleSelectArchetype(rec);
      }
    }
    if (step === 5 && !agentName.trim()) {
      setError('Agent name is required.');
      return;
    }
    setStep((prev) => Math.min(6, prev + 1));
  };

  const handleFinish = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const apiKeys: Partial<Record<ProviderId, string>> = {};
      if (geminiKey.trim()) apiKeys.gemini = geminiKey.trim();
      if (openaiKey.trim()) apiKeys.openai = openaiKey.trim();
      if (anthropicKey.trim()) apiKeys.anthropic = anthropicKey.trim();
      if (openrouterKey.trim()) apiKeys.openrouter = openrouterKey.trim();

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          ollamaOnlyMode,
          primaryProvider: ollamaOnlyMode ? 'ollama' : primaryProvider,
          apiKeys,
          telegramToken,
          telegramChatId,
          userProfile,
          firstAgent: {
            name: agentName.trim(),
            role: agentRole.trim(),
            systemPrompt: agentPrompt.trim(),
            providerId: ollamaOnlyMode ? 'ollama' : primaryProvider,
            hostExecutionEnabled: hostPermissionsGranted,
          },
          hostPermissionsGranted,
          operatorPassword: operatorPassword.trim() || undefined,
          setupCode: setupCode.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Setup failed');
      }
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={getLanguageDir(language)}
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-6 py-10"
    >
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {tr(language, 'wizardTitle')}
            </h1>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {tr(language, 'wizardStep')} {step} / 6
            </p>
          </div>
          <div className="flex items-center gap-1.5" aria-label="Progress">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className={`h-2 w-8 rounded-sm transition-colors ${
                  n <= step ? 'bg-slate-900' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="py-6 min-h-[340px]">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'step1Title')}</h2>
              <p className="text-sm text-slate-600">{tr(language, 'step1Desc')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLanguage(lang.code)}
                    className={`flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg border transition-colors text-left ${
                      language === lang.code
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span>{lang.nativeName}</span>
                    <span className="text-xs opacity-70 font-mono uppercase">{lang.code}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'step2Title')}</h2>
                <InfoHint
                  theme="light"
                  label="AI Szolgáltatók"
                  description="Az AI válaszokhoz kell egy felhős kulcs (pl. ingyenes Gemini API) vagy egy a gépeden futó helyi Ollama. Ezt bármikor módosíthatod."
                />
              </div>
              <p className="text-sm text-slate-600">{tr(language, 'step2Desc')}</p>
              <p className="text-xs text-slate-500">{tr(language, 'step2MultiKeyNote')}</p>

              {hasServerEnvGemini && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                  Server GEMINI_API_KEY detected in environment — ready to route Gemini calls.
                </div>
              )}

              <label className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={ollamaOnlyMode}
                  onChange={(e) => setOllamaOnlyMode(e.target.checked)}
                  className="h-4 w-4 accent-slate-900"
                />
                <span className="text-sm font-medium text-slate-800">
                  {tr(language, 'step2OllamaOnly')}
                </span>
              </label>

              {!ollamaOnlyMode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label htmlFor="wiz-gemini" className="block text-xs font-medium text-slate-700 mb-1">
                      Google Gemini API Key
                    </label>
                    <input
                      id="wiz-gemini"
                      type="password"
                      value={geminiKey}
                      onChange={(e) => {
                        setGeminiKey(e.target.value);
                        if (e.target.value) setPrimaryProvider('gemini');
                      }}
                      placeholder="AIza..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor="wiz-openrouter" className="block text-xs font-medium text-slate-700 mb-1">
                      OpenRouter API Key
                    </label>
                    <input
                      id="wiz-openrouter"
                      type="password"
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor="wiz-openai" className="block text-xs font-medium text-slate-700 mb-1">
                      OpenAI API Key
                    </label>
                    <input
                      id="wiz-openai"
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor="wiz-anthropic" className="block text-xs font-medium text-slate-700 mb-1">
                      Anthropic API Key
                    </label>
                    <input
                      id="wiz-anthropic"
                      type="password"
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'step3Title')}</h2>
                <InfoHint
                  theme="light"
                  label="Telegram összekötés"
                  description="Ha megadod a Telegram bot tokened és a saját Chat ID-dat, telefonról is tudsz írni vagy hangüzenetet küldeni a rendszernek. Idegen Chat ID-k alapból tiltva vannak."
                />
              </div>
              <p className="text-sm text-slate-600">{tr(language, 'step3Desc')}</p>
              <div className="space-y-3 pt-2">
                <div>
                  <label htmlFor="wiz-tg-token" className="block text-xs font-medium text-slate-700 mb-1">
                    Telegram Bot Token
                  </label>
                  <input
                    id="wiz-tg-token"
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456789:AAH..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-tg-chat" className="block text-xs font-medium text-slate-700 mb-1">
                    Telegram Chat / Group ID
                  </label>
                  <input
                    id="wiz-tg-chat"
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="e.g. 582910394"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'step4Title')}</h2>
              <p className="text-sm text-slate-600">{tr(language, 'step4Desc')}</p>
              <label htmlFor="wiz-profile" className="sr-only">
                {tr(language, 'step4Title')}
              </label>
              <textarea
                id="wiz-profile"
                rows={6}
                value={userProfile}
                onChange={(e) => setUserProfile(e.target.value)}
                placeholder={tr(language, 'step4Placeholder')}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'step5Title')}</h2>
              <p className="text-sm text-slate-600">{tr(language, 'step5Desc')}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ARCHETYPES.map((arch) => {
                  const isRec = arch.id === recommendedArchetypeId;
                  const isSelected = arch.id === selectedArchetypeId;
                  return (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => handleSelectArchetype(arch)}
                      className={`p-3.5 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{arch.role}</span>
                        {isRec && (
                          <span className="text-[11px] font-medium underline underline-offset-2">
                            {tr(language, 'step5Recommended')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1 opacity-80 line-clamp-2">{arch.systemPrompt}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label htmlFor="wiz-agent-name" className="block text-xs font-medium text-slate-700 mb-1">
                    {tr(language, 'step5Name')}
                  </label>
                  <input
                    id="wiz-agent-name"
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-agent-role" className="block text-xs font-medium text-slate-700 mb-1">
                    {tr(language, 'step5Role')}
                  </label>
                  <input
                    id="wiz-agent-role"
                    type="text"
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="wiz-agent-prompt" className="block text-xs font-medium text-slate-700 mb-1">
                  {tr(language, 'step5Prompt')}
                </label>
                <textarea
                  id="wiz-agent-prompt"
                  rows={3}
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{tr(language, 'step6Title')}</h2>
                <InfoHint
                  theme="light"
                  label="Biztonsági beállítások"
                  description="Alapértelmezésben a géphez (fájlokhoz, parancssorhoz) való hozzáférés biztonságosan ki van kapcsolva. Csak akkor engedélyezd, ha tényleg rendszerfelügyeletre használod."
                />
              </div>
              <p className="text-sm text-slate-600">{tr(language, 'step6Desc')}</p>
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => setHostPermissionsGranted(false)}
                  className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
                    !hostPermissionsGranted
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold">{tr(language, 'step6Restrict')} (Ajánlott induláshoz)</div>
                    <div className="text-xs opacity-80 mt-0.5">
                      Biztonságos mód: az AI segít beszélgetni, tervezni és kutatni, de nem tud közvetlenül fájlokat törölni vagy terminálparancsokat futtatni a gépeden.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setHostPermissionsGranted(true)}
                  className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
                    hostPermissionsGranted
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold">{tr(language, 'step6Allow')}</div>
                    <div className="text-xs opacity-80 mt-0.5">
                      Engedélyezi a beépített terminált, fájlkezelést és hardver-diagnosztikát. Veszélyes parancsok előtt továbbra is jóváhagyást kér a rendszer.
                    </div>
                  </div>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <label htmlFor="wiz-op-pass" className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <KeyRound className="h-3.5 w-3.5" />
                  Operátori belépési jelszó (ajánlott hálózati védelemhez, min. 8 karakter)
                </label>
                <input
                  id="wiz-op-pass"
                  type="password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  placeholder="Hagyd üresen, ha később állítod be a Beállításokban..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {operatorPassword.trim().length > 0 && (
                  <div className="pt-1.5 space-y-1">
                    <label htmlFor="wiz-setup-code" className="block text-xs font-medium text-amber-800">
                      Egyszeri szerver Setup-Kód (a szerver konzolról vagy a .novaswarm-setup.log fájlból)
                    </label>
                    <input
                      id="wiz-setup-code"
                      type="text"
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                      placeholder="pl. A1B2-C3D4-E5F6"
                      className="w-full px-3 py-2 text-sm font-mono uppercase border border-amber-300 bg-amber-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <Terminal className="h-4 w-4" />
                <span>Biztonságos alapértelmezések: jóváhagyásos végrehajtás · védett hálózat · 1 aktív segítő ágens + 1 Felügyelő.</span>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep((p) => Math.max(1, p - 1));
            }}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
            {tr(language, 'wizardBack')}
          </button>

          <div className="flex items-center gap-3">
            {step === 3 && (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                {tr(language, 'step3Skip')}
              </button>
            )}

            {step < 6 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {tr(language, 'wizardNext')}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinish}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Check className="h-4 w-4" />
                {tr(language, 'wizardFinish')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
