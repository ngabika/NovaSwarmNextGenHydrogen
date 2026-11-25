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

export type TaskType =
  | 'simple_fast'
  | 'summarization'
  | 'code_simple'
  | 'code_hard'
  | 'complex_planning'
  | 'long_context'
  | 'vision'
  | 'audio'
  | 'tool_heavy'
  | 'embedding';

export interface ModelCapabilityFlags {
  text: boolean;
  vision: boolean;
  audio: boolean;
  tools: boolean;
  reasoning: boolean;
  embedding: boolean;
}

export interface ProviderKeyEntry {
  id: string;
  label: string;
  /** Masked preview returned to UI (e.g. AIza...9f2a) — raw secret kept in server vault */
  maskedKey: string;
  enabled: boolean;
  /** Optional cloud project identifier (e.g. Google Cloud Project ID — Gemini quota is per-project) */
  projectId?: string;
  failureCount: number;
  lastUsedAt?: string;
  lastError?: string;
  disabledReason?: string;
  cooldownUntil?: string;
  dailyExhaustedUntil?: string;
  rpmLimit?: number;
  tpmLimit?: number;
  requestsLastMinute?: number;
  tokensLastMinute?: number;
  activeConcurrency?: number;
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
  capabilities?: ModelCapabilityFlags;
  qualityScore?: number;
  speedScore?: number;
}

export type KeyModelStatus =
  | 'available'
  | 'rpm_cooldown'
  | 'daily_exhausted'
  | 'disabled_invalid'
  | 'error';

export interface KeyModelMatrixEntry {
  keyId: string;
  keyLabel: string;
  maskedKey: string;
  provider: ProviderId;
  projectId?: string;
  modelId: string;
  contextWindow: number;
  capabilities: ModelCapabilityFlags;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isFree: boolean;
  status: KeyModelStatus;
  cooldownUntil?: string;
  resetAt?: string;
  reason?: string;
  requestsLastMinute: number;
  tokensLastMinute: number;
  rpmLimit: number;
  tpmLimit: number;
  successCount: number;
  failureCount: number;
  verificationPassCount: number;
  verificationFailCount: number;
  avgLatencyMs: number;
  discoveredAt: string;
  lastUsedAt?: string;
}

export interface RoutedCallLogEntry {
  id: string;
  timestamp: string;
  taskType: TaskType;
  provider: ProviderId;
  modelId: string;
  keyId: string;
  keyLabel: string;
  maskedKey: string;
  projectId?: string;
  switchReason?: string;
  degradedMode: boolean;
  strictVerificationRequired: boolean;
  queued?: boolean;
  cached?: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  error?: string;
}

export interface QueuedRequestSummary {
  id: string;
  taskType: TaskType;
  promptPreview: string;
  agentId?: string;
  createdAt: string;
  readyAt?: string;
  attempts: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  lastReason: string;
}

export interface OllamaBenchmarkTelemetry {
  model: string;
  tokensPerSec: number;
  latencyMs: number;
  evaluatedAt: string;
  hardwareTier?: HardwareTierId;
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
  /** M40: Per-agent fallback model chain */
  modelChain?: Array<{ providerId: ProviderId; modelId: string }>;
  /** Ú55: Agent capability benchmark */
  benchmarkScore?: number;
  lastBenchmarkedAt?: string;
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
  /** M17 & M31: Isolated git branch and optional git worktree path bound to this Kanban task */
  gitBranch?: string;
  worktreePath?: string;
  /** M58: Sprint / timebox estimation vs actual tracking */
  sprintName?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
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
  | 'security'
  | 'skill'
  | 'nightshift';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditLogType;
  sourceAgentId: string;
  sourceAgentName: string;
  message: string;
  verifiedExecution?: boolean;
  metadata?: Record<string, unknown>;
  /** M117: SHA-256 cryptographic hash-chain */
  prevHash?: string;
  hash?: string;
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
  /** M46: Plain-language morning summary */
  morningDigest?: string;
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
  /** M34: Per-bubble token & latency readout */
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costUsd?: number;
  toolTrace?: ToolExecutionStep[];
  artifactIds?: string[];
  /** M36: Council consensus voting matrix */
  councilVotes?: Array<{
    agentId: string;
    agentName: string;
    verdict: 'approve' | 'caution' | 'reject';
    confidence: number;
    rationale: string;
  }>;
  /** M32: Message fork ancestry */
  forkedFromMessageId?: string;
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
  | 'email_send'
  | 'destructive_shell';

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
  /** M42: Optional expiry & LAN IP CIDR allowlist */
  expiresAt?: string;
  allowedIps?: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ProviderHealthMetric {
  provider: ProviderId;
  totalCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  lastLatencyMs: number | null;
  lastErrorAt?: string;
  /** M77 & M80: Circuit breaker + TTFT & tok/sec */
  avgTtftMs?: number;
  avgTokensPerSec?: number;
  circuitState?: 'closed' | 'open' | 'half_open';
}

export interface GatewayAnalytics {
  totalProxyRequests: number;
  cacheHits: number;
  cacheMisses: number;
  savedUsd: number;
  guardrailsBlocked: number;
  spendByProvider: Record<ProviderId, number>;
  spendByModel: Record<string, number>;
  /** M39: Per-provider live latency & error leaderboard */
  providerHealth?: Record<ProviderId, ProviderHealthMetric>;
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

/** Ú17 & M51: Visual Workflow Automation & Multi-Step Pipelines */
export interface WorkflowStep {
  type: 'agent_prompt' | 'web_search' | 'kanban_create' | 'notify' | 'http_call';
  target: string;
  payload: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: 'manual' | 'cron' | 'webhook' | 'uptime_down' | 'feed_item' | 'ha_state';
  triggerConfig: string;
  conditionExpr?: string;
  actionType: 'agent_prompt' | 'kanban_create' | 'notify';
  actionTarget: string;
  actionPayload: string;
  /** M51: Optional sequential pipeline steps */
  steps?: WorkflowStep[];
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
  /** M41, M60, Ú45, Ú46, Ú59: Ollama auto-unload, Weather, Voice & Mobile */
  ollamaAutoUnloadMinutes: number;
  weatherLocation: string;
  piperTtsBinary: string;
  wakeWordEnabled: boolean;
  wakeWordPhrase: string;
  /** M30: Overview Widgets */
  dashboardWidgets: DashboardWidgetConfig[];
  /** Batch 3: Zero-friction full autonomy + theme + privacy + scheduler controls */
  fullAutonomousMode: boolean;
  themeMode: 'light' | 'dark' | 'high_contrast';
  privacyMaskEnabled: boolean;
  nightShiftEnabled: boolean;
  nightShiftIntervalMinutes: number;
  redTeamEnabled: boolean;
  supervisorStrictness: 'permissive' | 'balanced' | 'paranoid';
  retentionDays: number;
  softDowngradeOnBudget: boolean;
  defaultCurrency: 'HUF' | 'EUR' | 'USD';
  telegramInlineButtons: boolean;
  lastNightShiftAt?: string | null;
  lanSubnetAllowlist?: string[];
  totpEnabled?: boolean;
  /** Batch 4 (M168, M189, M190, M200, Ú225, Ú246): Adaptive Pi & Telegram controls */
  telegramAllowedChatIds?: string[];
  telegramDigestTime?: string;
  telegramSilentNight?: boolean;
  cpuLoadThrottleThreshold?: number;
  digitalDetoxMode?: boolean;
  deadManSwitchDays?: number;
  agentTemperatureBias?: number;
  /** Batch 5: Hardware-Adaptive Optimization Engine, Voice Reply, Proactive Loops & GPIO Thermal Fan */
  hardwareAutoOptimize?: boolean;
  detectedHardwareTier?: HardwareTierId;
  ramWatchdogThresholdPercent?: number;
  sdCardSparingMode?: boolean;
  hybridLocalFirst?: boolean;
  telegramVoiceReplyEnabled?: boolean;
  morningBriefTime?: string;
  eveningBriefTime?: string;
  inboxTriageEnabled?: boolean;
  selfHealingDaemonEnabled?: boolean;
  gpioFanPin?: number;
  gpioFanTempThresholdC?: number;
  lastMigrationRecord?: MigrationRunRecord | null;
  /** Batch 6: Apex Autonomy Rules, Mesh Offload, Docker Watchtower & LAN Sentinel */
  lanSentinelAutoAlert?: boolean;
  dockerAutoHealEnabled?: boolean;
  meshOffloadEnabled?: boolean;
  speedtestIntervalMinutes?: number;
  /** Batch 7 (M261–M360 & Ú261–Ú360): Operating Modes, UI Density, Local LLM Tuning & Telegram Stream */
  operatingMode?: OperatingModeId;
  compactUiMode?: boolean;
  compactLocalPrompt?: boolean;
  timezone?: string;
  telegramStreamEdit?: boolean;
  telegramMessageDebounceMs?: number;
  currencyAlertThresholdHuf?: number;
  /** Batch 8 (Ú361–Ú560): Omni-Agent Persona, Context, Self-Critique & Communication Tone */
  activePersonaId?: string;
  activeUserContextId?: string;
  adaptiveVerbosity?: 'concise' | 'balanced' | 'exhaustive';
  proactiveFollowUpSuggestions?: boolean;
  autoInjectFactVault?: boolean;
  autoExtractActionItems?: boolean;
  agentSelfCritiquePass?: boolean;
  defaultResponseTone?: 'professional' | 'friendly' | 'direct' | 'socratic';
  /** Veszélyes Zóna: host shell exec jóváhagyás nélküli engedélyezése (alapból false, fullAutonomousMode NEM kapcsolja be!) */
  dangerousExecAutoApprove?: boolean;
  /** Teljes autonómia egygombos profil + előző 3 kapcsoló elmentett állapota */
  fullAutonomyProfileEnabled?: boolean;
  fullAutonomyPreviousFlags?: {
    hostPermissionsGranted: boolean;
    fullAutonomousMode: boolean;
    dangerousExecAutoApprove: boolean;
  } | null;
  /** Konfigurálható parancsfuttatási időkorlátok (másodperc) */
  execTimeoutSeconds?: number;
  longExecTimeoutSeconds?: number;
  /** Teljes autonómia alatt napi automatikus Phoenix pillanatkép */
  autoPhoenixSnapshotInFullAutonomy?: boolean;
  lastPhoenixSnapshotAt?: string | null;
  /** Külső audit-lánc horgony: napi fej-hash küldése Telegramra */
  sendAuditAnchorToTelegram?: boolean;
  lastAuditAnchorSentDate?: string | null;
  /** Totális autonómia mód és sérthetetlen védőgaranciák */
  totalAutonomyEnabled?: boolean;
  totalAutonomyActivatedAt?: string | null;
  dailyCloudCostFallbackToOllama?: boolean;
  autoWatchdogRollbackEnabled?: boolean;
  watchdogTimeoutSeconds?: number;
  circuitBreakerMaxFailures?: number;
  circuitBreakerDailyActionCap?: number;
  exceptionTelegramSummaryHour?: number;
  lastExceptionDigestDate?: string | null;
  lockdownActive?: boolean;
  lockdownReason?: string | null;
  lockdownActivatedAt?: string | null;
  /** Smart Multi-Key / Task Routing & Hardware-Aware Ollama extensions */
  modelBlocklist?: string[];
  taskModelRankingOverrides?: Partial<Record<TaskType, string[]>>;
  providerOrder?: ProviderId[];
  ollamaFastModel?: string;
  ollamaCodeModel?: string;
  ollamaVisionModel?: string;
  ollamaBenchmark?: OllamaBenchmarkTelemetry | null;
  ollamaPendingPullModels?: string[];
  ollamaCleanupSuggestions?: string[];
}

export interface SudoCheckStatus {
  checkedAt: string;
  username: string;
  sudoInstalled: boolean;
  hasNopasswd: boolean;
  isRoot: boolean;
  message: string;
  visudoCommand: string;
  sudoersLine: string;
}

export interface PhoenixAutonomyStatus {
  fullAutonomyActive: boolean;
  autoDailyEnabled: boolean;
  lastSnapshotAt: string | null;
  ageHours: number | null;
  staleWarning: boolean;
  warningMessage: string | null;
}

/** Ú31: Deep Research Report */
export interface ResearchReport {
  id: string;
  query: string;
  subQueries: string[];
  summaryMarkdown: string;
  sources: Array<{ title: string; url: string }>;
  createdAt: string;
}

/** Ú32: Saved API Studio Request */
export interface SavedApiRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headersJson: string;
  body: string;
  lastStatus?: number;
  lastLatencyMs?: number;
  lastResponse?: string;
  updatedAt: string;
}

/** Ú33: Database Explorer Connection */
export interface DatabaseConnection {
  id: string;
  name: string;
  engine: 'sqlite' | 'postgres';
  target: string;
  lastTestedAt?: string;
  status?: string;
}

/** Ú36: Page Watchdog */
export interface WatchedPage {
  id: string;
  name: string;
  url: string;
  lastHash?: string;
  lastExcerpt?: string;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  changeCount: number;
  lastError?: string;
}

/** Ú48: Spaced Repetition Flashcard (SM-2) */
export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  tags: string[];
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  createdAt: string;
}

/** Ú50 & M47: Second Brain Daily Journal */
export interface DailyJournalEntry {
  id: string;
  date: string;
  mood: number;
  energy: number;
  topGoals: string[];
  completedNotes: string;
  gratitudeOrNotes: string;
  obsidianPath?: string;
  createdAt: string;
}

/** Ú51: Shared Lists synced with Telegram */
export interface SharedListItem {
  id: string;
  text: string;
  done: boolean;
  addedBy: string;
  createdAt: string;
}

export interface SharedList {
  id: string;
  name: string;
  items: SharedListItem[];
}

/** Ú52: Subscriptions & Warranties */
export interface SubscriptionItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'once';
  nextDueDate: string;
  reminderDaysBefore: number;
  notes?: string;
}

/** Ú55: Agent Benchmark Run */
export interface AgentBenchmarkRun {
  id: string;
  agentId: string;
  agentName: string;
  score: number;
  passed: number;
  total: number;
  avgLatencyMs: number;
  details: string[];
  createdAt: string;
}

/** B1 & B2: Autonomous Mission & Dynamic Custom Tool */
export interface DynamicToolDef {
  id: string;
  name: string;
  description: string;
  kind: 'http_get' | 'http_post' | 'sandbox_js';
  targetOrCode: string;
  /** M85: Typed JSON argument hints */
  argsSchema?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

export interface AutonomousMission {
  id: string;
  goal: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  steps: Array<{ title: string; status: 'pending' | 'done' | 'failed'; detail: string }>;
  finalSummary?: string;
  createdAt: string;
  completedAt?: string;
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
  signatureVerificationActive?: boolean;
  signatureWarning?: string | null;
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
  keyModelMatrix?: KeyModelMatrixEntry[];
  routedCallLogs?: RoutedCallLogEntry[];
  queuedLlmRequests?: QueuedRequestSummary[];
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
  /** Ú31–Ú55 & B1–B2 collections */
  researchReports: ResearchReport[];
  savedApiRequests: SavedApiRequest[];
  databaseConnections: DatabaseConnection[];
  watchedPages: WatchedPage[];
  flashcards: FlashcardItem[];
  dailyJournals: DailyJournalEntry[];
  sharedLists: SharedList[];
  subscriptions: SubscriptionItem[];
  agentBenchmarks: AgentBenchmarkRun[];
  dynamicTools: DynamicToolDef[];
  missions: AutonomousMission[];
  /** Batch 3 (Ú61–Ú160) domain collections */
  crmContacts: CrmContact[];
  packages: PackageOrder[];
  vehicleMaintenance: VehicleMaintenanceItem[];
  homeInventory: HomeInventoryItem[];
  sharedLinks: SharedPortalLink[];
  bookmarks: BookmarkEntry[];
  mealPlan: MealPlanEntry[];
  wolDevices: WolDevice[];
  clusterNodes: ClusterNode[];
  notaryRecords: NotaryRecord[];
  nightShiftRuns: NightShiftRun[];
  timeCapsules: TimeCapsuleDigest[];
  budgetEnvelopes: BudgetEnvelope[];
  clipboardHistory: ClipboardHistoryItem[];
  /** Batch 4 (M161–M260 & Ú161–Ú260) domain collections */
  priceWatches: PriceWatchItem[];
  documentSafe: DocumentSafeItem[];
  hostedMiniApps: HostedMiniApp[];
  apiMocks: ApiMockEndpoint[];
  ephemeralNotes: EphemeralNote[];
  lifeGoals: LifeGoalOkr[];
  customWidgets: CustomDashboardWidget[];
  debateRuns: SwarmDebateRun[];
  missionCheckpoints: MissionCheckpoint[];
  userXp: UserXpProfile;
  backgroundJobs: BackgroundWorkerJob[];
  telegramOutbox: TelegramOutboxItem[];
  knownLanMacs: KnownLanMac[];
  postMortems: PostMortemReport[];
  /** Batch 5: Hardware profile snapshot, Visual Page Change Watch & Proactive Rule Events */
  hardwareProfile?: HardwareAdaptiveProfile | null;
  visualWatchItems?: VisualWatchItem[];
  proactiveEvents?: ProactiveRuleEvent[];
  /** Batch 6: Apex Event-Action Rules, Smart Reminders, Quick Macros, LAN Speedtests, Mesh Dispatches & Forensics */
  autonomyRules?: AutonomyRule[];
  smartReminders?: SmartReminder[];
  quickMacros?: QuickMacro[];
  networkSpeeds?: NetworkSpeedRecord[];
  meshDispatches?: MeshDispatchRecord[];
  lastForensicReport?: ForensicReportSnapshot | null;
  /** Batch 7: Knowledge, Smart Home Timers, Homelab Replay/Scan/Drop, Personal OS & Shared Scratchpad */
  decisionLogs?: DecisionLogEntry[];
  quoteDeck?: QuoteDeckItem[];
  countdownTimers?: CountdownTimerItem[];
  medicationReminders?: MedicationReminder[];
  lentItems?: LentItemRecord[];
  fuelLogs?: FuelLogRecord[];
  savingsGoals?: SavingsGoalItem[];
  dailyTop3?: DailyTop3State | null;
  tripPlans?: TripPlanItem[];
  mediaBacklog?: MediaBacklogItem[];
  fixedExpenses?: FixedExpenseItem[];
  currencyRates?: CurrencyRatesSnapshot | null;
  lanPortScans?: LanPortScanResult[];
  webhookHistory?: WebhookReplayRecord[];
  dropShareTokens?: DropShareToken[];
  sharedScratchpad?: string;
  /** Batch 8 (Ú361–Ú560): Omni-Agent Persona, Cognitive Studio, Study/Meeting, Dev Copilot & Life-OS */
  agentPersonas?: AgentPersonaProfile[];
  userContextProfiles?: UserContextProfile[];
  writingStyleSamples?: WritingStyleSample[];
  /** Totális autonómia, biztonsági pillanatképek, megszakító, hálózati leltár & világmodell */
  securitySnapshots?: SecuritySnapshot[];
  autonomyDecisions?: AutonomyDecisionRecord[];
  circuitBreakerTasks?: CircuitBreakerTaskRecord[];
  exceptionNotificationsQueue?: ExceptionDigestEntry[];
  lanDeviceInventory?: LanDeviceInventoryItem[];
  pendingDevicePrompts?: PendingDeviceCredentialPrompt[];
  deviceActionHistory?: DeviceAdapterActionRecord[];
  worldModelNodes?: WorldModelNode[];
  worldModelEdges?: WorldModelEdge[];
  weeklyEvaluations?: WeeklySelfEvaluationReport[];
  goalCycles?: AutonomousGoalCycle[];
  factVault?: VerifiedFactItem[];
  goalTrees?: HierarchicalGoalNode[];
  agentHandoffs?: AgentHandoffTask[];
  decisionMatrixRuns?: DecisionMatrixRun[];
  scenarioSimulations?: ScenarioSimulation[];
  redTeamCritiques?: RedTeamCritique[];
  studyPlans?: StudyPlanItem[];
  meetingBriefs?: MeetingBriefRecord[];
  glossaryTerms?: GlossaryTermItem[];
  readingDigests?: ReadingDigestItem[];
  codeSnippets?: CodeSnippetVaultItem[];
  architectureBlueprints?: ArchitectureBlueprint[];
  incidentPlaybooks?: IncidentPlaybook[];
  communicationDrafts?: CommunicationDraft[];
  wellnessLogs?: WellnessCheckinItem[];
  smartChecklists?: SmartChecklistTemplate[];
  timeBlocks?: TimeBlockSlot[];
  auditChainAnchor?: { prevHash: string; prunedCount: number };
  lastActivityAt: string;
  activeExplicitTaskAgentId: string | null;
}

/** Ú61: Night Shift Autonomous Backlog Coder Run */
export interface NightShiftRun {
  id: string;
  startedAt: string;
  completedAt: string;
  tasksCompleted: number;
  reportSummary: string;
  actionsTaken: string[];
}

/** Ú91: Personal CRM */
export interface CrmContact {
  id: string;
  name: string;
  relation: string;
  email?: string;
  phone?: string;
  birthday?: string;
  lastContactedAt: string;
  nextFollowUpAt?: string;
  notes?: string;
}

/** Ú99: Package & Delivery Tracker */
export interface PackageOrder {
  id: string;
  title: string;
  carrier: string;
  trackingNumber: string;
  status: 'ordered' | 'in_transit' | 'out_for_delivery' | 'delivered';
  eta?: string;
  notes?: string;
  updatedAt: string;
}

/** Ú113: Home/Pantry Inventory */
export interface HomeInventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiresAt?: string;
  updatedAt: string;
}

/** Ú114: Weekly Meal Plan */
export interface MealPlanEntry {
  id: string;
  day: string;
  mealName: string;
  ingredients: string[];
  calories?: number;
}

/** Ú115: Vehicle & Home Maintenance */
export interface VehicleMaintenanceItem {
  id: string;
  vehicleOrAsset: string;
  task: string;
  dueAtDate?: string;
  dueAtKm?: number;
  done: boolean;
  notes?: string;
}

/** Ú100: Read-only Shareable Portal Link */
export interface SharedPortalLink {
  id: string;
  token: string;
  title: string;
  resourceType: 'list' | 'report' | 'artifact';
  resourceId: string;
  createdAt: string;
  expiresAt?: string;
  views: number;
}

/** Ú107: Read-It-Later Offline Bookmark */
export interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  archivedExcerpt: string;
  tags: string[];
  read: boolean;
  createdAt: string;
}

/** Ú120: Wake-on-LAN Device */
export interface WolDevice {
  id: string;
  name: string;
  mac: string;
  broadcastIp: string;
  lastWokenAt?: string;
}

/** Ú152 & Ú153: Multi-Node Cluster & GPU Offload */
export interface ClusterNode {
  id: string;
  name: string;
  role: 'gpu_ollama' | 'worker' | 'storage' | 'pi' | 'vps' | 'desktop';
  url: string;
  ollamaUrl?: string;
  status: 'unknown' | 'online' | 'offline';
  latencyMs?: number | null;
  lastSeenAt?: string;
  gpuVramMb?: number;
}

/** Ú150: SHA-256 Document Hash Notary */
export interface NotaryRecord {
  id: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  note?: string;
  notarizedAt: string;
}

/** Ú157: Weekly AI Time Capsule */
export interface TimeCapsuleDigest {
  id: string;
  periodLabel: string;
  completedTasks: number;
  newMemories: number;
  spendUsd: number;
  summaryMarkdown: string;
  createdAt: string;
}

/** Ú147: Budget Envelope */
export interface BudgetEnvelope {
  id: string;
  category: string;
  monthlyLimit: number;
  currency: string;
  spent: number;
}

/** Ú90: Smart Text / Clipboard History */
export interface ClipboardHistoryItem {
  id: string;
  content: string;
  kind: string;
  createdAt: string;
}

/** Ú210: Webshop Price Watch */
export interface PriceWatchItem {
  id: string;
  name: string;
  url: string;
  currency: string;
  targetPrice: number;
  lastPrice: number | null;
  priceHistory: Array<{ price: number; checkedAt: string }>;
  lastCheckedAt: string | null;
  lastError?: string;
}

/** Ú209: Warranty, Contract & Document Safe */
export interface DocumentSafeItem {
  id: string;
  title: string;
  category: 'warranty' | 'contract' | 'identity' | 'insurance' | 'other';
  expiresAt: string;
  issuer?: string;
  notes?: string;
  createdAt: string;
}

/** Ú206: Self-Hosted Prompt-Built Mini-App */
export interface HostedMiniApp {
  id: string;
  slug: string;
  title: string;
  description: string;
  htmlContent: string;
  createdAt: string;
  updatedAt: string;
}

/** Ú218: Live API Mock Endpoint */
export interface ApiMockEndpoint {
  id: string;
  slug: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  statusCode: number;
  responseJson: string;
  hitCount: number;
  createdAt: string;
}

/** Ú244 & Ú257: Ephemeral / Burn-After-Reading Note */
export interface EphemeralNote {
  id: string;
  token: string;
  title: string;
  content: string;
  oneTimeRead: boolean;
  expiresAt: string;
  readCount: number;
  burned: boolean;
  createdAt: string;
}

/** Ú254: Life Compass OKR Goal */
export interface LifeGoalOkr {
  id: string;
  title: string;
  quarter: string;
  progressPercent: number;
  milestones: Array<{ id: string; title: string; done: boolean; kanbanCardId?: string }>;
  createdAt: string;
}

/** Ú258: Custom Dynamic Overview Widget */
export interface CustomDashboardWidget {
  id: string;
  title: string;
  kind: 'http_json' | 'shell_cmd';
  source: string;
  lastValue?: string;
  lastUpdatedAt?: string;
}

/** Ú226: Multi-Agent Debate Theater */
export interface SwarmDebateRun {
  id: string;
  topic: string;
  proArgument: string;
  contraArgument: string;
  judgeVerdict: string;
  winnerSide: 'pro' | 'contra' | 'balanced';
  createdAt: string;
}

/** M163: Interrupted Mission Crash-Recovery Checkpoint */
export interface MissionCheckpoint {
  id: string;
  missionId: string;
  goal: string;
  completedStepIndices: number[];
  partialOutputs: string[];
  updatedAt: string;
}

/** Ú237: Gamified Productivity XP & Streaks */
export interface UserXpProfile {
  xp: number;
  level: number;
  streakDays: number;
  lastAwardDate: string | null;
  badges: string[];
  recentEvents: Array<{ reason: string; points: number; at: string }>;
}

/** Ú250: Background Worker Job Tracker */
export interface BackgroundWorkerJob {
  id: string;
  label: string;
  kind: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progressPercent: number;
  detail: string;
  startedAt: string;
  completedAt?: string;
}

/** M193: Offline Telegram Outbox Retry Queue */
export interface TelegramOutboxItem {
  id: string;
  text: string;
  chatId?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

/** Ú194: Known LAN MAC Registry for Intruder Detection */
export interface KnownLanMac {
  mac: string;
  label: string;
  ip: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** Ú253: Automatic Post-Mortem Diagnostic Report */
export interface PostMortemReport {
  id: string;
  title: string;
  rootCause: string;
  affectedEntries: number;
  remediationSteps: string[];
  createdAt: string;
}

/** Batch 5: Hardware-Adaptive Optimization Tiers & Profile */
export type HardwareTierId =
  | 'ultra_light_pi'
  | 'mid_sbc_vps'
  | 'standard_desktop'
  | 'workstation_gpu';

export interface HardwareAdaptiveProfile {
  tier: HardwareTierId;
  tierLabel: string;
  arch: string;
  cpuCores: number;
  ramTotalMb: number;
  ramAvailableMb: number;
  swapTotalMb: number;
  storageKind: 'sd_or_emmc' | 'ssd_or_nvme' | 'unknown';
  hasGpu: boolean;
  gpuName: string;
  recommendedOllamaModel: string;
  recommendedNumCtx: number;
  recommendedHeapMb: number;
  recommendedConcurrency: number;
  recommendedHeartbeatMinutes: number;
  recommendedNightShiftMinutes: number;
  recommendedDreamIdleMinutes: number;
  recommendedOllamaIdleUnloadMinutes: number;
  recommendedCpuThreshold: number;
  recommendedRamWatchdogPercent: number;
  sdCardSparingRecommended: boolean;
  hybridLocalFirstRecommended: boolean;
  detectedAt: string;
  appliedNotes: string[];
  /** Extended hardware-aware local Ollama selector fields */
  boardModel?: string;
  isRaspberryPi?: boolean;
  ramFreeMb?: number;
  diskFreeMb?: number;
  gpuVendor?: 'nvidia' | 'amd' | 'apple' | 'intel_igpu' | 'none';
  gpuVramMb?: number;
  cpuFlags?: string[];
  zramPresent?: boolean;
  recommendedFastModel?: string;
  recommendedCodeModel?: string;
  recommendedEmbeddingModel?: string;
  recommendedVisionModel?: string;
  recommendedGpuLayers?: number;
  recommendedParallelism?: number;
  singleModelMutex?: boolean;
  estimatedTokensPerSec?: number;
}

/** Batch 5: One-Shot SSH Host Migration Record */
export interface MigrationRunRecord {
  id: string;
  targetIp: string;
  sshPort: number;
  username: string;
  targetAppPort: number;
  stopOldInstance: boolean;
  status: 'idle' | 'running' | 'completed' | 'failed';
  stage: string;
  targetHardwareSummary?: string;
  newUrl?: string;
  logs: string[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/** Batch 5: Visual Page Change Detector Item */
export interface VisualWatchItem {
  id: string;
  name: string;
  url: string;
  lastScreenshotHash?: string;
  lastDomHash?: string;
  lastCapturedBase64?: string;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  changeCount: number;
  lastStatusNote?: string;
}

/** Batch 5: Proactive Second Self Event */
export interface ProactiveRuleEvent {
  id: string;
  kind: 'morning_brief' | 'evening_brief' | 'inbox_triage' | 'self_heal' | 'ram_watchdog' | 'thermal_fan';
  title: string;
  summary: string;
  notifiedTelegram: boolean;
  createdAt: string;
}

/** Batch 6: Natural Event-Action Rule Engine ("Ha ez történik -> Csináld ezt") */
export type AutonomyRuleTriggerKind =
  | 'ram_above'
  | 'cpu_above'
  | 'temp_above'
  | 'disk_above'
  | 'uptime_down'
  | 'new_lan_mac'
  | 'manual_event';

export type AutonomyRuleActionKind =
  | 'ram_cleanup'
  | 'telegram_notify'
  | 'run_agent_prompt'
  | 'gpio_set'
  | 'wol_wake'
  | 'docker_heal'
  | 'speak_tts';

export interface AutonomyRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerKind: AutonomyRuleTriggerKind;
  thresholdValue: number;
  actionKind: AutonomyRuleActionKind;
  actionTarget: string;
  cooldownMinutes: number;
  triggerCount: number;
  lastTriggeredAt?: string;
  createdAt: string;
}

/** Batch 6: Persistent Smart Reminder ("/emlekezteto 15m ...") */
export interface SmartReminder {
  id: string;
  message: string;
  triggerAt: string;
  channel: 'telegram' | 'web' | 'both';
  fired: boolean;
  firedAt?: string;
  createdAt: string;
}

/** Batch 6: 1-Tap Composite Quick Macro */
export type MacroStepKind =
  | 'ram_watchdog'
  | 'sd_flush'
  | 'ollama_unload'
  | 'docker_heal'
  | 'lan_sentinel'
  | 'forensic_snapshot'
  | 'morning_brief'
  | 'self_heal';

export interface QuickMacro {
  id: string;
  slug: string;
  name: string;
  description: string;
  steps: MacroStepKind[];
  runCount: number;
  lastRunAt?: string;
  lastSummary?: string;
}

/** Batch 6: Network Latency & Speedtest History */
export interface NetworkSpeedRecord {
  id: string;
  pingMs: number | null;
  downloadMbps: number | null;
  lanDeviceCount: number;
  unknownMacCount: number;
  checkedAt: string;
  note: string;
}

/** Batch 6: Swarm Mesh Node Dispatch History */
export interface MeshDispatchRecord {
  id: string;
  nodeName: string;
  nodeUrl: string;
  promptPreview: string;
  latencyMs: number;
  status: 'ok' | 'fallback_local' | 'failed';
  responsePreview: string;
  createdAt: string;
}

/** Batch 6: Forensic Root-Cause Host Snapshot */
export interface ForensicReportSnapshot {
  id: string;
  createdAt: string;
  topMemoryProcesses: string[];
  failedUnits: string[];
  oomKernelHits: string[];
  inodeUsageLines: string[];
  diagnosisSummary: string;
  recommendations: string[];
}

/** Batch 7: Operating Modes (Ú346) */
export type OperatingModeId = 'normal' | 'focus' | 'travel' | 'emergency' | 'chill';

/** Batch 7: Knowledge & Decision Studio (Ú265, Ú270) */
export interface DecisionLogEntry {
  id: string;
  title: string;
  choiceMade: string;
  alternatives: string;
  expectedOutcome: string;
  reviewDate: string;
  status: 'active' | 'reviewed_success' | 'reviewed_revised';
  createdAt: string;
}

export interface QuoteDeckItem {
  id: string;
  quote: string;
  author: string;
  source?: string;
  pinned?: boolean;
  createdAt: string;
}

/** Batch 7: Smart Home & Personal Care (Ú282, Ú292) */
export interface CountdownTimerItem {
  id: string;
  label: string;
  durationSec: number;
  endsAt: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface MedicationReminder {
  id: string;
  name: string;
  dosage: string;
  timeOfDay: string;
  takenDates: string[];
  createdAt: string;
}

/** Batch 7: Homelab, Network, Webhook Replay & LAN Drop (Ú301, Ú307, Ú314) */
export interface LanPortScanResult {
  id: string;
  host: string;
  openPorts: Array<{ port: number; service: string; latencyMs: number }>;
  scannedAt: string;
}

export interface WebhookReplayRecord {
  id: string;
  slug: string;
  headers: Record<string, string>;
  bodyJson: string;
  statusOk: boolean;
  replayCount: number;
  receivedAt: string;
  lastReplayedAt?: string;
}

export interface DropShareToken {
  token: string;
  fileName: string;
  expiresAt: string;
  downloads: number;
  maxDownloads: number;
  createdAt: string;
}

/** Batch 7: Finance, Life-OS & Daily Planner (Ú326–Ú343) */
export interface CurrencyRatesSnapshot {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: string;
}

export interface FixedExpenseItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  dueDay: number;
  paidThisMonth: boolean;
}

export interface TripPlanItem {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  notes: string;
  packingList: Array<{ id: string; text: string; packed: boolean }>;
  createdAt: string;
}

export interface LentItemRecord {
  id: string;
  itemName: string;
  personName: string;
  lentAt: string;
  dueReturnAt?: string;
  returned: boolean;
  returnedAt?: string;
}

export interface FuelLogRecord {
  id: string;
  date: string;
  distanceKm: number;
  liters: number;
  totalCost: number;
  consumptionPer100Km: number;
  costPerKm: number;
  note?: string;
}

export interface MediaBacklogItem {
  id: string;
  title: string;
  kind: 'book' | 'movie' | 'series' | 'course' | 'game';
  status: 'queued' | 'in_progress' | 'done';
  rating?: number;
  note?: string;
  createdAt: string;
}

export interface SavingsGoalItem {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline?: string;
  createdAt: string;
}

export interface DailyTop3State {
  date: string;
  items: Array<{ id: string; text: string; done: boolean }>;
}

/** Batch 8 (Ú361–Ú560): Omni-Agent Persona, Context, Cognitive, Study, Dev Copilot & Wellness */
export interface AgentPersonaProfile {
  id: string;
  name: string;
  roleTitle: string;
  tone: string;
  systemGuidance: string;
  strengths: string[];
  builtIn?: boolean;
}

export interface UserContextProfile {
  id: string;
  name: string;
  focusArea: string;
  rules: string;
  preferredVerbosity: 'concise' | 'balanced' | 'exhaustive';
}

export interface WritingStyleSample {
  id: string;
  label: string;
  avgSentenceWords: number;
  lexicalDiversity: number;
  formalityScore: number;
  signaturePhrases: string[];
  createdAt: string;
}

export interface VerifiedFactItem {
  id: string;
  category: string;
  factKey: string;
  factValue: string;
  confidence: number;
  updatedAt: string;
}

export interface HierarchicalGoalNode {
  id: string;
  title: string;
  horizon: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  milestones: Array<{ id: string; title: string; weight: number; done: boolean }>;
  progressPercent: number;
  createdAt: string;
}

export interface AgentHandoffTask {
  id: string;
  title: string;
  stage: 'planner' | 'builder' | 'reviewer' | 'verifier' | 'completed';
  notes: Array<{ stage: string; author: string; summary: string; at: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionMatrixRun {
  id: string;
  title: string;
  criteria: Array<{ name: string; weight: number }>;
  options: Array<{ name: string; scores: number[]; weightedTotal: number }>;
  winnerName: string;
  marginPercent: number;
  createdAt: string;
}

export interface ScenarioSimulation {
  id: string;
  topic: string;
  optimistic: { summary: string; probabilityPct: number; triggers: string[] };
  realistic: { summary: string; probabilityPct: number; triggers: string[] };
  pessimistic: { summary: string; probabilityPct: number; mitigations: string[] };
  createdAt: string;
}

export interface RedTeamCritique {
  id: string;
  proposal: string;
  riskScore: number;
  blindSpots: string[];
  failureModes: string[];
  recommendations: string[];
  createdAt: string;
}

export interface StudyPlanItem {
  id: string;
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  modules: Array<{ id: string; title: string; keyQuestion: string; completed: boolean }>;
  createdAt: string;
}

export interface MeetingBriefRecord {
  id: string;
  title: string;
  summary: string;
  actionItems: Array<{ id: string; text: string; owner?: string; dueHint?: string; exportedToKanban: boolean }>;
  openQuestions: string[];
  createdAt: string;
}

export interface GlossaryTermItem {
  id: string;
  term: string;
  domain: string;
  definition: string;
  example?: string;
  createdAt: string;
}

export interface ReadingDigestItem {
  id: string;
  title: string;
  tldrOneLine: string;
  bulletPoints: string[];
  wordCount: number;
  estimatedMinutes: number;
  readabilityScore: number;
  createdAt: string;
}

export interface CodeSnippetVaultItem {
  id: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
  useCount: number;
  createdAt: string;
}

export interface ArchitectureBlueprint {
  id: string;
  name: string;
  pattern: 'microservices' | 'iot_edge' | 'rag_pipeline' | 'event_driven' | 'monolith_sqlite';
  mermaidDiagram: string;
  components: string[];
  capacityNotes: string[];
  createdAt: string;
}

export interface IncidentPlaybook {
  id: string;
  slug: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  symptoms: string[];
  steps: Array<{ id: string; commandOrCheck: string; done: boolean }>;
}

export interface CommunicationDraft {
  id: string;
  purpose: string;
  tone: 'formal' | 'direct' | 'empathetic' | 'assertive';
  subject: string;
  body: string;
  createdAt: string;
}

export interface WellnessCheckinItem {
  id: string;
  date: string;
  sleepHours: number;
  waterMl: number;
  energyScore: number;
  movementMinutes: number;
  note?: string;
}

export interface SmartChecklistTemplate {
  id: string;
  title: string;
  category: string;
  items: Array<{ id: string; label: string; checked: boolean }>;
}

export interface TimeBlockSlot {
  id: string;
  date: string;
  startHour: string;
  endHour: string;
  title: string;
  kind: 'deep_work' | 'admin' | 'meeting' | 'recovery';
}

export interface OmniCapabilityEntry {
  code: string;
  category: string;
  title: string;
  summary: string;
  endpointOrTool: string;
}

export type SandboxIsolationMode =
  | 'docker_no_network'
  | 'bwrap_sandbox'
  | 'unshare_net_sandbox'
  | 'isolated_tmpfs_subprocess';

export interface SandboxCapabilities {
  supervisorBackend: SandboxIsolationMode;
  jsSandboxBackend: 'docker_no_network' | 'bwrap_sandbox' | 'unavailable';
  jsSandboxAvailable: boolean;
  nodeVersion: string;
  nodePermissionFlag: '--permission' | '--experimental-permission' | null;
  nodePermissionSupported: boolean;
  warning: string | null;
}

export interface SecuritySettingsSnapshotSubset {
  hostPermissionsGranted: boolean;
  fullAutonomousMode: boolean;
  dangerousExecAutoApprove: boolean;
  fullAutonomyProfileEnabled: boolean;
  totalAutonomyEnabled: boolean;
  webAuthEnabled: boolean;
  guardrailsEnabled: boolean;
  guardrailBlockPii: boolean;
  guardrailBlockSecrets: boolean;
  guardrailBlockPromptInjection: boolean;
  telegramChatId: string;
  telegramAllowedChatIds: string[];
  channelPairingRequired: boolean;
  lanSubnetAllowlist: string[];
  dailyCostLimitEnabled: boolean;
  dailyCostLimitUsd: number;
  dailyCloudCostFallbackToOllama: boolean;
  autoWatchdogRollbackEnabled: boolean;
  watchdogTimeoutSeconds: number;
  circuitBreakerMaxFailures: number;
}

export interface SecuritySnapshot {
  id: string;
  createdAt: string;
  reason: string;
  actor: string;
  settingsSubset: SecuritySettingsSnapshotSubset;
}

export interface AutonomyDecisionRecord {
  id: string;
  createdAt: string;
  agentId: string;
  category: 'security_admin' | 'code_selfmod' | 'device_control' | 'goal_loop' | 'budget_failover' | 'watchdog' | 'circuit_breaker';
  decision: string;
  rationale: string;
  rejectedAlternatives: string[];
  outcome: 'applied' | 'blocked' | 'rolled_back' | 'verified' | 'failed';
  highImpact: boolean;
  rollbackSnapshotId?: string;
}

export interface CircuitBreakerTaskRecord {
  taskKey: string;
  consecutiveFailures: number;
  rollbacksCount: number;
  state: 'closed' | 'open';
  trippedAt?: string;
  reason?: string;
  lastUpdatedAt: string;
}

export interface ExceptionDigestEntry {
  id: string;
  createdAt: string;
  category: string;
  summary: string;
  highImpact: boolean;
}

export type DeviceAdapterType =
  | 'ssh'
  | 'http_rest'
  | 'mqtt'
  | 'home_assistant'
  | 'snmp'
  | 'openwrt_unifi'
  | 'proxmox'
  | 'synology_nas'
  | 'shelly_tasmota'
  | 'philips_hue'
  | 'ipp_printer'
  | 'wol';

export interface LanDeviceInventoryItem {
  id: string;
  ip: string;
  mac: string;
  hostname?: string;
  vendor: string;
  inferredType: string;
  adapterType: DeviceAdapterType;
  openPorts: number[];
  services: string[];
  bannerExcerpt?: string;
  hasCredentials: boolean;
  credentialFieldsMask?: string[];
  status: 'online' | 'offline' | 'unknown' | 'needs_credentials';
  lastSeenAt: string;
  discoveredAt: string;
  lastError?: string;
}

export interface PendingDeviceCredentialPrompt {
  id: string;
  deviceId: string;
  ip: string;
  vendor: string;
  adapterType: DeviceAdapterType;
  requiredFields: string[];
  message: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
}

export interface DeviceAdapterActionRecord {
  id: string;
  deviceId: string;
  adapterType: DeviceAdapterType;
  action: string;
  paramsSummary: string;
  priorState: Record<string, unknown> | null;
  resultSummary: string;
  ok: boolean;
  dryRun: boolean;
  undone: boolean;
  createdAt: string;
}

export interface WorldModelNode {
  id: string;
  kind: 'device' | 'service' | 'agent' | 'routine' | 'anomaly';
  label: string;
  status: 'nominal' | 'warning' | 'critical' | 'offline';
  detail?: string;
  updatedAt: string;
}

export interface WorldModelEdge {
  fromId: string;
  toId: string;
  relation: string;
}

export interface WeeklySelfEvaluationReport {
  id: string;
  createdAt: string;
  successRatePct: number;
  verifiedTasks: number;
  failedOrRolledBackTasks: number;
  avgCostPerTaskUsd: number;
  securityAuditValid: boolean;
  recommendations: string[];
  summaryMarkdown: string;
}

export interface AutonomousGoalCycle {
  id: string;
  goal: string;
  phase: 'goal' | 'plan' | 'execute' | 'verify' | 'reflect' | 'completed' | 'failed';
  plannerNotes?: string;
  verifierOutput?: string;
  criticFeedback?: string;
  verifiedSuccess: boolean;
  createdAt: string;
  completedAt?: string;
}

