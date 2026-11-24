import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PhoenixAutonomyStatus, Settings, SudoCheckStatus } from '../../shared/types';
import { createPhoenixSnapshot } from '../infra/networkAndCluster';
import {
  appendAuditLog,
  getState,
  hasWebAuthPassword,
  updateState,
  verifyWebAuthPassword,
} from '../state/store';
import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from './auth';
import { KillSwitchActiveError, registerActiveHostChild } from './permissionGate';

export const DEFAULT_EXEC_TIMEOUT_SECONDS = 12;
export const MIN_EXEC_TIMEOUT_SECONDS = 5;
export const MAX_EXEC_TIMEOUT_SECONDS = 3600;

export const DEFAULT_LONG_EXEC_TIMEOUT_SECONDS = 600;
export const MIN_LONG_EXEC_TIMEOUT_SECONDS = 30;
export const MAX_LONG_EXEC_TIMEOUT_SECONDS = 7200;

const LONG_RUNNING_COMMAND_RE =
  /(^|[;|&]\s*|\s)(sudo(\s+-[a-zA-Z]+)*\s+)?(apt-get|apt|dpkg|npm\s+(ci|install|i|update|run\s+build)|npx\s+vite\s+build|vite\s+build|pnpm\s+(install|build)|yarn\s+(install|build)|bun\s+install|pip3?\s+install|cargo\s+(build|install)|make(\s|$)|cmake\b|docker\s+(build|pull)|docker-compose\s+(build|pull|up))/i;

export function clampExecTimeoutSeconds(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_EXEC_TIMEOUT_SECONDS;
  return Math.min(MAX_EXEC_TIMEOUT_SECONDS, Math.max(MIN_EXEC_TIMEOUT_SECONDS, Math.round(value)));
}

export function clampLongExecTimeoutSeconds(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LONG_EXEC_TIMEOUT_SECONDS;
  return Math.min(MAX_LONG_EXEC_TIMEOUT_SECONDS, Math.max(MIN_LONG_EXEC_TIMEOUT_SECONDS, Math.round(value)));
}

export function isLongRunningCommand(command: string): boolean {
  return LONG_RUNNING_COMMAND_RE.test(command.trim());
}

export function getExecTimeoutForCommand(
  command: string,
  settingsOverride?: Partial<Settings>
): { timeoutSec: number; timeoutMs: number; isLongCommand: boolean } {
  const s = settingsOverride ?? getState().settings;
  const isLongCommand = isLongRunningCommand(command);
  const timeoutSec = isLongCommand
    ? clampLongExecTimeoutSeconds(s.longExecTimeoutSeconds)
    : clampExecTimeoutSeconds(s.execTimeoutSeconds);
  return {
    timeoutSec,
    timeoutMs: timeoutSec * 1000,
    isLongCommand,
  };
}

export function formatExecTimeoutMessage(timeoutSec: number): string {
  return `Időtúllépés: a parancs végrehajtása leállt, mert túllépte a beállított ${timeoutSec} másodperces időkorlátot.`;
}

export function isExecTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; errno?: string | number; signal?: string; killed?: boolean; message?: string };
  if (e.code === 'ETIMEDOUT' || e.errno === 'ETIMEDOUT') return true;
  if (e.killed && e.signal === 'SIGTERM') return true;
  if (typeof e.message === 'string' && /ETIMEDOUT|timed?\s*out/i.test(e.message)) return true;
  return false;
}

export function getCurrentOsUsername(): string {
  try {
    return os.userInfo().username || process.env.USER || 'novaswarm';
  } catch {
    return process.env.USER || 'novaswarm';
  }
}

export function rewriteSudoNonInteractive(command: string): string {
  return command.replace(/(^|[;|&]\s*)sudo\b(?!\s+-[a-zA-Z]*n\b)/g, '$1sudo -n');
}

export function rewriteCommandArgsWithSudoN(bin: string, args: string[]): { bin: string; args: string[] } {
  if (path.basename(bin) === 'sudo') {
    const first = args[0] || '';
    if (first !== '-n' && !/^-[a-zA-Z]*n/.test(first)) {
      return { bin, args: ['-n', ...args] };
    }
  }
  return { bin, args };
}

export function detectSudoPasswordError(stderrOrMessage: string): boolean {
  return /sudo:\s*(a password is required|no tty present|askpass|1 incorrect password|nem adható meg jelszó)/i.test(
    stderrOrMessage
  );
}

export function formatSudoMissingNopasswdMessage(username = getCurrentOsUsername()): string {
  return (
    `Nincs jelszó nélküli sudo (NOPASSWD) jogosultság beállítva a(z) "${username}" felhasználónak, ` +
    `ezért a nem interaktív sudo (-n) azonnal leállt. ` +
    `Kézi javítás a gazdagépen: sudo visudo -f /etc/sudoers.d/novaswarm -> ${username} ALL=(ALL) NOPASSWD:ALL`
  );
}

export type SudoCommandExecutor = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number }
) => { status: number | null; stdout: string; stderr: string; errorCode?: string };

const defaultSudoExecutor: SudoCommandExecutor = (cmd, args, opts) => {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeoutMs,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const errCode = (res.error as NodeJS.ErrnoException | undefined)?.code;
  return {
    status: res.status,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
    errorCode: errCode,
  };
};

let cachedSudoStatus: SudoCheckStatus | null = null;

export function getCachedSudoStatus(): SudoCheckStatus | null {
  return cachedSudoStatus;
}

export function checkSudoNopasswd(opts?: {
  executor?: SudoCommandExecutor;
  username?: string;
  isRoot?: boolean;
}): SudoCheckStatus {
  const executor = opts?.executor ?? defaultSudoExecutor;
  const username = opts?.username?.trim() || getCurrentOsUsername();
  const isRoot =
    typeof opts?.isRoot === 'boolean'
      ? opts.isRoot
      : typeof process.getuid === 'function'
      ? process.getuid() === 0
      : false;
  const visudoCommand = 'sudo visudo -f /etc/sudoers.d/novaswarm';
  const sudoersLine = `${username} ALL=(ALL) NOPASSWD:ALL`;
  const checkedAt = new Date().toISOString();

  const res = executor('sudo', ['-n', 'true'], { timeoutMs: 2500 });
  if (res.errorCode === 'ENOENT') {
    const status: SudoCheckStatus = {
      checkedAt,
      username,
      sudoInstalled: false,
      hasNopasswd: false,
      isRoot,
      message: isRoot
        ? `A "sudo" parancs nincs telepítve (jelenlegi folyamat: root). Pi/Debian rendszeren telepítsd: apt install -y sudo.`
        : `A "sudo" parancs nincs telepítve a rendszeren.`,
      visudoCommand,
      sudoersLine,
    };
    cachedSudoStatus = status;
    return status;
  }

  const hasNopasswd = res.status === 0;
  const status: SudoCheckStatus = {
    checkedAt,
    username,
    sudoInstalled: true,
    hasNopasswd,
    isRoot,
    message: hasNopasswd
      ? `Jelszó nélküli sudo (NOPASSWD) aktív (${username}). A sudo -n alapú parancsok azonnal lefutnak.`
      : `A jelszó nélküli sudo (NOPASSWD) nincs beállítva a(z) "${username}" felhasználónak — a sudo -n parancsok hibával megállnak jelszóvárás nélkül.`,
    visudoCommand,
    sudoersLine,
  };
  cachedSudoStatus = status;
  return status;
}

export interface TrackedHostExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  killedByKillSwitch: boolean;
  sudoMissingNopasswd: boolean;
  timeoutSec: number;
  errorMessage?: string;
}

export async function runTrackedHostCommand(params: {
  bin: string;
  args: string[];
  cwd?: string;
  timeoutSec: number;
  maxOutputBytes?: number;
  spawnImpl?: typeof spawn;
}): Promise<TrackedHostExecResult> {
  if (getState().settings.killSwitchActive) {
    throw new KillSwitchActiveError();
  }

  const timeoutSec = Math.max(1, Math.round(params.timeoutSec));
  const maxBytes = params.maxOutputBytes ?? 256 * 1024;
  const normalized = rewriteCommandArgsWithSudoN(params.bin, params.args);
  const spawnFn = params.spawnImpl ?? spawn;

  return await new Promise<TrackedHostExecResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let killedByKillSwitch = false;
    let stdout = '';
    let stderr = '';
    let unregisterChild: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: TrackedHostExecResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unregisterChild();
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawnFn(normalized.bin, normalized.args, {
        cwd: params.cwd || process.cwd(),
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({
        ok: false,
        stdout: '',
        stderr: msg,
        exitCode: null,
        timedOut: false,
        killedByKillSwitch: false,
        sudoMissingNopasswd: detectSudoPasswordError(msg),
        timeoutSec,
        errorMessage: msg,
      });
      return;
    }

    const killProcessTree = () => {
      if (child.pid && process.platform !== 'win32') {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // ignore if process group already exited
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      try {
        child.stdout?.destroy();
        child.stderr?.destroy();
      } catch {
        // ignore
      }
    };

    unregisterChild = registerActiveHostChild(child, () => {
      killedByKillSwitch = true;
      killProcessTree();
      const msg = 'Vészleállító (/stop) aktiválva: a futó parancs azonnal megszakítva.';
      finish({
        ok: false,
        stdout,
        stderr: stderr ? `${stderr}\n${msg}` : msg,
        exitCode: null,
        timedOut: false,
        killedByKillSwitch: true,
        sudoMissingNopasswd: false,
        timeoutSec,
        errorMessage: msg,
      });
    });

    timer = setTimeout(() => {
      timedOut = true;
      killProcessTree();
      const msg = formatExecTimeoutMessage(timeoutSec);
      finish({
        ok: false,
        stdout,
        stderr: stderr ? `${stderr}\n${msg}` : msg,
        exitCode: null,
        timedOut: true,
        killedByKillSwitch: false,
        sudoMissingNopasswd: false,
        timeoutSec,
        errorMessage: msg,
      });
    }, timeoutSec * 1000);

    const appendLimited = (current: string, chunk: Buffer | string): string => {
      if (current.length >= maxBytes) return current;
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const remaining = maxBytes - current.length;
      return current + text.slice(0, remaining);
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout = appendLimited(stdout, chunk);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = appendLimited(stderr, chunk);
    });

    child.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const sudoMissing = detectSudoPasswordError(stderr || msg);
      finish({
        ok: false,
        stdout,
        stderr: stderr || msg,
        exitCode: null,
        timedOut,
        killedByKillSwitch,
        sudoMissingNopasswd: sudoMissing,
        timeoutSec,
        errorMessage: sudoMissing ? formatSudoMissingNopasswdMessage() : msg,
      });
    });

    child.on('close', (code) => {
      const sudoMissing = detectSudoPasswordError(stderr);
      if (killedByKillSwitch) {
        const msg = 'Vészleállító (/stop) aktiválva: a futó parancs azonnal megszakítva.';
        finish({
          ok: false,
          stdout,
          stderr: stderr ? `${stderr}\n${msg}` : msg,
          exitCode: code,
          timedOut: false,
          killedByKillSwitch: true,
          sudoMissingNopasswd: false,
          timeoutSec,
          errorMessage: msg,
        });
        return;
      }
      if (timedOut) {
        const msg = formatExecTimeoutMessage(timeoutSec);
        finish({
          ok: false,
          stdout,
          stderr: stderr ? `${stderr}\n${msg}` : msg,
          exitCode: code,
          timedOut: true,
          killedByKillSwitch: false,
          sudoMissingNopasswd: false,
          timeoutSec,
          errorMessage: msg,
        });
        return;
      }
      if (sudoMissing) {
        const msg = formatSudoMissingNopasswdMessage();
        finish({
          ok: false,
          stdout,
          stderr: stderr || msg,
          exitCode: code,
          timedOut: false,
          killedByKillSwitch: false,
          sudoMissingNopasswd: true,
          timeoutSec,
          errorMessage: msg,
        });
        return;
      }
      const ok = code === 0;
      finish({
        ok,
        stdout,
        stderr,
        exitCode: code,
        timedOut: false,
        killedByKillSwitch: false,
        sudoMissingNopasswd: false,
        timeoutSec,
        errorMessage: ok ? undefined : (stderr.trim() || `Parancs hibakóddal lépett ki (${code ?? 'ismeretlen'}).`),
      });
    });
  });
}

export const SECURITY_CRITICAL_SETTINGS_KEYS = [
  'hostPermissionsGranted',
  'fullAutonomousMode',
  'dangerousExecAutoApprove',
  'fullAutonomyProfileEnabled',
  'fullAutonomyPreviousFlags',
  'webAuthEnabled',
  'telegramChatId',
  'telegramAllowedChatIds',
  'channelPairingRequired',
  'guardrailsEnabled',
  'guardrailBlockPii',
  'guardrailBlockSecrets',
  'guardrailBlockPromptInjection',
  'lanSubnetAllowlist',
  'autoPhoenixSnapshotInFullAutonomy',
  'killSwitchActive',
] as const;

export function getChangedSecuritySettingsKeys(
  patch: Record<string, unknown>,
  currentSettings: Settings
): string[] {
  const changed: string[] = [];
  for (const key of SECURITY_CRITICAL_SETTINGS_KEYS) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const incoming = patch[key];
    const existing = currentSettings[key as keyof Settings];
    if (Array.isArray(incoming) || Array.isArray(existing)) {
      if (JSON.stringify(incoming ?? []) !== JSON.stringify(existing ?? [])) {
        changed.push(key);
      }
    } else if (incoming !== existing) {
      changed.push(key);
    }
  }
  return changed;
}

const FORBIDDEN_CONTROL_PLANE_PATH_RE =
  /^\/api\/(settings|autonomy-profile|auth|kill-switch|system|providers|agents|telegram|approvals|v\d+\/(tools|settings|autonomy|migrate|system))/i;

function isLocalInterfaceHostname(hostRaw: string): boolean {
  const host = hostRaw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host.startsWith('127.')
  ) {
    return true;
  }
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      for (const entry of entries || []) {
        if (entry.address.toLowerCase().split('%')[0] === host) {
          return true;
        }
      }
    }
  } catch {
    // ignore interface enumeration error
  }
  return false;
}

export function isForbiddenAgentControlPlaneUrl(rawUrl: string): { forbidden: boolean; reason?: string } {
  try {
    const u = new URL(rawUrl);
    if (!FORBIDDEN_CONTROL_PLANE_PATH_RE.test(u.pathname)) {
      return { forbidden: false };
    }
    const appPort = String(process.env.PORT || 3000);
    const urlPort = u.port || (u.protocol === 'https:' ? '443' : '80');
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isLocalInterfaceHostname(host) || urlPort === appPort) {
      return {
        forbidden: true,
        reason: `Biztonsági korlát: ágens eszköz nem hívhatja a NovaSwarm saját biztonsági vezérlősíkját (${u.pathname}).`,
      };
    }
    return { forbidden: false };
  } catch {
    return { forbidden: false };
  }
}

export async function toggleFullAutonomyProfile(params: {
  enabled: boolean;
  password?: string;
  clientIp?: string;
  telegramSender?: (text: string) => Promise<unknown>;
}): Promise<{
  ok: boolean;
  statusCode: number;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
  settings?: Settings;
}> {
  const sendTg =
    params.telegramSender ||
    (async (text: string) => {
      const m = await import('../telegram/bot');
      return m.sendTelegramMessage(text);
    });

  if (params.enabled) {
    if (!hasWebAuthPassword()) {
      return {
        ok: false,
        statusCode: 403,
        error:
          'A Teljes autonómia profil bekapcsolásához előbb be kell állítani egy operátori jelszót (Beállítások -> Hálózati Operátori Jelszó Zár).',
        code: 'OPERATOR_PASSWORD_NOT_CONFIGURED',
      };
    }

    const ip = params.clientIp || '127.0.0.1';
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      return {
        ok: false,
        statusCode: 429,
        error: `Túl sok hibás jelszópróbálkozás. Próbáld újra ${rate.retryAfterSeconds} másodperc múlva.`,
        code: 'AUTH_RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
      };
    }

    const pw = (params.password || '').trim();
    if (!pw || !verifyWebAuthPassword(pw)) {
      const fail = recordLoginFailure(ip, Date.now(), 'Hibás operátori jelszó Teljes autonómia profil aktiváláshoz');
      return {
        ok: false,
        statusCode: 401,
        error:
          fail.retryAfterSeconds > 0
            ? `Érvénytelen operátori jelszó. Fiókzár aktív (${fail.retryAfterSeconds} mp).`
            : 'Érvénytelen vagy hiányzó operátori jelszó.',
        code: 'INVALID_OPERATOR_PASSWORD',
        retryAfterSeconds: fail.retryAfterSeconds || undefined,
      };
    }
    clearLoginFailures(ip);

    updateState((s) => {
      if (!s.settings.fullAutonomyProfileEnabled) {
        s.settings.fullAutonomyPreviousFlags = {
          hostPermissionsGranted: Boolean(s.settings.hostPermissionsGranted),
          fullAutonomousMode: Boolean(s.settings.fullAutonomousMode),
          dangerousExecAutoApprove: Boolean(s.settings.dangerousExecAutoApprove),
        };
      }
      s.settings.fullAutonomyProfileEnabled = true;
      s.settings.hostPermissionsGranted = true;
      s.settings.fullAutonomousMode = true;
      s.settings.dangerousExecAutoApprove = true;
      // Note: webAuthEnabled, telegramAllowedChatIds, channelPairingRequired, guardrailsEnabled are NEVER lowered here.
    });

    appendAuditLog({
      type: 'security',
      sourceAgentId: 'autonomy-profile',
      sourceAgentName: 'Teljes Autonómia Profil',
      message:
        '[TELJES AUTONÓMIA PROFIL BEKAPCSOLVA] hostPermissionsGranted=true, fullAutonomousMode=true, dangerousExecAutoApprove=true. Minden parancs jóváhagyás nélkül futhat (auditált).',
      verifiedExecution: true,
    });

    await Promise.resolve(
      sendTg(
        '⚠️ [BIZTONSÁGI ÉRTESÍTÉS] A NovaSwarm "Teljes autonómia" profil BEKAPCSOLVA.\n' +
          'A Host jogosultság, Teljes autonóm mód és Veszélyes Zóna aktív (Telegram engedélylista, Web jelszó és /stop Kill-Switch továbbra is él).'
      )
    ).catch(() => {});

    return { ok: true, statusCode: 200, settings: getState().settings };
  }

  // Disabling: restore previously captured 3 flag values cleanly
  const current = getState().settings;
  const prev = current.fullAutonomyPreviousFlags || {
    hostPermissionsGranted: false,
    fullAutonomousMode: false,
    dangerousExecAutoApprove: false,
  };

  updateState((s) => {
    s.settings.fullAutonomyProfileEnabled = false;
    s.settings.hostPermissionsGranted = Boolean(prev.hostPermissionsGranted);
    s.settings.fullAutonomousMode = Boolean(prev.fullAutonomousMode);
    s.settings.dangerousExecAutoApprove = Boolean(prev.dangerousExecAutoApprove);
    s.settings.fullAutonomyPreviousFlags = null;
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: 'autonomy-profile',
    sourceAgentName: 'Teljes Autonómia Profil',
    message:
      `[TELJES AUTONÓMIA PROFIL KIKAPCSOLVA] Előző jogosultságok visszaállítva: ` +
      `host=${prev.hostPermissionsGranted}, autonomous=${prev.fullAutonomousMode}, dangerExec=${prev.dangerousExecAutoApprove}.`,
    verifiedExecution: true,
  });

  await Promise.resolve(
    sendTg(
      `✅ [BIZTONSÁGI ÉRTESÍTÉS] A NovaSwarm "Teljes autonómia" profil KIKAPCSOLVA.\n` +
        `Visszaállított állapot: host=${prev.hostPermissionsGranted}, autonóm=${prev.fullAutonomousMode}, veszélyes exec=${prev.dangerousExecAutoApprove}.`
    )
  ).catch(() => {});

  return { ok: true, statusCode: 200, settings: getState().settings };
}

export function getLatestPhoenixSnapshotTimestamp(
  backupsDir = path.join(process.cwd(), 'backups')
): string | null {
  const s = getState();
  let latestMs = s.settings.lastPhoenixSnapshotAt ? Date.parse(s.settings.lastPhoenixSnapshotAt) : 0;
  if (!Number.isFinite(latestMs)) latestMs = 0;

  try {
    if (fs.existsSync(backupsDir)) {
      for (const file of fs.readdirSync(backupsDir)) {
        if (!file.startsWith('novaswarm-phoenix-') || !file.endsWith('.json')) continue;
        const stat = fs.statSync(path.join(backupsDir, file));
        if (stat.mtimeMs > latestMs) {
          latestMs = stat.mtimeMs;
        }
      }
    }
  } catch {
    // ignore backup directory read failures
  }

  return latestMs > 0 ? new Date(latestMs).toISOString() : null;
}

export function getPhoenixAutonomyStatus(
  nowMs = Date.now(),
  backupsDir?: string
): PhoenixAutonomyStatus {
  const s = getState().settings;
  const fullAutonomyActive = Boolean(s.fullAutonomyProfileEnabled);
  const autoDailyEnabled = s.autoPhoenixSnapshotInFullAutonomy !== false;
  const lastSnapshotAt = getLatestPhoenixSnapshotTimestamp(backupsDir);
  const ageHours =
    lastSnapshotAt && Number.isFinite(Date.parse(lastSnapshotAt))
      ? Math.max(0, Math.round(((nowMs - Date.parse(lastSnapshotAt)) / 3_600_000) * 10) / 10)
      : null;

  const isStale = ageHours === null || ageHours > 24;
  const staleWarning = fullAutonomyActive && isStale;
  const warningMessage = staleWarning
    ? ageHours === null
      ? 'Figyelem: Teljes autonómia aktív, de még nincs egyetlen Phoenix pillanatkép sem! Készíts azonnali biztonsági mentést.'
      : `Figyelem: A legutóbbi Phoenix pillanatkép ${ageHours} órája készült (>24 óra). Javasolt azonnali mentés.`
    : null;

  return {
    fullAutonomyActive,
    autoDailyEnabled,
    lastSnapshotAt,
    ageHours,
    staleWarning,
    warningMessage,
  };
}

export function maybeRunDailyAutoPhoenixSnapshot(
  nowMs = Date.now(),
  snapshotCreator: typeof createPhoenixSnapshot = createPhoenixSnapshot,
  backupsDir?: string
): { created: boolean; fileName?: string; createdAt?: string } {
  const s = getState();
  if (!s.settings.fullAutonomyProfileEnabled) {
    return { created: false };
  }
  if (s.settings.autoPhoenixSnapshotInFullAutonomy === false) {
    return { created: false };
  }
  const latestIso = getLatestPhoenixSnapshotTimestamp(backupsDir);
  const latestMs = latestIso ? Date.parse(latestIso) : 0;
  if (latestMs > 0 && nowMs - latestMs < 24 * 3_600_000) {
    return { created: false };
  }
  const snap = snapshotCreator();
  updateState((draft) => {
    draft.settings.lastPhoenixSnapshotAt = snap.createdAt;
  });
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'phoenix-autonomy',
    sourceAgentName: 'Phoenix Őrszem',
    message: `Napi automatikus Phoenix pillanatkép elkészült (Teljes autonómia védelem): ${snap.fileName}`,
    verifiedExecution: true,
  });
  return { created: true, fileName: snap.fileName, createdAt: snap.createdAt };
}
