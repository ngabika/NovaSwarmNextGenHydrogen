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
import {
  createDefaultAgentPersonas,
  createDefaultCodeSnippets,
  createDefaultGlossaryTerms,
  createDefaultIncidentPlaybooks,
  createDefaultSmartChecklists,
  createDefaultUserContexts,
} from '../power/batch8SingularityEngine';
import { novaBus } from './eventBus';
import { syncAuditEntryToWal, syncMessageToWal } from './sqliteWal';

export const CURRENT_SCHEMA_VERSION = 13;

const ROOT_DIR = process.cwd();
const STATE_PATH = path.join(ROOT_DIR, '.state.json');
const CONFIG_PATH = path.join(ROOT_DIR, '.config.json');
const SECRETS_PATH = path.join(ROOT_DIR, '.secrets.vault.json');
const SECRETS_KEY_PATH = path.join(ROOT_DIR, '.secrets.key');

let cachedMasterKeyHex: string | null = null;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Legacy deterministic KDF kept read-only for migrating pre-audit vaults */
function getLegacyDeterministicVaultKey(): Buffer {
  const seed = `${os.hostname()}:${os.userInfo().username}:${ROOT_DIR}:novaswarm-vault-v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

/** Random 256-bit local master key stored with mode 0600 (or NOVASWARM_MASTER_KEY env) */
function getMasterKeyMaterial(): string {
  const envKey = process.env.NOVASWARM_MASTER_KEY?.trim();
  if (envKey && envKey.length >= 16) return envKey;
  if (cachedMasterKeyHex) return cachedMasterKeyHex;

  try {
    if (fs.existsSync(SECRETS_KEY_PATH)) {
      const raw = fs.readFileSync(SECRETS_KEY_PATH, 'utf8').trim();
      if (/^[0-9a-f]{32,}$/i.test(raw)) {
        try {
          fs.chmodSync(SECRETS_KEY_PATH, 0o600);
        } catch {
          // ignore on non-POSIX FS
        }
        cachedMasterKeyHex = raw;
        return cachedMasterKeyHex;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    atomicWriteFileSync(SECRETS_KEY_PATH, `${generated}\n`);
    cachedMasterKeyHex = generated;
    return generated;
  } catch {
    cachedMasterKeyHex = crypto.randomBytes(32).toString('hex');
    return cachedMasterKeyHex;
  }
}

function getAuditHmacKey(): Buffer {
  return crypto.createHmac('sha256', getMasterKeyMaterial()).update('novaswarm-audit-hmac-v1').digest();
}

export function encryptSecret(plaintext: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(getMasterKeyMaterial(), salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts[0] === 'v2' && parts.length === 5) {
    const [, saltHex, ivHex, tagHex, dataHex] = parts;
    if (!saltHex || !ivHex || !tagHex || !dataHex) return '';
    const key = crypto.scryptSync(getMasterKeyMaterial(), Buffer.from(saltHex, 'hex'), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  // Legacy 3-part format fallback
  const [ivHex, tagHex, dataHex] = parts;
  if (!ivHex || !tagHex || !dataHex) return '';
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getLegacyDeterministicVaultKey(),
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
    hostPermissionsGranted: false,
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
    guardrailsEnabled: true,
    guardrailBlockPii: false,
    guardrailBlockSecrets: true,
    guardrailBlockPromptInjection: true,
    heartbeatEnabled: true,
    heartbeatIntervalMinutes: 5,
    channelPairingRequired: true,
    lastHeartbeatAt: null,
    lastHeartbeatSummary: null,
    kanbanWipLimit: 3,
    kanbanAgingHours: 48,
    federationEnabled: false,
    instanceName: os.hostname().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || 'novaswarm-node',
    webAuthEnabled: true,
    webAuthHasPassword: hasWebAuthPassword(),
    autonomousKanbanWorkerEnabled: false,
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
    fullAutonomousMode: false,
    themeMode: 'light',
    privacyMaskEnabled: false,
    nightShiftEnabled: false,
    nightShiftIntervalMinutes: 30,
    redTeamEnabled: false,
    supervisorStrictness: 'balanced',
    retentionDays: 90,
    softDowngradeOnBudget: true,
    defaultCurrency: 'HUF',
    telegramInlineButtons: true,
    lastNightShiftAt: null,
    lanSubnetAllowlist: [],
    totpEnabled: false,
    telegramAllowedChatIds: [],
    telegramDigestTime: '07:30',
    telegramSilentNight: true,
    cpuLoadThrottleThreshold: 4.0,
    digitalDetoxMode: false,
    deadManSwitchDays: 0,
    agentTemperatureBias: 0,
    hardwareAutoOptimize: true,
    detectedHardwareTier: ramMb <= 2200 ? 'ultra_light_pi' : ramMb <= 6144 ? 'mid_sbc_vps' : ramMb <= 14336 ? 'standard_desktop' : 'workstation_gpu',
    ramWatchdogThresholdPercent: ramMb <= 2200 ? 84 : 90,
    sdCardSparingMode: ramMb <= 2200 || os.arch() === 'arm64' || os.arch() === 'arm',
    hybridLocalFirst: true,
    telegramVoiceReplyEnabled: true,
    morningBriefTime: '07:30',
    eveningBriefTime: '21:00',
    inboxTriageEnabled: true,
    selfHealingDaemonEnabled: true,
    gpioFanPin: undefined,
    gpioFanTempThresholdC: 65,
    lastMigrationRecord: null,
    lanSentinelAutoAlert: true,
    dockerAutoHealEnabled: true,
    meshOffloadEnabled: true,
    speedtestIntervalMinutes: 60,
    operatingMode: 'normal',
    compactUiMode: false,
    compactLocalPrompt: ramMb <= 2200,
    timezone: 'Europe/Budapest',
    telegramStreamEdit: true,
    telegramMessageDebounceMs: 1200,
    currencyAlertThresholdHuf: 410,
    activePersonaId: 'persona-architect',
    activeUserContextId: 'ctx-work',
    adaptiveVerbosity: 'balanced',
    proactiveFollowUpSuggestions: true,
    autoInjectFactVault: true,
    autoExtractActionItems: true,
    agentSelfCritiquePass: false,
    defaultResponseTone: 'professional',
    dangerousExecAutoApprove: false,
    sendAuditAnchorToTelegram: false,
    lastAuditAnchorSentDate: null,
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
    priceWatches: [],
    documentSafe: [],
    hostedMiniApps: [],
    apiMocks: [],
    ephemeralNotes: [],
    lifeGoals: [],
    customWidgets: [],
    debateRuns: [],
    missionCheckpoints: [],
    userXp: {
      xp: 0,
      level: 1,
      streakDays: 0,
      lastAwardDate: null,
      badges: ['Raj Kezdő'],
      recentEvents: [],
    },
    backgroundJobs: [],
    telegramOutbox: [],
    knownLanMacs: [],
    postMortems: [],
    hardwareProfile: null,
    visualWatchItems: [],
    proactiveEvents: [],
    autonomyRules: [
      {
        id: 'rule-default-ram-guard',
        name: 'Automatikus RAM & Cache Felszabadítás (88% felett)',
        enabled: true,
        triggerKind: 'ram_above',
        thresholdValue: 88,
        actionKind: 'ram_cleanup',
        actionTarget: 'auto',
        cooldownMinutes: 10,
        triggerCount: 0,
        createdAt: now,
      },
    ],
    smartReminders: [],
    quickMacros: [
      {
        id: 'macro-night-cleanup',
        slug: 'takaritas',
        name: 'Éjszakai Rendszertakarítás',
        description: 'RAM őrszem tisztítás, SD puffer kiírás és tétlen Ollama modell ürítés egy kattintással.',
        steps: ['ram_watchdog', 'sd_flush', 'ollama_unload'],
        runCount: 0,
      },
      {
        id: 'macro-full-health',
        slug: 'korkep',
        name: 'Teljes Állapot & Hálózat Kórkép',
        description: 'Öngyógyító démon, Docker konténer javítás, LAN őrszem és forenzikus folyamatkép.',
        steps: ['self_heal', 'docker_heal', 'lan_sentinel', 'forensic_snapshot'],
        runCount: 0,
      },
    ],
    networkSpeeds: [],
    meshDispatches: [],
    lastForensicReport: null,
    decisionLogs: [],
    quoteDeck: [
      {
        id: 'quote-init-1',
        quote: 'A legegyszerűbb autonóm rendszer az, amely csendben elvégzi a munkát és csak akkor szól, ha számít.',
        author: 'NovaSwarm Alapelv',
        source: 'Rendszerfilozófia',
        pinned: true,
        createdAt: now,
      },
    ],
    countdownTimers: [],
    medicationReminders: [],
    lentItems: [],
    fuelLogs: [],
    savingsGoals: [],
    dailyTop3: { date: todayIsoDate(), items: [] },
    tripPlans: [],
    mediaBacklog: [],
    fixedExpenses: [],
    currencyRates: null,
    lanPortScans: [],
    webhookHistory: [],
    dropShareTokens: [],
    sharedScratchpad: '',
    agentPersonas: createDefaultAgentPersonas(),
    userContextProfiles: createDefaultUserContexts(),
    writingStyleSamples: [],
    factVault: [],
    goalTrees: [],
    agentHandoffs: [],
    decisionMatrixRuns: [],
    scenarioSimulations: [],
    redTeamCritiques: [],
    studyPlans: [],
    meetingBriefs: [],
    glossaryTerms: createDefaultGlossaryTerms(),
    readingDigests: [],
    codeSnippets: createDefaultCodeSnippets(),
    architectureBlueprints: [],
    incidentPlaybooks: createDefaultIncidentPlaybooks(),
    communicationDrafts: [],
    wellnessLogs: [],
    smartChecklists: createDefaultSmartChecklists(),
    timeBlocks: [],
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
    priceWatches: Array.isArray(source.priceWatches) ? source.priceWatches : [],
    documentSafe: Array.isArray(source.documentSafe) ? source.documentSafe : [],
    hostedMiniApps: Array.isArray(source.hostedMiniApps) ? source.hostedMiniApps : [],
    apiMocks: Array.isArray(source.apiMocks) ? source.apiMocks : [],
    ephemeralNotes: Array.isArray(source.ephemeralNotes) ? source.ephemeralNotes : [],
    lifeGoals: Array.isArray(source.lifeGoals) ? source.lifeGoals : [],
    customWidgets: Array.isArray(source.customWidgets) ? source.customWidgets : [],
    debateRuns: Array.isArray(source.debateRuns) ? source.debateRuns : [],
    missionCheckpoints: Array.isArray(source.missionCheckpoints) ? source.missionCheckpoints : [],
    userXp: source.userXp
      ? {
          ...base.userXp,
          ...source.userXp,
          badges: Array.isArray(source.userXp.badges) ? source.userXp.badges : base.userXp.badges,
          recentEvents: Array.isArray(source.userXp.recentEvents) ? source.userXp.recentEvents : [],
        }
      : base.userXp,
    backgroundJobs: Array.isArray(source.backgroundJobs) ? source.backgroundJobs : [],
    telegramOutbox: Array.isArray(source.telegramOutbox) ? source.telegramOutbox : [],
    knownLanMacs: Array.isArray(source.knownLanMacs) ? source.knownLanMacs : [],
    postMortems: Array.isArray(source.postMortems) ? source.postMortems : [],
    hardwareProfile: source.hardwareProfile ?? null,
    visualWatchItems: Array.isArray(source.visualWatchItems) ? source.visualWatchItems : [],
    proactiveEvents: Array.isArray(source.proactiveEvents) ? source.proactiveEvents : [],
    autonomyRules:
      Array.isArray(source.autonomyRules) && source.autonomyRules.length > 0
        ? source.autonomyRules
        : base.autonomyRules,
    smartReminders: Array.isArray(source.smartReminders) ? source.smartReminders : [],
    quickMacros:
      Array.isArray(source.quickMacros) && source.quickMacros.length > 0
        ? source.quickMacros
        : base.quickMacros,
    networkSpeeds: Array.isArray(source.networkSpeeds) ? source.networkSpeeds : [],
    meshDispatches: Array.isArray(source.meshDispatches) ? source.meshDispatches : [],
    lastForensicReport: source.lastForensicReport ?? null,
    decisionLogs: Array.isArray(source.decisionLogs) ? source.decisionLogs : [],
    quoteDeck:
      Array.isArray(source.quoteDeck) && source.quoteDeck.length > 0 ? source.quoteDeck : base.quoteDeck,
    countdownTimers: Array.isArray(source.countdownTimers) ? source.countdownTimers : [],
    medicationReminders: Array.isArray(source.medicationReminders) ? source.medicationReminders : [],
    lentItems: Array.isArray(source.lentItems) ? source.lentItems : [],
    fuelLogs: Array.isArray(source.fuelLogs) ? source.fuelLogs : [],
    savingsGoals: Array.isArray(source.savingsGoals) ? source.savingsGoals : [],
    dailyTop3: source.dailyTop3 ?? base.dailyTop3,
    tripPlans: Array.isArray(source.tripPlans) ? source.tripPlans : [],
    mediaBacklog: Array.isArray(source.mediaBacklog) ? source.mediaBacklog : [],
    fixedExpenses: Array.isArray(source.fixedExpenses) ? source.fixedExpenses : [],
    currencyRates: source.currencyRates ?? null,
    lanPortScans: Array.isArray(source.lanPortScans) ? source.lanPortScans : [],
    webhookHistory: Array.isArray(source.webhookHistory) ? source.webhookHistory : [],
    dropShareTokens: Array.isArray(source.dropShareTokens) ? source.dropShareTokens : [],
    sharedScratchpad: typeof source.sharedScratchpad === 'string' ? source.sharedScratchpad : '',
    agentPersonas:
      Array.isArray(source.agentPersonas) && source.agentPersonas.length > 0
        ? source.agentPersonas
        : base.agentPersonas,
    userContextProfiles:
      Array.isArray(source.userContextProfiles) && source.userContextProfiles.length > 0
        ? source.userContextProfiles
        : base.userContextProfiles,
    writingStyleSamples: Array.isArray(source.writingStyleSamples) ? source.writingStyleSamples : [],
    factVault: Array.isArray(source.factVault) ? source.factVault : [],
    goalTrees: Array.isArray(source.goalTrees) ? source.goalTrees : [],
    agentHandoffs: Array.isArray(source.agentHandoffs) ? source.agentHandoffs : [],
    decisionMatrixRuns: Array.isArray(source.decisionMatrixRuns) ? source.decisionMatrixRuns : [],
    scenarioSimulations: Array.isArray(source.scenarioSimulations) ? source.scenarioSimulations : [],
    redTeamCritiques: Array.isArray(source.redTeamCritiques) ? source.redTeamCritiques : [],
    studyPlans: Array.isArray(source.studyPlans) ? source.studyPlans : [],
    meetingBriefs: Array.isArray(source.meetingBriefs) ? source.meetingBriefs : [],
    glossaryTerms:
      Array.isArray(source.glossaryTerms) && source.glossaryTerms.length > 0
        ? source.glossaryTerms
        : base.glossaryTerms,
    readingDigests: Array.isArray(source.readingDigests) ? source.readingDigests : [],
    codeSnippets:
      Array.isArray(source.codeSnippets) && source.codeSnippets.length > 0
        ? source.codeSnippets
        : base.codeSnippets,
    architectureBlueprints: Array.isArray(source.architectureBlueprints) ? source.architectureBlueprints : [],
    incidentPlaybooks:
      Array.isArray(source.incidentPlaybooks) && source.incidentPlaybooks.length > 0
        ? source.incidentPlaybooks
        : base.incidentPlaybooks,
    communicationDrafts: Array.isArray(source.communicationDrafts) ? source.communicationDrafts : [],
    wellnessLogs: Array.isArray(source.wellnessLogs) ? source.wellnessLogs : [],
    smartChecklists:
      Array.isArray(source.smartChecklists) && source.smartChecklists.length > 0
        ? source.smartChecklists
        : base.smartChecklists,
    timeBlocks: Array.isArray(source.timeBlocks) ? source.timeBlocks : [],
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
    auditChainAnchor: source.auditChainAnchor,
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

  for (const candidate of [STATE_PATH, `${STATE_PATH}.bak1`, `${STATE_PATH}.bak2`, `${STATE_PATH}.bak3`]) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Partial<NovaSwarmState>;
      cachedState = migrateStateNonDestructive(parsed);
      return cachedState;
    } catch {
      // try older generation backup
    }
  }

  cachedState = createInitialState();
  saveState(cachedState);
  return cachedState;
}

/** M264: 3-generation atomic rotating state backup (.bak1 -> .bak2 -> .bak3) */
export function rotateStateBackupGenerations(targetPath = STATE_PATH): void {
  try {
    if (!fs.existsSync(targetPath)) return;
    const bak1 = `${targetPath}.bak1`;
    const bak2 = `${targetPath}.bak2`;
    const bak3 = `${targetPath}.bak3`;
    if (fs.existsSync(bak2)) {
      fs.copyFileSync(bak2, bak3);
      try { fs.chmodSync(bak3, 0o600); } catch { /* ignore */ }
    }
    if (fs.existsSync(bak1)) {
      fs.copyFileSync(bak1, bak2);
      try { fs.chmodSync(bak2, 0o600); } catch { /* ignore */ }
    }
    fs.copyFileSync(targetPath, bak1);
    try { fs.chmodSync(bak1, 0o600); } catch { /* ignore */ }
  } catch {
    // non-fatal best-effort rotation
  }
}

export function saveState(state: NovaSwarmState): void {
  cachedState = state;
  rotateStateBackupGenerations(STATE_PATH);
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
  return crypto.createHmac('sha256', getAuditHmacKey()).update(payload).digest('hex');
}

export function verifyAuditLogChain(): {
  valid: boolean;
  checkedEntries: number;
  brokenIds: string[];
} {
  const state = getState();
  const logs = state.auditLogs;
  const brokenIds: string[] = [];
  let expectedPrev = state.auditChainAnchor?.prevHash || 'GENESIS';
  let checkedEntries = 0;

  for (const log of logs) {
    if (!log.hash) continue; // Legacy pre-chain entries
    checkedEntries += 1;
    if (log.prevHash !== expectedPrev) {
      brokenIds.push(log.id);
    }
    const recomputed = computeAuditHash(log, expectedPrev);
    if (recomputed !== log.hash) {
      if (!brokenIds.includes(log.id)) brokenIds.push(log.id);
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
    const prevHash = lastChained?.hash || s.auditChainAnchor?.prevHash || 'GENESIS';
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
      const dropped = s.auditLogs.splice(0, overflow);
      const lastDroppedHash = [...dropped].reverse().find((d) => Boolean(d.hash))?.hash;
      if (lastDroppedHash) {
        s.auditChainAnchor = {
          prevHash: lastDroppedHash,
          prunedCount: (s.auditChainAnchor?.prunedCount || 0) + dropped.length,
        };
      }
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

/** M156: Retention cleanup across transient logs/history (head-only prune preserves audit hash chain anchor) */
export function pruneRetentionData(daysOverride?: number): { prunedLogs: number; prunedClipboard: number } {
  const days = Math.max(1, daysOverride ?? getState().settings.retentionDays ?? 90);
  const cutoffMs = Date.now() - days * 86_400_000;
  let prunedLogs = 0;
  let prunedClipboard = 0;

  updateState((s) => {
    let headCutIdx = 0;
    while (headCutIdx < s.auditLogs.length) {
      const item = s.auditLogs[headCutIdx];
      if (item.type === 'security' || Date.parse(item.timestamp) >= cutoffMs) {
        break;
      }
      headCutIdx++;
    }
    if (headCutIdx > 0) {
      const dropped = s.auditLogs.splice(0, headCutIdx);
      prunedLogs = dropped.length;
      const lastDroppedHash = [...dropped].reverse().find((d) => Boolean(d.hash))?.hash;
      if (lastDroppedHash) {
        s.auditChainAnchor = {
          prevHash: lastDroppedHash,
          prunedCount: (s.auditChainAnchor?.prunedCount || 0) + dropped.length,
        };
      }
    }

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

/** M345: Reset non-secret runtime data (optionally preserving API keys, Telegram & settings) */
export function clearOrResetAppData(opts?: { keepSecretsAndSettings?: boolean }): NovaSwarmState {
  const prev = getState();
  const fresh = createInitialState();
  if (opts?.keepSecretsAndSettings !== false) {
    fresh.settings = {
      ...prev.settings,
      dailySpendUsd: 0,
      lastHeartbeatAt: null,
      lastHeartbeatSummary: null,
    };
  }
  saveState(fresh);
  return fresh;
}

export function resetInMemoryStateForTests(customState?: NovaSwarmState): void {
  cachedState = customState ?? createInitialState();
}

export function getStatePaths() {
  return { STATE_PATH, CONFIG_PATH, SECRETS_PATH };
}
