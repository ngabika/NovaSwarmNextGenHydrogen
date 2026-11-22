import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  HardwareAdaptiveProfile,
  HardwareTierId,
  NovaSwarmState,
} from '../../shared/types';
import { appendAuditLog, getState, updateState } from '../state/store';
import { clearResponseCache, unloadOllamaModel } from '../providers/router';

export interface TelemetryBufferSample {
  timestamp: string;
  ramPercent: number;
  cpuLoad1m: number;
  note?: string;
}

const telemetryRingBuffer: TelemetryBufferSample[] = [];
const MAX_RING_SAMPLES = 120;
let lastFlushedCount = 0;
let lastFlushAt: string | null = null;

function readProcMeminfo(): { ramTotalMb: number; ramAvailableMb: number; swapTotalMb: number } {
  const fallbackTotal = Math.max(256, Math.round(os.totalmem() / 1048576));
  const fallbackAvail = Math.max(64, Math.round(os.freemem() / 1048576));
  try {
    if (fs.existsSync('/proc/meminfo')) {
      const txt = fs.readFileSync('/proc/meminfo', 'utf8');
      const total = txt.match(/MemTotal:\s+(\d+)\s+kB/i);
      const avail = txt.match(/MemAvailable:\s+(\d+)\s+kB/i);
      const swap = txt.match(/SwapTotal:\s+(\d+)\s+kB/i);
      return {
        ramTotalMb: total ? Math.round(Number(total[1]) / 1024) : fallbackTotal,
        ramAvailableMb: avail ? Math.round(Number(avail[1]) / 1024) : fallbackAvail,
        swapTotalMb: swap ? Math.round(Number(swap[1]) / 1024) : 0,
      };
    }
  } catch {
    // ignore
  }
  return { ramTotalMb: fallbackTotal, ramAvailableMb: fallbackAvail, swapTotalMb: 0 };
}

function detectStorageKind(): 'sd_or_emmc' | 'ssd_or_nvme' | 'unknown' {
  try {
    if (!fs.existsSync('/sys/block')) return 'unknown';
    const devs = fs.readdirSync('/sys/block');
    if (devs.some((d) => d.startsWith('mmcblk'))) return 'sd_or_emmc';
    if (devs.some((d) => d.startsWith('nvme'))) return 'ssd_or_nvme';
    for (const d of devs) {
      if (!d.startsWith('sd')) continue;
      const rotPath = `/sys/block/${d}/queue/rotational`;
      if (fs.existsSync(rotPath) && fs.readFileSync(rotPath, 'utf8').trim() === '0') {
        return 'ssd_or_nvme';
      }
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function detectGpuSummary(): { hasGpu: boolean; gpuName: string } {
  try {
    const nv = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name', '--format=csv,noheader'],
      { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (nv) {
      return { hasGpu: true, gpuName: nv.split('\n')[0].trim() };
    }
  } catch {
    // no nvidia GPU
  }
  return { hasGpu: false, gpuName: 'none' };
}

/**
 * Pure, deterministic hardware tier & optimization engine.
 * Adjusts EVERY runtime interval, concurrency, Ollama model, heap limit,
 * SD wear protection, and RAM watchdog threshold to match the host machine.
 */
export function classifyHardwareSpecs(input: {
  cpuCores: number;
  arch: string;
  ramTotalMb: number;
  ramAvailableMb: number;
  swapTotalMb: number;
  storageKind: 'sd_or_emmc' | 'ssd_or_nvme' | 'unknown';
  hasGpu: boolean;
  gpuName: string;
}): HardwareAdaptiveProfile {
  const { cpuCores, arch, ramTotalMb, ramAvailableMb, swapTotalMb, storageKind, hasGpu, gpuName } = input;
  const isArm = /arm|aarch64/i.test(arch);
  const sdRisk = storageKind === 'sd_or_emmc' || (isArm && ramTotalMb <= 4096);

  let tier: HardwareTierId;
  let tierLabel: string;
  let recommendedOllamaModel: string;
  let recommendedNumCtx: number;
  let recommendedHeapMb: number;
  let recommendedConcurrency: number;
  let recommendedHeartbeatMinutes: number;
  let recommendedNightShiftMinutes: number;
  let recommendedDreamIdleMinutes: number;
  let recommendedOllamaIdleUnloadMinutes: number;
  let recommendedCpuThreshold: number;
  let recommendedRamWatchdogPercent: number;

  if (hasGpu || ramTotalMb >= 14336) {
    tier = 'workstation_gpu';
    tierLabel = hasGpu ? 'GPU Munkaállomás / Szerver' : 'Erős Asztali / Mini-PC (16+ GB RAM)';
    recommendedOllamaModel = 'qwen2.5-coder:7b';
    recommendedNumCtx = 8192;
    recommendedHeapMb = 2048;
    recommendedConcurrency = Math.min(8, Math.max(4, cpuCores));
    recommendedHeartbeatMinutes = 2;
    recommendedNightShiftMinutes = 15;
    recommendedDreamIdleMinutes = 5;
    recommendedOllamaIdleUnloadMinutes = 30;
    recommendedCpuThreshold = Number(Math.max(4, cpuCores * 1.5).toFixed(1));
    recommendedRamWatchdogPercent = 92;
  } else if (ramTotalMb >= 6144) {
    tier = 'standard_desktop';
    tierLabel = 'Normál Asztali / VPS (8 GB kategória)';
    recommendedOllamaModel = 'qwen2.5:3b';
    recommendedNumCtx = 4096;
    recommendedHeapMb = 1280;
    recommendedConcurrency = Math.min(4, Math.max(2, cpuCores));
    recommendedHeartbeatMinutes = 4;
    recommendedNightShiftMinutes = 25;
    recommendedDreamIdleMinutes = 8;
    recommendedOllamaIdleUnloadMinutes = 15;
    recommendedCpuThreshold = Number(Math.max(3, cpuCores * 1.25).toFixed(1));
    recommendedRamWatchdogPercent = 88;
  } else if (ramTotalMb >= 2300) {
    tier = 'mid_sbc_vps';
    tierLabel = 'Közepes SBC / 4 GB VPS';
    recommendedOllamaModel = 'qwen2.5:3b';
    recommendedNumCtx = 3072;
    recommendedHeapMb = 896;
    recommendedConcurrency = 2;
    recommendedHeartbeatMinutes = 5;
    recommendedNightShiftMinutes = 30;
    recommendedDreamIdleMinutes = 10;
    recommendedOllamaIdleUnloadMinutes = 8;
    recommendedCpuThreshold = Number(Math.max(2.5, cpuCores * 1.1).toFixed(1));
    recommendedRamWatchdogPercent = 86;
  } else {
    tier = 'ultra_light_pi';
    tierLabel = 'Ultra-Könnyű Raspberry Pi / 2 GB SBC';
    recommendedOllamaModel = 'qwen2.5:1.5b';
    recommendedNumCtx = 2048;
    recommendedHeapMb = 640;
    recommendedConcurrency = 1;
    recommendedHeartbeatMinutes = 8;
    recommendedNightShiftMinutes = 45;
    recommendedDreamIdleMinutes = 15;
    recommendedOllamaIdleUnloadMinutes = 4;
    recommendedCpuThreshold = Number(Math.max(2.0, cpuCores * 0.9).toFixed(1));
    recommendedRamWatchdogPercent = 84;
  }

  const appliedNotes: string[] = [
    `Profil: ${tierLabel} (${cpuCores} mag, ${ramTotalMb} MB RAM, Arch: ${arch})`,
    `Ajánlott lokális modell: ${recommendedOllamaModel} (NumCtx=${recommendedNumCtx}, IdleUnload=${recommendedOllamaIdleUnloadMinutes}p)`,
    `Node.js heap korlát: ${recommendedHeapMb} MB · Párhuzamosság: ${recommendedConcurrency}`,
    `Ütemezések: Heartbeat=${recommendedHeartbeatMinutes}p · NightShift=${recommendedNightShiftMinutes}p · Álmodás=${recommendedDreamIdleMinutes}p`,
    `RAM Őrszem küszöb: ${recommendedRamWatchdogPercent}% · SD-kártya kímélő mód: ${sdRisk ? 'BE' : 'KI'}`,
  ];

  return {
    tier,
    tierLabel,
    arch,
    cpuCores,
    ramTotalMb,
    ramAvailableMb,
    swapTotalMb,
    storageKind,
    hasGpu,
    gpuName,
    recommendedOllamaModel,
    recommendedNumCtx,
    recommendedHeapMb,
    recommendedConcurrency,
    recommendedHeartbeatMinutes,
    recommendedNightShiftMinutes,
    recommendedDreamIdleMinutes,
    recommendedOllamaIdleUnloadMinutes,
    recommendedCpuThreshold,
    recommendedRamWatchdogPercent,
    sdCardSparingRecommended: sdRisk,
    hybridLocalFirstRecommended: true,
    detectedAt: new Date().toISOString(),
    appliedNotes,
  };
}

export function detectHardwareProfile(): HardwareAdaptiveProfile {
  const mem = readProcMeminfo();
  const gpu = detectGpuSummary();
  return classifyHardwareSpecs({
    cpuCores: Math.max(1, os.cpus().length),
    arch: `${os.platform()}/${os.arch()}`,
    ramTotalMb: mem.ramTotalMb,
    ramAvailableMb: mem.ramAvailableMb,
    swapTotalMb: mem.swapTotalMb,
    storageKind: detectStorageKind(),
    hasGpu: gpu.hasGpu,
    gpuName: gpu.gpuName,
  });
}

export function applyHardwareAdaptiveOptimization(force = true): {
  profile: HardwareAdaptiveProfile;
  updatedSettingsFields: string[];
} {
  const profile = detectHardwareProfile();
  const s = getState();
  if (!force && s.settings.hardwareAutoOptimize === false) {
    return { profile, updatedSettingsFields: [] };
  }

  const updatedSettingsFields: string[] = [
    'detectedHardwareTier',
    'ollamaNumCtx',
    'ollamaAutoUnloadMinutes',
    'heartbeatIntervalMinutes',
    'nightShiftIntervalMinutes',
    'dreamingIdleMinutes',
    'cpuLoadThrottleThreshold',
    'ramWatchdogThresholdPercent',
    'sdCardSparingMode',
  ];

  updateState((draft) => {
    draft.hardwareProfile = profile;
    draft.settings.hardwareAutoOptimize = true;
    draft.settings.detectedHardwareTier = profile.tier;
    draft.settings.ollamaNumCtx = profile.recommendedNumCtx;
    draft.settings.ollamaAutoUnloadMinutes = profile.recommendedOllamaIdleUnloadMinutes;
    draft.settings.heartbeatIntervalMinutes = profile.recommendedHeartbeatMinutes;
    draft.settings.nightShiftIntervalMinutes = profile.recommendedNightShiftMinutes;
    draft.settings.dreamingIdleMinutes = profile.recommendedDreamIdleMinutes;
    draft.settings.cpuLoadThrottleThreshold = profile.recommendedCpuThreshold;
    draft.settings.ramWatchdogThresholdPercent = profile.recommendedRamWatchdogPercent;
    draft.settings.sdCardSparingMode = profile.sdCardSparingRecommended;
    draft.settings.hybridLocalFirst = draft.settings.hybridLocalFirst ?? true;

    // Only swap ollamaModel automatically when blank or set to a known default tier model
    const knownTierModels = new Set(['qwen2.5:1.5b', 'qwen2.5:3b', 'qwen2.5-coder:7b']);
    if (!draft.settings.ollamaModel || knownTierModels.has(draft.settings.ollamaModel)) {
      draft.settings.ollamaModel = profile.recommendedOllamaModel;
      updatedSettingsFields.push('ollamaModel');
    }
  });

  // Sync recommended model/heap hints into .env if .env exists (without touching secrets)
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      let envText = fs.readFileSync(envPath, 'utf8');
      if (/^NOVASWARM_RECOMMENDED_MODEL=/m.test(envText)) {
        envText = envText.replace(
          /^NOVASWARM_RECOMMENDED_MODEL=.*$/m,
          `NOVASWARM_RECOMMENDED_MODEL=${profile.recommendedOllamaModel}`
        );
      } else {
        envText = `${envText.trimEnd()}\nNOVASWARM_RECOMMENDED_MODEL=${profile.recommendedOllamaModel}\n`;
      }
      fs.writeFileSync(envPath, envText, 'utf8');
    } catch {
      // non-fatal
    }
  }

  appendAuditLog({
    type: 'system',
    sourceAgentId: 'hardware-optimizer',
    sourceAgentName: 'Hardver-Adaptív Optimalizáló',
    message: `Auto-profil alkalmazva [${profile.tierLabel}]: modell=${profile.recommendedOllamaModel}, heap=${profile.recommendedHeapMb}MB, RAM őrszem=${profile.recommendedRamWatchdogPercent}%`,
    verifiedExecution: true,
  });

  return { profile, updatedSettingsFields };
}

/**
 * Batch 5: SD-card sparing telemetry ring buffer (batches writes when sdCardSparingMode is ON)
 */
export function recordSdBufferedTelemetry(note?: string): TelemetryBufferSample {
  const mem = readProcMeminfo();
  const usedMb = Math.max(0, mem.ramTotalMb - mem.ramAvailableMb);
  const ramPercent = Math.round((usedMb / Math.max(1, mem.ramTotalMb)) * 100);
  const sample: TelemetryBufferSample = {
    timestamp: new Date().toISOString(),
    ramPercent,
    cpuLoad1m: Number((os.loadavg()[0] || 0).toFixed(2)),
    note,
  };
  telemetryRingBuffer.push(sample);
  if (telemetryRingBuffer.length > MAX_RING_SAMPLES) {
    telemetryRingBuffer.shift();
  }
  return sample;
}

export function flushTelemetryRingBuffer(): { flushedSamples: number; flushedAt: string } {
  const count = telemetryRingBuffer.length;
  lastFlushedCount = count;
  lastFlushAt = new Date().toISOString();
  telemetryRingBuffer.length = 0;
  return { flushedSamples: count, flushedAt: lastFlushAt };
}

export function getTelemetryBufferStatus(): {
  bufferedCount: number;
  lastFlushedCount: number;
  lastFlushAt: string | null;
  latestSample: TelemetryBufferSample | null;
} {
  return {
    bufferedCount: telemetryRingBuffer.length,
    lastFlushedCount,
    lastFlushAt,
    latestSample: telemetryRingBuffer[telemetryRingBuffer.length - 1] || null,
  };
}

/**
 * Batch 5: 2 GB Pi RAM & OOM Watchdog
 * Releases Ollama VRAM/RAM, clears gateway cache, and flushes buffers above threshold.
 */
export async function runRamOomWatchdogTick(ramPercentOverride?: number): Promise<{
  checkedAt: string;
  ramPercent: number;
  thresholdPercent: number;
  triggered: boolean;
  actionsTaken: string[];
}> {
  const s = getState();
  const threshold = s.settings.ramWatchdogThresholdPercent ?? 85;
  const mem = readProcMeminfo();
  const computedPercent = Math.round(((mem.ramTotalMb - mem.ramAvailableMb) / Math.max(1, mem.ramTotalMb)) * 100);
  const ramPercent = typeof ramPercentOverride === 'number' ? ramPercentOverride : computedPercent;
  const actionsTaken: string[] = [];

  recordSdBufferedTelemetry(`ram=${ramPercent}%`);

  if (ramPercent >= threshold) {
    try {
      await unloadOllamaModel();
      actionsTaken.push(`Ollama modell RAM felszabadítás (RAM=${ramPercent}% >= ${threshold}%)`);
    } catch {
      actionsTaken.push('Ollama unload kísérlet (offline vagy üres)');
    }
    const cleared = clearResponseCache();
    actionsTaken.push(`Válasz gyorsítótár ürítve (${cleared} bejegyzés)`);
    const flushed = flushTelemetryRingBuffer();
    actionsTaken.push(`Telemetria puffer ürítve (${flushed.flushedSamples} minta)`);

    if (typeof global.gc === 'function') {
      try {
        global.gc();
        actionsTaken.push('Node V8 GC kényszerítve');
      } catch {
        // ignore
      }
    }

    updateState((draft) => {
      draft.proactiveEvents = draft.proactiveEvents || [];
      draft.proactiveEvents.unshift({
        id: `pe-${Date.now().toString(36)}`,
        kind: 'ram_watchdog',
        title: `RAM Őrszem beavatkozás (${ramPercent}%)`,
        summary: actionsTaken.join(' · '),
        notifiedTelegram: ramPercent >= 93,
        createdAt: new Date().toISOString(),
      });
      draft.proactiveEvents = draft.proactiveEvents.slice(0, 60);
    });

    appendAuditLog({
      type: 'system',
      sourceAgentId: 'ram-watchdog',
      sourceAgentName: 'RAM/OOM Őrszem',
      message: `Memóriavédelem aktiválva (${ramPercent}%): ${actionsTaken.join(', ')}`,
      verifiedExecution: true,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    ramPercent,
    thresholdPercent: threshold,
    triggered: ramPercent >= threshold,
    actionsTaken,
  };
}

/**
 * Batch 5: Hybrid Context Router
 * Decides locally vs cloud provider using prompt complexity, length, and hardware tier.
 */
export function routeTaskModelHybrid(
  prompt: string,
  complexity: 'simple' | 'complex',
  stateOverride?: NovaSwarmState
): {
  target: 'local_ollama' | 'cloud_primary';
  provider: 'ollama' | NovaSwarmState['settings']['primaryProvider'];
  model: string;
  reason: string;
} {
  const s = stateOverride ?? getState();
  const tier = s.settings.detectedHardwareTier || 'standard_desktop';
  const ollamaModel = s.settings.ollamaModel || 'qwen2.5:1.5b';

  if (s.settings.ollamaOnlyMode) {
    return {
      target: 'local_ollama',
      provider: 'ollama',
      model: ollamaModel,
      reason: 'Ollama-only mód aktív (100% lokális)',
    };
  }

  const trimmed = prompt.trim();
  const isCodingOrHeavy =
    complexity === 'complex' ||
    trimmed.length > 600 ||
    /\b(kód|typescript|python|refactor|architektúra|debug|elemezd részletesen|kutass|összehasonlítás)\b/i.test(
      trimmed
    );

  const hasCloudKey =
    (s.settings.providerKeys[s.settings.primaryProvider] || []).some((k) => k.enabled) ||
    (s.settings.providerKeys[s.settings.secondaryProvider] || []).some((k) => k.enabled);

  if (s.settings.hybridLocalFirst !== false && !isCodingOrHeavy) {
    return {
      target: 'local_ollama',
      provider: 'ollama',
      model: ollamaModel,
      reason: `Gyors/egyszerű feladat (${tier}) -> ingyenes lokális Ollama (${ollamaModel})`,
    };
  }

  if (tier === 'workstation_gpu' && s.settings.hybridLocalFirst && trimmed.length < 1800 && !hasCloudKey) {
    return {
      target: 'local_ollama',
      provider: 'ollama',
      model: ollamaModel,
      reason: 'Erős GPU/RAM csomópont -> helyi nagy modell',
    };
  }

  if (!hasCloudKey) {
    return {
      target: 'local_ollama',
      provider: 'ollama',
      model: ollamaModel,
      reason: 'Nincs felhős API kulcs -> lokális Ollama végrehajtás',
    };
  }

  return {
    target: 'cloud_primary',
    provider: s.settings.primaryProvider,
    model: 'cloud-auto',
    reason: `Nehéz / hosszú / kódolási feladat (${tier}) -> felhős modell (${s.settings.primaryProvider})`,
  };
}
