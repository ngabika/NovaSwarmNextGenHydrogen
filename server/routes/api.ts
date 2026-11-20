import crypto from 'node:crypto';
import express from 'express';
import type {
  Agent,
  ChannelConnectorType,
  DashboardWidgetConfig,
  ExecutionPreset,
  ExpenseRecord,
  IdeaItem,
  IdeaStatus,
  KanbanCard,
  KanbanPriority,
  KanbanStatus,
  McpAuthType,
  McpTransport,
  MemoryTier,
  MessageAttachment,
  PromptTemplate,
  ProviderId,
  SessionIsolationMode,
  Settings,
  WorkflowDefinition,
} from '../../shared/types';
import {
  auditRecentCycle,
  breakdownKanbanCardWithAi,
  createAgent,
  handleCouncilTurn,
  handleUserTurn,
  runAutonomousKanbanWorkerTick,
  SELF_DOCUMENTATION_TEXT,
} from '../agents/engine';
import {
  buildSvgChartArtifact,
  createCustomWebhook,
  executeWorkflow,
  exportSanitizedBundle,
  importSanitizedBundle,
  logFocusSession,
  runSandboxedCodeInterpreter,
  toggleHabitCheckin,
} from '../automation/workflowsAndProductivity';
import {
  createChannelConnector,
  deleteChannelConnector,
  handleInboundChannelEvent,
  pollExternalChannels,
  resolvePairingRequest,
  sendToChannelConnector,
  updateChannelPollingConfig,
} from '../channels/connectors';
import {
  applyReflexionSuggestion,
  promoteDreamSkillDraft,
  runDreamingCycle,
} from '../dreaming/engine';
import {
  addFederationPeer,
  handoffKanbanToPeer,
  pingFederationPeer,
  receiveFederationMessage,
  receiveKanbanHandoff,
  receiveSharedMemories,
  removeFederationPeer,
  sendFederationMessage,
  syncSharedMemoriesWithPeers,
} from '../federation/bridge';
import { createVirtualKey, revokeVirtualKey } from '../gateway/openaiProxy';
import {
  addSshProfile,
  checkAllSslTargets,
  controlDockerContainer,
  ensureKanbanGitBranch,
  executeSshProfileCommand,
  getDockerContainerLogs,
  getVpnStatus,
  inspectAndAnalyzeSystemdUnit,
  inspectDiskHealth,
  listDockerContainers,
  listSystemdUnits,
  readSafeEnvConfig,
  runHostSelfDiagnostics,
  runRsyncExternalBackup,
  scanLanDevices,
  updateSafeEnvConfig,
} from '../infra/hostAdmin';
import {
  callHomeAssistantService,
  categorizeMerchant,
  generateDailyBriefingText,
  importExpensesFromCsv,
  parseIcsCalendarText,
  publishMqttMessage,
  queryHomeAssistantStates,
  refreshAllRssFeeds,
  sendEmailViaSmtp,
  syncRecentEmailsViaImap,
  syncWatchedGithubRepo,
  updateEmailConfig,
} from '../integrations/ecosystem';
import {
  buildGoogleOAuthUrl,
  fetchExternalCatalog,
  listMcpTools,
  registerMcpServer,
  testMcpConnection,
  updateMcpCredentials,
} from '../mcp/manager';
import {
  addPersistentMemory,
  addPersistentMemoryAsync,
  deleteVaultNote,
  getMemoryGraphData,
  listObsidianNotes,
  readVaultNote,
  runSalienceDecayAndTiering,
  saveVaultNote,
  searchMemoriesAsync,
} from '../memory/vectorStore';
import {
  addProviderKey,
  clearResponseCache,
  computeMonthlyProjection,
  discoverModels,
  generateImageArtifactWithGemini,
  getResponseCacheSize,
  invokeWithFailover,
  removeProviderKey,
  resetProviderCooldowns,
  transcribeAudioBuffer,
  warmOllamaModel,
} from '../providers/router';
import {
  getOfflinePackStats,
  ingestDocumentToRag,
  listRagDocuments,
  searchOfflineKnowledgePack,
} from '../rag/documents';
import { detectActiveSandboxBackend, runDestructiveSandboxProof } from '../sandbox/supervisorSandbox';
import {
  authenticateOperatorPassword,
  isRequestAuthorized,
  issueSessionToken,
  requireWebAuthMiddleware,
  WEB_SESSION_COOKIE_NAME,
} from '../security/auth';
import {
  activateKillSwitch,
  assertHostPermission,
  deactivateKillSwitch,
  HostPermissionDeniedError,
  KillSwitchActiveError,
  resolveApproval,
} from '../security/permissionGate';
import {
  applyGuardedSelfModification,
  ForbiddenZoneError,
  getCommitDiff,
  getRecentGitHistory,
  rollbackSelfModToCommit,
  SecretLeakDetectedError,
} from '../selfmod/gitGuard';
import { addSkillPitfall, createAndValidateSkill } from '../skills/loader';
import {
  appendAuditLog,
  getState,
  hasWebAuthPassword,
  setAgentTelegramTokenSecret,
  setNamedSecret,
  setTelegramTokenSecret,
  setWebAuthPassword,
  updateState,
} from '../state/store';
import {
  addUptimeTarget,
  applyOtaUpdate,
  checkOtaUpdates,
  collectHardwareMetrics,
  createBackupPoint,
  getOtaGitDiff,
  registerCronTask,
  removeUptimeTarget,
  requestOsPackageUpgrade,
  restoreBackupPoint,
  runHeartbeatTick,
  runUptimeChecks,
  speakOnHostSpeaker,
} from '../system/ops';
import { processTelegramInput, sendTelegramMessage } from '../telegram/bot';
import {
  closeTerminalSession,
  createTerminalSession,
  getTerminalBuffer,
  listTerminalSessions,
} from '../terminal/ptyManager';
import {
  detectHeadlessBrowserBinary,
  performWebSearch,
  runHeadlessBrowserAction,
} from '../web/searchAndBrowser';

export function createApiRouter(broadcastEvent: (type: string, payload?: unknown) => void): express.Router {
  const router = express.Router();

  router.use(requireWebAuthMiddleware);

  const handleErr = (res: express.Response, err: unknown) => {
    if (err instanceof HostPermissionDeniedError || err instanceof KillSwitchActiveError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    if (err instanceof ForbiddenZoneError || err instanceof SecretLeakDetectedError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: msg });
  };

  // LAN Operator Auth endpoints
  router.get('/auth/status', (req, res) => {
    const s = getState().settings;
    res.json({
      webAuthEnabled: s.webAuthEnabled,
      webAuthHasPassword: hasWebAuthPassword(),
      authenticated: isRequestAuthorized(req.headers),
    });
  });

  router.post('/auth/login', (req, res) => {
    const { password } = req.body as { password?: string };
    if (!password) return res.status(400).json({ error: 'Jelszó megadása kötelező.' });
    const token = authenticateOperatorPassword(password);
    if (!token) {
      return res.status(401).json({ error: 'Hibás operátori jelszó.' });
    }
    res.cookie(WEB_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true, authenticated: true });
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(WEB_SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  router.post('/auth/password', (req, res) => {
    const { password, enable } = req.body as { password?: string; enable?: boolean };
    if (typeof password === 'string' && password.trim().length > 0) {
      if (password.trim().length < 4) {
        return res.status(400).json({ error: 'A jelszónak legalább 4 karakterből kell állnia.' });
      }
      setWebAuthPassword(password.trim());
    }
    const hasPw = hasWebAuthPassword();
    if (enable && !hasPw) {
      return res.status(400).json({ error: 'Előbb állíts be operátori jelszót a LAN zár bekapcsolásához.' });
    }
    updateState((s) => {
      s.settings.webAuthHasPassword = hasPw;
      if (typeof enable === 'boolean') {
        s.settings.webAuthEnabled = enable && hasPw;
      }
    });
    // Issue a valid cookie for the current operator so enabling lock doesn't log themselves out immediately
    if (hasPw) {
      res.cookie(WEB_SESSION_COOKIE_NAME, issueSessionToken(), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    broadcastEvent('state:updated');
    res.json({
      ok: true,
      webAuthEnabled: getState().settings.webAuthEnabled,
      webAuthHasPassword: hasPw,
    });
  });

  router.get('/state', (_req, res) => {
    const state = getState();
    const hardware = collectHardwareMetrics();
    const terminalSessions = listTerminalSessions();
    res.json({
      state,
      hardware,
      terminalSessions,
      cacheSize: getResponseCacheSize(),
      sandboxBackend: detectActiveSandboxBackend(),
    });
  });

  // 6-step Setup Wizard completion
  router.post('/onboarding/complete', async (req, res) => {
    try {
      const body = req.body as {
        language: Settings['language'];
        ollamaOnlyMode: boolean;
        primaryProvider: ProviderId;
        apiKeys?: Partial<Record<ProviderId, string>>;
        telegramToken?: string;
        telegramChatId?: string;
        userProfile: string;
        firstAgent: {
          name: string;
          role: string;
          avatar?: string;
          systemPrompt: string;
          modelId?: string;
          providerId?: ProviderId;
          webSearchEnabled?: boolean;
          hostExecutionEnabled?: boolean;
        };
        hostPermissionsGranted: boolean;
      };

      if (!body.firstAgent?.name?.trim()) {
        return res.status(400).json({ error: 'Az első ágens neve kötelező.' });
      }

      updateState((s) => {
        s.settings.language = body.language || 'hu';
        s.settings.ollamaOnlyMode = Boolean(body.ollamaOnlyMode);
        s.settings.primaryProvider = body.ollamaOnlyMode
          ? 'ollama'
          : body.primaryProvider || 'gemini';
        s.settings.userProfile = (body.userProfile || '').trim();
        s.settings.hostPermissionsGranted = Boolean(body.hostPermissionsGranted);
        s.settings.telegramChatId = (body.telegramChatId || '').trim();
        if (body.telegramToken?.trim()) {
          setTelegramTokenSecret(body.telegramToken.trim());
          s.settings.telegramHasToken = true;
          s.settings.telegramEnabled = Boolean(s.settings.telegramChatId);
        }
        s.settings.onboardingCompleted = true;
      });

      if (body.apiKeys) {
        for (const [prov, key] of Object.entries(body.apiKeys)) {
          if (key && key.trim().length > 4) {
            addProviderKey(prov as ProviderId, key.trim(), 'Kezdő API kulcs');
          }
        }
      }

      updateState((s) => {
        s.agents = s.agents.filter((a) => a.isSupervisor);
        s.kanban = [];
      });

      createAgent({
        name: body.firstAgent.name,
        role: body.firstAgent.role || 'Általános Asszisztens',
        avatar: body.firstAgent.avatar || 'bot',
        parentAgentId: null,
        systemPrompt: body.firstAgent.systemPrompt,
        providerId: body.ollamaOnlyMode
          ? 'ollama'
          : body.firstAgent.providerId || body.primaryProvider || 'gemini',
        modelId: body.firstAgent.modelId,
        webSearchEnabled: body.firstAgent.webSearchEnabled ?? true,
        hostExecutionEnabled:
          Boolean(body.hostPermissionsGranted) &&
          (body.firstAgent.hostExecutionEnabled ?? true),
      });

      if (body.userProfile?.trim()) {
        addPersistentMemory({
          content: `Felhasználói bemutatkozás és kommunikációs elvárás: ${body.userProfile.trim()}`,
          entity: 'Felhasználói Profil',
          tags: ['profile', 'preferences'],
          links: ['Kezdő Ágens'],
          importanceScore: 1.0,
          tier: 'hot',
        });
      }

      void discoverModels().catch(() => {});
      broadcastEvent('state:updated');
      res.json({ ok: true, state: getState() });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/onboarding/autostart', (_req, res) => {
    const state = getState();
    if (!state.settings.onboardingCompleted) {
      updateState((s) => {
        s.settings.onboardingCompleted = true;
        s.settings.hostPermissionsGranted = true;
        s.settings.ollamaOnlyMode = s.settings.providerKeys.gemini.length === 0;
        if (!s.settings.userProfile) {
          s.settings.userProfile = 'Rendszermérnök felhasználó, tömör technikai válaszokat preferál.';
        }
      });
      if (state.agents.filter((a) => !a.isSupervisor).length === 0) {
        createAgent({
          name: 'Központi Asszisztens',
          role: 'Általános Asszisztens',
          systemPrompt: 'Segítőkész, precíz személyi AI asszisztens.',
          hostExecutionEnabled: true,
        });
      }
      broadcastEvent('state:updated');
    }
    res.json({ ok: true, state: getState() });
  });

  router.patch('/settings', (req, res) => {
    try {
      const patch = req.body as Partial<Settings> & {
        telegramToken?: string;
        braveSearchKey?: string;
        homeAssistantToken?: string;
      };
      if (typeof patch.braveSearchKey === 'string' && patch.braveSearchKey.trim()) {
        setNamedSecret('brave_search_key', patch.braveSearchKey.trim());
      }
      if (typeof patch.homeAssistantToken === 'string' && patch.homeAssistantToken.trim()) {
        setNamedSecret('home_assistant_token', patch.homeAssistantToken.trim());
      }
      updateState((s) => {
        if (patch.language) s.settings.language = patch.language;
        if (typeof patch.hostPermissionsGranted === 'boolean') {
          s.settings.hostPermissionsGranted = patch.hostPermissionsGranted;
        }
        if (typeof patch.userProfile === 'string') s.settings.userProfile = patch.userProfile;
        if (patch.primaryProvider) s.settings.primaryProvider = patch.primaryProvider;
        if (patch.secondaryProvider) s.settings.secondaryProvider = patch.secondaryProvider;
        if (typeof patch.ollamaOnlyMode === 'boolean') s.settings.ollamaOnlyMode = patch.ollamaOnlyMode;
        if (typeof patch.ollamaUrl === 'string') s.settings.ollamaUrl = patch.ollamaUrl;
        if (typeof patch.ollamaModel === 'string') s.settings.ollamaModel = patch.ollamaModel;
        if (typeof patch.ollamaNumCtx === 'number' && patch.ollamaNumCtx >= 512) {
          s.settings.ollamaNumCtx = Math.min(131072, Math.round(patch.ollamaNumCtx));
        }
        if (typeof patch.ollamaKeepAlive === 'string' && patch.ollamaKeepAlive.trim()) {
          s.settings.ollamaKeepAlive = patch.ollamaKeepAlive.trim();
        }
        if (patch.manualModelPriority) s.settings.manualModelPriority = patch.manualModelPriority;
        if (typeof patch.dailyCostLimitEnabled === 'boolean') {
          s.settings.dailyCostLimitEnabled = patch.dailyCostLimitEnabled;
        }
        if (typeof patch.dailyCostLimitUsd === 'number' && patch.dailyCostLimitUsd >= 0) {
          s.settings.dailyCostLimitUsd = patch.dailyCostLimitUsd;
        }
        if (typeof patch.monthlyBudgetAlertUsd === 'number' && patch.monthlyBudgetAlertUsd >= 0) {
          s.settings.monthlyBudgetAlertUsd = patch.monthlyBudgetAlertUsd;
        }
        if (typeof patch.dreamingIdleMinutes === 'number' && patch.dreamingIdleMinutes >= 1) {
          s.settings.dreamingIdleMinutes = patch.dreamingIdleMinutes;
        }
        if (typeof patch.thermalThrottleCelsius === 'number') {
          s.settings.thermalThrottleCelsius = patch.thermalThrottleCelsius;
        }
        if (typeof patch.batteryThrottlePercent === 'number') {
          s.settings.batteryThrottlePercent = patch.batteryThrottlePercent;
        }
        if (typeof patch.auditLogMaxEntries === 'number') {
          s.settings.auditLogMaxEntries = Math.max(100, patch.auditLogMaxEntries);
        }
        if (typeof patch.telegramEnabled === 'boolean') s.settings.telegramEnabled = patch.telegramEnabled;
        if (typeof patch.telegramChatId === 'string') s.settings.telegramChatId = patch.telegramChatId;
        if (patch.backupSchedule) s.settings.backupSchedule = patch.backupSchedule;
        if (typeof patch.backupRsyncTarget === 'string') {
          s.settings.backupRsyncTarget = patch.backupRsyncTarget.trim();
        }
        if (typeof patch.ttsEnabled === 'boolean') s.settings.ttsEnabled = patch.ttsEnabled;
        if (typeof patch.ttsHostSpeakerEnabled === 'boolean') {
          s.settings.ttsHostSpeakerEnabled = patch.ttsHostSpeakerEnabled;
        }
        if (typeof patch.continuousVoiceMode === 'boolean') {
          s.settings.continuousVoiceMode = patch.continuousVoiceMode;
        }
        if (typeof patch.autoTaskRouting === 'boolean') s.settings.autoTaskRouting = patch.autoTaskRouting;
        if (typeof patch.maxToolSteps === 'number' && patch.maxToolSteps >= 1) {
          s.settings.maxToolSteps = Math.min(20, Math.max(1, Math.round(patch.maxToolSteps)));
        }
        if (patch.defaultPreset === 'fast' || patch.defaultPreset === 'deep' || patch.defaultPreset === 'precise') {
          s.settings.defaultPreset = patch.defaultPreset;
        }
        if (typeof patch.responseCacheEnabled === 'boolean') s.settings.responseCacheEnabled = patch.responseCacheEnabled;
        if (typeof patch.responseCacheTtlSec === 'number') s.settings.responseCacheTtlSec = Math.max(10, patch.responseCacheTtlSec);
        if (typeof patch.guardrailsEnabled === 'boolean') s.settings.guardrailsEnabled = patch.guardrailsEnabled;
        if (typeof patch.guardrailBlockPii === 'boolean') s.settings.guardrailBlockPii = patch.guardrailBlockPii;
        if (typeof patch.guardrailBlockSecrets === 'boolean') s.settings.guardrailBlockSecrets = patch.guardrailBlockSecrets;
        if (typeof patch.guardrailBlockPromptInjection === 'boolean') s.settings.guardrailBlockPromptInjection = patch.guardrailBlockPromptInjection;
        if (typeof patch.heartbeatEnabled === 'boolean') s.settings.heartbeatEnabled = patch.heartbeatEnabled;
        if (typeof patch.heartbeatIntervalMinutes === 'number') s.settings.heartbeatIntervalMinutes = Math.max(1, patch.heartbeatIntervalMinutes);
        if (typeof patch.channelPairingRequired === 'boolean') s.settings.channelPairingRequired = patch.channelPairingRequired;
        if (typeof patch.kanbanWipLimit === 'number') s.settings.kanbanWipLimit = Math.max(1, patch.kanbanWipLimit);
        if (typeof patch.kanbanAgingHours === 'number') s.settings.kanbanAgingHours = Math.max(1, patch.kanbanAgingHours);
        if (typeof patch.federationEnabled === 'boolean') s.settings.federationEnabled = patch.federationEnabled;
        if (typeof patch.instanceName === 'string' && patch.instanceName.trim()) {
          s.settings.instanceName = patch.instanceName.trim();
        }
        if (typeof patch.webAuthEnabled === 'boolean') {
          s.settings.webAuthEnabled = patch.webAuthEnabled && hasWebAuthPassword();
        }
        if (typeof patch.autonomousKanbanWorkerEnabled === 'boolean') {
          s.settings.autonomousKanbanWorkerEnabled = patch.autonomousKanbanWorkerEnabled;
        }
        if (patch.embeddingMode === 'local_ngram' || patch.embeddingMode === 'ollama') {
          s.settings.embeddingMode = patch.embeddingMode;
        }
        if (typeof patch.ollamaEmbeddingModel === 'string' && patch.ollamaEmbeddingModel.trim()) {
          s.settings.ollamaEmbeddingModel = patch.ollamaEmbeddingModel.trim();
        }
        if (typeof patch.otaRepoSlug === 'string' && patch.otaRepoSlug.trim()) {
          s.settings.otaRepoSlug = patch.otaRepoSlug.trim();
        }
        if (typeof patch.autoUpdateEnabled === 'boolean') {
          s.settings.autoUpdateEnabled = patch.autoUpdateEnabled;
        }
        if (typeof patch.autoUpdateCheckHours === 'number' && patch.autoUpdateCheckHours >= 1) {
          s.settings.autoUpdateCheckHours = Math.max(1, patch.autoUpdateCheckHours);
        }
        if (patch.searchProvider === 'duckduckgo' || patch.searchProvider === 'searxng' || patch.searchProvider === 'brave') {
          s.settings.searchProvider = patch.searchProvider;
        }
        if (typeof patch.searxngUrl === 'string') {
          s.settings.searxngUrl = patch.searxngUrl.trim();
        }
        if (typeof patch.braveSearchKey === 'string' && patch.braveSearchKey.trim()) {
          s.settings.braveHasKey = true;
        }
        if (typeof patch.caldavUrl === 'string') {
          s.settings.caldavUrl = patch.caldavUrl.trim();
        }
        if (typeof patch.homeAssistantUrl === 'string') {
          s.settings.homeAssistantUrl = patch.homeAssistantUrl.trim();
        }
        if (typeof patch.homeAssistantToken === 'string' && patch.homeAssistantToken.trim()) {
          s.settings.homeAssistantHasToken = true;
        }
        if (typeof patch.mqttBrokerHost === 'string') {
          s.settings.mqttBrokerHost = patch.mqttBrokerHost.trim();
        }
        if (typeof patch.mqttBrokerPort === 'number' && patch.mqttBrokerPort > 0) {
          s.settings.mqttBrokerPort = patch.mqttBrokerPort;
        }
        if (Array.isArray(patch.dashboardWidgets)) {
          s.settings.dashboardWidgets = patch.dashboardWidgets as DashboardWidgetConfig[];
        }
        if (typeof patch.telegramToken === 'string' && patch.telegramToken.trim()) {
          setTelegramTokenSecret(patch.telegramToken.trim());
          s.settings.telegramHasToken = true;
        }
      });

      appendAuditLog({
        type: 'system',
        sourceAgentId: 'user',
        sourceAgentName: 'Beállítások',
        message: 'Rendszerbeállítások frissítve.',
      });
      broadcastEvent('state:updated');
      res.json({ ok: true, settings: getState().settings });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Multi-provider key pool, cooldowns, cache & Virtual Keys
  router.post('/providers/keys', (req, res) => {
    try {
      const { provider, rawKey, label } = req.body as {
        provider: ProviderId;
        rawKey: string;
        label?: string;
      };
      if (!provider || !rawKey?.trim()) {
        return res.status(400).json({ error: 'Szolgáltató és API kulcs kötelező.' });
      }
      const entry = addProviderKey(provider, rawKey, label);
      broadcastEvent('state:updated');
      res.json({ ok: true, entry });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/providers/keys/:provider/:keyId', (req, res) => {
    removeProviderKey(req.params.provider as ProviderId, req.params.keyId);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/providers/reset-cooldowns', (_req, res) => {
    resetProviderCooldowns();
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/providers/discover', async (_req, res) => {
    try {
      const result = await discoverModels();
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/providers/test-failover', async (req, res) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      const result = await invokeWithFailover({
        prompt: prompt || 'Válaszolj röviden: Működik a failover router?',
        complexity: 'simple',
      });
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/gateway/virtual-keys', (req, res) => {
    try {
      const { name, maxBudgetUsd, rpmLimit, allowedModels } = req.body as {
        name: string;
        maxBudgetUsd?: number;
        rpmLimit?: number;
        allowedModels?: string[];
      };
      const created = createVirtualKey({
        name: name || 'Client Key',
        maxBudgetUsd,
        rpmLimit,
        allowedModels,
      });
      broadcastEvent('state:updated');
      res.json(created);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.patch('/gateway/virtual-keys/:id', (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    updateState((s) => {
      const vk = s.virtualKeys.find((k) => k.id === req.params.id);
      if (vk && typeof enabled === 'boolean') vk.enabled = enabled;
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.delete('/gateway/virtual-keys/:id', (req, res) => {
    revokeVirtualKey(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/gateway/cache/clear', (_req, res) => {
    const cleared = clearResponseCache();
    broadcastEvent('state:updated');
    res.json({ ok: true, cleared });
  });

  router.get('/gateway/projection', (_req, res) => {
    res.json(computeMonthlyProjection());
  });

  router.post('/providers/ollama/warm', async (_req, res) => {
    const outcome = await warmOllamaModel();
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  // Unified Chat & Threads (with isolationMode, SSE streaming, Council Mode, Templates & Media)
  router.post('/threads', (req, res) => {
    const { title, folder, isolationMode } = req.body as {
      title?: string;
      folder?: string;
      isolationMode?: SessionIsolationMode;
    };
    const now = new Date().toISOString();
    const thread = {
      id: `thread-${crypto.randomUUID().slice(0, 8)}`,
      title: (title || 'Új beszélgetés').trim(),
      folder: (folder || 'Általános').trim(),
      isolationMode: isolationMode || 'sandboxed',
      channelSource: 'web' as const,
      createdAt: now,
      updatedAt: now,
    };
    updateState((s) => {
      s.threads.unshift(thread);
    });
    broadcastEvent('state:updated');
    res.json({ thread });
  });

  router.post('/chat/send', async (req, res) => {
    try {
      const { threadId, content, targetAgentId, attachments, preset } = req.body as {
        threadId?: string;
        content: string;
        targetAgentId?: string | null;
        attachments?: MessageAttachment[];
        preset?: ExecutionPreset;
      };
      if (!content?.trim() && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Üres üzenet nem küldhető.' });
      }
      const state = getState();
      const targetThread = threadId || state.threads[0]?.id || 'thread-main';
      const result = await handleUserTurn({
        threadId: targetThread,
        content: (content || '').trim() || 'Elemezd a mellékletet.',
        channel: 'web',
        targetAgentId,
        preset: preset || state.settings.defaultPreset,
        attachments,
      });

      if (state.settings.ttsHostSpeakerEnabled) {
        speakOnHostSpeaker(result.coordinatorReply.content);
      }

      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/chat/stream', async (req, res) => {
    const { threadId, content, targetAgentId, attachments, preset } = req.body as {
      threadId?: string;
      content: string;
      targetAgentId?: string | null;
      attachments?: MessageAttachment[];
      preset?: ExecutionPreset;
    };
    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Üres üzenet nem küldhető.' });
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const sendSse = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    try {
      const state = getState();
      const targetThread = threadId || state.threads[0]?.id || 'thread-main';
      const result = await handleUserTurn({
        threadId: targetThread,
        content: (content || '').trim() || 'Elemezd a mellékletet.',
        channel: 'web',
        targetAgentId,
        preset: preset || state.settings.defaultPreset,
        attachments,
        onStreamDelta: (delta) => sendSse('delta', { delta }),
      });
      if (state.settings.ttsHostSpeakerEnabled) {
        speakOnHostSpeaker(result.coordinatorReply.content);
      }
      broadcastEvent('state:updated');
      sendSse('done', result);
    } catch (err) {
      sendSse('error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  router.post('/chat/council', async (req, res) => {
    try {
      const { threadId, content, preset } = req.body as {
        threadId?: string;
        content: string;
        preset?: ExecutionPreset;
      };
      if (!content?.trim()) return res.status(400).json({ error: 'Kérdés kötelező a konziliumhoz.' });
      const state = getState();
      const result = await handleCouncilTurn({
        threadId: threadId || state.threads[0]?.id || 'thread-main',
        content: content.trim(),
        preset: preset || state.settings.defaultPreset,
      });
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // M10: Prompt Templates
  router.get('/templates', (_req, res) => {
    res.json({ templates: getState().promptTemplates });
  });

  router.post('/templates', (req, res) => {
    const { title, command, body, category } = req.body as Partial<PromptTemplate>;
    if (!title?.trim() || !command?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Cím, /parancs és sablon szöveg kötelező.' });
    }
    const cleanCmd = command.trim().startsWith('/') ? command.trim().toLowerCase() : `/${command.trim().toLowerCase()}`;
    const tpl: PromptTemplate = {
      id: `tpl-${crypto.randomUUID().slice(0, 6)}`,
      title: title.trim(),
      command: cleanCmd,
      body: body.trim(),
      category: (category || 'Egyéni').trim(),
      createdAt: new Date().toISOString(),
    };
    updateState((s) => {
      s.promptTemplates.unshift(tpl);
    });
    broadcastEvent('state:updated');
    res.json({ template: tpl });
  });

  router.delete('/templates/:id', (req, res) => {
    updateState((s) => {
      s.promptTemplates = s.promptTemplates.filter((t) => t.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú4, Ú5, Ú20: Media Generation, Audio Transcription & Artifacts
  router.get('/artifacts', (_req, res) => {
    res.json({ artifacts: getState().artifacts });
  });

  router.post('/artifacts', (req, res) => {
    const { kind, title, mimeType, urlOrContent } = req.body as {
      kind: 'html_app' | 'chart_svg' | 'image';
      title: string;
      mimeType?: string;
      urlOrContent: string;
    };
    if (!title?.trim() || !urlOrContent?.trim()) {
      return res.status(400).json({ error: 'Cím és tartalom kötelező.' });
    }
    const art = {
      id: `art-${crypto.randomUUID().slice(0, 8)}`,
      kind: kind || 'html_app',
      title: title.trim(),
      mimeType: mimeType || 'text/html',
      urlOrContent,
      createdAt: new Date().toISOString(),
    };
    updateState((s) => {
      s.artifacts.unshift(art);
      s.artifacts = s.artifacts.slice(0, 50);
    });
    broadcastEvent('state:updated');
    res.json({ artifact: art });
  });

  router.delete('/artifacts/:id', (req, res) => {
    updateState((s) => {
      s.artifacts = s.artifacts.filter((a) => a.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/media/generate-image', async (req, res) => {
    try {
      const { prompt } = req.body as { prompt: string };
      if (!prompt?.trim()) return res.status(400).json({ error: 'Képleírás (prompt) kötelező.' });
      const artifact = await generateImageArtifactWithGemini({ prompt: prompt.trim() });
      broadcastEvent('state:updated');
      res.json({ artifact });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/media/transcribe', async (req, res) => {
    try {
      const { mimeType, dataBase64, languageHint } = req.body as {
        mimeType?: string;
        dataBase64: string;
        languageHint?: string;
      };
      if (!dataBase64?.trim()) return res.status(400).json({ error: 'Hanganyag (base64) kötelező.' });
      const result = await transcribeAudioBuffer({
        mimeType: mimeType || 'audio/webm',
        dataBase64,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Agents & Hierarchy + Per-Agent Telegram Bot & Budget
  router.post('/agents', (req, res) => {
    try {
      const body = req.body as Partial<Agent>;
      if (!body.name?.trim()) {
        return res.status(400).json({ error: 'Az ágens neve kötelező.' });
      }
      const agent = createAgent({
        name: body.name,
        role: body.role || 'Specialista',
        avatar: body.avatar,
        parentAgentId: body.parentAgentId ?? null,
        systemPrompt: body.systemPrompt || 'Autonóm AI specialista ágens.',
        modelId: body.modelId,
        providerId: body.providerId,
        webSearchEnabled: body.webSearchEnabled,
        hostExecutionEnabled: body.hostExecutionEnabled,
        dailyBudgetUsd: body.dailyBudgetUsd,
        voiceReplyMode: body.voiceReplyMode,
      });
      broadcastEvent('state:updated');
      res.json({ agent });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.patch('/agents/:id', (req, res) => {
    const patch = req.body as Partial<Agent> & { agentTelegramToken?: string };
    let updated: Agent | null = null;
    updateState((s) => {
      const target = s.agents.find((a) => a.id === req.params.id);
      if (!target) return;
      if (typeof patch.name === 'string') target.name = patch.name.trim();
      if (typeof patch.role === 'string') target.role = patch.role.trim();
      if (patch.parentAgentId !== undefined && !target.isSupervisor) {
        target.parentAgentId = patch.parentAgentId;
      }
      if (typeof patch.systemPrompt === 'string') target.systemPrompt = patch.systemPrompt;
      if (typeof patch.modelId === 'string') target.modelId = patch.modelId;
      if (patch.providerId) target.providerId = patch.providerId;
      if (typeof patch.webSearchEnabled === 'boolean') target.webSearchEnabled = patch.webSearchEnabled;
      if (typeof patch.hostExecutionEnabled === 'boolean') {
        target.hostExecutionEnabled = patch.hostExecutionEnabled;
      }
      if (typeof patch.active === 'boolean' && !target.isSupervisor) target.active = patch.active;
      if (typeof patch.telegramBotEnabled === 'boolean') target.telegramBotEnabled = patch.telegramBotEnabled;
      if (typeof patch.telegramBotUsername === 'string') target.telegramBotUsername = patch.telegramBotUsername.trim();
      if (typeof patch.dailyBudgetUsd === 'number') target.dailyBudgetUsd = Math.max(0, patch.dailyBudgetUsd);
      if (patch.voiceReplyMode) target.voiceReplyMode = patch.voiceReplyMode;
      if (Array.isArray(patch.allowedMcpIds)) target.allowedMcpIds = patch.allowedMcpIds;
      if (typeof patch.activeHoursStart === 'number') {
        target.activeHoursStart = Math.max(0, Math.min(23, Math.round(patch.activeHoursStart)));
      }
      if (typeof patch.activeHoursEnd === 'number') {
        target.activeHoursEnd = Math.max(0, Math.min(23, Math.round(patch.activeHoursEnd)));
      }
      if (typeof patch.maxRunsPerHour === 'number') {
        target.maxRunsPerHour = Math.max(0, Math.round(patch.maxRunsPerHour));
      }
      if (typeof patch.agentTelegramToken === 'string' && patch.agentTelegramToken.trim()) {
        setAgentTelegramTokenSecret(target.id, patch.agentTelegramToken.trim());
        target.telegramHasToken = true;
        target.telegramBotEnabled = true;
      }
      target.updatedAt = new Date().toISOString();
      updated = target;
    });
    if (!updated) return res.status(404).json({ error: 'Ágens nem található.' });
    broadcastEvent('state:updated');
    res.json({ agent: updated });
  });

  router.delete('/agents/:id', (req, res) => {
    const state = getState();
    const target = state.agents.find((a) => a.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Ágens nem található.' });
    if (target.isSupervisor) {
      return res.status(403).json({ error: 'Az állandó Felügyelő Auditor ágens nem törölhető.' });
    }
    setAgentTelegramTokenSecret(target.id, '');
    updateState((s) => {
      s.agents = s.agents.filter((a) => a.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Rich Kanban (Priority, Subtasks, AI Auto-Breakdown, Dependencies M16, Git Branch M17)
  router.post('/kanban', (req, res) => {
    const { title, description, status, assignedAgentId, priority, project, blockedBy, gitBranch } =
      req.body as Partial<KanbanCard>;
    if (!title?.trim()) return res.status(400).json({ error: 'Kártya címe kötelező.' });
    const now = new Date().toISOString();
    const card: KanbanCard = {
      id: `card-${crypto.randomUUID().slice(0, 8)}`,
      title: title.trim(),
      description: (description || '').trim(),
      status: status || 'todo',
      assignedAgentId: assignedAgentId ?? null,
      priority: (priority as KanbanPriority) || 'medium',
      subtasks: [],
      archived: false,
      project: project?.trim() || undefined,
      blockedBy: Array.isArray(blockedBy) ? blockedBy : [],
      gitBranch: gitBranch?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    updateState((s) => {
      s.kanban.unshift(card);
    });
    appendAuditLog({
      type: 'kanban',
      sourceAgentId: assignedAgentId || 'user',
      sourceAgentName: 'Kanban',
      message: `Új kártya: ${card.title} [${card.status}/${card.priority}]`,
    });
    broadcastEvent('state:updated');
    res.json({ card });
  });

  router.patch('/kanban/:id', (req, res) => {
    const { status, title, description, assignedAgentId, priority, archived, blockedBy, gitBranch } = req.body as {
      status?: KanbanStatus;
      title?: string;
      description?: string;
      assignedAgentId?: string | null;
      priority?: KanbanPriority;
      archived?: boolean;
      blockedBy?: string[];
      gitBranch?: string;
    };
    let card: KanbanCard | null = null;
    updateState((s) => {
      const target = s.kanban.find((c) => c.id === req.params.id);
      if (!target) return;
      if (status) target.status = status;
      if (typeof title === 'string') target.title = title;
      if (typeof description === 'string') target.description = description;
      if (assignedAgentId !== undefined) target.assignedAgentId = assignedAgentId;
      if (priority) target.priority = priority;
      if (typeof archived === 'boolean') target.archived = archived;
      if (Array.isArray(blockedBy)) target.blockedBy = blockedBy;
      if (typeof gitBranch === 'string') target.gitBranch = gitBranch.trim() || undefined;
      target.updatedAt = new Date().toISOString();
      card = target;
    });
    if (!card) return res.status(404).json({ error: 'Kanban kártya nem található.' });
    broadcastEvent('state:updated');
    res.json({ card });
  });

  router.post('/kanban/:id/branch', (req, res) => {
    const outcome = ensureKanbanGitBranch(req.params.id);
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  router.post('/kanban/:id/breakdown', async (req, res) => {
    const card = await breakdownKanbanCardWithAi(req.params.id);
    if (!card) return res.status(404).json({ error: 'Kanban kártya nem található.' });
    broadcastEvent('state:updated');
    res.json({ card });
  });

  router.post('/kanban/:id/subtasks/:subId/toggle', (req, res) => {
    let updated: KanbanCard | null = null;
    updateState((s) => {
      const card = s.kanban.find((c) => c.id === req.params.id);
      const sub = card?.subtasks?.find((x) => x.id === req.params.subId);
      if (card && sub) {
        sub.done = !sub.done;
        card.updatedAt = new Date().toISOString();
        updated = card;
      }
    });
    if (!updated) return res.status(404).json({ error: 'Részfeladat nem található.' });
    broadcastEvent('state:updated');
    res.json({ card: updated });
  });

  router.delete('/kanban/:id', (req, res) => {
    updateState((s) => {
      s.kanban = s.kanban.filter((c) => c.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/kanban/worker/run', async (_req, res) => {
    try {
      const outcome = await runAutonomousKanbanWorkerTick();
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Ötletláda (IdeaBox)
  router.post('/ideas', (req, res) => {
    const { title, description, impact, effort } = req.body as {
      title: string;
      description?: string;
      impact?: number;
      effort?: number;
    };
    if (!title?.trim()) return res.status(400).json({ error: 'Ötlet címe kötelező.' });
    const imp = Math.min(5, Math.max(1, Number(impact ?? 3)));
    const eff = Math.min(5, Math.max(1, Number(effort ?? 2)));
    const now = new Date().toISOString();
    const idea: IdeaItem = {
      id: `idea-${crypto.randomUUID().slice(0, 8)}`,
      title: title.trim(),
      description: (description || '').trim(),
      status: 'new',
      impact: imp,
      effort: eff,
      score: imp - eff,
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    updateState((s) => {
      s.ideas.unshift(idea);
    });
    broadcastEvent('state:updated');
    res.json({ idea });
  });

  router.patch('/ideas/:id', (req, res) => {
    const { status, impact, effort } = req.body as {
      status?: IdeaStatus;
      impact?: number;
      effort?: number;
    };
    let updated: IdeaItem | null = null;
    updateState((s) => {
      const idea = s.ideas.find((i) => i.id === req.params.id);
      if (!idea) return;
      if (status) idea.status = status;
      if (typeof impact === 'number') idea.impact = Math.min(5, Math.max(1, impact));
      if (typeof effort === 'number') idea.effort = Math.min(5, Math.max(1, effort));
      idea.score = idea.impact - idea.effort;
      idea.updatedAt = new Date().toISOString();
      updated = idea;
    });
    if (!updated) return res.status(404).json({ error: 'Ötlet nem található.' });
    broadcastEvent('state:updated');
    res.json({ idea: updated });
  });

  router.post('/ideas/:id/comments', (req, res) => {
    const { text, author } = req.body as { text: string; author?: string };
    if (!text?.trim()) return res.status(400).json({ error: 'Megjegyzés kötelező.' });
    let updated: IdeaItem | null = null;
    updateState((s) => {
      const idea = s.ideas.find((i) => i.id === req.params.id);
      if (!idea) return;
      idea.comments.push({
        id: crypto.randomUUID().slice(0, 8),
        author: (author || 'Felhasználó').trim(),
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      idea.updatedAt = new Date().toISOString();
      updated = idea;
    });
    if (!updated) return res.status(404).json({ error: 'Ötlet nem található.' });
    broadcastEvent('state:updated');
    res.json({ idea: updated });
  });

  router.post('/ideas/:id/promote', async (req, res) => {
    const { withAiBreakdown } = req.body as { withAiBreakdown?: boolean };
    const state = getState();
    const idea = state.ideas.find((i) => i.id === req.params.id);
    if (!idea) return res.status(404).json({ error: 'Ötlet nem található.' });

    const now = new Date().toISOString();
    const firstAgentId = state.agents.find((a) => !a.isSupervisor && a.active)?.id ?? null;
    const card: KanbanCard = {
      id: `card-${crypto.randomUUID().slice(0, 8)}`,
      title: idea.title,
      description: `${idea.description}\n(Ötletláda Impact=${idea.impact}, Effort=${idea.effort}, Score=${idea.score})`.trim(),
      status: 'todo',
      assignedAgentId: firstAgentId,
      priority: idea.score >= 2 ? 'high' : 'medium',
      subtasks: [],
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    updateState((s) => {
      s.kanban.unshift(card);
      const ref = s.ideas.find((i) => i.id === idea.id);
      if (ref) {
        ref.status = 'kanban';
        ref.linkedCardId = card.id;
        ref.updatedAt = now;
      }
    });

    if (withAiBreakdown) {
      await breakdownKanbanCardWithAi(card.id);
    }

    broadcastEvent('state:updated');
    res.json({ card: getState().kanban.find((c) => c.id === card.id) });
  });

  router.delete('/ideas/:id', (req, res) => {
    updateState((s) => {
      s.ideas = s.ideas.filter((i) => i.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Tiered Hybrid Memory, Graph & Dreaming
  router.post('/memory/search', async (req, res) => {
    const { query, tier } = req.body as { query: string; tier?: MemoryTier | 'all' };
    const results = await searchMemoriesAsync(query || '', 12, { tier: tier || 'all', reinforce: true });
    res.json({ results });
  });

  router.post('/memory/add', async (req, res) => {
    const { content, entity, tags, links, tier } = req.body as {
      content: string;
      entity?: string;
      tags?: string[];
      links?: string[];
      tier?: MemoryTier;
    };
    if (!content?.trim()) return res.status(400).json({ error: 'Tartalom kötelező.' });
    const entry = await addPersistentMemoryAsync({
      content: content.trim(),
      entity: (entity || 'Kézi Jegyzet').trim(),
      tags: tags && tags.length > 0 ? tags : ['memory'],
      links: links || [],
      tier: tier || 'hot',
    });
    broadcastEvent('state:updated');
    res.json({ entry });
  });

  router.post('/memory/decay', (_req, res) => {
    const stats = runSalienceDecayAndTiering();
    broadcastEvent('state:updated');
    res.json(stats);
  });

  router.get('/memory/graph', (_req, res) => {
    res.json(getMemoryGraphData());
  });

  router.get('/memory/vault', (_req, res) => {
    res.json({ notes: listObsidianNotes() });
  });

  // Ú23: Interactive Obsidian/Markdown Wiki Editor
  router.get('/memory/wiki', (req, res) => {
    try {
      const relPath = String(req.query.path || '');
      if (!relPath) return res.json({ notes: listObsidianNotes() });
      res.json({ note: readVaultNote(relPath) });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/memory/wiki', (req, res) => {
    try {
      const { path: relPath, content } = req.body as { path: string; content: string };
      if (!relPath?.trim()) return res.status(400).json({ error: 'Fájlnév kötelező.' });
      const note = saveVaultNote(relPath, content || '');
      broadcastEvent('state:updated');
      res.json({ note });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/memory/wiki', (req, res) => {
    try {
      const relPath = String(req.query.path || '');
      if (!relPath) return res.status(400).json({ error: 'Fájlnév kötelező.' });
      deleteVaultNote(relPath);
      broadcastEvent('state:updated');
      res.json({ ok: true });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Ú3: Local RAG Document Upload & Listing
  router.get('/rag/documents', (_req, res) => {
    res.json({ documents: listRagDocuments() });
  });

  router.post('/rag/upload', async (req, res) => {
    try {
      const { filename, contentBase64, contentText } = req.body as {
        filename: string;
        contentBase64?: string;
        contentText?: string;
      };
      if (!filename?.trim() || (!contentBase64 && !contentText)) {
        return res.status(400).json({ error: 'Fájlnév és tartalom kötelező.' });
      }
      const dataBase64 = contentBase64
        ? contentBase64
        : Buffer.from(contentText || '', 'utf8').toString('base64');
      const result = await ingestDocumentToRag({ filename: filename.trim(), dataBase64 });
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Ú27: Offline Survival Knowledge Pack
  router.get('/offline/search', (req, res) => {
    const q = String(req.query.q || '');
    const stats = getOfflinePackStats();
    const hits = q.trim() ? searchOfflineKnowledgePack(q) : { found: false, matches: [] };
    res.json({ stats, ...hits });
  });

  // Ú1 & Ú2: Live Web Search & Headless Browser Actions
  router.post('/web/search', async (req, res) => {
    try {
      const { query, maxResults } = req.body as { query: string; maxResults?: number };
      if (!query?.trim()) return res.status(400).json({ error: 'Keresőkifejezés kötelező.' });
      const result = await performWebSearch(query.trim(), maxResults || 6);
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/browser/status', (_req, res) => {
    const bin = detectHeadlessBrowserBinary();
    res.json({ available: Boolean(bin), binary: bin });
  });

  router.post('/browser/action', async (req, res) => {
    try {
      const { url, action } = req.body as {
        url: string;
        action?: 'inspect' | 'screenshot' | 'navigate_dom' | 'extract_links';
      };
      if (!url?.trim()) return res.status(400).json({ error: 'URL kötelező.' });
      const mappedAction: 'navigate_dom' | 'screenshot' | 'extract_links' =
        action === 'screenshot'
          ? 'screenshot'
          : action === 'extract_links'
          ? 'extract_links'
          : 'navigate_dom';
      const out = await runHeadlessBrowserAction({ url: url.trim(), action: mappedAction });
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dreaming/run', async (_req, res) => {
    try {
      const hardware = collectHardwareMetrics();
      const outcome = await runDreamingCycle({ hardware, forceRun: true });
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dreaming/drafts/:id/promote', (req, res) => {
    try {
      const skill = promoteDreamSkillDraft(req.params.id);
      broadcastEvent('state:updated');
      res.json({ skill });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/reflexion/:id/apply', (req, res) => {
    try {
      const agent = applyReflexionSuggestion(req.params.id);
      broadcastEvent('state:updated');
      res.json({ agent });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Supervisor & Sandbox
  router.post('/supervisor/audit', (_req, res) => {
    const report = auditRecentCycle();
    broadcastEvent('state:updated');
    res.json(report);
  });

  router.post('/supervisor/destructive-proof', (_req, res) => {
    const proof = runDestructiveSandboxProof();
    broadcastEvent('state:updated');
    res.json(proof);
  });

  // Skills Factory & MCP
  router.post('/skills', (req, res) => {
    try {
      const { name, description, code, createdByAgentId, pitfalls } = req.body as {
        name: string;
        description: string;
        code: string;
        createdByAgentId?: string;
        pitfalls?: string[];
      };
      if (!name?.trim() || !code?.trim()) {
        return res.status(400).json({ error: 'Skill név és kód kötelező.' });
      }
      const skill = createAndValidateSkill({
        name,
        description: description || '',
        code,
        createdByAgentId: createdByAgentId || 'user',
        pitfalls,
      });
      broadcastEvent('state:updated');
      res.json({ skill });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/skills/:id/pitfalls', (req, res) => {
    const { pitfall } = req.body as { pitfall: string };
    if (!pitfall?.trim()) return res.status(400).json({ error: 'Buktató leírás kötelező.' });
    const skill = addSkillPitfall(req.params.id, pitfall);
    if (!skill) return res.status(404).json({ error: 'Skill nem található.' });
    broadcastEvent('state:updated');
    res.json({ skill });
  });

  router.post('/mcp', (req, res) => {
    const { name, description, endpointUrl, authType, transport, command, args } = req.body as {
      name: string;
      description?: string;
      endpointUrl?: string;
      authType?: McpAuthType;
      transport?: McpTransport;
      command?: string;
      args?: string[] | string;
    };
    const isStdio = transport === 'stdio';
    if (!name?.trim() || (!isStdio && !endpointUrl?.trim()) || (isStdio && !command?.trim())) {
      return res.status(400).json({ error: 'MCP név és végpont URL (vagy stdio parancs) kötelező.' });
    }
    const parsedArgs = Array.isArray(args)
      ? args
      : typeof args === 'string'
      ? args.split(/\s+/).filter(Boolean)
      : undefined;
    const server = registerMcpServer({
      name,
      description: description || '',
      endpointUrl: endpointUrl || '',
      transport: transport || 'http',
      command,
      args: parsedArgs,
      authType: authType || 'none',
    });
    broadcastEvent('state:updated');
    res.json({ server });
  });

  router.patch('/mcp/:id/credentials', (req, res) => {
    const creds = req.body as Record<string, string>;
    const updated = updateMcpCredentials(req.params.id, creds);
    if (!updated) return res.status(404).json({ error: 'MCP szerver nem található.' });
    broadcastEvent('state:updated');
    res.json({ server: updated });
  });

  router.post('/mcp/:id/test', async (req, res) => {
    try {
      const server = await testMcpConnection(req.params.id);
      broadcastEvent('state:updated');
      res.json({ server });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/mcp/:id/tools', async (req, res) => {
    try {
      const result = await listMcpTools(req.params.id);
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/mcp/import-catalog', async (req, res) => {
    try {
      const { catalogUrl } = req.body as { catalogUrl: string };
      if (!catalogUrl?.trim()) return res.status(400).json({ error: 'Katalógus URL kötelező.' });
      const items = await fetchExternalCatalog(catalogUrl.trim());
      res.json({ items });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/mcp/google-oauth-url', (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    const info = buildGoogleOAuthUrl(`${origin}/api/mcp/google-oauth-callback`);
    res.json(info);
  });

  // Multi-Channel Connectors & Pairing (incl. M18 Bidirectional Polling)
  router.post('/channels', (req, res) => {
    const { type, name, webhookUrl, secret, defaultAgentId } = req.body as {
      type: ChannelConnectorType;
      name: string;
      webhookUrl: string;
      secret?: string;
      defaultAgentId?: string | null;
    };
    if (!name?.trim() || !webhookUrl?.trim()) {
      return res.status(400).json({ error: 'Csatlakozó név és webhook URL kötelező.' });
    }
    const connector = createChannelConnector({ type: type || 'webhook', name, webhookUrl, secret, defaultAgentId });
    broadcastEvent('state:updated');
    res.json({ connector });
  });

  router.patch('/channels/:id/polling', (req, res) => {
    const { pollingEnabled, channelId, botToken } = req.body as {
      pollingEnabled: boolean;
      channelId?: string;
      botToken?: string;
    };
    const updated = updateChannelPollingConfig(req.params.id, { pollingEnabled, channelId, botToken });
    if (!updated) return res.status(404).json({ error: 'Csatlakozó nem található.' });
    broadcastEvent('state:updated');
    res.json({ connector: updated });
  });

  router.post('/channels/poll', async (_req, res) => {
    const outcome = await pollExternalChannels();
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  router.delete('/channels/:id', (req, res) => {
    deleteChannelConnector(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/channels/:id/test', async (req, res) => {
    const result = await sendToChannelConnector(req.params.id, 'NovaSwarm csatorna kapcsolat-teszt (OK)');
    broadcastEvent('state:updated');
    res.json(result);
  });

  router.post('/channels/inbound/:connectorId', async (req, res) => {
    try {
      // Slack Events API url_verification challenge
      if (req.body?.type === 'url_verification' && req.body?.challenge) {
        return res.json({ challenge: req.body.challenge });
      }
      // Discord interaction ping
      if (req.body?.type === 1) {
        return res.json({ type: 1 });
      }
      const text =
        req.body?.text ||
        req.body?.content ||
        req.body?.event?.text ||
        req.body?.message ||
        '';
      const senderId = String(req.body?.senderId || req.body?.user_id || req.body?.author?.id || 'external-user');
      const senderLabel = String(req.body?.senderLabel || req.body?.user_name || req.body?.author?.username || senderId);
      if (!String(text).trim()) {
        return res.status(400).json({ error: 'Üres bejövő üzenet.' });
      }
      const result = await handleInboundChannelEvent({
        connectorId: req.params.connectorId,
        senderId,
        senderLabel,
        text: String(text),
      });
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/pairing/:id/resolve', (req, res) => {
    const { decision } = req.body as { decision: 'approved' | 'rejected' };
    const resolved = resolvePairingRequest(req.params.id, decision);
    if (!resolved) return res.status(404).json({ error: 'Függő párosítási kérelem nem található.' });
    broadcastEvent('state:updated');
    res.json({ pairing: resolved });
  });

  // P2P Federation
  router.get('/federation/manifest', (_req, res) => {
    const state = getState();
    res.json({
      instanceName: state.settings.instanceName,
      federationEnabled: state.settings.federationEnabled,
      agents: state.agents
        .filter((a) => !a.isSupervisor && a.active)
        .map((a) => ({ id: a.id, name: a.name, role: a.role })),
    });
  });

  router.post('/federation/peers', (req, res) => {
    try {
      const { name, baseUrl, sharedToken } = req.body as {
        name: string;
        baseUrl: string;
        sharedToken?: string;
      };
      if (!name?.trim() || !baseUrl?.trim()) {
        return res.status(400).json({ error: 'Társ neve és alap URL kötelező.' });
      }
      const peer = addFederationPeer({ name, baseUrl, sharedToken });
      broadcastEvent('state:updated');
      res.json({ peer });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/federation/peers/:id', (req, res) => {
    removeFederationPeer(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/federation/peers/:id/ping', async (req, res) => {
    const peer = await pingFederationPeer(req.params.id);
    if (!peer) return res.status(404).json({ error: 'Föderációs társ nem található.' });
    broadcastEvent('state:updated');
    res.json({ peer });
  });

  router.post('/federation/send', async (req, res) => {
    try {
      const { address, content, fromAgent } = req.body as {
        address: string;
        content: string;
        fromAgent?: string;
      };
      const outcome = await sendFederationMessage({ address, content, fromAgent });
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/federation/inbound', async (req, res) => {
    try {
      const { fromNode, fromAgent, targetAgent, content } = req.body as {
        fromNode: string;
        fromAgent: string;
        targetAgent: string;
        content: string;
      };
      const outcome = await receiveFederationMessage({
        fromNode: fromNode || 'remote',
        fromAgent: fromAgent || 'agent',
        targetAgent: targetAgent || 'coordinator',
        content: content || '',
      });
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/federation/handoff', async (req, res) => {
    try {
      const { cardId, peerId } = req.body as { cardId: string; peerId: string };
      const outcome = await handoffKanbanToPeer(cardId, peerId);
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/federation/handoff-inbound', (req, res) => {
    try {
      const result = receiveKanbanHandoff(req.body);
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/federation/memory-sync', async (_req, res) => {
    const outcome = await syncSharedMemoriesWithPeers();
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  router.post('/federation/memory-sync-inbound', (req, res) => {
    const { fromNode, entries } = req.body as {
      fromNode: string;
      entries: Array<{ content: string; entity: string; tags: string[] }>;
    };
    const outcome = receiveSharedMemories(fromNode || 'remote', entries || []);
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  // Uptime Monitor & Heartbeat
  router.post('/uptime', (req, res) => {
    const { name, url, expectedText, intervalMinutes } = req.body as {
      name: string;
      url: string;
      expectedText?: string;
      intervalMinutes?: number;
    };
    if (!name?.trim() || !url?.trim()) {
      return res.status(400).json({ error: 'Célpont neve és URL kötelező.' });
    }
    const target = addUptimeTarget({ name, url, expectedText, intervalMinutes });
    broadcastEvent('state:updated');
    res.json({ target });
  });

  router.delete('/uptime/:id', (req, res) => {
    removeUptimeTarget(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/uptime/run', async (_req, res) => {
    const targets = await runUptimeChecks(fetch, async (msg) => {
      await sendTelegramMessage(msg);
    });
    broadcastEvent('state:updated');
    res.json({ targets });
  });

  router.post('/heartbeat/run', async (_req, res) => {
    const outcome = await runHeartbeatTick(async (msg) => {
      await sendTelegramMessage(msg);
    });
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  // Terminal REST endpoints
  router.get('/terminal/sessions', (_req, res) => {
    res.json({ sessions: listTerminalSessions() });
  });

  router.post('/terminal/sessions', (req, res) => {
    try {
      const { initiator, agentId, cols, rows } = req.body as {
        initiator?: string;
        agentId?: string;
        cols?: number;
        rows?: number;
      };
      const session = createTerminalSession({
        initiator: initiator || 'Felhasználó',
        agentId,
        cols,
        rows,
      });
      broadcastEvent('state:updated');
      res.json({ session });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/terminal/sessions/:id', (req, res) => {
    closeTerminalSession(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.get('/terminal/sessions/:id/buffer', (req, res) => {
    const lines = Math.min(150, Math.max(10, Number(req.query.lines || 50)));
    res.json({ sessionId: req.params.id, buffer: getTerminalBuffer(req.params.id, lines) });
  });

  // Approvals & Kill Switch
  router.post('/approvals/:id/resolve', (req, res) => {
    const { decision } = req.body as { decision: 'approved' | 'rejected' };
    const resolved = resolveApproval(req.params.id, decision, 'web');
    if (!resolved) return res.status(404).json({ error: 'Függőben lévő kérelem nem található.' });
    broadcastEvent('state:updated');
    res.json({ approval: resolved });
  });

  router.post('/kill-switch', (req, res) => {
    const { active } = req.body as { active: boolean };
    if (active) {
      activateKillSwitch('web');
    } else {
      deactivateKillSwitch();
    }
    broadcastEvent('state:updated');
    res.json({ active: getState().settings.killSwitchActive });
  });

  // Self-modification, Git History, Diff & Rollback (M15)
  router.get('/selfmod/history', (_req, res) => {
    res.json({ commits: getRecentGitHistory() });
  });

  router.get('/selfmod/diff/:hash', (req, res) => {
    res.json(getCommitDiff(req.params.hash));
  });

  router.post('/selfmod/rollback', (req, res) => {
    try {
      const { hash } = req.body as { hash: string };
      if (!hash?.trim()) return res.status(400).json({ error: 'Commit hash kötelező.' });
      const result = rollbackSelfModToCommit(hash.trim());
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/selfmod/apply', (req, res) => {
    try {
      const { targetPath, newContent, commitMessage, agentId } = req.body as {
        targetPath: string;
        newContent: string;
        commitMessage?: string;
        agentId?: string;
      };
      const result = applyGuardedSelfModification({
        targetPath,
        newContent,
        commitMessage: commitMessage || `feat(selfmod): update ${targetPath}`,
        agentId: agentId || 'user',
      });
      if (result.pendingApproval) {
        void sendTelegramMessage(
          `Érzékeny önmódosítási kérelem: ${targetPath}\nJóváhagyás: /approve ${result.approvalId?.slice(0, 8)}`
        );
      }
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // System Backups, OS Upgrade, OTA, Docs, Cron, Telegram Command Tester
  router.post('/system/backup', (_req, res) => {
    const point = createBackupPoint();
    broadcastEvent('state:updated');
    res.json({ backup: point });
  });

  router.post('/system/restore/:id', (req, res) => {
    const ok = restoreBackupPoint(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Mentési pont nem található.' });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/system/os-upgrade', (_req, res) => {
    try {
      const queued = requestOsPackageUpgrade('Web UI');
      void sendTelegramMessage(
        `OS csomagfrissítés jóváhagyásra vár: ${queued.command}\nJóváhagyás: /approve ${queued.queuedApprovalId.slice(0, 8)}`
      );
      broadcastEvent('state:updated');
      res.json(queued);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/system/ota', async (_req, res) => {
    const status = await checkOtaUpdates();
    res.json(status);
  });

  router.get('/system/ota/diff', (_req, res) => {
    res.json(getOtaGitDiff());
  });

  router.post('/system/ota/apply', (_req, res) => {
    const result = applyOtaUpdate();
    broadcastEvent('state:updated');
    res.json(result);
  });

  router.get('/system/docs', (_req, res) => {
    res.json({ documentation: SELF_DOCUMENTATION_TEXT });
  });

  router.post('/cron', (req, res) => {
    const { name, cronExpression, prompt, targetAgentId } = req.body as {
      name: string;
      cronExpression: string;
      prompt: string;
      targetAgentId?: string;
    };
    if (!name?.trim() || !cronExpression?.trim() || !prompt?.trim()) {
      return res.status(400).json({ error: 'Név, cron kifejezés és feladat prompt kötelező.' });
    }
    const task = {
      id: `cron-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      cronExpression: cronExpression.trim(),
      prompt: prompt.trim(),
      targetAgentId: targetAgentId || getState().agents.find((a) => !a.isSupervisor)?.id || '',
      enabled: true,
      lastRunAt: null,
      lastResult: null,
    };
    updateState((s) => {
      s.cronTasks.push(task);
    });
    registerCronTask(task, async (t) => {
      const state = getState();
      if (state.settings.killSwitchActive) return;
      const turn = await handleUserTurn({
        threadId: state.threads[0]?.id || 'thread-main',
        content: `[Cron: ${t.name}] ${t.prompt}`,
        channel: 'web',
        targetAgentId: t.targetAgentId,
      });
      updateState((s) => {
        const ref = s.cronTasks.find((c) => c.id === t.id);
        if (ref) {
          ref.lastRunAt = new Date().toISOString();
          ref.lastResult = turn.coordinatorReply.content.slice(0, 200);
        }
      });
      broadcastEvent('state:updated');
    });
    broadcastEvent('state:updated');
    res.json({ task });
  });

  router.delete('/cron/:id', (req, res) => {
    updateState((s) => {
      s.cronTasks = s.cronTasks.filter((c) => c.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/telegram/command', async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      if (!text?.trim()) return res.status(400).json({ error: 'Parancs vagy szöveg kötelező.' });
      const reply = await processTelegramInput(text);
      broadcastEvent('state:updated');
      res.json({ reply });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/host/check-access', (_req, res) => {
    try {
      assertHostPermission('host_access_check');
      res.json({ granted: true });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // M22: Audit Export (JSON / CSV)
  router.get('/audit/export', (req, res) => {
    const format = String(req.query.format || 'json').toLowerCase();
    const logs = getState().auditLogs;
    if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = 'id,timestamp,type,sourceAgentId,sourceAgentName,verifiedExecution,message\n';
      const rows = logs
        .map((l) =>
          [l.id, l.timestamp, l.type, l.sourceAgentId, l.sourceAgentName, l.verifiedExecution ? 'true' : 'false', l.message]
            .map(esc)
            .join(',')
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="novaswarm-audit.csv"');
      return res.send(header + rows);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="novaswarm-audit.json"');
    return res.send(JSON.stringify(logs, null, 2));
  });

  // M25, M26, Ú9-Ú15, Ú26: Host Diagnostics, .env, Docker, Systemd, LAN, VPN, Disk/Rsync, SSH Fleet, SSL
  router.get('/system/diagnostics', async (_req, res) => {
    res.json(await runHostSelfDiagnostics());
  });

  router.get('/system/env', (_req, res) => {
    res.json({ vars: readSafeEnvConfig() });
  });

  router.patch('/system/env', (req, res) => {
    try {
      const { vars } = req.body as { vars: Record<string, string> };
      const updated = updateSafeEnvConfig(vars || {});
      res.json({ vars: updated });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/infra/docker', (_req, res) => {
    res.json(listDockerContainers());
  });

  router.get('/infra/docker/:id/logs', (req, res) => {
    const lines = Number(req.query.lines || 60);
    res.json({ logs: getDockerContainerLogs(req.params.id, lines) });
  });

  router.post('/infra/docker/:id/:action', (req, res) => {
    try {
      const action = req.params.action as 'start' | 'stop' | 'restart';
      if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ error: 'Érvénytelen Docker művelet.' });
      }
      const result = controlDockerContainer(req.params.id, action);
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/infra/systemd', (_req, res) => {
    res.json(listSystemdUnits());
  });

  router.post('/infra/systemd/:unit/analyze', async (req, res) => {
    res.json(await inspectAndAnalyzeSystemdUnit(req.params.unit));
  });

  router.get('/infra/lan', (_req, res) => {
    res.json(scanLanDevices());
  });

  router.get('/infra/vpn', (_req, res) => {
    res.json(getVpnStatus());
  });

  router.get('/infra/disks', (_req, res) => {
    res.json(inspectDiskHealth());
  });

  router.post('/infra/rsync', (req, res) => {
    try {
      const { targetDir } = req.body as { targetDir?: string };
      const target = targetDir?.trim() || getState().settings.backupRsyncTarget;
      if (!target) return res.status(400).json({ error: 'Rsync célmappa kötelező.' });
      res.json(runRsyncExternalBackup(target));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/infra/ssh', (_req, res) => {
    res.json({ profiles: getState().sshProfiles });
  });

  router.post('/infra/ssh', (req, res) => {
    const { name, host, port, username, keyPath } = req.body as {
      name: string;
      host: string;
      port?: number;
      username: string;
      keyPath?: string;
    };
    if (!name?.trim() || !host?.trim() || !username?.trim()) {
      return res.status(400).json({ error: 'Név, host és felhasználónév kötelező.' });
    }
    const profile = addSshProfile({ name, host, port, username, keyPath });
    broadcastEvent('state:updated');
    res.json({ profile });
  });

  router.delete('/infra/ssh/:id', (req, res) => {
    updateState((s) => {
      s.sshProfiles = s.sshProfiles.filter((p) => p.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/infra/ssh/:id/exec', (req, res) => {
    try {
      const { command } = req.body as { command: string };
      if (!command?.trim()) return res.status(400).json({ error: 'Parancs kötelező.' });
      const result = executeSshProfileCommand(req.params.id, command.trim());
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/infra/ssl', async (req, res) => {
    const { host, port } = req.body as { host: string; port?: number };
    if (!host?.trim()) return res.status(400).json({ error: 'Host kötelező.' });
    const target = {
      id: `ssl-${crypto.randomUUID().slice(0, 6)}`,
      host: host.trim().replace(/^https?:\/\//i, '').split('/')[0],
      port: Number(port || 443),
    };
    updateState((s) => {
      s.sslTargets.push(target);
    });
    const results = await checkAllSslTargets();
    broadcastEvent('state:updated');
    res.json({ targets: results });
  });

  router.delete('/infra/ssl/:id', (req, res) => {
    updateState((s) => {
      s.sslTargets = s.sslTargets.filter((t) => t.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/infra/ssl/check', async (_req, res) => {
    const targets = await checkAllSslTargets();
    broadcastEvent('state:updated');
    res.json({ targets });
  });

  // Ú6: RSS Feeds & Daily Briefing
  router.post('/rss/feeds', async (req, res) => {
    const { name, url } = req.body as { name: string; url: string };
    if (!name?.trim() || !url?.trim()) return res.status(400).json({ error: 'Név és feed URL kötelező.' });
    const feed = {
      id: `rss-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      url: url.trim(),
      enabled: true,
      lastCheckedAt: null,
    };
    updateState((s) => {
      s.rssFeeds.push(feed);
    });
    await refreshAllRssFeeds();
    broadcastEvent('state:updated');
    res.json({ feed });
  });

  router.delete('/rss/feeds/:id', (req, res) => {
    updateState((s) => {
      s.rssFeeds = s.rssFeeds.filter((f) => f.id !== req.params.id);
      s.rssFeedItems = s.rssFeedItems.filter((i) => i.feedId !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/rss/refresh', async (_req, res) => {
    const items = await refreshAllRssFeeds();
    broadcastEvent('state:updated');
    res.json({ items });
  });

  router.get('/rss/briefing', async (_req, res) => {
    const briefing = await generateDailyBriefingText();
    res.json({ briefing });
  });

  // Ú7: IMAP/SMTP Email Client
  router.patch('/email/config', (req, res) => {
    const config = updateEmailConfig(req.body || {});
    broadcastEvent('state:updated');
    res.json({ emailConfig: config });
  });

  router.post('/email/sync', async (_req, res) => {
    const outcome = await syncRecentEmailsViaImap();
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  router.post('/email/send', async (req, res) => {
    try {
      const { to, subject, text, requireApproval } = req.body as {
        to: string;
        subject: string;
        text: string;
        requireApproval?: boolean;
      };
      if (!to?.trim() || !subject?.trim()) return res.status(400).json({ error: 'Címzett és tárgy kötelező.' });
      const outcome = await sendEmailViaSmtp({ to, subject, text: text || '', requireApproval });
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Ú8: Calendar & Reminders
  router.post('/calendar/events', (req, res) => {
    const { title, startAt, endAt, location, notes, reminderMinutes } = req.body as {
      title: string;
      startAt: string;
      endAt?: string;
      location?: string;
      notes?: string;
      reminderMinutes?: number;
    };
    if (!title?.trim() || !startAt?.trim()) return res.status(400).json({ error: 'Cím és kezdési idő kötelező.' });
    const ev = {
      id: `cal-${crypto.randomUUID().slice(0, 6)}`,
      title: title.trim(),
      startAt: startAt.trim(),
      endAt: endAt?.trim() || undefined,
      location: location?.trim() || undefined,
      notes: notes?.trim() || undefined,
      reminderMinutes: Number(reminderMinutes ?? 15),
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    updateState((s) => {
      s.calendarEvents.push(ev);
    });
    broadcastEvent('state:updated');
    res.json({ event: ev });
  });

  router.post('/calendar/import-ics', (req, res) => {
    const { icsText } = req.body as { icsText: string };
    if (!icsText?.trim()) return res.status(400).json({ error: 'ICS szöveg kötelező.' });
    const parsed = parseIcsCalendarText(icsText);
    updateState((s) => {
      s.calendarEvents.push(...parsed);
    });
    broadcastEvent('state:updated');
    res.json({ imported: parsed.length, events: parsed });
  });

  router.delete('/calendar/events/:id', (req, res) => {
    updateState((s) => {
      s.calendarEvents = s.calendarEvents.filter((e) => e.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú13: Smart Home (Home Assistant + MQTT)
  router.get('/smarthome/ha/states', async (_req, res) => {
    res.json(await queryHomeAssistantStates());
  });

  router.post('/smarthome/ha/call', async (req, res) => {
    const { domain, service, entityId } = req.body as { domain: string; service: string; entityId: string };
    if (!domain || !service || !entityId) {
      return res.status(400).json({ error: 'Domain, service és entityId kötelező.' });
    }
    const outcome = await callHomeAssistantService(domain, service, entityId);
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  router.post('/smarthome/mqtt/publish', async (req, res) => {
    const { topic, message } = req.body as { topic: string; message: string };
    if (!topic?.trim()) return res.status(400).json({ error: 'MQTT topic kötelező.' });
    const s = getState().settings;
    const outcome = await publishMqttMessage(
      s.mqttBrokerHost || '127.0.0.1',
      s.mqttBrokerPort || 1883,
      topic.trim(),
      message || ''
    );
    broadcastEvent('state:updated');
    res.json(outcome);
  });

  router.post('/smarthome/devices', (req, res) => {
    const { name, kind, entityOrTopic } = req.body as {
      name: string;
      kind: 'home_assistant' | 'mqtt';
      entityOrTopic: string;
    };
    if (!name?.trim() || !entityOrTopic?.trim()) return res.status(400).json({ error: 'Név és entitás/topic kötelező.' });
    const dev = {
      id: `sh-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      kind: kind || 'home_assistant',
      entityOrTopic: entityOrTopic.trim(),
    };
    updateState((s) => {
      s.smartHomeDevices.push(dev);
    });
    broadcastEvent('state:updated');
    res.json({ device: dev });
  });

  router.delete('/smarthome/devices/:id', (req, res) => {
    updateState((s) => {
      s.smartHomeDevices = s.smartHomeDevices.filter((d) => d.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú16: Watched GitHub Repositories
  router.post('/repos', async (req, res) => {
    const { slug, branch } = req.body as { slug: string; branch?: string };
    if (!slug?.trim() || !slug.includes('/')) {
      return res.status(400).json({ error: 'Érvényes owner/repo formátum kötelező.' });
    }
    const repo = {
      id: `repo-${crypto.randomUUID().slice(0, 6)}`,
      slug: slug.trim(),
      branch: (branch || 'main').trim(),
    };
    updateState((s) => {
      s.watchedRepos.push(repo);
    });
    await syncWatchedGithubRepo(repo.id);
    broadcastEvent('state:updated');
    res.json({ repo: getState().watchedRepos.find((r) => r.id === repo.id) || repo });
  });

  router.post('/repos/:id/sync', async (req, res) => {
    const repo = await syncWatchedGithubRepo(req.params.id);
    if (!repo) return res.status(404).json({ error: 'Figyelt repo nem található.' });
    broadcastEvent('state:updated');
    res.json({ repo });
  });

  router.delete('/repos/:id', (req, res) => {
    updateState((s) => {
      s.watchedRepos = s.watchedRepos.filter((r) => r.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú17 & Ú19: Workflows & Custom Webhooks
  router.post('/workflows', (req, res) => {
    const body = req.body as Partial<WorkflowDefinition>;
    if (!body.name?.trim() || !body.actionPayload?.trim()) {
      return res.status(400).json({ error: 'Név és művelet payload kötelező.' });
    }
    const wf: WorkflowDefinition = {
      id: `wf-${crypto.randomUUID().slice(0, 6)}`,
      name: body.name.trim(),
      enabled: body.enabled ?? true,
      triggerType: body.triggerType || 'manual',
      triggerConfig: body.triggerConfig || '',
      conditionExpr: body.conditionExpr?.trim() || undefined,
      actionType: body.actionType || 'agent_prompt',
      actionTarget: body.actionTarget || '',
      actionPayload: body.actionPayload.trim(),
      lastRunAt: null,
      runCount: 0,
    };
    updateState((s) => {
      s.workflows.unshift(wf);
    });
    broadcastEvent('state:updated');
    res.json({ workflow: wf });
  });

  router.patch('/workflows/:id', (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    updateState((s) => {
      const wf = s.workflows.find((w) => w.id === req.params.id);
      if (wf && typeof enabled === 'boolean') wf.enabled = enabled;
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.delete('/workflows/:id', (req, res) => {
    updateState((s) => {
      s.workflows = s.workflows.filter((w) => w.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/workflows/:id/run', async (req, res) => {
    try {
      const { payload } = req.body as { payload?: string };
      const outcome = await executeWorkflow(req.params.id, payload);
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/webhooks', (req, res) => {
    try {
      const { slug, name, secret, targetAgentId, workflowId, promptTemplate } = req.body as {
        slug: string;
        name: string;
        secret?: string;
        targetAgentId?: string;
        workflowId?: string;
        promptTemplate?: string;
      };
      const hook = createCustomWebhook({ slug, name, secret, targetAgentId, workflowId, promptTemplate });
      broadcastEvent('state:updated');
      res.json({ webhook: hook });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/webhooks/:id', (req, res) => {
    updateState((s) => {
      s.customWebhooks = s.customWebhooks.filter((h) => h.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú18: Sandboxed Code Interpreter & SVG Charts
  router.post('/sandbox/run', (req, res) => {
    const { language, code } = req.body as { language: 'javascript' | 'python'; code: string };
    if (!code?.trim()) return res.status(400).json({ error: 'Kód kötelező.' });
    res.json(runSandboxedCodeInterpreter({ language: language || 'javascript', code }));
  });

  router.post('/charts/svg', (req, res) => {
    const { title, labels, values, unit } = req.body as {
      title: string;
      labels: string[];
      values: number[];
      unit?: string;
    };
    if (!title?.trim() || !Array.isArray(values) || values.length === 0) {
      return res.status(400).json({ error: 'Cím és értékek tömb kötelező.' });
    }
    const artifact = buildSvgChartArtifact({ title, labels: labels || [], values, unit });
    broadcastEvent('state:updated');
    res.json({ artifact });
  });

  // Ú24: Habits & Focus Sessions
  router.post('/habits', (req, res) => {
    const { name, targetPerWeek } = req.body as { name: string; targetPerWeek?: number };
    if (!name?.trim()) return res.status(400).json({ error: 'Szokás neve kötelező.' });
    const habit = {
      id: `hab-${crypto.randomUUID().slice(0, 6)}`,
      name: name.trim(),
      targetPerWeek: Math.max(1, Math.min(7, Number(targetPerWeek || 5))),
      completedDates: [],
      totalMinutes: 0,
      createdAt: new Date().toISOString(),
    };
    updateState((s) => {
      s.habits.push(habit);
    });
    broadcastEvent('state:updated');
    res.json({ habit });
  });

  router.post('/habits/:id/toggle', (req, res) => {
    const { date } = req.body as { date?: string };
    const habit = toggleHabitCheckin(req.params.id, date);
    if (!habit) return res.status(404).json({ error: 'Szokás nem található.' });
    broadcastEvent('state:updated');
    res.json({ habit });
  });

  router.delete('/habits/:id', (req, res) => {
    updateState((s) => {
      s.habits = s.habits.filter((h) => h.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/focus', (req, res) => {
    const { label, habitId, minutes } = req.body as { label: string; habitId?: string; minutes: number };
    const session = logFocusSession({ label: label || 'Fókusz', habitId, minutes: Number(minutes || 25) });
    broadcastEvent('state:updated');
    res.json({ session });
  });

  // Ú25: Personal Expenses & CSV Import
  router.post('/expenses', (req, res) => {
    const { date, merchant, category, amount, currency, notes } = req.body as Partial<ExpenseRecord>;
    if (!merchant?.trim() || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Partner és összeg kötelező.' });
    }
    const rec: ExpenseRecord = {
      id: `exp-${crypto.randomUUID().slice(0, 6)}`,
      date: date || new Date().toISOString().slice(0, 10),
      merchant: merchant.trim(),
      category: category?.trim() || categorizeMerchant(merchant),
      amount,
      currency: currency || 'HUF',
      source: 'manual',
      notes,
    };
    updateState((s) => {
      s.expenses.unshift(rec);
    });
    broadcastEvent('state:updated');
    res.json({ expense: rec });
  });

  router.post('/expenses/import-csv', (req, res) => {
    const { csvText, defaultCurrency } = req.body as { csvText: string; defaultCurrency?: string };
    if (!csvText?.trim()) return res.status(400).json({ error: 'CSV tartalom kötelező.' });
    const records = importExpensesFromCsv(csvText, defaultCurrency || 'HUF');
    updateState((s) => {
      s.expenses.unshift(...records);
      s.expenses = s.expenses.slice(0, 500);
    });
    broadcastEvent('state:updated');
    res.json({ imported: records.length, records });
  });

  router.delete('/expenses/:id', (req, res) => {
    updateState((s) => {
      s.expenses = s.expenses.filter((e) => e.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Ú29: Sanitized Bundle Export / Import
  router.get('/bundle/export', (_req, res) => {
    const bundle = exportSanitizedBundle();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="novaswarm-bundle.json"');
    res.send(JSON.stringify(bundle, null, 2));
  });

  router.post('/bundle/import', (req, res) => {
    try {
      const outcome = importSanitizedBundle(req.body || {});
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
