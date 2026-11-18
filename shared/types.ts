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
  telegramBotEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KanbanStatus = 'todo' | 'in_progress' | 'done';

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  assignedAgentId: string | null;
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
  | 'supervisor';

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
  createdAt: string;
}

export interface MemoryEntry {
  id: string;
  createdAt: string;
  content: string;
  entity: string;
  tags: string[];
  links: string[];
  importanceScore: number;
  embedding: number[];
  obsidianPath?: string;
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

export interface ChatThread {
  id: string;
  title: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedMessage {
  id: string;
  threadId: string;
  senderType: 'user' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  targetAgentId?: string | null;
  channel: 'web' | 'telegram' | 'swarm_internal';
  content: string;
  modelUsed?: string;
  providerUsed?: ProviderId;
  costUsd?: number;
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
  error?: string;
}

export interface NovaSwarmState {
  settings: Settings;
  agents: Agent[];
  kanban: KanbanCard[];
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
  lastActivityAt: string;
  activeExplicitTaskAgentId: string | null;
}
