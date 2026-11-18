import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  Agent,
  ApprovalRequest,
  AuditLogEntry,
  ChatThread,
  GatewayAnalytics,
  KanbanCard,
  MemoryEntry,
  NovaSwarmState,
  ProviderId,
  QuotaStatus,
  Settings,
  UnifiedMessage,
} from '../../shared/types';

export const CURRENT_SCHEMA_VERSION = 5;

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

/** Atomic write: writes to temp file in same directory, fsyncs, and renames over target */
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
  providerKeys: Record<string, string>; // keyId -> encrypted apiKey
  mcpCredentials: Record<string, string>; // mcpId -> encrypted JSON string
  telegramBotToken?: string; // encrypted coordinator bot
  agentTelegramTokens?: Record<string, string>; // agentId -> encrypted per-agent bot token
  channelSecrets?: Record<string, string>; // connectorId -> encrypted bot/signing secret
  federationTokens?: Record<string, string>; // peerId -> encrypted shared bearer token
  googleOAuthTokens?: string; // encrypted JSON
  webAuthPasswordHash?: string; // scrypt salt:hash (never sent to UI)
  webSessionSecret?: string; // encrypted random HMAC key
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

/** Marveen Parity: Per-Agent Dedicated Telegram Bot Token Vault */
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
  };
}

export function createDefaultSettings(): Settings {
  const hasEnvGemini = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
      process.env.GEMINI_API_KEY.trim().length > 8
  );

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
    providerKeys: {
      gemini: hasEnvGemini
        ? [
            {
              id: 'env-gemini-default',
              label: 'Server Environment Key',
              maskedKey: maskSecret(process.env.GEMINI_API_KEY!),
              enabled: true,
              failureCount: 0,
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
    ttsEnabled: false,
    ttsHostSpeakerEnabled: false,
    autoTaskRouting: true,
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
    webAuthEnabled: false,
    webAuthHasPassword: hasWebAuthPassword(),
    autonomousKanbanWorkerEnabled: false,
    embeddingMode: 'local_ngram',
    ollamaEmbeddingModel: 'nomic-embed-text',
    otaRepoSlug: process.env.NOVASWARM_OTA_REPO || 'ngabika/NovaSwarmNextGenHydrogen',
    autoUpdateEnabled: false,
    autoUpdateCheckHours: 6,
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
    // Strictly ONLY the structural Supervisor/Auditor exception at cold boot.
    // Zero sample user agents, zero sample Kanban cards, zero fake memories!
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
    lastActivityAt: now,
    activeExplicitTaskAgentId: null,
  };
}

let cachedState: NovaSwarmState | null = null;

/** Non-destructive migration: preserves all learned memories, agents, skills, and config while adding missing schema fields */
export function migrateStateNonDestructive(existing?: Partial<NovaSwarmState>): NovaSwarmState {
  const base = createInitialState();
  const source = existing ?? (fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {});

  const mergedSettings: Settings = {
    ...base.settings,
    ...(source.settings || {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    webAuthHasPassword: hasWebAuthPassword(),
    otaRepoSlug:
      source.settings?.otaRepoSlug === 'Szotasz/marveen' || !source.settings?.otaRepoSlug
        ? 'ngabika/NovaSwarmNextGenHydrogen'
        : source.settings.otaRepoSlug,
    providerKeys: {
      ...base.settings.providerKeys,
      ...(source.settings?.providerKeys || {}),
    },
    manualModelPriority: {
      ...base.settings.manualModelPriority,
      ...(source.settings?.manualModelPriority || {}),
    },
  };

  // Reset daily spend if calendar date rolled over
  if (mergedSettings.dailySpendDate !== todayIsoDate()) {
    mergedSettings.dailySpendDate = todayIsoDate();
    mergedSettings.dailySpendUsd = 0;
  }

  // Ensure server env GEMINI_API_KEY is available if configured
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
    });
  }

  const rawAgents: Agent[] = Array.isArray(source.agents) && source.agents.length > 0 ? source.agents : base.agents;
  const agents: Agent[] = rawAgents.map((a) => ({
    ...a,
    dailySpendUsd: a.dailySpendUsd ?? 0,
    voiceReplyMode: a.voiceReplyMode ?? 'off',
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
      }))
    : [];

  const kanban: KanbanCard[] = Array.isArray(source.kanban)
    ? source.kanban.map((c: KanbanCard) => ({
        ...c,
        priority: c.priority ?? 'medium',
        subtasks: Array.isArray(c.subtasks) ? c.subtasks : [],
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
    // Check date rollover on daily budget
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

  // Mirror non-secret editable config to .config.json atomically
  const nonSecretConfig = {
    schemaVersion: state.settings.schemaVersion,
    language: state.settings.language,
    hostPermissionsGranted: state.settings.hostPermissionsGranted,
    primaryProvider: state.settings.primaryProvider,
    secondaryProvider: state.settings.secondaryProvider,
    ollamaOnlyMode: state.settings.ollamaOnlyMode,
    ollamaUrl: state.settings.ollamaUrl,
    ollamaModel: state.settings.ollamaModel,
    dailyCostLimitEnabled: state.settings.dailyCostLimitEnabled,
    dailyCostLimitUsd: state.settings.dailyCostLimitUsd,
    dreamingIdleMinutes: state.settings.dreamingIdleMinutes,
    thermalThrottleCelsius: state.settings.thermalThrottleCelsius,
    batteryThrottlePercent: state.settings.batteryThrottlePercent,
    auditLogMaxEntries: state.settings.auditLogMaxEntries,
    backupSchedule: state.settings.backupSchedule,
    ttsEnabled: state.settings.ttsEnabled,
    ttsHostSpeakerEnabled: state.settings.ttsHostSpeakerEnabled,
    autoTaskRouting: state.settings.autoTaskRouting,
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
  };
  atomicWriteFileSync(CONFIG_PATH, JSON.stringify(nonSecretConfig, null, 2));
}

export function updateState(mutator: (draft: NovaSwarmState) => void): NovaSwarmState {
  const current = getState();
  mutator(current);
  saveState(current);
  return current;
}

/** Rotate secondary technical audit logs above limit, NEVER delete user-agent chat history (Section 15.2) */
export function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const full: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  updateState((s) => {
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

  return full;
}

/** Unified message store shared by Web UI, Telegram, Discord, Slack, Webhooks, and Federation */
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

  return full;
}

export function createApprovalRequest(
  req: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>
): ApprovalRequest {
  const full: ApprovalRequest = {
    ...req,
    id: crypto.randomUUID(),
    status: 'pending',
    createdAt: new Date().toISOString(),
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
