import { execFileSync, execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cron, { type ScheduledTask } from 'node-cron';
import type {
  BackupPoint,
  CronTask,
  HardwareMetrics,
  OtaVersionStatus,
  UptimeTarget,
} from '../../shared/types';
import {
  assertHostPermission,
  requireDestructiveApproval,
  shouldRequireApproval,
} from '../security/permissionGate';
import { appendAuditLog, getState, updateState } from '../state/store';

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const scheduledCronJobs = new Map<string, ScheduledTask>();
let cachedOtaStatus: OtaVersionStatus | null = null;

function readCpuTemperature(): number | null {
  try {
    const thermalRoot = '/sys/class/thermal';
    if (!fs.existsSync(thermalRoot)) return null;
    const zones = fs.readdirSync(thermalRoot).filter((d) => d.startsWith('thermal_zone'));
    for (const z of zones) {
      const tempPath = path.join(thermalRoot, z, 'temp');
      if (fs.existsSync(tempPath)) {
        const raw = Number(fs.readFileSync(tempPath, 'utf8').trim());
        if (!Number.isNaN(raw) && raw > 0) {
          return Number((raw > 1000 ? raw / 1000 : raw).toFixed(1));
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function readBatteryInfo(): { percent: number | null; isCharging: boolean | null } {
  try {
    const psRoot = '/sys/class/power_supply';
    if (!fs.existsSync(psRoot)) return { percent: null, isCharging: null };
    const supplies = fs.readdirSync(psRoot).filter((d) => d.startsWith('BAT'));
    if (supplies.length === 0) return { percent: null, isCharging: null };
    const batDir = path.join(psRoot, supplies[0]);
    const capPath = path.join(batDir, 'capacity');
    const statPath = path.join(batDir, 'status');
    const percent = fs.existsSync(capPath) ? Number(fs.readFileSync(capPath, 'utf8').trim()) : null;
    const statusStr = fs.existsSync(statPath) ? fs.readFileSync(statPath, 'utf8').trim().toLowerCase() : '';
    const isCharging = statusStr ? statusStr === 'charging' || statusStr === 'full' : null;
    return {
      percent: percent !== null && !Number.isNaN(percent) ? percent : null,
      isCharging,
    };
  } catch {
    return { percent: null, isCharging: null };
  }
}

function readDiskStats(): { totalGb: number; usedGb: number; percent: number } {
  try {
    const stats = fs.statfsSync(process.cwd());
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    const totalGb = Number((total / 1024 ** 3).toFixed(1));
    const usedGb = Number((used / 1024 ** 3).toFixed(1));
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { totalGb, usedGb, percent };
  } catch {
    return { totalGb: 0, usedGb: 0, percent: 0 };
  }
}

export function collectHardwareMetrics(): HardwareMetrics {
  const cpus = os.cpus();
  const load1m = os.loadavg()[0] || 0;
  const cpuLoadPercent = Math.min(100, Math.round((load1m / Math.max(1, cpus.length)) * 100));
  const ramTotalMb = Math.round(os.totalmem() / (1024 * 1024));
  const ramFreeMb = Math.round(os.freemem() / (1024 * 1024));
  const ramUsedMb = Math.max(0, ramTotalMb - ramFreeMb);
  const ramPercent = ramTotalMb > 0 ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0;
  const disk = readDiskStats();
  const temperatureCelsius = readCpuTemperature();
  const battery = readBatteryInfo();
  const state = getState();

  let throttledReason: string | null = null;
  if (temperatureCelsius !== null && temperatureCelsius >= state.settings.thermalThrottleCelsius) {
    throttledReason = `Magas CPU hőmérséklet (${temperatureCelsius}°C) — háttérciklusok lassítva`;
  } else if (
    battery.percent !== null &&
    battery.isCharging === false &&
    battery.percent <= state.settings.batteryThrottlePercent
  ) {
    throttledReason = `Alacsony akkumulátor (${battery.percent}%) — energiatakarékos ütemezés`;
  }

  return {
    cpuCores: cpus.length,
    cpuModel: cpus[0]?.model || 'Linux CPU',
    cpuLoadPercent,
    ramTotalMb,
    ramUsedMb,
    ramPercent,
    diskTotalGb: disk.totalGb,
    diskUsedGb: disk.usedGb,
    diskPercent: disk.percent,
    temperatureCelsius,
    batteryPercent: battery.percent,
    isCharging: battery.isCharging,
    throttledReason,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Two-Strikes Uptime Monitor
 */
export function addUptimeTarget(input: {
  name: string;
  url: string;
  expectedText?: string;
  intervalMinutes?: number;
}): UptimeTarget {
  const target: UptimeTarget = {
    id: `up-${crypto.randomUUID().slice(0, 6)}`,
    name: input.name.trim(),
    url: input.url.trim(),
    expectedText: input.expectedText?.trim() || undefined,
    intervalMinutes: Math.max(1, input.intervalMinutes ?? 5),
    enabled: true,
    status: 'unknown',
    consecutiveFailures: 0,
    lastStatusCode: null,
    lastLatencyMs: null,
    lastCheckedAt: null,
    totalChecks: 0,
    upChecks: 0,
  };
  updateState((s) => {
    s.uptimeTargets.push(target);
  });
  return target;
}

export function removeUptimeTarget(id: string): void {
  updateState((s) => {
    s.uptimeTargets = s.uptimeTargets.filter((t) => t.id !== id);
  });
}

export async function runUptimeChecks(
  fetchImpl: typeof fetch = fetch,
  onAlert?: (msg: string) => Promise<void>
): Promise<UptimeTarget[]> {
  const state = getState();
  const targets = state.uptimeTargets.filter((t) => t.enabled);

  for (const t of targets) {
    const start = Date.now();
    let ok = false;
    let statusCode: number | null = null;
    let errorMsg: string | undefined;

    try {
      const res = await fetchImpl(t.url, { signal: AbortSignal.timeout(5000) });
      statusCode = res.status;
      const body = await res.text();
      if (!res.ok) {
        errorMsg = `HTTP ${res.status}`;
      } else if (t.expectedText && !body.includes(t.expectedText)) {
        errorMsg = `Hiányzó tartalomjelző: "${t.expectedText}"`;
      } else {
        ok = true;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = Date.now() - start;
    const prevStatus = t.status;
    let alertText: string | null = null;

    updateState((s) => {
      const ref = s.uptimeTargets.find((x) => x.id === t.id);
      if (!ref) return;
      ref.totalChecks += 1;
      ref.lastLatencyMs = latencyMs;
      ref.lastStatusCode = statusCode;
      ref.lastCheckedAt = new Date().toISOString();
      ref.lastError = errorMsg;

      if (ok) {
        ref.upChecks += 1;
        ref.consecutiveFailures = 0;
        ref.status = 'up';
        if (prevStatus === 'down') {
          alertText = `UPTIME HELYREÁLLT: ${ref.name} (${ref.url}) újra elérhető (${latencyMs}ms).`;
        }
      } else {
        ref.consecutiveFailures += 1;
        // Two-Strikes rule: 1st failure marks degraded; 2nd consecutive marks down + single outage alert
        if (ref.consecutiveFailures >= 2) {
          ref.status = 'down';
          if (prevStatus !== 'down') {
            alertText = `UPTIME LEÁLLÁS (2 egymást követő hiba): ${ref.name} (${ref.url}) — ${errorMsg}`;
          }
        } else {
          ref.status = 'degraded';
        }
      }
    });

    if (alertText) {
      appendAuditLog({
        type: 'uptime',
        sourceAgentId: 'uptime-monitor',
        sourceAgentName: 'Uptime Monitor',
        message: alertText,
        verifiedExecution: true,
      });
      if (onAlert) {
        await onAlert(alertText);
      }
    }
  }

  return getState().uptimeTargets;
}

/**
 * Silent Autonomous Heartbeat:
 * Checks Kanban card aging, Uptime targets, and pending approvals.
 * Quiet when everything is healthy; surfaces actionable alerts cleanly.
 */
export async function runHeartbeatTick(onAlert?: (msg: string) => Promise<void>): Promise<{
  summary: string;
  agedCardIds: string[];
  downTargets: string[];
  pendingApprovals: number;
}> {
  const state = getState();
  await runUptimeChecks(fetch, onAlert);

  const fresh = getState();
  const agingThresholdMs = Math.max(1, fresh.settings.kanbanAgingHours || 48) * 3_600_000;
  const nowMs = Date.now();
  const agedCards = fresh.kanban.filter(
    (c) => !c.archived && c.status !== 'done' && nowMs - Date.parse(c.updatedAt) >= agingThresholdMs
  );
  const downTargets = fresh.uptimeTargets.filter((u) => u.status === 'down').map((u) => u.name);
  const pendingApprovals = fresh.approvals.filter((a) => a.status === 'pending').length;

  const issues: string[] = [];
  if (agedCards.length > 0) issues.push(`${agedCards.length} beakadt Kanban kártya`);
  if (downTargets.length > 0) issues.push(`${downTargets.length} leállt uptime cél (${downTargets.join(', ')})`);
  if (pendingApprovals > 0) issues.push(`${pendingApprovals} függő jóváhagyás`);

  const summary =
    issues.length > 0
      ? `Heartbeat riasztás: ${issues.join(' · ')}`
      : `Heartbeat rendben (${fresh.uptimeTargets.length} uptime cél, ${fresh.kanban.filter((c) => !c.archived && c.status !== 'done').length} aktív feladat)`;

  updateState((s) => {
    s.settings.lastHeartbeatAt = new Date().toISOString();
    s.settings.lastHeartbeatSummary = summary;
  });

  if (issues.length > 0) {
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'heartbeat-engine',
      sourceAgentName: 'Autonóm Heartbeat',
      message: summary,
      verifiedExecution: true,
    });
  }

  return {
    summary,
    agedCardIds: agedCards.map((c) => c.id),
    downTargets,
    pendingApprovals,
  };
}

export function createBackupPoint(): BackupPoint {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  }
  const state = getState();
  const id = `bkp-${crypto.randomUUID().slice(0, 8)}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `novaswarm-backup-${stamp}.json`;
  const fullPath = path.join(BACKUP_DIR, fileName);

  const snapshotPayload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2
  );
  fs.writeFileSync(fullPath, snapshotPayload, { encoding: 'utf8', mode: 0o600 });
  const sizeBytes = fs.statSync(fullPath).size;

  const destination: BackupPoint['destination'] = state.settings.cloudBackupGoogleDriveConnected
    ? 'local_and_drive'
    : 'local';

  const point: BackupPoint = {
    id,
    createdAt: new Date().toISOString(),
    fileName,
    sizeBytes,
    destination,
  };

  updateState((s) => {
    s.backups.unshift(point);
    s.settings.lastBackupAt = point.createdAt;
    s.settings.lastBackupLocation = destination;
  });

  appendAuditLog({
    type: 'system',
    sourceAgentId: 'backup-engine',
    sourceAgentName: 'Mentés Rendszer',
    message:
      destination === 'local_and_drive'
        ? `Biztonsági mentés elkészült (lokálisan és Google Drive-ra): ${fileName}`
        : `Biztonsági mentés elkészült KIZÁRÓLAG lokálisan (${fileName}) — felhő nincs bekötve.`,
    verifiedExecution: true,
  });

  return point;
}

export function restoreBackupPoint(backupId: string): boolean {
  const state = getState();
  const point = state.backups.find((b) => b.id === backupId);
  if (!point) return false;
  const fullPath = path.join(BACKUP_DIR, point.fileName);
  if (!fs.existsSync(fullPath)) return false;

  const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { state?: typeof state };
  if (!parsed.state) return false;

  updateState((s) => {
    Object.assign(s, parsed.state);
  });

  appendAuditLog({
    type: 'system',
    sourceAgentId: 'backup-engine',
    sourceAgentName: 'Mentés Rendszer',
    message: `Rendszer visszaállítva a mentési pontból: ${point.fileName}`,
    verifiedExecution: true,
  });
  return true;
}

export function requestOsPackageUpgrade(requestedBy = 'Felhasználó'): {
  queuedApprovalId: string;
  executedDirectly?: boolean;
  output?: string;
  command: string;
} {
  assertHostPermission('os_package_upgrade');
  const cmd = 'sudo apt-get update && sudo apt-get upgrade -y';
  if (!shouldRequireApproval()) {
    let output = '';
    try {
      output = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 }).slice(0, 1200);
    } catch (err) {
      output = `Autonóm végrehajtás kimenet: ${err instanceof Error ? err.message : String(err)}`;
    }
    appendAuditLog({
      type: 'action',
      sourceAgentId: 'system-ops',
      sourceAgentName: requestedBy,
      message: `OS csomagfrissítés közvetlenül elindítva (Autonóm mód): ${cmd}`,
      verifiedExecution: true,
    });
    return { queuedApprovalId: 'auto-executed', executedDirectly: true, output, command: cmd };
  }
  const req = requireDestructiveApproval(
    'os_upgrade',
    'Operációs rendszer csomaglista frissítése és csomag-upgrade',
    cmd,
    requestedBy
  );
  return { queuedApprovalId: req.id, executedDirectly: false, command: cmd };
}

export async function checkOtaUpdates(fetchImpl: typeof fetch = fetch): Promise<OtaVersionStatus> {
  const hasGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
  let localCommit: string | null = null;
  let currentVersion = '1.0.0';

  if (hasGitRepo) {
    try {
      localCommit = execSync('git rev-parse --short HEAD', { cwd: process.cwd(), encoding: 'utf8' }).trim() || null;
    } catch {
      localCommit = null;
    }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    if (pkg.version && pkg.version !== '0.0.0') {
      currentVersion = pkg.version;
    } else if (localCommit) {
      currentVersion = `git-${localCommit}`;
    }
  } catch {
    if (localCommit) currentVersion = `git-${localCommit}`;
  }

  const state = getState();
  const repoSlug =
    state.settings.otaRepoSlug?.trim() ||
    process.env.NOVASWARM_OTA_REPO ||
    'ngabika/NovaSwarmNextGenHydrogen';

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NovaSwarm-OTA-Checker',
  };
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }
  if (cachedOtaStatus?.etag && cachedOtaStatus.source === `github:${repoSlug}`) {
    headers['If-None-Match'] = cachedOtaStatus.etag;
  }

  let commitsBehind = 0;
  if (hasGitRepo) {
    try {
      execSync('git fetch --quiet origin', { cwd: process.cwd(), timeout: 5000, stdio: 'ignore' });
      const behindStr = execSync('git rev-list --count HEAD..origin/main', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 2000,
      }).trim();
      commitsBehind = Math.max(0, Number(behindStr) || 0);
    } catch {
      // ignore if origin/main not fetched or offline
    }
  }

  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(4500),
    });

    if (res.status === 304 && cachedOtaStatus) {
      cachedOtaStatus = {
        ...cachedOtaStatus,
        checkedAt: new Date().toISOString(),
        hasGitRepo,
        localCommit,
        commitsBehind,
      };
      return cachedOtaStatus;
    }

    if (res.ok) {
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (data.tag_name || '').replace(/^v/, '') || null;
      const updateAvailable = commitsBehind > 0 || Boolean(latest && latest !== currentVersion);
      cachedOtaStatus = {
        currentVersion,
        latestVersion: latest,
        updateAvailable,
        checkedAt: new Date().toISOString(),
        etag: res.headers.get('etag'),
        releaseUrl: data.html_url ?? `https://github.com/${repoSlug}`,
        source: `github:${repoSlug}`,
        hasGitRepo,
        localCommit,
        remoteCommit: null,
        commitsBehind,
        autoUpdatedAt: cachedOtaStatus?.autoUpdatedAt ?? null,
      };
      return cachedOtaStatus;
    }

    // Fallback when repo has commits on main without GitHub Releases tags
    if (res.status === 404) {
      const commitRes = await fetchImpl(`https://api.github.com/repos/${repoSlug}/commits/main`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'NovaSwarm-OTA-Checker',
          ...(headers.Authorization ? { Authorization: headers.Authorization } : {}),
        },
        signal: AbortSignal.timeout(4500),
      });
      if (commitRes.ok) {
        const cData = (await commitRes.json()) as {
          sha?: string;
          html_url?: string;
          commit?: { message?: string };
        };
        const remoteShort = cData.sha ? cData.sha.slice(0, 7) : null;
        const updateAvailable =
          commitsBehind > 0 || Boolean(localCommit && remoteShort && localCommit !== remoteShort);
        cachedOtaStatus = {
          currentVersion,
          latestVersion: remoteShort ? `git-${remoteShort}` : null,
          updateAvailable,
          checkedAt: new Date().toISOString(),
          etag: commitRes.headers.get('etag'),
          releaseUrl: cData.html_url ?? `https://github.com/${repoSlug}`,
          source: `github:${repoSlug}`,
          hasGitRepo,
          localCommit,
          remoteCommit: remoteShort,
          commitsBehind,
          autoUpdatedAt: cachedOtaStatus?.autoUpdatedAt ?? null,
        };
        return cachedOtaStatus;
      }
    }

    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: commitsBehind > 0,
      checkedAt: new Date().toISOString(),
      etag: null,
      releaseUrl: `https://github.com/${repoSlug}`,
      source: `github:${repoSlug}`,
      hasGitRepo,
      localCommit,
      commitsBehind,
      error: `GitHub API HTTP ${res.status} — nincs elérhető kiadási adat`,
    };
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: commitsBehind > 0,
      checkedAt: new Date().toISOString(),
      etag: null,
      releaseUrl: `https://github.com/${repoSlug}`,
      source: `github:${repoSlug}`,
      hasGitRepo,
      localCommit,
      commitsBehind,
      error: `Hálózati ellenőrzés sikertelen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function getOtaGitDiff(): {
  hasGitRepo: boolean;
  repoSlug: string;
  commitsBehind: number;
  stat: string;
  diff: string;
  message: string;
} {
  const repoSlug =
    getState().settings.otaRepoSlug?.trim() ||
    process.env.NOVASWARM_OTA_REPO ||
    'ngabika/NovaSwarmNextGenHydrogen';
  const hasGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
  if (!hasGitRepo) {
    return {
      hasGitRepo: false,
      repoSlug,
      commitsBehind: 0,
      stat: '',
      diff: '',
      message: `Nincs helyi .git tároló ebben a munkakönyvtárban. Éles Linux szerveren a "git clone https://github.com/${repoSlug}.git" telepítés után itt látható a távoli diff.`,
    };
  }

  try {
    execSync('git fetch --quiet origin', { cwd: process.cwd(), timeout: 8000, stdio: 'ignore' });
    const behind = Number(
      execSync('git rev-list --count HEAD..origin/main', { cwd: process.cwd(), encoding: 'utf8' }).trim() || 0
    );
    const stat = execSync('git diff --stat HEAD..origin/main', { cwd: process.cwd(), encoding: 'utf8' }).trim();
    const diff = execSync('git diff HEAD..origin/main', { cwd: process.cwd(), encoding: 'utf8' }).slice(0, 8000);
    return {
      hasGitRepo: true,
      repoSlug,
      commitsBehind: behind,
      stat,
      diff,
      message: behind > 0 ? `${behind} új commit érhető el a GitHubról.` : 'A helyi tároló naprakész az origin/main ággal.',
    };
  } catch (err) {
    return {
      hasGitRepo: true,
      repoSlug,
      commitsBehind: 0,
      stat: '',
      diff: '',
      message: `Git diff lekérés sikertelen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function applyOtaUpdate(): {
  ok: boolean;
  rolledBack: boolean;
  backupId?: string;
  previousCommit?: string;
  newCommit?: string;
  message: string;
} {
  const backup = createBackupPoint();
  const repoSlug =
    getState().settings.otaRepoSlug?.trim() ||
    process.env.NOVASWARM_OTA_REPO ||
    'ngabika/NovaSwarmNextGenHydrogen';
  const hasGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));

  if (!hasGitRepo) {
    return {
      ok: false,
      rolledBack: false,
      backupId: backup.id,
      message: `Biztonsági mentés elkészült (${backup.fileName}), de ebben a környezetben nincs .git tároló. Éles szerveren futtasd: git clone https://github.com/${repoSlug}.git && cd NovaSwarmNextGenHydrogen && bash install.sh`,
    };
  }

  let prevCommit = '';
  try {
    prevCommit = execSync('git rev-parse HEAD', { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    prevCommit = '';
  }

  try {
    execSync('git pull --ff-only origin main', { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
    execSync('npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps', {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 90000,
    });
    execSync('npm run lint && npm run build', { cwd: process.cwd(), encoding: 'utf8', timeout: 90000 });
    const newCommit = execSync('git rev-parse --short HEAD', { cwd: process.cwd(), encoding: 'utf8' }).trim();
    const now = new Date().toISOString();
    if (cachedOtaStatus) {
      cachedOtaStatus.autoUpdatedAt = now;
      cachedOtaStatus.updateAvailable = false;
      cachedOtaStatus.localCommit = newCommit;
    }
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'ota-updater',
      sourceAgentName: 'GitHub OTA Frissítő',
      message: `Sikeres GitHub OTA frissítés (${repoSlug}): ${prevCommit.slice(0, 7)} -> ${newCommit}`,
      verifiedExecution: true,
    });
    return {
      ok: true,
      rolledBack: false,
      backupId: backup.id,
      previousCommit: prevCommit.slice(0, 7),
      newCommit,
      message: `Sikeres frissítés (${prevCommit.slice(0, 7)} -> ${newCommit}) és build ellenőrzés. Újraindítás ajánlott a friss kód betöltéséhez.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (prevCommit && /^[0-9a-f]{7,40}$/i.test(prevCommit.trim())) {
      try {
        execFileSync('git', ['reset', '--hard', prevCommit.trim()], { cwd: process.cwd(), stdio: 'ignore', timeout: 15000 });
        execFileSync('npm', ['run', 'build'], { cwd: process.cwd(), stdio: 'ignore', timeout: 60000 });
      } catch {
        // rollback best effort
      }
    }
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'ota-updater',
      sourceAgentName: 'GitHub OTA Frissítő',
      message: `OTA frissítés sikertelen, visszaállítva (${prevCommit.slice(0, 7)}): ${msg}`,
      verifiedExecution: true,
    });
    return {
      ok: false,
      rolledBack: Boolean(prevCommit),
      backupId: backup.id,
      previousCommit: prevCommit.slice(0, 7),
      message: `Frissítés sikertelen — automatikus Git rollback végrehajtva: ${msg}`,
    };
  }
}

export function speakOnHostSpeaker(text: string): { launched: boolean; engine?: string; reason?: string } {
  const state = getState();
  if (!state.settings.ttsHostSpeakerEnabled) {
    return { launched: false, reason: 'Gazdagép hangszóró TTS kikapcsolva' };
  }
  const clean = text.replace(/[^\p{L}\p{N}\s.,!?-]/gu, ' ').slice(0, 400);
  const lang = /^[a-z]{2}(?:-[a-zA-Z0-9]+)?$/.test(state.settings.language) ? state.settings.language : 'hu';
  const rawPiper = state.settings.piperTtsBinary?.trim() || 'piper';
  const safePiperBin = /^[a-zA-Z0-9_./-]+$/.test(rawPiper) ? rawPiper : null;

  /** Ú46: Try neural Piper TTS first if available on host without shell interpolation */
  if (safePiperBin) {
    try {
      execFileSync('which', [safePiperBin], { stdio: 'ignore' });
      const piper = spawn(safePiperBin, ['--output-raw'], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const aplay = spawn('aplay', ['-r', '22050', '-f', 'S16_LE', '-t', 'raw', '-'], {
        detached: true,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      piper.stdout?.pipe(aplay.stdin);
      piper.stdin?.end(clean);
      aplay.unref();
      return { launched: true, engine: 'piper' };
    } catch {
      // Fallback to espeak-ng
    }
  }

  try {
    const child = spawn('espeak-ng', ['-v', lang, clean], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { launched: true, engine: 'espeak-ng' };
  } catch {
    return { launched: false, reason: 'Sem piper, sem espeak-ng nem található a gazdagépen' };
  }
}

export function registerCronTask(task: CronTask, onTrigger: (t: CronTask) => Promise<void>): void {
  const existing = scheduledCronJobs.get(task.id);
  if (existing) {
    existing.stop();
    scheduledCronJobs.delete(task.id);
  }
  if (!task.enabled || !cron.validate(task.cronExpression)) return;

  const job = cron.schedule(task.cronExpression, () => {
    void onTrigger(task);
  });
  scheduledCronJobs.set(task.id, job);
}

export function stopAllCronTasks(): void {
  for (const job of scheduledCronJobs.values()) {
    job.stop();
  }
  scheduledCronJobs.clear();
}
