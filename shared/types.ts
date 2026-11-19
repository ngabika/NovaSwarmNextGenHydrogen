export type LanguageCode =
  | 'hu'
  | 'en'
  | 'de'
  | 'es'
  | 'fr'
  | 'it'
  | 'pt'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'ar';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama';

export interface ProviderKeyEntry {
  id: string;
  label: string;
  /** Masked preview returned to UI (e.g. AIza...9f2a) — raw secret kept in server vault */
  maskedKey: string;
  enabled: boolean;
  failureCount: number;
  lastUsedAt?: string;
  lastError?: string;
  cooldownUntil?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isFree: boolean;
  tier: 'free' | 'budget' | 'standard' | 'flagship' | 'local';
  source: 'api' | 'catalog';
}

export interface QuotaStatus {
  provider: ProviderId;
  remainingRequests: number | null;
  limitRequests: number | null;
  remainingTokens: number | null;
  resetAt: string | null;
  isEstimated: boolean;
  lastCheckedAt: string | null;
  sourceNote: string;
}

export type VoiceReplyMode = 'off' | 'on_voice' | 'always';

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  role: string;
  parentAgentId: string | null;
  systemPrompt: string;
  modelId: string;
  providerId: ProviderId;
  webSearchEnabled: boolean;
  hostExecutionEnabled: boolean;
  active: boolean;
  isSupervisor?: boolean;
  /** Per-agent dedicated Telegram bot */
  telegramBotEnabled?: boolean;
  telegramHasToken?: boolean;
  telegramBotUsername?: string;
  /** Per-agent daily USD spend tracking & optional budget limit */
  dailyBudgetUsd?: number;
  dailySpendUsd?: number;
  voiceReplyMode?: VoiceReplyMode;
  lastHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type KanbanStatus = 'todo' | 'in_progress' | 'done';
export type KanbanPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface KanbanSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  assignedAgentId: string | null;
  priority?: KanbanPriority;
  subtasks?: KanbanSubtask[];
  archived?: boolean;
  project?: string;
  createdAt: string;
  updatedAt: string;
}

export type IdeaStatus = 'new' | 'reviewed' | 'kanban' | 'rejected';

export interface IdeaComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface IdeaItem {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  impact: number;
  effort: number;
  score: number;
  comments: IdeaComment[];
  linkedCardId?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditLogType =
  | 'thought'
  | 'action'
  | 'chat'
  | 'terminal'
  | 'system'
  | 'telegram'
  | 'kanban'
  | 'memory'
  | 'supervisor'
  | 'gateway'
  | 'channel'
  | 'federation'
  | 'uptime';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditLogType;
  sourceAgentId: string;
  sourceAgentName: string;
  message: string;
  verifiedExecution?: boolean;
  metadata?: Record<string, unknown>;
}

export type McpAuthType = 'none' | 'basic' | 'apikey' | 'oauth2';
export type McpConnectionStatus = 'untested' | 'connected' | 'disconnected' | 'error' | 'not_configured';

export interface McpServer {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  authType: McpAuthType;
  /** Non-secret display summary; secrets are AES-encrypted on server */
  hasCredentials: boolean;
  oauthConfigured: boolean;
  isGoogleWorkspace?: boolean;
  googleServices?: ('gmail' | 'calendar' | 'drive' | 'photos')[];
  status: McpConnectionStatus;
  lastCheckedAt: string | null;
  lastCheckMessage: string;
}

export type SkillStatus = 'pending_sandbox' | 'verified' | 'rejected';

export interface Skill {
  id: string;
  name: string;
  description: string;
  filePath: string;
  code: string;
  createdByAgentId: string;
  status: SkillStatus;
  sandboxReport: string;
  /** Skill Factory: learned failure recovery pitfalls */
  pitfalls?: string[];
  usageCount?: number;
  lastUsedAt?: string;
  createdAt: string;
}

export type MemoryTier = 'hot' | 'warm' | 'cold' | 'shared';

export interface MemoryEntry {
  id: string;
  createdAt: string;
  content: string;
  entity: string;
  tags: string[];
  links: string[];
  importanceScore: number;
  embedding: number[];
  semanticEmbedding?: number[];
  obsidianPath?: string;
  /** Memory Tiering & Salience Decay */
  tier?: MemoryTier;
  salience?: number;
  lastAccessedAt?: string;
  agentId?: string;
}

export interface ShortTermSignal {
  id: string;
  createdAt: string;
  content: string;
  source: string;
  queryCount: number;
  tags: string[];
}

export interface DreamJournalEntry {
  id: string;
  timestamp: string;
  phaseSummary: {
    lightCandidates: number;
    deepPromoted: number;
    remThemes: string[];
  };
  narrative: string;
  costUsd: number;
  usedLocalOllama: boolean;
}

export type SessionIsolationMode = 'main_host' | 'sandboxed';

export interface ChatThread {
  id: string;
  title: string;
  folder: string;
  /** Session isolation: main_host has host permissions, secondary/external are sandboxed */
  isolationMode?: SessionIsolationMode;
  channelSource?: 'web' | 'telegram' | 'discord' | 'slack' | 'webhook' | 'federation';
  compactedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ToolExecutionStep {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  sandboxed: boolean;
  outputPreview: string;
}

export interface MessageAttachment {
  kind: 'image' | 'audio';
  mimeType: string;
  dataBase64: string;
  name?: string;
}

export interface UnifiedMessage {
  id: string;
  threadId: string;
  senderType: 'user' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  targetAgentId?: string | null;
  channel: 'web' | 'telegram' | 'swarm_internal' | 'discord' | 'slack' | 'webhook' | 'federation';
  content: string;
  attachments?: MessageAttachment[];
  modelUsed?: string;
  providerUsed?: ProviderId;
  costUsd?: number;
  toolTrace?: ToolExecutionStep[];
  timestamp: string;
}

export interface CronTask {
  id: string;
  name: string;
  cronExpression: string;
  prompt: string;
  targetAgentId: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
}

export type DestructiveActionType =
  | 'os_upgrade'
  | 'package_remove'
  | 'partition_disk'
  | 'firewall_modify'
  | 'full_restore'
  | 'sensitive_selfmod';

export interface ApprovalRequest {
  id: string;
  type: DestructiveActionType;
  title: string;
  commandOrTarget: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  resolvedVia?: 'web' | 'telegram';
}

export interface HardwareMetrics {
  cpuCores: number;
  cpuModel: string;
  cpuLoadPercent: number;
  ramTotalMb: number;
  ramUsedMb: number;
  ramPercent: number;
  diskTotalGb: number;
  diskUsedGb: number;
  diskPercent: number;
  temperatureCelsius: number | null;
  batteryPercent: number | null;
  isCharging: boolean | null;
  throttledReason: string | null;
  timestamp: string;
}

export interface SupervisorStatus {
  lastAuditAt: string | null;
  status: 'nominal' | 'warning' | 'alert';
  lastSummary: string;
  discrepanciesFound: number;
  sandboxTestsPassed: number;
  lastDestructiveProofAt: string | null;
}

/** Gateway Virtual Keys */
export interface VirtualKey {
  id: string;
  name: string;
  maskedKey: string;
  keyHash: string;
  maxBudgetUsd: number;
  spendUsd: number;
  rpmLimit: number;
  allowedModels: string[];
  enabled: boolean;
  totalRequests: number;
  totalTokens: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface GatewayAnalytics {
  totalProxyRequests: number;
  cacheHits: number;
  cacheMisses: number;
  savedUsd: number;
  guardrailsBlocked: number;
  spendByProvider: Record<ProviderId, number>;
  spendByModel: Record<string, number>;
}

/** Multi-Channel Connectors & Pairing */
export type ChannelConnectorType = 'discord' | 'slack' | 'webhook';

export interface ChannelConnector {
  id: string;
  type: ChannelConnectorType;
  name: string;
  enabled: boolean;
  hasSecret: boolean;
  webhookUrl: string;
  defaultAgentId: string | null;
  lastEventAt: string | null;
  lastError?: string;
}

export interface PairingRequest {
  id: string;
  channel: 'telegram' | 'discord' | 'slack' | 'webhook';
  senderId: string;
  senderLabel: string;
  code: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
}

/** P2P Federation Peer */
export interface FederationPeer {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  hasToken: boolean;
  status: 'untested' | 'online' | 'offline';
  remoteAgents: Array<{ id: string; name: string; role: string }>;
  lastSyncAt: string | null;
  lastError?: string;
}

/** Two-Strikes Uptime Monitor Target */
export interface UptimeTarget {
  id: string;
  name: string;
  url: string;
  expectedText?: string;
  intervalMinutes: number;
  enabled: boolean;
  status: 'unknown' | 'up' | 'degraded' | 'down';
  consecutiveFailures: number;
  lastStatusCode: number | null;
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  totalChecks: number;
  upChecks: number;
  lastError?: string;
}

export interface Settings {
  schemaVersion: number;
  onboardingCompleted: boolean;
  language: LanguageCode;
  hostPermissionsGranted: boolean;
  killSwitchActive: boolean;
  userProfile: string;
  primaryProvider: ProviderId;
  secondaryProvider: ProviderId;
  ollamaOnlyMode: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  providerKeys: Record<ProviderId, ProviderKeyEntry[]>;
  manualModelPriority: Record<ProviderId, string[]>;
  lastModelDiscoveryAt: string | null;
  dailyCostLimitEnabled: boolean;
  dailyCostLimitUsd: number;
  dailySpendUsd: number;
  dailySpendDate: string;
  dreamingIdleMinutes: number;
  thermalThrottleCelsius: number;
  batteryThrottlePercent: number;
  auditLogMaxEntries: number;
  telegramEnabled: boolean;
  telegramChatId: string;
  telegramHasToken: boolean;
  backupSchedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  cloudBackupGoogleDriveConnected: boolean;
  lastBackupAt: string | null;
  lastBackupLocation: 'none' | 'local' | 'local_and_drive';
  ttsEnabled: boolean;
  ttsHostSpeakerEnabled: boolean;
  autoTaskRouting: boolean;
  /** AI Gateway Cache & Guardrails */
  responseCacheEnabled: boolean;
  responseCacheTtlSec: number;
  guardrailsEnabled: boolean;
  guardrailBlockPii: boolean;
  guardrailBlockSecrets: boolean;
  guardrailBlockPromptInjection: boolean;
  /** Heartbeat & Pairing */
  heartbeatEnabled: boolean;
  heartbeatIntervalMinutes: number;
  channelPairingRequired: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatSummary: string | null;
  /** Kanban WIP/Aging & Federation */
  kanbanWipLimit: number;
  kanbanAgingHours: number;
  federationEnabled: boolean;
  instanceName: string;
  /** LAN Operator Auth, Autonomous Kanban Worker, Ollama Embeddings & GitHub Auto-Update */
  webAuthEnabled: boolean;
  webAuthHasPassword: boolean;
  autonomousKanbanWorkerEnabled: boolean;
  embeddingMode: 'local_ngram' | 'ollama';
  ollamaEmbeddingModel: string;
  otaRepoSlug: string;
  autoUpdateEnabled: boolean;
  autoUpdateCheckHours: number;
}

export interface BackupPoint {
  id: string;
  createdAt: string;
  fileName: string;
  sizeBytes: number;
  destination: 'local' | 'local_and_drive';
}

export interface OtaVersionStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  etag: string | null;
  releaseUrl: string | null;
  source: string;
  hasGitRepo?: boolean;
  localCommit?: string | null;
  remoteCommit?: string | null;
  commitsBehind?: number;
  autoUpdatedAt?: string | null;
  error?: string;
}

export interface NovaSwarmState {
  settings: Settings;
  agents: Agent[];
  kanban: KanbanCard[];
  ideas: IdeaItem[];
  auditLogs: AuditLogEntry[];
  mcpServers: McpServer[];
  skills: Skill[];
  memories: MemoryEntry[];
  shortTermSignals: ShortTermSignal[];
  dreamJournal: DreamJournalEntry[];
  threads: ChatThread[];
  messages: UnifiedMessage[];
  cronTasks: CronTask[];
  approvals: ApprovalRequest[];
  supervisor: SupervisorStatus;
  discoveredModels: ModelInfo[];
  quotas: Record<ProviderId, QuotaStatus>;
  backups: BackupPoint[];
  virtualKeys: VirtualKey[];
  gatewayAnalytics: GatewayAnalytics;
  channelConnectors: ChannelConnector[];
  pairingRequests: PairingRequest[];
  federationPeers: FederationPeer[];
  uptimeTargets: UptimeTarget[];
  lastActivityAt: string;
  activeExplicitTaskAgentId: string | null;
}
