import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AutonomyDecisionRecord,
  CircuitBreakerTaskRecord,
  ExceptionDigestEntry,
  SecuritySettingsSnapshotSubset,
  SecuritySnapshot,
  Settings,
} from '../../shared/types';
import {
  appendAuditLog,
  getState,
  hasWebAuthPassword,
  normalizePasswordInput,
  updateState,
  verifyAuditLogChain,
  verifyWebAuthPassword,
} from '../state/store';
import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from './auth';
import { redactLeakedSecrets } from './egressAndCrypto';
import { KillSwitchActiveError, terminateActiveHostProcesses } from './permissionGate';

export class InviolableGuaranteeError extends Error {
  public readonly code = 'INVIOLABLE_GUARANTEE';
  constructor(message: string) {
    super(message);
    this.name = 'InviolableGuaranteeError';
  }
}

export class UntrustedInjectionBlockedError extends Error {
  public readonly code = 'UNTRUSTED_INJECTION_BLOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'UntrustedInjectionBlockedError';
  }
}

export class CircuitBreakerOpenError extends Error {
  public readonly code = 'CIRCUIT_BREAKER_OPEN';
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

const DEFAULT_SYSTEM_LOCKDOWN_FILE = '/etc/novaswarm/LOCKDOWN';
const FALLBACK_USER_LOCKDOWN_FILE = path.join(os.homedir(), '.novaswarm', 'LOCKDOWN');

export function resolveLockdownFileCandidates(): string[] {
  const override = process.env.NOVASWARM_LOCKDOWN_FILE?.trim();
  if (override) return [override];
  return [DEFAULT_SYSTEM_LOCKDOWN_FILE, FALLBACK_USER_LOCKDOWN_FILE];
}

export function getPrimaryLockdownFilePath(): string {
  return resolveLockdownFileCandidates()[0];
}

export function isLockdownFilePresent(): { present: boolean; path: string | null } {
  for (const p of resolveLockdownFileCandidates()) {
    try {
      if (fs.existsSync(p)) {
        return { present: true, path: p };
      }
    } catch {
      // ignore stat errors
    }
  }
  return { present: false, path: null };
}

export function isSystemLockedDown(): boolean {
  const s = getState().settings;
  if (s.lockdownActive || s.killSwitchActive) return true;
  return isLockdownFilePresent().present;
}

function extractSecuritySnapshotSubset(s: Settings): SecuritySettingsSnapshotSubset {
  return {
    hostPermissionsGranted: Boolean(s.hostPermissionsGranted),
    fullAutonomousMode: Boolean(s.fullAutonomousMode),
    dangerousExecAutoApprove: Boolean(s.dangerousExecAutoApprove),
    fullAutonomyProfileEnabled: Boolean(s.fullAutonomyProfileEnabled),
    totalAutonomyEnabled: Boolean(s.totalAutonomyEnabled),
    webAuthEnabled: Boolean(s.webAuthEnabled),
    guardrailsEnabled: Boolean(s.guardrailsEnabled),
    guardrailBlockPii: Boolean(s.guardrailBlockPii),
    guardrailBlockSecrets: Boolean(s.guardrailBlockSecrets),
    guardrailBlockPromptInjection: Boolean(s.guardrailBlockPromptInjection),
    telegramChatId: String(s.telegramChatId || ''),
    telegramAllowedChatIds: [...(s.telegramAllowedChatIds || [])],
    channelPairingRequired: Boolean(s.channelPairingRequired),
    lanSubnetAllowlist: [...(s.lanSubnetAllowlist || [])],
    dailyCostLimitEnabled: Boolean(s.dailyCostLimitEnabled),
    dailyCostLimitUsd: Number(s.dailyCostLimitUsd || 1.0),
    dailyCloudCostFallbackToOllama: s.dailyCloudCostFallbackToOllama !== false,
    autoWatchdogRollbackEnabled: s.autoWatchdogRollbackEnabled !== false,
    watchdogTimeoutSeconds: Number(s.watchdogTimeoutSeconds || 15),
    circuitBreakerMaxFailures: Number(s.circuitBreakerMaxFailures || 3),
  };
}

export function createSecuritySnapshot(reason: string, actor = 'system'): SecuritySnapshot {
  const state = getState();
  const snapshot: SecuritySnapshot = {
    id: `secsnap-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    reason: reason.trim() || 'Automatikus biztonsági mentés',
    actor,
    settingsSubset: extractSecuritySnapshotSubset(state.settings),
  };
  updateState((s) => {
    s.securitySnapshots = [snapshot, ...(s.securitySnapshots || [])].slice(0, 50);
  });
  return snapshot;
}

export function restoreSecuritySnapshot(
  stepsBack = 1,
  actor = 'system'
): { ok: boolean; restoredSnapshot?: SecuritySnapshot; message: string } {
  const state = getState();
  const snaps = state.securitySnapshots || [];
  if (snaps.length === 0) {
    return {
      ok: false,
      message: 'Nincs elérhető biztonsági pillanatkép a visszaállításhoz.',
    };
  }
  const index = Math.min(snaps.length - 1, Math.max(0, Math.round(stepsBack) - 1));
  const target = snaps[index];
  const sub = target.settingsSubset;

  updateState((s) => {
    s.settings.hostPermissionsGranted = sub.hostPermissionsGranted;
    s.settings.fullAutonomousMode = sub.fullAutonomousMode;
    s.settings.dangerousExecAutoApprove = sub.dangerousExecAutoApprove;
    s.settings.fullAutonomyProfileEnabled = sub.fullAutonomyProfileEnabled;
    s.settings.totalAutonomyEnabled = sub.totalAutonomyEnabled;
    s.settings.webAuthEnabled = sub.webAuthEnabled;
    s.settings.guardrailsEnabled = sub.guardrailsEnabled;
    s.settings.guardrailBlockPii = sub.guardrailBlockPii;
    s.settings.guardrailBlockSecrets = sub.guardrailBlockSecrets;
    s.settings.guardrailBlockPromptInjection = sub.guardrailBlockPromptInjection;
    s.settings.telegramChatId = sub.telegramChatId;
    s.settings.telegramAllowedChatIds = [...(sub.telegramAllowedChatIds || [])];
    s.settings.channelPairingRequired = sub.channelPairingRequired;
    s.settings.lanSubnetAllowlist = [...(sub.lanSubnetAllowlist || [])];
    s.settings.dailyCostLimitEnabled = sub.dailyCostLimitEnabled;
    s.settings.dailyCostLimitUsd = sub.dailyCostLimitUsd;
    s.settings.dailyCloudCostFallbackToOllama = sub.dailyCloudCostFallbackToOllama;
    s.settings.autoWatchdogRollbackEnabled = sub.autoWatchdogRollbackEnabled;
    s.settings.watchdogTimeoutSeconds = sub.watchdogTimeoutSeconds;
    s.settings.circuitBreakerMaxFailures = sub.circuitBreakerMaxFailures;
  });

  recordAutonomyDecision({
    agentId: actor,
    category: 'watchdog',
    decision: `Biztonsági konfiguráció visszaállítva: ${target.id} (${target.reason})`,
    rationale: `Visszaállítás ${index + 1} lépéssel korábbi pillanatképre (${target.createdAt}).`,
    rejectedAlternatives: ['Hibás vagy módosított konfiguráció megtartása'],
    outcome: 'rolled_back',
    highImpact: true,
    rollbackSnapshotId: target.id,
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: actor,
    sourceAgentName: 'Biztonsági Visszaállító',
    message: `Biztonsági beállítások visszaállítva (${target.id} · ${target.reason}).`,
    verifiedExecution: true,
  });

  return {
    ok: true,
    restoredSnapshot: target,
    message: `Biztonsági beállítások visszaállítva a(z) ${target.id} pillanatképre (${target.createdAt}).`,
  };
}

export async function activateEmergencyLockdown(
  source: 'telegram' | 'web' | 'cli' | 'watchdog',
  reason = 'Operátori vészleállítás'
): Promise<{
  lockdownActive: boolean;
  terminatedProcesses: number;
  lockfilePath: string | null;
}> {
  const now = new Date().toISOString();
  updateState((s) => {
    s.settings.lockdownActive = true;
    s.settings.killSwitchActive = true;
    s.settings.totalAutonomyEnabled = false;
    s.settings.lockdownReason = reason;
    s.settings.lockdownActivatedAt = now;
    s.activeExplicitTaskAgentId = null;
  });

  const terminatedProcesses = terminateActiveHostProcesses();

  let lockfilePath: string | null = null;
  const payload = JSON.stringify({
    lockedAt: now,
    source,
    reason,
    pid: process.pid,
  });

  for (const candidate of resolveLockdownFileCandidates()) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      fs.writeFileSync(candidate, payload, { encoding: 'utf8', mode: 0o600 });
      lockfilePath = candidate;
      break;
    } catch {
      // try next lockfile path
    }
  }

  appendAuditLog({
    type: 'security',
    sourceAgentId: `lockdown:${source}`,
    sourceAgentName: 'Vészleállítás (LOCKDOWN)',
    message: `VÉSZLEÁLLÍTÁS AKTIVÁLVA (${source}): ${reason}. Megállított folyamatok: ${terminatedProcesses}. Zárfájl: ${lockfilePath || 'in-memory/state'}`,
    verifiedExecution: true,
  });

  await notifyExceptionToTelegram(
    `🛑 [VÉSZLEÁLLÍTÁS AKTÍV] Forrás: ${source}\nOk: ${reason}\nMegállított host folyamatok: ${terminatedProcesses}\nFeloldás kizárólag a tulajdonos hitelesített jelszavával lehetséges.`,
    true
  ).catch(() => {});

  return {
    lockdownActive: true,
    terminatedProcesses,
    lockfilePath,
  };
}

export async function unlockEmergencyLockdown(params: {
  password?: string;
  actorIp?: string;
  actorLabel?: string;
}): Promise<{ ok: boolean; statusCode: number; error?: string; code?: string; retryAfterSeconds?: number }> {
  const ip = params.actorIp || '127.0.0.1';
  if (hasWebAuthPassword()) {
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      return {
        ok: false,
        statusCode: 429,
        error: `Túl sok hibás jelszópróba a vészleállítás feloldásához (${rate.retryAfterSeconds} mp).`,
        code: 'AUTH_RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
      };
    }
    const pw = normalizePasswordInput(params.password || '');
    if (!pw || !verifyWebAuthPassword(pw)) {
      const fail = recordLoginFailure(ip, Date.now(), 'Hibás jelszó LOCKDOWN feloldásnál');
      return {
        ok: false,
        statusCode: 401,
        error: 'Érvénytelen tulajdonosi jelszó — a vészleállítás feloldása megtagadva.',
        code: 'INVALID_OWNER_PASSWORD',
        retryAfterSeconds: fail.retryAfterSeconds || undefined,
      };
    }
    clearLoginFailures(ip);
  }

  for (const candidate of resolveLockdownFileCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    } catch {
      // ignore if already absent
    }
  }

  updateState((s) => {
    s.settings.lockdownActive = false;
    s.settings.killSwitchActive = false;
    s.settings.lockdownReason = null;
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: params.actorLabel || 'owner-unlock',
    sourceAgentName: 'Vészleállítás Feloldása',
    message: 'Vészleállítás (LOCKDOWN) feloldva hitelesített tulajdonosi jelszóval.',
    verifiedExecution: true,
  });

  await notifyExceptionToTelegram(
    '✅ [VÉSZLEÁLLÍTÁS FELOLDVA] A tulajdonos hitelesítetten visszaállította a rendszer működését.',
    true
  ).catch(() => {});

  return { ok: true, statusCode: 200 };
}

export function recordAutonomyDecision(
  entry: Omit<AutonomyDecisionRecord, 'id' | 'createdAt'>
): AutonomyDecisionRecord {
  const rec: AutonomyDecisionRecord = {
    ...entry,
    id: `dec-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.autonomyDecisions = [rec, ...(s.autonomyDecisions || [])].slice(0, 500);
  });
  return rec;
}

export async function notifyExceptionToTelegram(
  message: string,
  highImpact: boolean,
  telegramSender?: (text: string) => Promise<unknown>
): Promise<{ sentImmediately: boolean; queuedForDigest: boolean }> {
  const cleanMsg = redactLeakedSecrets(message).redacted;
  const entry: ExceptionDigestEntry = {
    id: `exc-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    category: highImpact ? 'high_impact' : 'routine',
    summary: cleanMsg.slice(0, 500),
    highImpact,
  };
  updateState((s) => {
    s.exceptionNotificationsQueue = [entry, ...(s.exceptionNotificationsQueue || [])].slice(0, 200);
  });

  if (!highImpact) {
    return { sentImmediately: false, queuedForDigest: true };
  }

  const sendFn =
    telegramSender ||
    (async (txt: string) => {
      const bot = await import('../telegram/bot');
      return bot.sendTelegramMessage(txt);
    });

  await Promise.resolve(sendFn(cleanMsg)).catch(() => {});
  return { sentImmediately: true, queuedForDigest: false };
}

export async function flushDailyExceptionDigest(
  telegramSender?: (text: string) => Promise<unknown>,
  force = false
): Promise<{ sent: boolean; itemCount: number }> {
  const state = getState();
  if (!force && !state.settings.totalAutonomyEnabled) {
    return { sent: false, itemCount: 0 };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!force && state.settings.lastExceptionDigestDate === today) {
    return { sent: false, itemCount: 0 };
  }
  const queue = state.exceptionNotificationsQueue || [];
  const todayItems = queue.filter((q) => q.createdAt.startsWith(today));
  const highCount = todayItems.filter((i) => i.highImpact).length;
  const routineCount = todayItems.length - highCount;

  const msg = [
    `📊 NovaSwarm Napi Autonóm Összefoglaló (${today})`,
    `• Események ma: ${todayItems.length} db (kritikus: ${highCount}, rutin: ${routineCount})`,
    `• Napi felhő költés: $${state.settings.dailySpendUsd.toFixed(4)} / $${state.settings.dailyCostLimitUsd.toFixed(2)}`,
    `• Biztonsági pillanatképek: ${(state.securitySnapshots || []).length} db`,
    ...todayItems.slice(0, 5).map((i) => `- [${i.highImpact ? 'FONTOS' : 'rutin'}] ${i.summary.slice(0, 120)}`),
  ].join('\n');

  const sendFn =
    telegramSender ||
    (async (txt: string) => {
      const bot = await import('../telegram/bot');
      return bot.sendTelegramMessage(txt);
    });

  await Promise.resolve(sendFn(msg)).catch(() => {});
  updateState((s) => {
    s.settings.lastExceptionDigestDate = today;
  });
  return { sent: true, itemCount: todayItems.length };
}

const UNTRUSTED_HEADER_TAG = '[NEM MEGBÍZHATÓ KÜLSŐ TARTALOM]';
const UNTRUSTED_FOOTER_TAG = '[/NEM MEGBÍZHATÓ KÜLSŐ TARTALOM]';

export function tagUntrustedContent(sourceLabel: string, content: string): string {
  const safeBody = redactLeakedSecrets(content).redacted;
  return `${UNTRUSTED_HEADER_TAG} (forrás: ${sourceLabel})\n${safeBody}\n${UNTRUSTED_FOOTER_TAG}`;
}

export function detectUntrustedInjectionDirectives(text: string): {
  suspicious: boolean;
  matchedReasons: string[];
} {
  const matchedReasons: string[] = [];
  const patterns: Array<{ re: RegExp; label: string }> = [
    {
      re: /\b(webAuthEnabled\s*[:=]\s*false|disable\s+(web\s*)?auth|kapcsold\s+ki\s+(a\s+)?(jelsz[oó]|hiteles[ií]t[eé]s)|allow\s+unauthenticated)\b/i,
      label: 'Hitelesítés kikapcsolására irányuló utasítás',
    },
    {
      re: /\b(guardrailsEnabled\s*[:=]\s*false|disable\s+guardrails?|disable\s+audit|delete\s+audit|truncate\s+audit|remove\s+lockdown|kapcsold\s+ki\s+a\s+(védelm|audit|vészleáll))\b/i,
      label: 'Védelmi garanciák / audit / lockdown kiiktatási kísérlet',
    },
    {
      re: /\b(ignore\s+(all\s+)?previous\s+instructions?|override\s+system\s+prompt|figyelmen\s+kívül\s+hagy)\b/i,
      label: 'Rendszerutasítás felülírási kísérlet',
    },
    {
      re: /\b(exfiltrate|send\s+(\.secrets|\.env|passwords?|tokens?)|küldd\s+el\s+a\s+kulcs)\b/i,
      label: 'Titok-kiszivárogtatási utasítás',
    },
  ];
  for (const p of patterns) {
    if (p.re.test(text)) {
      matchedReasons.push(p.label);
    }
  }
  return {
    suspicious: matchedReasons.length > 0,
    matchedReasons,
  };
}

export function evaluateUntrustedActionGuard(params: {
  hasUntrustedContext: boolean;
  actionName: string;
  actionArgsText: string;
  sourcePromptOrContext?: string;
}): { allowed: boolean; reason?: string; criticVerdict: 'approve' | 'reject' } {
  const combined = `${params.actionArgsText}\n${params.sourcePromptOrContext || ''}`;
  const injection = detectUntrustedInjectionDirectives(combined);

  const isHighImpactTool =
    params.actionName === 'settings_admin' ||
    params.actionName === 'exec_shell' ||
    params.actionName === 'write_file' ||
    params.actionName === 'patch_file' ||
    params.actionName === 'ssh_exec' ||
    params.actionName === 'device_control';

  if (params.hasUntrustedContext && injection.suspicious && isHighImpactTool) {
    const reason =
      `Kritikus Felülvizsgáló blokkolta: nem megbízható külső tartalomból érkező prompt-injection kísérlet ` +
      `(${injection.matchedReasons.join('; ')}). Magas kockázatú művelet (${params.actionName}) megtagadva.`;
    appendAuditLog({
      type: 'security',
      sourceAgentId: 'critical-reviewer',
      sourceAgentName: 'Kritikus Felülvizsgáló',
      message: reason,
      verifiedExecution: true,
    });
    return { allowed: false, reason, criticVerdict: 'reject' };
  }

  if (params.hasUntrustedContext && params.actionName === 'settings_admin') {
    const reason =
      'Kritikus Felülvizsgáló blokkolta: külső, nem megbízható tartalommal szennyezett munkamenetből tilos a biztonsági beállítások módosítása (csak hitelesített tulajdonosi kérésből engedélyezett).';
    appendAuditLog({
      type: 'security',
      sourceAgentId: 'critical-reviewer',
      sourceAgentName: 'Kritikus Felülvizsgáló',
      message: reason,
      verifiedExecution: true,
    });
    return { allowed: false, reason, criticVerdict: 'reject' };
  }

  return { allowed: true, criticVerdict: 'approve' };
}

export interface WatchdogProbes {
  healthProbe?: () => Promise<boolean>;
  authProbe?: () => Promise<boolean>;
  telegramProbe?: () => Promise<boolean>;
  telegramSender?: (text: string) => Promise<unknown>;
}

export async function runSecurityWatchdog(params: {
  snapshotId: string;
  changeLabel: string;
  probes?: WatchdogProbes;
}): Promise<{ healthy: boolean; rolledBack: boolean; failedChecks: string[]; message: string }> {
  const state = getState();
  const failedChecks: string[] = [];

  const healthCheck =
    params.probes?.healthProbe ||
    (async () => {
      const s = getState();
      return Boolean(s && s.settings && verifyAuditLogChain().valid);
    });

  const authCheck =
    params.probes?.authProbe ||
    (async () => {
      const s = getState();
      if (!s.settings.webAuthEnabled) return true;
      return hasWebAuthPassword();
    });

  const telegramCheck =
    params.probes?.telegramProbe ||
    (async () => {
      const s = getState();
      if (!s.settings.telegramEnabled) return true;
      return Boolean(s.settings.telegramChatId || (s.settings.telegramAllowedChatIds || []).length > 0);
    });

  const [hOk, aOk, tOk] = await Promise.all([
    Promise.resolve(healthCheck()).catch(() => false),
    Promise.resolve(authCheck()).catch(() => false),
    Promise.resolve(telegramCheck()).catch(() => false),
  ]);

  if (!hOk) failedChecks.push('healthz/audit');
  if (!aOk) failedChecks.push('auth');
  if (!tOk) failedChecks.push('telegram');

  if (failedChecks.length === 0) {
    return {
      healthy: true,
      rolledBack: false,
      failedChecks: [],
      message: `Biztonsági Watchdog rendben (${params.changeLabel}).`,
    };
  }

  let rolledBack = false;
  if (state.settings.autoWatchdogRollbackEnabled !== false) {
    const snaps = getState().securitySnapshots || [];
    const idx = snaps.findIndex((x) => x.id === params.snapshotId);
    const steps = idx >= 0 ? idx + 1 : 1;
    const restoreRes = restoreSecuritySnapshot(steps, 'security-watchdog');
    rolledBack = restoreRes.ok;
  }

  recordTaskExecutionOutcome('security-watchdog', false, true, `Watchdog hiba: ${failedChecks.join(', ')}`);

  const alertMsg = `🚨 [BIZTONSÁGI WATCHDOG VISSZAÁLLÍTÁS] Módosítás (${params.changeLabel}) hibás állapotot okozott (${failedChecks.join(', ')}). Automatikus visszaállítás: ${rolledBack ? 'SIKERES' : 'SIKERTELEN'}.`;
  await notifyExceptionToTelegram(alertMsg, true, params.probes?.telegramSender).catch(() => {});

  return {
    healthy: false,
    rolledBack,
    failedChecks,
    message: alertMsg,
  };
}

export function isTaskCircuitOpen(taskKey: string): { open: boolean; record?: CircuitBreakerTaskRecord } {
  const rec = (getState().circuitBreakerTasks || []).find((c) => c.taskKey === taskKey);
  if (!rec) return { open: false };
  return { open: rec.state === 'open', record: rec };
}

export function resetTaskCircuit(taskKey: string): void {
  updateState((s) => {
    s.circuitBreakerTasks = (s.circuitBreakerTasks || []).filter((c) => c.taskKey !== taskKey);
  });
}

export function recordTaskExecutionOutcome(
  taskKey: string,
  ok: boolean,
  wasRollback = false,
  reason?: string
): { trippedNow: boolean; record: CircuitBreakerTaskRecord } {
  const maxFailures = Math.max(2, getState().settings.circuitBreakerMaxFailures || 3);
  const now = new Date().toISOString();
  let trippedNow = false;
  let resultRec!: CircuitBreakerTaskRecord;

  updateState((s) => {
    s.circuitBreakerTasks = s.circuitBreakerTasks || [];
    let rec = s.circuitBreakerTasks.find((c) => c.taskKey === taskKey);
    if (!rec) {
      rec = {
        taskKey,
        consecutiveFailures: 0,
        rollbacksCount: 0,
        state: 'closed',
        lastUpdatedAt: now,
      };
      s.circuitBreakerTasks.unshift(rec);
    }

    if (ok && !wasRollback) {
      rec.consecutiveFailures = 0;
      rec.state = 'closed';
      rec.reason = undefined;
      rec.lastUpdatedAt = now;
    } else {
      rec.consecutiveFailures += 1;
      if (wasRollback) rec.rollbacksCount += 1;
      rec.reason = reason || rec.reason;
      rec.lastUpdatedAt = now;
      if (rec.consecutiveFailures >= maxFailures && rec.state !== 'open') {
        rec.state = 'open';
        rec.trippedAt = now;
        trippedNow = true;
      }
    }
    resultRec = { ...rec };
  });

  if (trippedNow) {
    appendAuditLog({
      type: 'security',
      sourceAgentId: 'circuit-breaker',
      sourceAgentName: 'Megszakító (Circuit Breaker)',
      message: `Feladat felfüggesztve (${taskKey}): ${resultRec.consecutiveFailures} egymás utáni hiba/visszaállítás. Ok: ${resultRec.reason || 'ismételt kudarc'}.`,
      verifiedExecution: true,
    });
    recordAutonomyDecision({
      agentId: 'circuit-breaker',
      category: 'circuit_breaker',
      decision: `Feladat (${taskKey}) megszakítója kinyitott (felfüggesztve).`,
      rationale: `${resultRec.consecutiveFailures} egymás utáni hiba/rollback elérte a küszöböt (${maxFailures}).`,
      rejectedAlternatives: ['Végtelen újrapróbálkozás folytatása'],
      outcome: 'blocked',
      highImpact: true,
    });
    void notifyExceptionToTelegram(
      `⚡ [MEGSZAKÍTÓ AKTÍV] A(z) "${taskKey}" feladat ${resultRec.consecutiveFailures} egymás utáni hiba után felfüggesztve (${resultRec.reason || 'hiba'}).`,
      true
    ).catch(() => {});
  }

  return { trippedNow, record: resultRec };
}

const INVIOLABLE_BLOCKED_KEYS = new Set([
  'disableAuditLog',
  'deleteAuditLogs',
  'clearAuditLogs',
  'truncateAuditLog',
  'disableLockdown',
  'disableEmergencyLockdown',
  'disableSecuritySnapshots',
  'disableRestoreSnapshots',
  'lockdownActive',
  'killSwitchActive',
]);

const ALLOWED_AGENT_ADMIN_SETTINGS_KEYS = new Set<keyof Settings>([
  'hostPermissionsGranted',
  'fullAutonomousMode',
  'dangerousExecAutoApprove',
  'guardrailsEnabled',
  'guardrailBlockPii',
  'guardrailBlockSecrets',
  'guardrailBlockPromptInjection',
  'webAuthEnabled',
  'lanSubnetAllowlist',
  'dailyCostLimitEnabled',
  'dailyCostLimitUsd',
  'dailyCloudCostFallbackToOllama',
  'autoWatchdogRollbackEnabled',
  'watchdogTimeoutSeconds',
  'circuitBreakerMaxFailures',
  'circuitBreakerDailyActionCap',
  'execTimeoutSeconds',
  'longExecTimeoutSeconds',
  'nightShiftEnabled',
  'autonomousKanbanWorkerEnabled',
  'ollamaOnlyMode',
  'softDowngradeOnBudget',
  'channelPairingRequired',
]);

export async function applyAgentSettingsAdmin(params: {
  agentId: string;
  agentName: string;
  patch: Record<string, unknown>;
  reason: string;
  rejectedAlternatives?: string[];
  hasUntrustedContext?: boolean;
  probes?: WatchdogProbes;
}): Promise<{
  ok: boolean;
  snapshotId?: string;
  changedKeys: string[];
  watchdogHealthy?: boolean;
  rolledBack?: boolean;
  message: string;
}> {
  if (isSystemLockedDown()) {
    throw new KillSwitchActiveError();
  }

  const state = getState();
  if (!state.settings.totalAutonomyEnabled) {
    throw new InviolableGuaranteeError(
      'A settings_admin eszköz kizárólag aktív „Totális autonómia” módban használható.'
    );
  }

  // Critical Reviewer check on untrusted session
  const guard = evaluateUntrustedActionGuard({
    hasUntrustedContext: Boolean(params.hasUntrustedContext),
    actionName: 'settings_admin',
    actionArgsText: JSON.stringify(params.patch),
    sourcePromptOrContext: params.reason,
  });
  if (!guard.allowed) {
    throw new UntrustedInjectionBlockedError(guard.reason || 'Prompt injection blokkolva.');
  }

  // Enforce the 3 INVIOLABLE GUARANTEES
  for (const key of Object.keys(params.patch)) {
    if (INVIOLABLE_BLOCKED_KEYS.has(key)) {
      throw new InviolableGuaranteeError(
        `SÉRTETLEN GARANCIA MEGSÉRTÉSE TILTÁSA: "${key}" nem kapcsolható ki vagy törölhető semmilyen eszközzel.`
      );
    }
  }
  if (params.patch.sendAuditAnchorToTelegram === false) {
    throw new InviolableGuaranteeError(
      'SÉRTETLEN GARANCIA: Totális autonómia alatt a napi audit fej-hash Telegram horgony nem kapcsolható ki.'
    );
  }
  if (typeof params.patch.auditLogMaxEntries === 'number' && params.patch.auditLogMaxEntries < 100) {
    throw new InviolableGuaranteeError(
      'SÉRTETLEN GARANCIA: Az audit napló nem csonkítható vagy nullázható.'
    );
  }
  if (params.patch.totalAutonomyEnabled === false) {
    throw new InviolableGuaranteeError(
      'SÉRTETLEN GARANCIA: Az ágens nem módosíthatja a Totális autonómia vagy a vészleállítási rendszer határait.'
    );
  }

  const patchKeys = Object.keys(params.patch);
  const unknownKeys = patchKeys.filter((k) => !ALLOWED_AGENT_ADMIN_SETTINGS_KEYS.has(k as keyof Settings));
  if (unknownKeys.length > 0) {
    throw new InviolableGuaranteeError(
      `A következő mezők nem módosíthatók az ágens admin eszközön keresztül: ${unknownKeys.join(', ')}`
    );
  }

  const reasonStr = params.reason?.trim() || 'Autonóm konfigurációs igazítás';
  const preSnapshot = createSecuritySnapshot(`settings_admin (${params.agentName}): ${reasonStr}`, params.agentId);

  const changedKeys: string[] = [];
  updateState((s) => {
    const targetSettings = s.settings as unknown as Record<string, unknown>;
    for (const k of patchKeys) {
      const nextVal = params.patch[k];
      if (nextVal !== undefined && JSON.stringify(targetSettings[k]) !== JSON.stringify(nextVal)) {
        targetSettings[k] = nextVal;
        changedKeys.push(k);
      }
    }
  });

  if (changedKeys.length === 0) {
    return {
      ok: true,
      snapshotId: preSnapshot.id,
      changedKeys: [],
      watchdogHealthy: true,
      rolledBack: false,
      message: 'Nincs tényleges változás a beállításokban.',
    };
  }

  recordAutonomyDecision({
    agentId: params.agentId,
    category: 'security_admin',
    decision: `Beállítások módosítva (${changedKeys.join(', ')})`,
    rationale: reasonStr,
    rejectedAlternatives: params.rejectedAlternatives?.length
      ? params.rejectedAlternatives
      : ['Jelenlegi korlátozó beállítások megtartása'],
    outcome: 'applied',
    highImpact: true,
    rollbackSnapshotId: preSnapshot.id,
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: params.agentId,
    sourceAgentName: params.agentName,
    message: `[TOTÁLIS AUTONÓMIA · settings_admin] Módosított kulcsok: ${changedKeys.join(', ')} | Ok: ${reasonStr} | Snapshot: ${preSnapshot.id}`,
    verifiedExecution: true,
  });

  await notifyExceptionToTelegram(
    `⚙️ [Totális autonómia változtatás]\nÁgens: ${params.agentName}\nKulcsok: ${changedKeys.join(', ')}\nOk: ${reasonStr}\nVisszaállítási pont: ${preSnapshot.id}`,
    true,
    params.probes?.telegramSender
  ).catch(() => {});

  const wd = await runSecurityWatchdog({
    snapshotId: preSnapshot.id,
    changeLabel: `settings_admin:${changedKeys.join(',')}`,
    probes: params.probes,
  });

  return {
    ok: wd.healthy,
    snapshotId: preSnapshot.id,
    changedKeys,
    watchdogHealthy: wd.healthy,
    rolledBack: wd.rolledBack,
    message: wd.healthy
      ? `Beállítások módosítva (${changedKeys.join(', ')}), visszaállítási pont: ${preSnapshot.id}, Watchdog: rendben.`
      : wd.message,
  };
}

export async function toggleTotalAutonomyMode(params: {
  enabled: boolean;
  password?: string;
  clientIp?: string;
  bypassPasswordForInstaller?: boolean;
  telegramSender?: (text: string) => Promise<unknown>;
}): Promise<{
  ok: boolean;
  statusCode: number;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
  settings?: Settings;
}> {
  if (params.enabled) {
    if (isSystemLockedDown()) {
      return {
        ok: false,
        statusCode: 423,
        error: 'A Vészleállítás (LOCKDOWN) aktív — előbb oldd fel a vészleállítást a tulajdonosi jelszóval!',
        code: 'SYSTEM_LOCKED_DOWN',
      };
    }

    if (!params.bypassPasswordForInstaller && hasWebAuthPassword()) {
      const ip = params.clientIp || '127.0.0.1';
      const rate = checkLoginRateLimit(ip);
      if (!rate.allowed) {
        return {
          ok: false,
          statusCode: 429,
          error: `Túl sok hibás jelszópróba (${rate.retryAfterSeconds} mp).`,
          code: 'AUTH_RATE_LIMITED',
          retryAfterSeconds: rate.retryAfterSeconds,
        };
      }
      const pw = normalizePasswordInput(params.password || '');
      if (!pw || !verifyWebAuthPassword(pw)) {
        const fail = recordLoginFailure(ip, Date.now(), 'Hibás jelszó Totális autonómia aktiválásához');
        return {
          ok: false,
          statusCode: 401,
          error: 'Érvénytelen tulajdonosi jelszó.',
          code: 'INVALID_OWNER_PASSWORD',
          retryAfterSeconds: fail.retryAfterSeconds || undefined,
        };
      }
      clearLoginFailures(ip);
    }

    createSecuritySnapshot('Totális autonómia bekapcsolása előtti mentés', 'owner');
    const now = new Date().toISOString();

    updateState((s) => {
      s.settings.totalAutonomyEnabled = true;
      s.settings.totalAutonomyActivatedAt = now;
      s.settings.fullAutonomyProfileEnabled = true;
      s.settings.hostPermissionsGranted = true;
      s.settings.fullAutonomousMode = true;
      s.settings.dangerousExecAutoApprove = true;
      s.settings.dailyCloudCostFallbackToOllama = s.settings.dailyCloudCostFallbackToOllama !== false;
      s.settings.autoWatchdogRollbackEnabled = true;
      s.settings.sendAuditAnchorToTelegram = true;
    });

    appendAuditLog({
      type: 'security',
      sourceAgentId: 'total-autonomy',
      sourceAgentName: 'Totális Autonómia',
      message:
        'TOTÁLIS AUTONÓMIA BEKAPCSOLVA. A 3 sérthetetlen garancia (append-only audit, LOCKDOWN, visszaállítási pontok) aktív.',
      verifiedExecution: true,
    });

    await notifyExceptionToTelegram(
      '🔴 [TOTÁLIS AUTONÓMIA BEKAPCSOLVA]\nAz ágensek teljes önállósággal dolgoznak.\nSérthetetlen garanciák aktívak: Append-only Audit + Napi Anchor, /stop LOCKDOWN, Automatikus Snapshot + Watchdog Rollback.',
      true,
      params.telegramSender
    ).catch(() => {});

    return { ok: true, statusCode: 200, settings: getState().settings };
  }

  updateState((s) => {
    s.settings.totalAutonomyEnabled = false;
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: 'total-autonomy',
    sourceAgentName: 'Totális Autonómia',
    message: 'TOTÁLIS AUTONÓMIA KIKAPCSOLVA a tulajdonos által.',
    verifiedExecution: true,
  });

  await notifyExceptionToTelegram(
    '🟢 [TOTÁLIS AUTONÓMIA KIKAPCSOLVA] A rendszer visszatért a normál felügyelt módba.',
    true,
    params.telegramSender
  ).catch(() => {});

  return { ok: true, statusCode: 200, settings: getState().settings };
}

export function getTotalAutonomySummary() {
  const s = getState();
  const lockfile = isLockdownFilePresent();
  const auditChain = verifyAuditLogChain();
  return {
    totalAutonomyEnabled: Boolean(s.settings.totalAutonomyEnabled),
    fullAutonomyProfileEnabled: Boolean(s.settings.fullAutonomyProfileEnabled),
    lockdownActive: isSystemLockedDown(),
    lockdownReason: s.settings.lockdownReason || null,
    lockdownFilePresent: lockfile.present,
    lockdownFilePath: lockfile.path,
    guarantees: {
      appendOnlyAudit: {
        active: true,
        chainValid: auditChain.valid,
        entriesCount: s.auditLogs.length,
        dailyAnchorActive: Boolean(s.settings.totalAutonomyEnabled || s.settings.sendAuditAnchorToTelegram),
        lastAnchorDate: s.settings.lastAuditAnchorSentDate || null,
      },
      emergencyLockdown: {
        active: true,
        lockedDown: isSystemLockedDown(),
        channels: ['telegram:/stop', 'cli:lockdown', 'web:veszleallitas', `file:${getPrimaryLockdownFilePath()}`],
      },
      securityRestore: {
        active: true,
        snapshotsCount: (s.securitySnapshots || []).length,
        latestSnapshotAt: (s.securitySnapshots || [])[0]?.createdAt || null,
        autoWatchdogRollback: s.settings.autoWatchdogRollbackEnabled !== false,
      },
    },
    cloudBudget: {
      enabled: Boolean(s.settings.dailyCostLimitEnabled),
      spendUsd: s.settings.dailySpendUsd,
      limitUsd: s.settings.dailyCostLimitUsd,
      fallbackToOllama: s.settings.dailyCloudCostFallbackToOllama !== false,
      ratioPct: Math.min(100, Math.round((s.settings.dailySpendUsd / Math.max(0.01, s.settings.dailyCostLimitUsd)) * 100)),
    },
    circuitBreakers: s.circuitBreakerTasks || [],
    recentDecisions: (s.autonomyDecisions || []).slice(0, 50),
    snapshots: (s.securitySnapshots || []).slice(0, 20),
    exceptionQueueCount: (s.exceptionNotificationsQueue || []).length,
  };
}
