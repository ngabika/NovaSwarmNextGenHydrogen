import type { LanguageCode } from '../../shared/types';

export interface LanguageOption {
  code: LanguageCode;
  nativeName: string;
  speechLocale: string;
  dir?: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'hu', nativeName: 'Magyar', speechLocale: 'hu-HU' },
  { code: 'en', nativeName: 'English', speechLocale: 'en-US' },
  { code: 'de', nativeName: 'Deutsch', speechLocale: 'de-DE' },
  { code: 'es', nativeName: 'Español', speechLocale: 'es-ES' },
  { code: 'fr', nativeName: 'Français', speechLocale: 'fr-FR' },
  { code: 'it', nativeName: 'Italiano', speechLocale: 'it-IT' },
  { code: 'pt', nativeName: 'Português', speechLocale: 'pt-PT' },
  { code: 'ru', nativeName: 'Русский', speechLocale: 'ru-RU' },
  { code: 'zh', nativeName: '中文', speechLocale: 'zh-CN' },
  { code: 'ja', nativeName: '日本語', speechLocale: 'ja-JP' },
  { code: 'ar', nativeName: 'العربية', speechLocale: 'ar-SA', dir: 'rtl' },
];

type TranslationKeys = {
  appName: string;
  navSwarm: string;
  navAgents: string;
  navMemory: string;
  navModels: string;
  navMcp: string;
  navTerminal: string;
  navSystem: string;
  navSettings: string;
  supervisorPanelTitle: string;
  supervisorNominal: string;
  supervisorWarning: string;
  supervisorAlert: string;
  supervisorLastCheck: string;
  supervisorDiscrepancies: string;
  supervisorSandboxTests: string;
  supervisorRunAudit: string;
  wizardTitle: string;
  wizardStep: string;
  wizardNext: string;
  wizardBack: string;
  wizardFinish: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step2OllamaOnly: string;
  step2MultiKeyNote: string;
  step2ValidationErr: string;
  step3Title: string;
  step3Desc: string;
  step3Skip: string;
  step4Title: string;
  step4Desc: string;
  step4Placeholder: string;
  step5Title: string;
  step5Desc: string;
  step5Recommended: string;
  step5Name: string;
  step5Role: string;
  step5Prompt: string;
  step6Title: string;
  step6Desc: string;
  step6Allow: string;
  step6Restrict: string;
  chatPlaceholder: string;
  send: string;
  teamRoom: string;
  summaryView: string;
  kanbanTitle: string;
  kanbanEmpty: string;
  addCard: string;
  todo: string;
  inProgress: string;
  done: string;
  createAgent: string;
  runDreaming: string;
  discoverModels: string;
  testFailover: string;
  testConnection: string;
  terminalLockedTitle: string;
  terminalLockedDesc: string;
  terminalNewSession: string;
  killSwitchTitle: string;
  killSwitchActivate: string;
  killSwitchDeactivate: string;
  saveSettings: string;
  estimatedBadge: string;
  realHeaderBadge: string;
  notConnected: string;
  hostPermGranted: string;
  hostPermRestricted: string;
  dailyBudget: string;
  ttsSpeak: string;
  approvalsPending: string;
  approve: string;
  reject: string;
  createBackup: string;
  checkOta: string;
  osUpgrade: string;
};

const EN: TranslationKeys = {
  appName: 'NovaSwarm',
  navSwarm: 'Swarm & Kanban',
  navAgents: 'Org & Agents',
  navMemory: 'Memory & Dreaming',
  navModels: 'Models & Router',
  navMcp: 'MCP & Skills',
  navTerminal: 'Terminal',
  navSystem: 'System & Docs',
  navSettings: 'Settings',
  supervisorPanelTitle: 'Supervisor Auditor',
  supervisorNominal: 'All nominal',
  supervisorWarning: 'Discrepancy noted',
  supervisorAlert: 'Alert active',
  supervisorLastCheck: 'Last check',
  supervisorDiscrepancies: 'Discrepancies',
  supervisorSandboxTests: 'Sandbox tests',
  supervisorRunAudit: 'Run Audit',
  wizardTitle: 'NovaSwarm Setup Wizard',
  wizardStep: 'Step',
  wizardNext: 'Continue',
  wizardBack: 'Back',
  wizardFinish: 'Launch NovaSwarm',
  step1Title: 'Choose Interface Language',
  step1Desc: 'The selected language applies across every panel, error message, and voice output.',
  step2Title: 'AI Provider API Keys',
  step2Desc: 'Enter at least one cloud API key or explicitly choose to start with local Ollama only.',
  step2OllamaOnly: 'Start with local Ollama only (no cloud API keys required)',
  step2MultiKeyNote: 'You can add unlimited additional keys per provider later in Settings for round-robin pooling.',
  step2ValidationErr: 'Provide at least one provider API key or enable local Ollama-only mode.',
  step3Title: 'Telegram Integration (Optional)',
  step3Desc: 'Connect a Telegram bot for bidirectional chat, commands, and 1-click approvals. You can skip and set it up later.',
  step3Skip: 'Skip for now',
  step4Title: 'Introduce Yourself',
  step4Desc: 'Describe who you are, your work, preferred style, and main goals. Saved permanently to Memory.',
  step4Placeholder: 'e.g. Linux engineer building automated tools. Prefer concise technical answers.',
  step5Title: 'Create Your First Agent',
  step5Desc: 'Select a recommended archetype or customize your first active agent. Only this agent + the Supervisor start active.',
  step5Recommended: 'Recommended for your profile',
  step5Name: 'Agent Name',
  step5Role: 'Role',
  step5Prompt: 'System Instruction',
  step6Title: 'Host Access Permissions',
  step6Desc: 'Allow agents to read/write host files, install packages, and run commands through the unified permission gate.',
  step6Allow: 'Grant autonomous host access (recommended for daily workflow)',
  step6Restrict: 'Keep host access disabled (chat & web reasoning only)',
  chatPlaceholder: 'Message the swarm (use @AgentName to address a specific agent)...',
  send: 'Send',
  teamRoom: 'Agent Team Room',
  summaryView: 'Coordinator Summary',
  kanbanTitle: 'Task Board',
  kanbanEmpty: 'No Kanban cards yet. Add a task or let an agent create one.',
  addCard: 'Add Task',
  todo: 'Todo',
  inProgress: 'In Progress',
  done: 'Done',
  createAgent: 'Create Agent',
  runDreaming: 'Run Dreaming Cycle',
  discoverModels: 'Discover Live Models',
  testFailover: 'Test Failover Chain',
  testConnection: 'Test Connection',
  terminalLockedTitle: 'Host Terminal Access Restricted',
  terminalLockedDesc: 'Host permissions are currently disabled in the unified Permission Gate. Enable host access in Settings to start PTY sessions.',
  terminalNewSession: 'New PTY Session',
  killSwitchTitle: 'Emergency Kill Switch',
  killSwitchActivate: 'Activate Emergency Stop',
  killSwitchDeactivate: 'Resume Operations',
  saveSettings: 'Save Settings',
  estimatedBadge: 'Estimated value',
  realHeaderBadge: 'Live provider header',
  notConnected: 'Not connected',
  hostPermGranted: 'Host Access: Enabled',
  hostPermRestricted: 'Host Access: Restricted',
  dailyBudget: 'Daily Spend Limit',
  ttsSpeak: 'Read aloud',
  approvalsPending: 'Pending Destructive Approvals',
  approve: 'Approve',
  reject: 'Reject',
  createBackup: 'Create Backup',
  checkOta: 'Check Updates',
  osUpgrade: 'Request OS Upgrade',
};

const HU: TranslationKeys = {
  appName: 'NovaSwarm',
  navSwarm: 'Raj & Kanban',
  navAgents: 'Szervezet & Ágensek',
  navMemory: 'Memória & Álmodás',
  navModels: 'Modellek & Router',
  navMcp: 'MCP & Skillek',
  navTerminal: 'Terminál',
  navSystem: 'Rendszer & Doksik',
  navSettings: 'Beállítások',
  supervisorPanelTitle: 'Felügyelő Auditor',
  supervisorNominal: 'Minden rendben',
  supervisorWarning: 'Eltérés észlelve',
  supervisorAlert: 'Riasztás aktív',
  supervisorLastCheck: 'Legutóbbi ellenőrzés',
  supervisorDiscrepancies: 'Talált eltérés',
  supervisorSandboxTests: 'Sandbox tesztek',
  supervisorRunAudit: 'Audit futtatása',
  wizardTitle: 'NovaSwarm Indító Varázsló',
  wizardStep: 'Lépés',
  wizardNext: 'Tovább',
  wizardBack: 'Vissza',
  wizardFinish: 'NovaSwarm Indítása',
  step1Title: 'Válaszd ki a felület nyelvét',
  step1Desc: 'A választott nyelv ettől a pillanattól minden fülön, hibaüzenetben és hangkimenetben érvényes.',
  step2Title: 'AI Szolgáltatói API Kulcsok',
  step2Desc: 'Adj meg legalább egy felhős API kulcsot, vagy válaszd a kizárólag lokális Ollama indulást.',
  step2OllamaOnly: 'Indulás kizárólag lokális Ollama modellel',
  step2MultiKeyNote: 'A Beállításokban később egy szolgáltatóhoz tetszőleges számú további kulcsot adhatsz hozzá körbeforgó (round-robin) rotációhoz.',
  step2ValidationErr: 'Adj meg legalább egy API kulcsot, vagy jelöld be a csak lokális Ollama opciót.',
  step3Title: 'Telegram Integráció (Opcionális)',
  step3Desc: 'Kétirányú bot összekapcsolás parancsokhoz és egygombos jóváhagyásokhoz. Kihagyható és később pótolható.',
  step3Skip: 'Kihagyás most',
  step4Title: 'Felhasználói Bemutatkozás',
  step4Desc: 'Írd le ki vagy, mivel foglalkozol, milyen stílust preferálsz. Bekerül a tartós memóriába.',
  step4Placeholder: 'Pl.: Linux rendszermérnök vagyok, tömör, gyakorlatias válaszokat kérek kódoláshoz és üzemeltetéshez.',
  step5Title: 'Az Első Ágens Létrehozása',
  step5Desc: 'Válassz a bemutatkozásodhoz ajánlott archetípusokból vagy írj egyedit. Csak ez az ágens + a Felügyelő indul el.',
  step5Recommended: 'Bemutatkozásod alapján ajánlott',
  step5Name: 'Ágens neve',
  step5Role: 'Szerepkör',
  step5Prompt: 'Rendszerutasítás (személyiség)',
  step6Title: 'Gazdagép-Jogosultság Megerősítése',
  step6Desc: 'Engedélyezed, hogy az ágensek a gazdagépen (fájlok, csomagok, parancsok, terminál) dolgozzanak az egységes kapun át?',
  step6Allow: 'Autonóm gazdagép-hozzáférés engedélyezése',
  step6Restrict: 'Korlátozott mód (nincs fájl- vagy parancsvégrehajtás)',
  chatPlaceholder: 'Üzenet a rajnak (használj @ÁgensNév megszólítást célzott delegáláshoz)...',
  send: 'Küldés',
  teamRoom: 'Ágensek közötti szoba',
  summaryView: 'Koordinátor összefoglaló',
  kanbanTitle: 'Kanban Feladattábla',
  kanbanEmpty: 'Még nincsenek Kanban kártyák. Hozz létre egyet, vagy bízd az ágensre.',
  addCard: 'Új kártya',
  todo: 'Teendő',
  inProgress: 'Folyamatban',
  done: 'Kész',
  createAgent: 'Új Ágens',
  runDreaming: 'Álmodás Indítása',
  discoverModels: 'Modellek Lekérése',
  testFailover: 'Failover Lánc Teszt',
  testConnection: 'Kapcsolat Tesztelése',
  terminalLockedTitle: 'Gazdagép Terminál Korlátozva',
  terminalLockedDesc: 'A gazdagép-jogosultság nincs engedélyezve az egységes jogosultsági kapuban. Engedélyezd a Beállításokban PTY indításhoz.',
  terminalNewSession: 'Új PTY Session',
  killSwitchTitle: 'Vészleállító',
  killSwitchActivate: 'Vészleállító Aktiválása',
  killSwitchDeactivate: 'Működés Folytatása',
  saveSettings: 'Beállítások Mentése',
  estimatedBadge: 'Becsült érték',
  realHeaderBadge: 'Valós válasz-fejléc',
  notConnected: 'Nincs bekötve',
  hostPermGranted: 'Gazdagép: Engedélyezve',
  hostPermRestricted: 'Gazdagép: Korlátozva',
  dailyBudget: 'Napi Költséglimit',
  ttsSpeak: 'Felolvasás',
  approvalsPending: 'Függő Destruktív Jóváhagyások',
  approve: 'Jóváhagyás',
  reject: 'Elutasítás',
  createBackup: 'Mentés Készítése',
  checkOta: 'Frissítés Ellenőrzése',
  osUpgrade: 'OS Frissítés Kérése',
};

const PARTIAL_TRANSLATIONS: Record<LanguageCode, Partial<TranslationKeys>> = {
  hu: HU,
  en: EN,
  de: {
    navSwarm: 'Schwarm & Kanban',
    navAgents: 'Org & Agenten',
    navMemory: 'Speicher & Träumen',
    navModels: 'Modelle & Router',
    navMcp: 'MCP & Skills',
    navTerminal: 'Terminal',
    navSystem: 'System & Doku',
    navSettings: 'Einstellungen',
    wizardTitle: 'NovaSwarm Einrichtungsassistent',
    wizardStep: 'Schritt',
    wizardNext: 'Weiter',
    wizardBack: 'Zurück',
    wizardFinish: 'NovaSwarm Starten',
    step1Title: 'Oberflächensprache wählen',
    step2Title: 'KI-Anbieter API-Schlüssel',
    step3Title: 'Telegram-Integration (Optional)',
    step4Title: 'Über Sie',
    step5Title: 'Ersten Agenten erstellen',
    step6Title: 'Host-Berechtigungen bestätigen',
    send: 'Senden',
    saveSettings: 'Einstellungen speichern',
    approve: 'Genehmigen',
    reject: 'Ablehnen',
  },
  es: {
    navSwarm: 'Enjambre y Kanban',
    navAgents: 'Org y Agentes',
    navMemory: 'Memoria y Sueño',
    navModels: 'Modelos y Router',
    navMcp: 'MCP y Habilidades',
    navTerminal: 'Terminal',
    navSystem: 'Sistema y Docs',
    navSettings: 'Ajustes',
    wizardTitle: 'Asistente de Configuración NovaSwarm',
    wizardStep: 'Paso',
    wizardNext: 'Siguiente',
    wizardBack: 'Atrás',
    wizardFinish: 'Iniciar NovaSwarm',
    step1Title: 'Seleccionar Idioma',
    step2Title: 'Claves API de Proveedores IA',
    step3Title: 'Integración de Telegram (Opcional)',
    step4Title: 'Preséntate',
    step5Title: 'Crear Primer Agente',
    step6Title: 'Permisos del Host',
    send: 'Enviar',
    saveSettings: 'Guardar Ajustes',
    approve: 'Aprobar',
    reject: 'Rechazar',
  },
  fr: {
    navSwarm: 'Essaim & Kanban',
    navAgents: 'Org & Agents',
    navMemory: 'Mémoire & Rêve',
    navModels: 'Modèles & Routeur',
    navMcp: 'MCP & Compétences',
    navTerminal: 'Terminal',
    navSystem: 'Système & Docs',
    navSettings: 'Paramètres',
    wizardTitle: 'Assistant NovaSwarm',
    wizardStep: 'Étape',
    wizardNext: 'Suivant',
    wizardBack: 'Retour',
    wizardFinish: 'Lancer NovaSwarm',
    step1Title: 'Choisir la langue',
    step2Title: 'Clés API IA',
    step3Title: 'Configuration Telegram (Optionnel)',
    step4Title: 'Présentation',
    step5Title: 'Créer le premier agent',
    step6Title: 'Autorisations hôte',
    send: 'Envoyer',
    saveSettings: 'Enregistrer',
    approve: 'Approuver',
    reject: 'Refuser',
  },
  it: {
    navSwarm: 'Sciame & Kanban',
    navAgents: 'Org & Agenti',
    navMemory: 'Memoria & Sogno',
    navModels: 'Modelli & Router',
    navMcp: 'MCP & Skill',
    navTerminal: 'Terminale',
    navSystem: 'Sistema & Docs',
    navSettings: 'Impostazioni',
    wizardTitle: 'Configurazione Guidata NovaSwarm',
    wizardStep: 'Passo',
    wizardNext: 'Avanti',
    wizardBack: 'Indietro',
    wizardFinish: 'Avvia NovaSwarm',
    step1Title: 'Seleziona Lingua',
    send: 'Invia',
    saveSettings: 'Salva',
  },
  pt: {
    navSwarm: 'Enxame & Kanban',
    navAgents: 'Org & Agentes',
    navMemory: 'Memória & Sonho',
    navModels: 'Modelos & Roteador',
    navMcp: 'MCP & Habilidades',
    navTerminal: 'Terminal',
    navSystem: 'Sistema & Docs',
    navSettings: 'Configurações',
    wizardTitle: 'Assistente NovaSwarm',
    wizardStep: 'Passo',
    wizardNext: 'Avançar',
    wizardBack: 'Voltar',
    wizardFinish: 'Iniciar NovaSwarm',
    step1Title: 'Escolher Idioma',
    send: 'Enviar',
    saveSettings: 'Salvar',
  },
  ru: {
    navSwarm: 'Рой и Канбан',
    navAgents: 'Структура и Агенты',
    navMemory: 'Память и Сон',
    navModels: 'Модели и Роутер',
    navMcp: 'MCP и Навыки',
    navTerminal: 'Терминал',
    navSystem: 'Система и Доки',
    navSettings: 'Настройки',
    wizardTitle: 'Мастер настройки NovaSwarm',
    wizardStep: 'Шаг',
    wizardNext: 'Далее',
    wizardBack: 'Назад',
    wizardFinish: 'Запустить NovaSwarm',
    step1Title: 'Выберите язык интерфейса',
    send: 'Отправить',
    saveSettings: 'Сохранить',
  },
  zh: {
    navSwarm: '集群与看板',
    navAgents: '组织与智能体',
    navMemory: '记忆与梦境',
    navModels: '模型与路由',
    navMcp: 'MCP 与技能',
    navTerminal: '终端',
    navSystem: '系统与文档',
    navSettings: '设置',
    wizardTitle: 'NovaSwarm 初始化向导',
    wizardStep: '步骤',
    wizardNext: '下一步',
    wizardBack: '上一步',
    wizardFinish: '启动 NovaSwarm',
    step1Title: '选择界面语言',
    send: '发送',
    saveSettings: '保存设置',
  },
  ja: {
    navSwarm: 'スウォーム & カンバン',
    navAgents: '組織 & エージェント',
    navMemory: '記憶 & ドリーミング',
    navModels: 'モデル & ルーター',
    navMcp: 'MCP & スキル',
    navTerminal: 'ターミナル',
    navSystem: 'システム & 資料',
    navSettings: '設定',
    wizardTitle: 'NovaSwarm セットアップウィザード',
    wizardStep: 'ステップ',
    wizardNext: '次へ',
    wizardBack: '戻る',
    wizardFinish: 'NovaSwarm を起動',
    step1Title: '表示言語を選択',
    send: '送信',
    saveSettings: '設定を保存',
  },
  ar: {
    navSwarm: 'السرب وكانبان',
    navAgents: 'الهيكل والوكلاء',
    navMemory: 'الذاكرة والحلم',
    navModels: 'النماذج والموجه',
    navMcp: 'MCP والمهارات',
    navTerminal: 'الطرفية',
    navSystem: 'النظام والوثائق',
    navSettings: 'الإعدادات',
    wizardTitle: 'معالج إعداد NovaSwarm',
    wizardStep: 'خطوة',
    wizardNext: 'التالي',
    wizardBack: 'السابق',
    wizardFinish: 'تشغيل NovaSwarm',
    step1Title: 'اختر لغة الواجهة',
    send: 'إرسال',
    saveSettings: 'حفظ الإعدادات',
  },
};

export function tr(lang: LanguageCode, key: keyof TranslationKeys): string {
  return PARTIAL_TRANSLATIONS[lang]?.[key] ?? EN[key];
}

export function getLanguageDir(lang: LanguageCode): 'ltr' | 'rtl' {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';
}

export function speakBrowserTts(text: string, lang: LanguageCode): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
  const locale = SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.speechLocale ?? 'en-US';
  utter.lang = locale;
  window.speechSynthesis.speak(utter);
}
