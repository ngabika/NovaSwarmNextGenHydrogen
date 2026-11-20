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

export type ExecutionPreset = 'fast' | 'deep' | 'precise';

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
  createdAt?: string;
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
  /** M19: Per-agent MCP permission matrix (empty/undefined = allowed to all) */
  allowedMcpIds?: string[];
  /** M23: Per-agent rate limit & quiet/active schedule */
  activeHoursStart?: number;
  activeHoursEnd?: number;
  maxRunsPerHour?: number;
  runTimestamps?: string[];
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
  /** M16: Card dependencies that must be 'done' before autonomous worker runs this card */
  blockedBy?: string[];
  /** M17: Isolated git branch bound to this Kanban task */
  gitBranch?: string;
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
  | 'uptime'
  | 'workflow'
  | 'security';

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
export type McpTransport = 'http' | 'stdio';
export type McpConnectionStatus = 'untested' | 'connected' | 'disconnected' | 'error' | 'not_configured';

export interface McpServer {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
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

export interface MemoryRelation {
  target: string;
  relation: string;
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
  semanticEmbedding?: number[];
  obsidianPath?: string;
  /** Memory Tiering & Salience Decay */
  tier?: MemoryTier;
  salience?: number;
  lastAccessedAt?: string;
  agentId?: string;
  /** M11: Contradiction resolution */
  supersededBy?: string;
  supersedesId?: string;
  /** M12: Auto-extracted entity relations */
  relations?: MemoryRelation[];
}

export interface ShortTermSignal {
  id: string;
  createdAt: string;
  content: string;
  source: string;
  queryCount: number;
  tags: string[];
}

export interface DreamSkillDraft {
  id: string;
  name: string;
  description: string;
  suggestedCode: string;
  theme: string;
  createdAt: string;
  promotedSkillId?: string;
}

export interface DreamJournalEntry {
  id: string;
  timestamp: string;
  phaseSummary: {
    lightCandidates: number;
    deepPromoted: number;
    remThemes: string[];
    contradictionsResolved?: number;
    skillDraftsCreated?: number;
  };
  narrative: string;
  costUsd: number;
  usedLocalOllama: boolean;
}

export interface ReflexionSuggestion {
  id: string;
  agentId: string;
  agentName: string;
  reason: string;
  currentPromptSnippet: string;
  proposedPrompt: string;
  createdAt: string;
  applied?: boolean;
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
  kind: 'image' | 'audio' | 'document';
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
  artifactIds?: string[];
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
  | 'sensitive_selfmod'
  | 'docker_control'
  | 'systemd_control'
  | 'email_send';

export interface ApprovalRequest {
  id: string;
  type: DestructiveActionType;
  title: string;
  commandOrTarget: string;
  requestedBy: string;
  impactSummary?: string;
  expiresAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
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
  /** M18: Bidirectional polling via bot token + channel ID */
  pollingEnabled?: boolean;
  botTokenConfigured?: boolean;
  channelId?: string;
  lastMessageId?: string;
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

/** M10: Prompt Templates */
export interface PromptTemplate {
  id: string;
  title: string;
  command: string;
  body: string;
  category: string;
  createdAt: string;
}

/** Ú4, Ú18, Ú20: Media & Interactive Artifacts */
export interface MediaArtifact {
  id: string;
  kind: 'image' | 'audio' | 'chart_svg' | 'html_app';
  title: string;
  mimeType?: string;
  urlOrContent: string;
  agentId?: string;
  createdAt: string;
}

/** Ú6: RSS / Atom / GitHub Release Feeds */
export interface RssFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastError?: string;
}

export interface RssFeedItem {
  id: string;
  feedId: string;
  feedName: string;
  title: string;
  link: string;
  publishedAt: string;
  summary: string;
}

/** Ú7: IMAP/SMTP Email Monitor */
export interface EmailSummaryItem {
  uid: number;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface EmailConfig {
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  tls: boolean;
  hasPassword: boolean;
  lastCheckedAt: string | null;
  lastError?: string;
  recentEmails: EmailSummaryItem[];
}

/** Ú8: Calendar & Reminders */
export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  location?: string;
  notes?: string;
  reminderMinutes: number;
  triggered?: boolean;
  createdAt: string;
}

/** Ú13: Smart Home (Home Assistant + MQTT) */
export interface SmartHomeDevice {
  id: string;
  name: string;
  kind: 'home_assistant' | 'mqtt';
  entityOrTopic: string;
  lastState?: string;
  lastUpdatedAt?: string;
}

/** Ú15: SSH Fleet Profiles */
export interface SshHostProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  keyPath?: string;
  lastCheckedAt?: string;
  lastStatus?: 'unknown' | 'online' | 'error';
  lastOutput?: string;
}

/** Ú16: Watched GitHub Repositories */
export interface WatchedRepo {
  id: string;
  slug: string;
  branch: string;
  lastCommitSha?: string;
  lastCommitMsg?: string;
  openIssuesCount?: number;
  lastCheckedAt?: string;
  lastError?: string;
}

/** Ú17: Visual Workflow Automation */
export interface WorkflowDefinition {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: 'manual' | 'cron' | 'webhook' | 'uptime_down' | 'feed_item';
  triggerConfig: string;
  conditionExpr?: string;
  actionType: 'agent_prompt' | 'kanban_create' | 'notify';
  actionTarget: string;
  actionPayload: string;
  lastRunAt: string | null;
  lastStatus?: string;
  runCount: number;
}

/** Ú19: Custom Incoming Webhooks */
export interface CustomWebhook {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  hasSecret: boolean;
  targetAgentId?: string;
  workflowId?: string;
  promptTemplate: string;
  lastTriggeredAt: string | null;
  hitCount: number;
}

/** Ú24: Habits & Focus Sessions */
export interface HabitItem {
  id: string;
  name: string;
  targetPerWeek: number;
  completedDates: string[];
  totalMinutes: number;
  createdAt: string;
}

export interface FocusSession {
  id: string;
  label: string;
  habitId?: string;
  minutes: number;
  startedAt: string;
  completedAt: string;
}

/** Ú25: Local Expense & Receipt Records */
export interface ExpenseRecord {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  source: 'csv' | 'receipt_ocr' | 'manual';
  notes?: string;
}

/** Ú26: SSL Certificate Watch Targets */
export interface SslWatchTarget {
  id: string;
  host: string;
  port: number;
  issuer?: string;
  expiresAt?: string;
  daysRemaining?: number | null;
  lastCheckedAt?: string;
  lastError?: string;
}

/** M30: Dashboard Widget Layout */
export interface DashboardWidgetConfig {
  id: string;
  title: string;
  visible: boolean;
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
  /** M6: Ollama low-RAM optimizer */
  ollamaNumCtx: number;
  ollamaKeepAlive: string;
  providerKeys: Record<ProviderId, ProviderKeyEntry[]>;
  manualModelPriority: Record<ProviderId, string[]>;
  lastModelDiscoveryAt: string | null;
  dailyCostLimitEnabled: boolean;
  dailyCostLimitUsd: number;
  dailySpendUsd: number;
  dailySpendDate: string;
  /** M9: Monthly projected alert threshold */
  monthlyBudgetAlertUsd: number;
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
  /** Ú14: Rsync external/NAS backup target */
  backupRsyncTarget: string;
  ttsEnabled: boolean;
  ttsHostSpeakerEnabled: boolean;
  /** M29: Hands-free continuous voice loop */
  continuousVoiceMode: boolean;
  autoTaskRouting: boolean;
  /** M2 & M4: Configurable tool chain depth & default execution preset */
  maxToolSteps: number;
  defaultPreset: ExecutionPreset;
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
  /** Ú2: Live Web Search config */
  searchProvider: 'duckduckgo' | 'searxng' | 'brave';
  searxngUrl: string;
  braveHasKey: boolean;
  /** Ú8: CalDAV URL */
  caldavUrl: string;
  /** Ú13: Home Assistant + MQTT */
  homeAssistantUrl: string;
  homeAssistantHasToken: boolean;
  mqttBrokerHost: string;
  mqttBrokerPort: number;
  /** M30: Overview Widgets */
  dashboardWidgets: DashboardWidgetConfig[];
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
  dreamSkillDrafts: DreamSkillDraft[];
  reflexionSuggestions: ReflexionSuggestion[];
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
  promptTemplates: PromptTemplate[];
  artifacts: MediaArtifact[];
  rssFeeds: RssFeed[];
  rssFeedItems: RssFeedItem[];
  emailConfig: EmailConfig;
  calendarEvents: CalendarEvent[];
  smartHomeDevices: SmartHomeDevice[];
  sshProfiles: SshHostProfile[];
  watchedRepos: WatchedRepo[];
  workflows: WorkflowDefinition[];
  customWebhooks: CustomWebhook[];
  habits: HabitItem[];
  focusSessions: FocusSession[];
  expenses: ExpenseRecord[];
  sslTargets: SslWatchTarget[];
  lastActivityAt: string;
  activeExplicitTaskAgentId: string | null;
}
