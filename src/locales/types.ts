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

export interface TranslationKeys {
  appName: string;
  navGroupDaily: string;
  navGroupKnowledge: string;
  navGroupLife: string;
  navGroupSystem: string;
  navOverview: string;
  navSwarm: string;
  navWorkbench: string;
  navAgents: string;
  navMemory: string;
  navModels: string;
  navMcp: string;
  navEcosystem: string;
  navTerminal: string;
  navSystem: string;
  navAutonomy: string;
  navSettings: string;
  navOverviewHint: string;
  navSwarmHint: string;
  navWorkbenchHint: string;
  navTerminalHint: string;
  navAgentsHint: string;
  navMemoryHint: string;
  navModelsHint: string;
  navMcpHint: string;
  navEcosystemHint: string;
  navSystemHint: string;
  navAutonomyHint: string;
  navSettingsHint: string;

  // Shell, Topbar, Supervisor, Drawers
  supervisorPanelTitle: string;
  supervisorPanelDesc: string;
  supervisorNominal: string;
  supervisorWarning: string;
  supervisorAlert: string;
  supervisorLastCheck: string;
  supervisorDiscrepancies: string;
  supervisorSandboxTests: string;
  supervisorRunAudit: string;
  quickHealthCheck: string;
  quickSearch: string;
  quickSearchHintTitle: string;
  quickSearchHintDesc: string;
  mainNavLabel: string;
  closeNavAria: string;
  openNavAria: string;
  hostPermAutonomous: string;
  hostPermGranted: string;
  hostPermRestricted: string;
  killSwitchActiveBadge: string;
  themeToggleTitle: string;
  privacyMaskTitle: string;
  lanPingTitle: string;
  scratchpadBtnTitle: string;
  shortcutsBtnTitle: string;
  lockLogoutTitle: string;
  lockLogoutBtn: string;
  languageSwitchLabel: string;
  viewLoadingText: string;
  loadingAppTitle: string;
  loadingAppDesc: string;
  retryBtn: string;
  closeBtn: string;
  infoHintPrefix: string;
  mobileHome: string;
  mobileLife: string;
  mobileNavAria: string;

  // Banners
  passwordlessBannerText: string;
  setPasswordBtn: string;
  snooze7DaysBtn: string;
  snooze7DaysAria: string;
  halfInstalledBannerText: string;
  lockdownBannerText: string;
  totalAutonomyBannerText: string;
  fullAutonomyBannerText: string;
  phoenixSaveBtn: string;
  phoenixSavingBtn: string;
  emergencyStopBtn: string;
  autonomyCenterBtn: string;
  settingsBtn: string;
  bannerStopReason: string;

  // Auth Lock Screen
  lockHalfInstalledTitle: string;
  lockHalfInstalledDesc: string;
  lockTitle: string;
  lockSetupDesc: string;
  lockPasswordDesc: string;
  lockSetupCodeLabel: string;
  lockSetupCodePlaceholder: string;
  lockPasswordPlaceholder: string;
  lockSetPwBtn: string;
  lockLoginBtn: string;
  lockUnlockingBtn: string;
  lockInvalidErr: string;
  lockSaveErr: string;

  // Scratchpad & Shortcuts Modals
  scratchpadDrawerTitle: string;
  scratchpadInfoTitle: string;
  scratchpadInfoDesc: string;
  scratchpadPlaceholder: string;
  scratchpadAria: string;
  scratchpadClearBtn: string;
  shortcutsModalTitle: string;
  shortcutQuickPalette: string;
  shortcutScratchpad: string;
  shortcutHelp: string;
  shortcutEsc: string;

  // Onboarding Wizard
  wizardTitle: string;
  wizardStep: string;
  wizardNext: string;
  wizardBack: string;
  wizardFinish: string;
  wizardProgressAria: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step2HintLabel: string;
  step2HintDesc: string;
  step2EnvGemini: string;
  step2OllamaOnly: string;
  step2MultiKeyNote: string;
  step2ValidationErr: string;
  step2GeminiKey: string;
  step2OpenRouterKey: string;
  step2OpenAiKey: string;
  step2AnthropicKey: string;
  step3Title: string;
  step3Desc: string;
  step3HintLabel: string;
  step3HintDesc: string;
  step3Skip: string;
  step3BotToken: string;
  step3ChatId: string;
  step4Title: string;
  step4Desc: string;
  step4Placeholder: string;
  step5Title: string;
  step5Desc: string;
  step5Recommended: string;
  step5Name: string;
  step5Role: string;
  step5Prompt: string;
  archGeneralRole: string;
  archGeneralPrompt: string;
  archDevRole: string;
  archDevPrompt: string;
  archOpsRole: string;
  archOpsPrompt: string;
  archResearchRole: string;
  archResearchPrompt: string;
  step6Title: string;
  step6Desc: string;
  step6HintLabel: string;
  step6HintDesc: string;
  step6Allow: string;
  step6AllowDesc: string;
  step6Restrict: string;
  step6RestrictRecommended: string;
  step6RestrictDesc: string;
  step6OpPwLabel: string;
  step6OpPwPlaceholder: string;
  step6SetupCodeLabel: string;
  step6DefaultsFooter: string;

  // Command Palette
  cmdPaletteAria: string;
  cmdPlaceholder: string;
  cmdGroupNav: string;
  cmdGroupQuick: string;
  cmdGroupAgent: string;
  cmdGroupTemplate: string;
  cmdGroupKanban: string;
  cmdGroupMemory: string;
  cmdNoMatch: string;
  cmdFooterKeys: string;
  cmdActDream: string;
  cmdActAudit: string;
  cmdActDoctor: string;
  cmdActOta: string;
  cmdActBackup: string;
  cmdActWarm: string;
  cmdActUnload: string;

  // PWA Controls
  pwaOffline: string;
  pwaOfflineTitle: string;
  pwaNotifications: string;
  pwaNotificationsTitle: string;
  pwaInstallTitle: string;
  pwaHelpTitle: string;
  pwaHelpBody: string;

  // Common UI & Chat / Kanban / Agents / Memory / Models / Terminal / Approvals / System
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
  terminalNoSession: string;
  terminalSendSwarm50: string;
  terminalRecordings: string;
  terminalRecordingsTitle: string;
  terminalNoRecordings: string;
  terminalEmptyTitle: string;
  terminalEmptyDesc: string;
  killSwitchTitle: string;
  killSwitchActivate: string;
  killSwitchDeactivate: string;
  saveSettings: string;
  estimatedBadge: string;
  realHeaderBadge: string;
  notConnected: string;
  dailyBudget: string;
  ttsSpeak: string;
  approvalsPending: string;
  approvalsPendingShort: string;
  approve: string;
  reject: string;
  createBackup: string;
  checkOta: string;
  osUpgrade: string;

  // Autonomy Center (new Total Autonomy, LOCKDOWN, Guarantees, Benchmark, LAN Devices, World Model)
  autonomyLoading: string;
  autonomyHeaderTitle: string;
  autonomyHeaderSubtitle: string;
  autonomyModeLockdown: string;
  autonomyModeTotal: string;
  autonomyModeSupervised: string;
  autonomyRefresh: string;
  autonomyLockReasonPlaceholder: string;
  autonomyLocking: string;
  autonomyLockBtn: string;
  autonomyUnderLockdown: string;
  autonomyUnlockPlaceholder: string;
  autonomyUnlocking: string;
  autonomyUnlockBtn: string;
  autonomyGuarantee1Title: string;
  autonomyGuarantee1Entries: string;
  autonomyGuarantee1Valid: string;
  autonomyGuarantee1Broken: string;
  autonomyGuarantee2Title: string;
  autonomyGuarantee2Locked: string;
  autonomyGuarantee2Ready: string;
  autonomyGuarantee3Title: string;
  autonomyGuarantee3WatchdogBtn: string;
  autonomyGuarantee3Snapshots: string;
  autonomyCloudBudgetTitle: string;
  autonomyFallbackOllama: string;
  autonomyActiveCircuitBreakers: string;
  autonomyNoCircuitBreakers: string;
  autonomyResetBtn: string;
  autonomyGoalCycleTitle: string;
  autonomyRunBenchmarkBtn: string;
  autonomyRunningBenchmark: string;
  autonomyGoalPlaceholder: string;
  autonomyGoalCycleBtn: string;
  autonomyLanDiscoveryTitle: string;
  autonomyLanDiscoveryDesc: string;
  autonomyLanScanBtn: string;
  autonomyLanScanning: string;
  autonomyWorldModelTitle: string;
  autonomySnapshotsTitle: string;
  autonomyDecisionLogTitle: string;

  // Overview Dashboard core
  overviewTitle: string;
  overviewStartMissionBtn: string;
  overviewDoctorBtn: string;
  overviewWidgetsBtn: string;
  overviewOmniPlaceholder: string;
  overviewMachineHealthTitle: string;
  overviewBudgetCardTitle: string;
  overviewTasksCardTitle: string;
  overviewUptimeCardTitle: string;
  overviewBriefingCardTitle: string;
  overviewHabitsCardTitle: string;
  overviewWeatherSecurityTitle: string;
  overviewDreamCardTitle: string;
  overviewWeeklyCapsCardTitle: string;
  overviewCustomBoxesTitle: string;

  // MCP & Skills new features
  mcpServersTitle: string;
  mcpListToolsBtn: string;
  mcpAddBtn: string;
  mcpCatalogTitle: string;
  mcpLoadBtn: string;
  mcpAutonomousDiscoveryTitle: string;
  mcpDiscoveryPlaceholder: string;
  mcpDiscoveryBtn: string;
  skillFactoryTitle: string;
  skillTestCodePlaceholder: string;
  skillCreateAndTestBtn: string;
  skillSelfTestBtn: string;
  skillGithubImportTitle: string;
  skillImportAuditBtn: string;
  webSearchTitle: string;
  headlessBrowserTitle: string;
  channelConnectorsTitle: string;
  pairingQueueTitle: string;

  // Models & Router new features
  modelsPrimaryLabel: string;
  modelsSecondaryLabel: string;
  modelsCooldownResetBtn: string;
  modelsDiscoverPerKeyBtn: string;
  modelsTestChainBtn: string;
  modelsOllamaSuiteTitle: string;
  modelsReselectBtn: string;
  modelsBenchmarkBtn: string;
  modelsUnloadRamBtn: string;
  modelsWarmBtn: string;
  modelsCostProjectionTitle: string;
  modelsKeyPoolTitle: string;
  modelsBulkPasteBtn: string;
  modelsSingleModeBtn: string;
  modelsBulkImportBtn: string;
  modelsAddKeyBtn: string;
  modelsMatrixTitle: string;
  modelsRoutingRulesTitle: string;
  modelsBlocklistTitle: string;
  modelsAnalyticsTitle: string;
  modelsVirtualKeysTitle: string;
}

export interface LocaleBundle<P extends string = string> {
  core: TranslationKeys;
  phrases: Record<P, string>;
}
