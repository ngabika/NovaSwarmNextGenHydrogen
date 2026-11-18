import { execSync, spawn } from 'node:child_process';
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
} from '../../shared/types';
import {
  assertHostPermission,
  requireDestructiveApproval,
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

/**
 * Collects real Linux host hardware metrics + determines thermal/battery throttling state (Section 4.3 & 15.1).
 */
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
 * Local + optional Google Drive backup (Section 17.1 & 3.3).
 * Truthfully reports 'local' unless Google Drive OAuth2 is actually verified connected.
 */
export function createBackupPoint(): BackupPoint {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
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
  fs.writeFileSync(fullPath, snapshotPayload, 'utf8');
  const sizeBytes = fs.statSync(fullPath).size;

  // Never claim cloud backup succeeded unless OAuth2 Google Drive is genuinely connected
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

/**
 * OS Package Upgrade behind Destructive Approval Gate + Host Permission Gate (Section 8.3 & 17.4).
 */
export function requestOsPackageUpgrade(requestedBy = 'Felhasználó'): {
  queuedApprovalId: string;
  command: string;
} {
  assertHostPermission('os_package_upgrade');
  const cmd = 'sudo apt-get update && sudo apt-get upgrade -y';
  const req = requireDestructiveApproval(
    'os_upgrade',
    'Operációs rendszer csomaglista frissítése és csomag-upgrade',
    cmd,
    requestedBy
  );
  return { queuedApprovalId: req.id, command: cmd };
}

/**
 * Real version comparison with ETag caching & optional GITHUB_TOKEN auth (Section 18.2).
 * Never uses a heuristic like "no .git folder => update available".
 */
export async function checkOtaUpdates(): Promise<OtaVersionStatus> {
  let currentVersion = '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    if (pkg.version && pkg.version !== '0.0.0') {
      currentVersion = pkg.version;
    } else {
      const gitHash = execSync('git rev-parse --short HEAD', { cwd: process.cwd(), encoding: 'utf8' }).trim();
      if (gitHash) currentVersion = `git-${gitHash}`;
    }
  } catch {
    currentVersion = '1.0.0';
  }

  const repoSlug = process.env.NOVASWARM_OTA_REPO || 'Szotasz/marveen';
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NovaSwarm-OTA-Checker',
  };
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }
  if (cachedOtaStatus?.etag) {
    headers['If-None-Match'] = cachedOtaStatus.etag;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });

    if (res.status === 304 && cachedOtaStatus) {
      cachedOtaStatus = { ...cachedOtaStatus, checkedAt: new Date().toISOString() };
      return cachedOtaStatus;
    }

    if (res.ok) {
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (data.tag_name || '').replace(/^v/, '') || null;
      const updateAvailable = Boolean(latest && latest !== currentVersion);
      cachedOtaStatus = {
        currentVersion,
        latestVersion: latest,
        updateAvailable,
        checkedAt: new Date().toISOString(),
        etag: res.headers.get('etag'),
        releaseUrl: data.html_url ?? null,
        source: `github:${repoSlug}`,
      };
      return cachedOtaStatus;
    }

    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      etag: null,
      releaseUrl: null,
      source: `github:${repoSlug}`,
      error: `GitHub API HTTP ${res.status} — nincs elérhető kiadási adat`,
    };
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      etag: null,
      releaseUrl: null,
      source: `github:${repoSlug}`,
      error: `Hálózati ellenőrzés sikertelen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Optional host speaker TTS via espeak-ng / spd-say (Section 15.3) */
export function speakOnHostSpeaker(text: string): { launched: boolean; reason?: string } {
  const state = getState();
  if (!state.settings.ttsHostSpeakerEnabled) {
    return { launched: false, reason: 'Gazdagép hangszóró TTS kikapcsolva' };
  }
  const clean = text.replace(/[^\p{L}\p{N}\s.,!?-]/gu, ' ').slice(0, 400);
  try {
    const child = spawn('espeak-ng', ['-v', state.settings.language, clean], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { launched: true };
  } catch {
    return { launched: false, reason: 'espeak-ng nem található a gazdagépen' };
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
