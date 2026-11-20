import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  Agent,
  ApprovalRequest,
  AuditLogEntry,
  ChatThread,
  DashboardWidgetConfig,
  EmailConfig,
  GatewayAnalytics,
  KanbanCard,
  MemoryEntry,
  NovaSwarmState,
  ProviderId,
  QuotaStatus,
  Settings,
  UnifiedMessage,
} from '../../shared/types';
import { novaBus } from './eventBus';
import { syncAuditEntryToWal, syncMessageToWal } from './sqliteWal';

export const CURRENT_SCHEMA_VERSION = 8;

const ROOT_DIR = process.cwd();
const STATE_PATH = path.join(ROOT_DIR, '.state.json');
const CONFIG_PATH = path.join(ROOT_DIR, '.config.json');
const SECRETS_PATH = path.join(ROOT_DIR, '.secrets.vault.json');

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Derive deterministic machine-local key for encrypting MCP & provider secrets at rest */
function getVaultKey(): Buffer {
  const seed = `${os.hostname()}:${os.userInfo().username}:${ROOT_DIR}:novaswarm-vault-v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) return '';
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getVaultKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/** Atomic write: writes to temp file in same directory and renames over target */
export function atomicWriteFileSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
}

interface SecretVault {
  providerKeys: Record<string, string>;
  mcpCredentials: Record<string, string>;
  telegramBotToken?: string;
  agentTelegramTokens?: Record<string, string>;
  channelSecrets?: Record<string, string>;
  channelBotTokens?: Record<string, string>;
  federationTokens?: Record<string, string>;
  googleOAuthTokens?: string;
  webAuthPasswordHash?: string;
  webSessionSecret?: string;
  namedSecrets?: Record<string, string>;
}

function loadSecretVault(): SecretVault {
  if (!fs.existsSync(SECRETS_PATH)) {
    return { providerKeys: {}, mcpCredentials: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8')) as SecretVault;
  } catch {
    return { providerKeys: {}, mcpCredentials: {} };
  }
}

function saveSecretVault(vault: SecretVault): void {
  atomicWriteFileSync(SECRETS_PATH, JSON.stringify(vault, null, 2));
}

export function setNamedSecret(name: string, plaintext: string): void {
  const vault = loadSecretVault();
  vault.namedSecrets = vault.namedSecrets ?? {};
  if (plaintext.trim()) {
    vault.namedSecrets[name] = encryptSecret(plaintext.trim());
  } else {
    delete vault.namedSecrets[name];
  }
  saveSecretVault(vault);
}

export function getNamedSecret(name: string): string {
  const vault = loadSecretVault();
  const enc = vault.namedSecrets?.[name];
  return enc ? decryptSecret(enc) : '';
}

export function hasNamedSecret(name: string): boolean {
  const vault = loadSecretVault();
  return Boolean(vault.namedSecrets?.[name]);
}

export function setRawProviderKeySecret(keyId: string, rawKey: string): void {
  const vault = loadSecretVault();
  vault.providerKeys[keyId] = encryptSecret(rawKey.trim());
  saveSecretVault(vault);
}

export function getRawProviderKeySecret(keyId: string): string {
  const vault = loadSecretVault();
  const enc = vault.providerKeys[keyId];
  return enc ? decryptSecret(enc) : '';
}

export function deleteRawProviderKeySecret(keyId: string): void {
  const vault = loadSecretVault();
  delete vault.providerKeys[keyId];
  saveSecretVault(vault);
}

export function setMcpCredentialSecret(mcpId: string, creds: Record<string, string>): void {
  const vault = loadSecretVault();
  vault.mcpCredentials[mcpId] = encryptSecret(JSON.stringify(creds));
  saveSecretVault(vault);
}

export function getMcpCredentialSecret(mcpId: string): Record<string, string> | null {
  const vault = loadSecretVault();
  const enc = vault.mcpCredentials[mcpId];
  if (!enc) return null;
  try {
    return JSON.parse(decryptSecret(enc)) as Record<string, string>;
  } catch {
    return null;
  }
}

export function setTelegramTokenSecret(token: string): void {
  const vault = loadSecretVault();
  vault.telegramBotToken = token.trim() ? encryptSecret(token.trim()) : undefined;
  saveSecretVault(vault);
}

export function getTelegramTokenSecret(): string {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken) return envToken;
  const vault = loadSecretVault();
  return vault.telegramBotToken ? decryptSecret(vault.telegramBotToken) : '';
}

export function setAgentTelegramTokenSecret(agentId: string, token: string): void {
  const vault = loadSecretVault();
  vault.agentTelegramTokens = vault.agentTelegramTokens ?? {};
  if (token.trim()) {
    vault.agentTelegramTokens[agentId] = encryptSecret(token.trim());
  } else {
    delete vault.agentTelegramTokens[agentId];
  }
  saveSecretVault(vault);
}

export function getAgentTelegramTokenSecret(agentId: string): string {
  const vault = loadSecretVault();
  const enc = vault.agentTelegramTokens?.[agentId];
  return enc ? decryptSecret(enc) : '';
}

export function setChannelConnectorSecret(connectorId: string, secret: string): void {
  const vault = loadSecretVault();
  vault.channelSecrets = vault.channelSecrets ?? {};
  if (secret.trim()) {
    vault.channelSecrets[connectorId] = encryptSecret(secret.trim());
  } else {
    delete vault.channelSecrets[connectorId];
  }
  saveSecretVault(vault);
}

export function getChannelConnectorSecret(connectorId: string): string {
  const vault = loadSecretVault();
  const enc = vault.channelSecrets?.[connectorId];
  return enc ? decryptSecret(enc) : '';
}

export function setChannelBotTokenSecret(connectorId: string, token: string): void {
  const vault = loadSecretVault();
  vault.channelBotTokens = vault.channelBotTokens ?? {};
  if (token.trim()) {
    vault.channelBotTokens[connectorId] = encryptSecret(token.trim());
  } else {
    delete vault.channelBotTokens[connectorId];
  }
  saveSecretVault(vault);
}

export function getChannelBotTokenSecret(connectorId: string): string {
  const vault = loadSecretVault();
  const enc = vault.channelBotTokens?.[connectorId];
  return enc ? decryptSecret(enc) : '';
}

export function setFederationPeerToken(peerId: string, token: string): void {
  const vault = loadSecretVault();
  vault.federationTokens = vault.federationTokens ?? {};
  if (token.trim()) {
    vault.federationTokens[peerId] = encryptSecret(token.trim());
  } else {
    delete vault.federationTokens[peerId];
  }
  saveSecretVault(vault);
}

export function getFederationPeerToken(peerId: string): string {
  const vault = loadSecretVault();
  const enc = vault.federationTokens?.[peerId];
  return enc ? decryptSecret(enc) : '';
}

export function setWebAuthPassword(plaintext: string): void {
  const vault = loadSecretVault();
  const trimmed = plaintext.trim();
  if (!trimmed) {
    delete vault.webAuthPasswordHash;
    saveSecretVault(vault);
    return;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(trimmed, salt, 32).toString('hex');
  vault.webAuthPasswordHash = `${salt}:${derived}`;
  saveSecretVault(vault);
}

export function hasWebAuthPassword(): boolean {
  const vault = loadSecretVault();
  return Boolean(vault.webAuthPasswordHash);
}

export function verifyWebAuthPassword(plaintext: string): boolean {
  const vault = loadSecretVault();
  const stored = vault.webAuthPasswordHash;
  if (!stored) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(plaintext, salt, 32);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function getWebSessionSecret(): string {
  const vault = loadSecretVault();
  if (vault.webSessionSecret) {
    const dec = decryptSecret(vault.webSessionSecret);
    if (dec) return dec;
  }
  const fresh = crypto.randomBytes(32).toString('hex');
  vault.webSessionSecret = encryptSecret(fresh);
  saveSecretVault(vault);
  return fresh;
}

export function createDefaultQuotas(): Record<ProviderId, QuotaStatus> {
  return {
    gemini: {
      provider: 'gemini',
      remainingRequests: null,
      limitRequests: null,
      remainingTokens: null,
      resetAt: null,
      isEstimated: true,
      lastCheckedAt: null,
      sourceNote: 'Nincs még élő API válasz-fejléc (becsült érték)',
    },
    openai: {
      provider: 'openai',
      remainingRequests: null,
      limitRequests: null,
      remainingTokens: null,
      resetAt: null,
      isEstimated: true,
      lastCheckedAt: null,
      sourceNote: 'Nincs még élő API válasz-fejléc (becsült érték)',
    },
    anthropic: {
      provider: 'anthropic',
      remainingRequests: null,
      limitRequests: null,
      remainingTokens: null,
      resetAt: null,
      isEstimated: true,
      lastCheckedAt: null,
      sourceNote: 'Nincs még élő API válasz-fejléc (becsült érték)',
    },
    openrouter: {
      provider: 'openrouter',
      remainingRequests: null,
      limitRequests: null,
      remainingTokens: null,
      resetAt: null,
      isEstimated: true,
      lastCheckedAt: null,
      sourceNote: 'Nincs még élő API válasz-fejléc (becsült érték)',
    },
    ollama: {
      provider: 'ollama',
      remainingRequests: null,
      limitRequests: null,
      remainingTokens: null,
      resetAt: null,
      isEstimated: false,
      lastCheckedAt: null,
      sourceNote: 'Lokális hardver-kapacitás (nincs felhős kvóta-korlát)',
    },
  };
}

export function createDefaultGatewayAnalytics(): GatewayAnalytics {
  return {
    totalProxyRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    savedUsd: 0,
    guardrailsBlocked: 0,
    spendByProvider: {
      gemini: 0,
      openai: 0,
      anthropic: 0,
      openrouter: 0,
      ollama: 0,
    },
    spendByModel: {},
    providerHealth: {
      gemini: { provider: 'gemini', totalCalls: 0, failedCalls: 0, avgLatencyMs: 0, lastLatencyMs: null },
      openai: { provider: 'openai', totalCalls: 0, failedCalls: 0, avgLatencyMs: 0, lastLatencyMs: null },
      anthropic: { provider: 'anthropic', totalCalls: 0, failedCalls: 0, avgLatencyMs: 0, lastLatencyMs: null },
      openrouter: { provider: 'openrouter', totalCalls: 0, failedCalls: 0, avgLatencyMs: 0, lastLatencyMs: null },
      ollama: { provider: 'ollama', totalCalls: 0, failedCalls: 0, avgLatencyMs: 0, lastLatencyMs: null },
    },
  };
}

export function createDefaultDashboardWidgets(): DashboardWidgetConfig[] {
  return [
    { id: 'vitals', title: 'Hardver & Rendszer Állapot', visible: true },
    { id: 'budget', title: 'Költség & Havi Előrejelzés', visible: true },
    { id: 'kanban', title: 'Aktív Kanban & Munkafolyamatok', visible: true },
    { id: 'uptime', title: 'Uptime & SSL Figyelő', visible: true },
    { id: 'briefing', title: 'Napi Briefing, Hírek & Naptár', visible: true },
  ];
}

export function createDefaultEmailConfig(): EmailConfig {
  return {
    enabled: false,
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465,
    username: '',
    tls: true,
    hasPassword: hasNamedSecret('email_password'),
    lastCheckedAt: null,
    recentEmails: [],
  };
}

export function createDefaultSettings(): Settings {
  const hasEnvGemini = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      process.env.GEMINI_API_KEY.trim().length > 8
  );
  const ramMb = Math.round(os.totalmem() / (1024 * 1024));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    onboardingCompleted: false,
    language: 'hu',
    hostPermissionsGranted: true,
    killSwitchActive: false,
    userProfile: '',
    primaryProvider: 'gemini',
    secondaryProvider: 'openrouter',
    ollamaOnlyMode: false,
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: process.env.NOVASWARM_RECOMMENDED_MODEL || 'qwen2.5:3b',
    ollamaNumCtx: ramMb <= 2048 ? 2048 : 4096,
    ollamaKeepAlive: '5m',
    providerKeys: {
      gemini: hasEnvGemini
        ? [
            {
              id: 'env-gemini-default',
              label: 'Server Environment Key',
              maskedKey: maskSecret(process.env.GEMINI_API_KEY!),
              enabled: true,
              failureCount: 0,
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
      openai: [],
      anthropic: [],
      openrouter: [],
      ollama: [],
    },
    manualModelPriority: {
      gemini: [],
      openai: [],
      anthropic: [],
      openrouter: [],
      ollama: [],
    },
    lastModelDiscoveryAt: null,
    dailyCostLimitEnabled: true,
    dailyCostLimitUsd: 1.0,
    dailySpendUsd: 0,
    dailySpendDate: todayIsoDate(),
    monthlyBudgetAlertUsd: 25.0,
    dreamingIdleMinutes: 10,
    thermalThrottleCelsius: 80,
    batteryThrottlePercent: 20,
    auditLogMaxEntries: 2000,
    telegramEnabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    telegramHasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    backupSchedule: 'daily',
    cloudBackupGoogleDriveConnected: false,
    lastBackupAt: null,
    lastBackupLocation: 'none',
    backupRsyncTarget: '',
    ttsEnabled: false,
    ttsHostSpeakerEnabled: false,
    continuousVoiceMode: false,
    autoTaskRouting: true,
    maxToolSteps: 12,
    defaultPreset: 'fast',
    responseCacheEnabled: true,
    responseCacheTtlSec: 600,
    guardrailsEnabled: false,
    guardrailBlockPii: false,
    guardrailBlockSecrets: false,
    guardrailBlockPromptInjection: false,
    heartbeatEnabled: true,
    heartbeatIntervalMinutes: 5,
    channelPairingRequired: false,
    lastHeartbeatAt: null,
    lastHeartbeatSummary: null,
    kanbanWipLimit: 3,
    kanbanAgingHours: 48,
    federationEnabled: false,
    instanceName: os.hostname().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || 'novaswarm-node',
    webAuthEnabled: false,
    webAuthHasPassword: hasWebAuthPassword(),
    autonomousKanbanWorkerEnabled: true,
    embeddingMode: 'local_ngram',
    ollamaEmbeddingModel: 'nomic-embed-text',
    otaRepoSlug: process.env.NOVASWARM_OTA_REPO || 'ngabika/NovaSwarmNextGenHydrogen',
    autoUpdateEnabled: false,
    autoUpdateCheckHours: 6,
    searchProvider: 'duckduckgo',
    searxngUrl: '',
    braveHasKey: hasNamedSecret('brave_search_key'),
    caldavUrl: '',
    homeAssistantUrl: '',
    homeAssistantHasToken: hasNamedSecret('home_assistant_token'),
    mqttBrokerHost: '',
    mqttBrokerPort: 1883,
    ollamaAutoUnloadMinutes: 15,
    weatherLocation: 'Budapest',
    piperTtsBinary: 'piper',
    wakeWordEnabled: false,
    wakeWordPhrase: 'nova',
    dashboardWidgets: createDefaultDashboardWidgets(),
    fullAutonomousMode: true,
    themeMode: 'light',
    privacyMaskEnabled: false,
    nightShiftEnabled: true,
    nightShiftIntervalMinutes: 30,
    redTeamEnabled: false,
    supervisorStrictness: 'permissive',
    retentionDays: 90,
    softDowngradeOnBudget: true,
    defaultCurrency: 'HUF',
    telegramInlineButtons: true,
    lastNightShiftAt: null,
    lanSubnetAllowlist: [],
    totpEnabled: false,
  };
}

export function createSupervisorAgent(): Agent {
  const now = new Date().toISOString();
  return {
    id: 'supervisor-auditor',
    name: 'Felügyelő Auditor',
    avatar: 'shield',
    role: 'Supervisor & Sandbox Auditor',
    parentAgentId: null,
    systemPrompt:
      'Te vagy a rendszer állandó technikai Felügyelő/Auditor ágense. Feladatod minden autonóm kör után ellenőrizni a naplókat és memória-írásokat, kiszűrni a nem végrehajtott, fiktív sikereket, és előzetes dry-run sandbox teszteket futtatni új skillek, MCP kapcsolatok és önmódosítások előtt.',
    modelId: 'gemini-4-hydrogen',
    providerId: 'gemini',
    webSearchEnabled: false,
    hostExecutionEnabled: true,
    active: true,
    isSupervisor: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialState(): NovaSwarmState {
  const now = new Date().toISOString();
  return {
    settings: createDefaultSettings(),
    agents: [createSupervisorAgent()],
    kanban: [],
    ideas: [],
    auditLogs: [],
    mcpServers: [
      {
        id: 'mcp-google-workspace',
        name: 'Google Workspace (Gmail, Calendar, Drive, Photos)',
        description: 'Valódi OAuth2 alapú személyes és munkahelyi Google fiók integráció.',
        endpointUrl: 'https://www.googleapis.com/discovery/v1/apis',
        transport: 'http',
        authType: 'oauth2',
        hasCredentials: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        oauthConfigured: false,
        isGoogleWorkspace: true,
        googleServices: ['gmail', 'calendar', 'drive', 'photos'],
        status: 'not_configured',
        lastCheckedAt: null,
        lastCheckMessage: 'Nincs bekötve — OAuth2 hitelesítés szükséges',
      },
    ],
    skills: [],
    memories: [],
    shortTermSignals: [],
    dreamJournal: [],
    dreamSkillDrafts: [],
    reflexionSuggestions: [],
    threads: [
      {
        id: 'thread-main',
        title: 'Fő koordinációs szál',
        folder: 'Általános',
        isolationMode: 'main_host',
        channelSource: 'web',
        createdAt: now,
        updatedAt: now,
      },
    ],
    messages: [],
    cronTasks: [],
    approvals: [],
    supervisor: {
      lastAuditAt: null,
      status: 'nominal',
      lastSummary: 'Rendszer készenlétben — várakozás az első ágens körre.',
      discrepanciesFound: 0,
      sandboxTestsPassed: 0,
      lastDestructiveProofAt: null,
    },
    discoveredModels: [],
    quotas: createDefaultQuotas(),
    backups: [],
    virtualKeys: [],
    gatewayAnalytics: createDefaultGatewayAnalytics(),
    channelConnectors: [],
    pairingRequests: [],
    federationPeers: [],
    uptimeTargets: [],
    promptTemplates: [
      {
        id: 'tpl-daily-brief',
        title: 'Reggeli Briefing',
        command: '/briefing',
        body: 'Készíts napi áttekintést a nyitott Kanban kártyákból, mai naptárból, uptime állapotból és friss RSS hírekből.',
        category: 'Rendszer',
        createdAt: now,
      },
      {
        id: 'tpl-host-health',
        title: 'Gazdagép Diagnosztika',
        command: '/diagnosztika',
        body: 'Ellenőrizd a CPU, RAM, lemez, systemd szolgáltatások és SSL tanúsítványok állapotát, és jelezd ha beavatkozás kell.',
        category: 'Üzemeltetés',
        createdAt: now,
      },
    ],
    artifacts: [],
    rssFeeds: [],
    rssFeedItems: [],
    emailConfig: createDefaultEmailConfig(),
    calendarEvents: [],
    smartHomeDevices: [],
    sshProfiles: [],
    watchedRepos: [],
    workflows: [],
    customWebhooks: [],
    habits: [],
    focusSessions: [],
    expenses: [],
    sslTargets: [],
    researchReports: [],
    savedApiRequests: [],
    databaseConnections: [],
    watchedPages: [],
    flashcards: [],
    dailyJournals: [],
    sharedLists: [
      { id: 'list-default', name: 'Bevásárlólista', items: [] },
    ],
    subscriptions: [],
    agentBenchmarks: [],
    dynamicTools: [],
    missions: [],
    crmContacts: [],
    packages: [],
    vehicleMaintenance: [],
    homeInventory: [],
    sharedLinks: [],
    bookmarks: [],
    mealPlan: [],
    wolDevices: [],
    clusterNodes: [],
    notaryRecords: [],
    nightShiftRuns: [],
    timeCapsules: [],
    budgetEnvelopes: [],
    clipboardHistory: [],
    lastActivityAt: now,
    activeExplicitTaskAgentId: null,
  };
}

let cachedState: NovaSwarmState | null = null;

export function migrateStateNonDestructive(existing?: Partial<NovaSwarmState>): NovaSwarmState {
  const base = createInitialState();
  const source = existing ?? (fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {});

  const mergedSettings: Settings = {
    ...base.settings,
    ...(source.settings || {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    webAuthHasPassword: hasWebAuthPassword(),
    braveHasKey: hasNamedSecret('brave_search_key'),
    homeAssistantHasToken: hasNamedSecret('home_assistant_token'),
    otaRepoSlug: !source.settings?.otaRepoSlug
      ? 'ngabika/NovaSwarmNextGenHydrogen'
      : source.settings.otaRepoSlug,
    dashboardWidgets:
      Array.isArray(source.settings?.dashboardWidgets) && source.settings.dashboardWidgets.length > 0
        ? source.settings.dashboardWidgets
        : base.settings.dashboardWidgets,
    providerKeys: {
      ...base.settings.providerKeys,
      ...(source.settings?.providerKeys || {}),
    },
    manualModelPriority: {
      ...base.settings.manualModelPriority,
      ...(source.settings?.manualModelPriority || {}),
    },
  };

  if (mergedSettings.dailySpendDate !== todayIsoDate()) {
    mergedSettings.dailySpendDate = todayIsoDate();
    mergedSettings.dailySpendUsd = 0;
  }

  const hasEnvKey =
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
    process.env.GEMINI_API_KEY.trim().length > 8;
  if (hasEnvKey && !mergedSettings.providerKeys.gemini.some((k) => k.id === 'env-gemini-default')) {
    mergedSettings.providerKeys.gemini.unshift({
      id: 'env-gemini-default',
      label: 'Server Environment Key',
      maskedKey: maskSecret(process.env.GEMINI_API_KEY!),
      enabled: true,
      failureCount: 0,
      createdAt: new Date().toISOString(),
    });
  }

  const rawAgents: Agent[] = Array.isArray(source.agents) && source.agents.length > 0 ? source.agents : base.agents;
  const agents: Agent[] = rawAgents.map((a) => ({
    ...a,
    dailySpendUsd: a.dailySpendUsd ?? 0,
    voiceReplyMode: a.voiceReplyMode ?? 'off',
    allowedMcpIds: Array.isArray(a.allowedMcpIds) ? a.allowedMcpIds : undefined,
    runTimestamps: Array.isArray(a.runTimestamps) ? a.runTimestamps : [],
  }));
  if (!agents.some((a) => a.id === 'supervisor-auditor')) {
    agents.unshift(createSupervisorAgent());
  }

  const threads: ChatThread[] = (
    Array.isArray(source.threads) && source.threads.length > 0 ? source.threads : base.threads
  ).map((t: ChatThread) => ({
    ...t,
    isolationMode: t.isolationMode ?? (t.id === 'thread-main' ? 'main_host' : 'sandboxed'),
    channelSource: t.channelSource ?? 'web',
  }));

  const memories: MemoryEntry[] = Array.isArray(source.memories)
    ? source.memories.map((m: MemoryEntry) => ({
        ...m,
        tier: m.tier ?? 'warm',
        salience: m.salience ?? m.importanceScore ?? 0.7,
        lastAccessedAt: m.lastAccessedAt ?? m.createdAt,
        relations: Array.isArray(m.relations) ? m.relations : [],
      }))
    : [];

  const kanban: KanbanCard[] = Array.isArray(source.kanban)
    ? source.kanban.map((c: KanbanCard) => ({
        ...c,
        priority: c.priority ?? 'medium',
        subtasks: Array.isArray(c.subtasks) ? c.subtasks : [],
        blockedBy: Array.isArray(c.blockedBy) ? c.blockedBy : [],
        archived: Boolean(c.archived),
      }))
    : [];

  const migrated: NovaSwarmState = {
    ...base,
    ...source,
    settings: mergedSettings,
    agents,
    threads,
    memories,
    kanban,
    ideas: Array.isArray(source.ideas) ? source.ideas : [],
    virtualKeys: Array.isArray(source.virtualKeys) ? source.virtualKeys : [],
    channelConnectors: Array.isArray(source.channelConnectors) ? source.channelConnectors : [],
    pairingRequests: Array.isArray(source.pairingRequests) ? source.pairingRequests : [],
    federationPeers: Array.isArray(source.federationPeers) ? source.federationPeers : [],
    uptimeTargets: Array.isArray(source.uptimeTargets) ? source.uptimeTargets : [],
    dreamSkillDrafts: Array.isArray(source.dreamSkillDrafts) ? source.dreamSkillDrafts : [],
    reflexionSuggestions: Array.isArray(source.reflexionSuggestions) ? source.reflexionSuggestions : [],
    promptTemplates:
      Array.isArray(source.promptTemplates) && source.promptTemplates.length > 0
        ? source.promptTemplates
        : base.promptTemplates,
    artifacts: Array.isArray(source.artifacts) ? source.artifacts : [],
    rssFeeds: Array.isArray(source.rssFeeds) ? source.rssFeeds : [],
    rssFeedItems: Array.isArray(source.rssFeedItems) ? source.rssFeedItems : [],
    emailConfig: {
      ...base.emailConfig,
      ...(source.emailConfig || {}),
      hasPassword: hasNamedSecret('email_password'),
      recentEmails: Array.isArray(source.emailConfig?.recentEmails) ? source.emailConfig.recentEmails : [],
    },
    calendarEvents: Array.isArray(source.calendarEvents) ? source.calendarEvents : [],
    smartHomeDevices: Array.isArray(source.smartHomeDevices) ? source.smartHomeDevices : [],
    sshProfiles: Array.isArray(source.sshProfiles) ? source.sshProfiles : [],
    watchedRepos: Array.isArray(source.watchedRepos) ? source.watchedRepos : [],
    workflows: Array.isArray(source.workflows) ? source.workflows : [],
    customWebhooks: Array.isArray(source.customWebhooks) ? source.customWebhooks : [],
    habits: Array.isArray(source.habits) ? source.habits : [],
    focusSessions: Array.isArray(source.focusSessions) ? source.focusSessions : [],
    expenses: Array.isArray(source.expenses) ? source.expenses : [],
    sslTargets: Array.isArray(source.sslTargets) ? source.sslTargets : [],
    researchReports: Array.isArray(source.researchReports) ? source.researchReports : [],
    savedApiRequests: Array.isArray(source.savedApiRequests) ? source.savedApiRequests : [],
    databaseConnections: Array.isArray(source.databaseConnections) ? source.databaseConnections : [],
    watchedPages: Array.isArray(source.watchedPages) ? source.watchedPages : [],
    flashcards: Array.isArray(source.flashcards) ? source.flashcards : [],
    dailyJournals: Array.isArray(source.dailyJournals) ? source.dailyJournals : [],
    sharedLists:
      Array.isArray(source.sharedLists) && source.sharedLists.length > 0
        ? source.sharedLists
        : base.sharedLists,
    subscriptions: Array.isArray(source.subscriptions) ? source.subscriptions : [],
    agentBenchmarks: Array.isArray(source.agentBenchmarks) ? source.agentBenchmarks : [],
    dynamicTools: Array.isArray(source.dynamicTools) ? source.dynamicTools : [],
    missions: Array.isArray(source.missions) ? source.missions : [],
    crmContacts: Array.isArray(source.crmContacts) ? source.crmContacts : [],
    packages: Array.isArray(source.packages)
      ? source.packages
      : Array.isArray((source as { packageOrders?: unknown[] }).packageOrders)
      ? ((source as { packageOrders?: NovaSwarmState['packages'] }).packageOrders ?? [])
      : [],
    vehicleMaintenance: Array.isArray(source.vehicleMaintenance)
      ? source.vehicleMaintenance
      : Array.isArray((source as { maintenanceItems?: unknown[] }).maintenanceItems)
      ? ((source as { maintenanceItems?: NovaSwarmState['vehicleMaintenance'] }).maintenanceItems ?? [])
      : [],
    homeInventory: Array.isArray(source.homeInventory)
      ? source.homeInventory
      : Array.isArray((source as { inventoryItems?: unknown[] }).inventoryItems)
      ? ((source as { inventoryItems?: NovaSwarmState['homeInventory'] }).inventoryItems ?? [])
      : [],
    sharedLinks: Array.isArray(source.sharedLinks)
      ? source.sharedLinks
      : Array.isArray((source as { sharedPortalLinks?: unknown[] }).sharedPortalLinks)
      ? ((source as { sharedPortalLinks?: NovaSwarmState['sharedLinks'] }).sharedPortalLinks ?? [])
      : [],
    bookmarks: Array.isArray(source.bookmarks) ? source.bookmarks : [],
    mealPlan: Array.isArray(source.mealPlan)
      ? source.mealPlan
      : Array.isArray((source as { mealPlans?: unknown[] }).mealPlans)
      ? ((source as { mealPlans?: NovaSwarmState['mealPlan'] }).mealPlans ?? [])
      : [],
    wolDevices: Array.isArray(source.wolDevices) ? source.wolDevices : [],
    clusterNodes: Array.isArray(source.clusterNodes) ? source.clusterNodes : [],
    notaryRecords: Array.isArray(source.notaryRecords) ? source.notaryRecords : [],
    nightShiftRuns: Array.isArray(source.nightShiftRuns) ? source.nightShiftRuns : [],
    timeCapsules: Array.isArray(source.timeCapsules) ? source.timeCapsules : [],
    budgetEnvelopes: Array.isArray(source.budgetEnvelopes) ? source.budgetEnvelopes : [],
    clipboardHistory: Array.isArray(source.clipboardHistory) ? source.clipboardHistory : [],
    gatewayAnalytics: {
      ...base.gatewayAnalytics,
      ...(source.gatewayAnalytics || {}),
      spendByProvider: {
        ...base.gatewayAnalytics.spendByProvider,
        ...(source.gatewayAnalytics?.spendByProvider || {}),
      },
      spendByModel: {
        ...(source.gatewayAnalytics?.spendByModel || {}),
      },
      providerHealth: {
        ...base.gatewayAnalytics.providerHealth!,
        ...(source.gatewayAnalytics?.providerHealth || {}),
      },
    },
    quotas: {
      ...base.quotas,
      ...(source.quotas || {}),
    },
    supervisor: {
      ...base.supervisor,
      ...(source.supervisor || {}),
    },
  };

  saveState(migrated);
  return migrated;
}

export function getState(): NovaSwarmState {
  if (cachedState) {
    if (cachedState.settings.dailySpendDate !== todayIsoDate()) {
      cachedState.settings.dailySpendDate = todayIsoDate();
      cachedState.settings.dailySpendUsd = 0;
      for (const a of cachedState.agents) {
        a.dailySpendUsd = 0;
      }
      saveState(cachedState);
    }
    return cachedState;
  }

  if (fs.existsSync(STATE_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as Partial<NovaSwarmState>;
      cachedState = migrateStateNonDestructive(parsed);
      return cachedState;
    } catch {
      cachedState = createInitialState();
      saveState(cachedState);
      return cachedState;
    }
  }

  cachedState = createInitialState();
  saveState(cachedState);
  return cachedState;
}

export function saveState(state: NovaSwarmState): void {
  cachedState = state;
  atomicWriteFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  const nonSecretConfig = {
    schemaVersion: state.settings.schemaVersion,
    language: state.settings.language,
    hostPermissionsGranted: state.settings.hostPermissionsGranted,
    primaryProvider: state.settings.primaryProvider,
    secondaryProvider: state.settings.secondaryProvider,
    ollamaOnlyMode: state.settings.ollamaOnlyMode,
    ollamaUrl: state.settings.ollamaUrl,
    ollamaModel: state.settings.ollamaModel,
    ollamaNumCtx: state.settings.ollamaNumCtx,
    ollamaKeepAlive: state.settings.ollamaKeepAlive,
    dailyCostLimitEnabled: state.settings.dailyCostLimitEnabled,
    dailyCostLimitUsd: state.settings.dailyCostLimitUsd,
    monthlyBudgetAlertUsd: state.settings.monthlyBudgetAlertUsd,
    dreamingIdleMinutes: state.settings.dreamingIdleMinutes,
    thermalThrottleCelsius: state.settings.thermalThrottleCelsius,
    batteryThrottlePercent: state.settings.batteryThrottlePercent,
    auditLogMaxEntries: state.settings.auditLogMaxEntries,
    backupSchedule: state.settings.backupSchedule,
    backupRsyncTarget: state.settings.backupRsyncTarget,
    ttsEnabled: state.settings.ttsEnabled,
    ttsHostSpeakerEnabled: state.settings.ttsHostSpeakerEnabled,
    continuousVoiceMode: state.settings.continuousVoiceMode,
    autoTaskRouting: state.settings.autoTaskRouting,
    maxToolSteps: state.settings.maxToolSteps,
    defaultPreset: state.settings.defaultPreset,
    responseCacheEnabled: state.settings.responseCacheEnabled,
    guardrailsEnabled: state.settings.guardrailsEnabled,
    heartbeatEnabled: state.settings.heartbeatEnabled,
    heartbeatIntervalMinutes: state.settings.heartbeatIntervalMinutes,
    kanbanWipLimit: state.settings.kanbanWipLimit,
    federationEnabled: state.settings.federationEnabled,
    instanceName: state.settings.instanceName,
    webAuthEnabled: state.settings.webAuthEnabled,
    autonomousKanbanWorkerEnabled: state.settings.autonomousKanbanWorkerEnabled,
    embeddingMode: state.settings.embeddingMode,
    ollamaEmbeddingModel: state.settings.ollamaEmbeddingModel,
    otaRepoSlug: state.settings.otaRepoSlug,
    autoUpdateEnabled: state.settings.autoUpdateEnabled,
    autoUpdateCheckHours: state.settings.autoUpdateCheckHours,
    searchProvider: state.settings.searchProvider,
    searxngUrl: state.settings.searxngUrl,
    caldavUrl: state.settings.caldavUrl,
    homeAssistantUrl: state.settings.homeAssistantUrl,
    mqttBrokerHost: state.settings.mqttBrokerHost,
    mqttBrokerPort: state.settings.mqttBrokerPort,
  };
  atomicWriteFileSync(CONFIG_PATH, JSON.stringify(nonSecretConfig, null, 2));
}

export function updateState(mutator: (draft: NovaSwarmState) => void): NovaSwarmState {
  const current = getState();
  mutator(current);
  saveState(current);
  return current;
}

function computeAuditHash(entry: AuditLogEntry, prevHash: string): string {
  const payload = `${prevHash}|${entry.id}|${entry.timestamp}|${entry.type}|${entry.sourceAgentId}|${entry.message}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function verifyAuditLogChain(): {
  valid: boolean;
  checkedEntries: number;
  brokenIds: string[];
} {
  const logs = getState().auditLogs;
  const brokenIds: string[] = [];
  let expectedPrev = 'GENESIS';
  let checkedEntries = 0;

  for (const log of logs) {
    if (!log.hash) continue; // Legacy pre-chain entries
    checkedEntries += 1;
    const prevToUse = log.prevHash || expectedPrev;
    const recomputed = computeAuditHash(log, prevToUse);
    if (recomputed !== log.hash) {
      brokenIds.push(log.id);
    }
    expectedPrev = log.hash;
  }

  return { valid: brokenIds.length === 0, checkedEntries, brokenIds };
}

export function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'hash' | 'prevHash'>): AuditLogEntry {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  let full!: AuditLogEntry;

  updateState((s) => {
    const lastChained = [...s.auditLogs].reverse().find((x) => Boolean(x.hash));
    const prevHash = lastChained?.hash || 'GENESIS';
    const baseEntry: AuditLogEntry = {
      ...entry,
      id,
      timestamp,
      prevHash,
    };
    baseEntry.hash = computeAuditHash(baseEntry, prevHash);
    full = baseEntry;

    s.auditLogs.push(full);
    const maxEntries = Math.max(100, s.settings.auditLogMaxEntries || 2000);
    if (s.auditLogs.length > maxEntries) {
      const overflow = s.auditLogs.length - maxEntries;
      let removed = 0;
      s.auditLogs = s.auditLogs.filter((item) => {
        if (removed < overflow && item.type !== 'chat') {
          removed++;
          return false;
        }
        return true;
      });
    }
  });

  syncAuditEntryToWal(full);
  novaBus.emitEvent('audit:appended', { id: full.id, type: full.type, message: full.message });
  return full;
}

export function appendUnifiedMessage(
  msg: Omit<UnifiedMessage, 'id' | 'timestamp'>
): UnifiedMessage {
  const full: UnifiedMessage = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  updateState((s) => {
    s.messages.push(full);
    s.lastActivityAt = full.timestamp;
    const thread = s.threads.find((t) => t.id === full.threadId);
    if (thread) {
      thread.updatedAt = full.timestamp;
    }
  });

  syncMessageToWal(full);
  novaBus.emitEvent('state:updated', { section: 'messages', timestamp: full.timestamp });
  return full;
}

/** M156: Retention cleanup across transient logs/history */
export function pruneRetentionData(daysOverride?: number): { prunedLogs: number; prunedClipboard: number } {
  const days = Math.max(1, daysOverride ?? getState().settings.retentionDays ?? 90);
  const cutoffMs = Date.now() - days * 86_400_000;
  let prunedLogs = 0;
  let prunedClipboard = 0;

  updateState((s) => {
    const beforeL = s.auditLogs.length;
    s.auditLogs = s.auditLogs.filter((l) => Date.parse(l.timestamp) >= cutoffMs || l.type === 'security');
    prunedLogs = beforeL - s.auditLogs.length;

    const beforeC = s.clipboardHistory.length;
    s.clipboardHistory = s.clipboardHistory.filter((c) => Date.parse(c.createdAt) >= cutoffMs);
    prunedClipboard = beforeC - s.clipboardHistory.length;
  });

  return { prunedLogs, prunedClipboard };
}

export function createApprovalRequest(
  req: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt' | 'expiresAt'>
): ApprovalRequest {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString(); // M21: 15-minute auto-expiry
  const full: ApprovalRequest = {
    ...req,
    id: crypto.randomUUID(),
    status: 'pending',
    createdAt,
    expiresAt,
  };
  updateState((s) => {
    s.approvals.unshift(full);
  });
  return full;
}

export function resetInMemoryStateForTests(customState?: NovaSwarmState): void {
  cachedState = customState ?? createInitialState();
}

export function getStatePaths() {
  return { STATE_PATH, CONFIG_PATH, SECRETS_PATH };
}
