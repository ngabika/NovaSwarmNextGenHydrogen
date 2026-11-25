import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HardwareTierId, OllamaBenchmarkTelemetry } from '../../shared/types';
import {
  appendAuditLog,
  getState,
  updateState,
} from '../state/store';

export type OllamaCapability = 'general' | 'code' | 'vision' | 'embedding' | 'tools' | 'reasoning';

export interface OllamaCatalogModel {
  name: string;
  family: string;
  paramsB: number;
  quantization: string;
  memoryMb: number;
  contextMemoryPer4kMb: number;
  diskMb: number;
  capabilities: OllamaCapability[];
  minRamMb: number;
  minDiskMb: number;
  minVramMb: number;
  estTokensPerSecCpu: number;
  estTokensPerSecGpu: number;
  qualityScore: number;
}

export interface OllamaModelCatalog {
  catalogVersion: number;
  updatedAt: string;
  models: OllamaCatalogModel[];
}

export interface DetailedHardwareSpecs {
  arch: string;
  platform: string;
  isArm: boolean;
  isRaspberryPi: boolean;
  boardModel: string;
  cpuCores: number;
  cpuFlags: string[];
  hasAvx2: boolean;
  hasNeon: boolean;
  ramTotalMb: number;
  ramFreeMb: number;
  swapTotalMb: number;
  zramPresent: boolean;
  diskFreeMb: number;
  storageKind: 'sd_or_emmc' | 'ssd_or_nvme' | 'unknown';
  gpuVendor: 'nvidia' | 'amd' | 'apple' | 'intel_igpu' | 'none';
  gpuName: string;
  gpuVramMb: number;
}

export interface CandidateVerificationResult {
  available: boolean;
  source: 'local_tags' | 'registry_manifest' | 'skipped' | 'error';
  reason?: string;
}

export interface OllamaSuiteSelection {
  tier: HardwareTierId;
  tierLabel: string;
  usableMemoryBudgetMb: number;
  osAndNovaHeadroomMb: number;
  mainModel: string;
  mainModelParamsB: number;
  fastModel: string;
  codeModel: string;
  embeddingModel: string;
  visionModel: string | null;
  numCtx: number;
  keepAlive: string;
  numParallel: number;
  gpuLayers: number;
  singleModelMutex: boolean;
  sdCardSparingMode: boolean;
  estimatedTokensPerSec: number;
  skippedCandidates: Array<{ model: string; reason: string }>;
  rationale: string[];
}

const DEFAULT_CATALOG_PATH = path.join(process.cwd(), 'config', 'ollama-models.json');

export function loadOllamaModelCatalog(catalogPath = DEFAULT_CATALOG_PATH): OllamaModelCatalog {
  const raw = fs.readFileSync(catalogPath, 'utf8');
  return JSON.parse(raw) as OllamaModelCatalog;
}

function readCpuFlags(): string[] {
  try {
    if (!fs.existsSync('/proc/cpuinfo')) return [];
    const txt = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const flagsLine = txt.match(/^(?:Flags|Features)\s*:\s*(.+)$/im);
    if (!flagsLine) return [];
    return flagsLine[1]
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 64);
  } catch {
    return [];
  }
}

function readBoardModel(): { isRaspberryPi: boolean; boardModel: string } {
  const candidates = ['/proc/device-tree/model', '/sys/firmware/devicetree/base/model'];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8').replace(/\0/g, '').trim();
        if (raw) {
          return {
            isRaspberryPi: /raspberry\s*pi/i.test(raw),
            boardModel: raw,
          };
        }
      }
    } catch {
      // ignore
    }
  }
  return { isRaspberryPi: false, boardModel: os.hostname() };
}

function readMemInfo(): {
  ramTotalMb: number;
  ramFreeMb: number;
  swapTotalMb: number;
  zramPresent: boolean;
} {
  const fallbackTotal = Math.max(256, Math.round(os.totalmem() / 1048576));
  const fallbackFree = Math.max(64, Math.round(os.freemem() / 1048576));
  let ramTotalMb = fallbackTotal;
  let ramFreeMb = fallbackFree;
  let swapTotalMb = 0;
  let zramPresent = false;

  try {
    if (fs.existsSync('/proc/meminfo')) {
      const txt = fs.readFileSync('/proc/meminfo', 'utf8');
      const total = txt.match(/MemTotal:\s+(\d+)\s+kB/i);
      const avail = txt.match(/MemAvailable:\s+(\d+)\s+kB/i);
      const swap = txt.match(/SwapTotal:\s+(\d+)\s+kB/i);
      if (total) ramTotalMb = Math.round(Number(total[1]) / 1024);
      if (avail) ramFreeMb = Math.round(Number(avail[1]) / 1024);
      if (swap) swapTotalMb = Math.round(Number(swap[1]) / 1024);
    }
    if (fs.existsSync('/proc/swaps')) {
      const swaps = fs.readFileSync('/proc/swaps', 'utf8');
      zramPresent = /zram/i.test(swaps);
    }
  } catch {
    // ignore
  }
  return { ramTotalMb, ramFreeMb, swapTotalMb, zramPresent };
}

function readFreeDiskMb(targetDir = process.cwd()): number {
  try {
    const statFs = fs.statfsSync(targetDir);
    const bytes = Number(statFs.bavail) * Number(statFs.bsize);
    if (Number.isFinite(bytes) && bytes > 0) {
      return Math.round(bytes / 1048576);
    }
  } catch {
    // fallback via df -Pm
  }
  try {
    const out = execFileSync('df', ['-Pm', targetDir], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[lines.length - 1].trim().split(/\s+/);
      const avail = Number(parts[3]);
      if (Number.isFinite(avail) && avail > 0) return avail;
    }
  } catch {
    // ignore
  }
  return 20480;
}

function readStorageKind(): 'sd_or_emmc' | 'ssd_or_nvme' | 'unknown' {
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

function readGpuInfo(): {
  gpuVendor: DetailedHardwareSpecs['gpuVendor'];
  gpuName: string;
  gpuVramMb: number;
} {
  try {
    const nv = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (nv) {
      const lines = nv.split('\n').filter(Boolean);
      const [firstName, vramStr] = lines[0].split(',').map((x) => x.trim());
      const vramMb = lines.reduce((sum, l) => {
        const val = Number(l.split(',')[1]?.trim() || 0);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);
      return {
        gpuVendor: 'nvidia',
        gpuName: firstName || 'NVIDIA GPU',
        gpuVramMb: Math.max(0, Math.round(vramMb || Number(vramStr) || 0)),
      };
    }
  } catch {
    // no nvidia-smi
  }

  try {
    if (fs.existsSync('/sys/class/kfd/kfd/topology/nodes')) {
      const nodes = fs.readdirSync('/sys/class/kfd/kfd/topology/nodes');
      for (const n of nodes) {
        const memProps = `/sys/class/kfd/kfd/topology/nodes/${n}/mem_banks/0/size_in_bytes`;
        if (fs.existsSync(memProps)) {
          const bytes = Number(fs.readFileSync(memProps, 'utf8').trim());
          if (Number.isFinite(bytes) && bytes > 512 * 1048576) {
            return {
              gpuVendor: 'amd',
              gpuName: 'AMD ROCm GPU',
              gpuVramMb: Math.round(bytes / 1048576),
            };
          }
        }
      }
    }
  } catch {
    // ignore
  }

  if (process.platform === 'darwin') {
    const totalMb = Math.round(os.totalmem() / 1048576);
    if (os.arch() === 'arm64') {
      return {
        gpuVendor: 'apple',
        gpuName: 'Apple Silicon Unified GPU',
        gpuVramMb: Math.round(totalMb * 0.65),
      };
    }
  }

  return { gpuVendor: 'none', gpuName: 'none', gpuVramMb: 0 };
}

export function detectDetailedHardware(overrides: Partial<DetailedHardwareSpecs> = {}): DetailedHardwareSpecs {
  const mem = readMemInfo();
  const board = readBoardModel();
  const cpuFlags = overrides.cpuFlags ?? readCpuFlags();
  const gpu = readGpuInfo();
  const arch = overrides.arch ?? os.arch();
  const platform = overrides.platform ?? os.platform();
  const isArm = overrides.isArm ?? /arm|aarch64/i.test(arch);

  const ramTotalMb = overrides.ramTotalMb ?? mem.ramTotalMb;
  const ramFreeMb = overrides.ramFreeMb ?? mem.ramFreeMb;

  return {
    arch,
    platform,
    isArm,
    isRaspberryPi: overrides.isRaspberryPi ?? board.isRaspberryPi,
    boardModel: overrides.boardModel ?? board.boardModel,
    cpuCores: overrides.cpuCores ?? Math.max(1, os.cpus().length),
    cpuFlags,
    hasAvx2: overrides.hasAvx2 ?? cpuFlags.some((f) => /avx2|avx512/i.test(f)),
    hasNeon: overrides.hasNeon ?? (isArm || cpuFlags.some((f) => /neon|asimd/i.test(f))),
    ramTotalMb,
    ramFreeMb,
    swapTotalMb: overrides.swapTotalMb ?? mem.swapTotalMb,
    zramPresent: overrides.zramPresent ?? mem.zramPresent,
    diskFreeMb: overrides.diskFreeMb ?? readFreeDiskMb(),
    storageKind: overrides.storageKind ?? readStorageKind(),
    gpuVendor: overrides.gpuVendor ?? gpu.gpuVendor,
    gpuName: overrides.gpuName ?? gpu.gpuName,
    gpuVramMb: overrides.gpuVramMb ?? gpu.gpuVramMb,
  };
}

function estimateContextMemoryMb(model: OllamaCatalogModel, numCtx: number): number {
  return Math.round((model.contextMemoryPer4kMb * numCtx) / 4096);
}

function estimateTokensPerSec(model: OllamaCatalogModel, hw: DetailedHardwareSpecs, useGpu: boolean): number {
  if (useGpu && hw.gpuVramMb > 0) {
    return model.estTokensPerSecGpu;
  }
  let factor = 1;
  if (hw.cpuCores <= 2) factor *= 0.65;
  else if (hw.cpuCores >= 8) factor *= 1.25;
  if (hw.isArm && !hw.hasNeon) factor *= 0.6;
  if (!hw.isArm && hw.cpuFlags.length > 0 && !hw.hasAvx2) factor *= 0.75;
  return Number((model.estTokensPerSecCpu * factor).toFixed(1));
}

function determineCtxForTier(tier: HardwareTierId, useGpu: boolean, vramMb: number): number {
  if (useGpu && vramMb >= 20000) return 8192;
  if (tier === 'workstation_gpu') return 8192;
  if (tier === 'standard_desktop') return 4096;
  if (tier === 'mid_sbc_vps') return 3072;
  return 2048;
}

export async function selectOptimalOllamaSuite(
  hwInput?: DetailedHardwareSpecs,
  options?: {
    catalog?: OllamaModelCatalog;
    verifyCandidate?: (modelName: string) => Promise<CandidateVerificationResult>;
    minTokensPerSec?: number;
  }
): Promise<OllamaSuiteSelection> {
  const hw = hwInput ?? detectDetailedHardware();
  const catalog = options?.catalog ?? loadOllamaModelCatalog();
  const minTps = options?.minTokensPerSec ?? 2.0;

  const hasDedicatedGpu = hw.gpuVendor !== 'none' && hw.gpuVramMb >= 4000;
  const sdRisk = hw.storageKind === 'sd_or_emmc' || hw.isRaspberryPi || (hw.isArm && hw.ramTotalMb <= 4096);

  // OS + NovaSwarm headroom reservation
  const osAndNovaHeadroomMb =
    hw.ramTotalMb <= 2500
      ? 620
      : hw.ramTotalMb <= 5000
      ? 1200
      : hw.ramTotalMb <= 10000
      ? 2100
      : 3200;

  // Usable budget: GPU VRAM (~90% offloadable) OR ~62-65% of free RAM (bounded by total RAM - OS headroom)
  const cpuRamFreeBasis = hw.ramTotalMb <= 2500
    ? Math.max(hw.ramFreeMb, Math.round(hw.ramTotalMb * 0.68))
    : hw.ramFreeMb;
  const cpuBudgetFromFree = Math.round(cpuRamFreeBasis * 0.65);
  const cpuBudgetFromTotal = Math.max(512, hw.ramTotalMb - osAndNovaHeadroomMb);
  const cpuUsableBudgetMb = hw.ramTotalMb <= 2500
    ? Math.min(cpuBudgetFromTotal, Math.round(hw.ramTotalMb * 0.65) + (hw.zramPresent || hw.swapTotalMb >= 1024 ? 220 : 0))
    : Math.min(cpuBudgetFromTotal, Math.max(cpuBudgetFromFree, Math.round(hw.ramFreeMb * 0.65)));

  const usableMemoryBudgetMb = hasDedicatedGpu
    ? Math.round(hw.gpuVramMb * 0.90)
    : cpuUsableBudgetMb;

  let tier: HardwareTierId;
  let tierLabel: string;
  if (hasDedicatedGpu || hw.ramTotalMb >= 14336) {
    tier = 'workstation_gpu';
    tierLabel = hasDedicatedGpu
      ? `GPU Munkaállomás (${hw.gpuName}, ${Math.round(hw.gpuVramMb / 1024)} GB VRAM)`
      : 'Erős Asztali / Mini-PC (16+ GB RAM)';
  } else if (hw.ramTotalMb >= 6144) {
    tier = 'standard_desktop';
    tierLabel = 'Normál Asztali / VPS (8 GB kategória)';
  } else if (hw.ramTotalMb >= 2500) {
    tier = 'mid_sbc_vps';
    tierLabel = 'Közepes SBC / 4 GB VPS';
  } else {
    tier = 'ultra_light_pi';
    tierLabel = hw.isRaspberryPi ? `Ultra-Könnyű Raspberry Pi (${hw.ramTotalMb} MB)` : 'Ultra-Könnyű 2 GB SBC';
  }

  const numCtx = determineCtxForTier(tier, hasDedicatedGpu, hw.gpuVramMb);
  const diskHeadroomMb = 450;
  const skippedCandidates: Array<{ model: string; reason: string }> = [];

  const fitsCandidate = (m: OllamaCatalogModel, allowRelaxedSpeed = false): { ok: boolean; reason?: string } => {
    const totalMemNeed = m.memoryMb + estimateContextMemoryMb(m, numCtx);
    if (hw.diskFreeMb < m.diskMb + diskHeadroomMb) {
      return {
        ok: false,
        reason: `kevés szabad lemezterület (${hw.diskFreeMb} MB < ${m.diskMb + diskHeadroomMb} MB)`,
      };
    }
    if (hasDedicatedGpu) {
      if (totalMemNeed > usableMemoryBudgetMb) {
        return {
          ok: false,
          reason: `meghaladja a használható GPU VRAM keretet (${totalMemNeed} MB > ${usableMemoryBudgetMb} MB)`,
        };
      }
    } else {
      if (hw.ramTotalMb < m.minRamMb && !(hw.ramTotalMb >= m.minRamMb * 0.92 && (hw.zramPresent || hw.swapTotalMb >= 1024))) {
        return {
          ok: false,
          reason: `teljes RAM kevés (${hw.ramTotalMb} MB < ${m.minRamMb} MB)`,
        };
      }
      if (totalMemNeed > usableMemoryBudgetMb) {
        return {
          ok: false,
          reason: `túllépi a biztonságos RAM keretet (${totalMemNeed} MB > ${usableMemoryBudgetMb} MB)`,
        };
      }
    }
    const tps = estimateTokensPerSec(m, hw, hasDedicatedGpu);
    if (!allowRelaxedSpeed && !m.capabilities.includes('embedding') && tps < minTps) {
      return {
        ok: false,
        reason: `túl lassú CPU becsült sebesség (${tps} tok/s < ${minTps} tok/s)`,
      };
    }
    return { ok: true };
  };

  const sortBestFirst = (a: OllamaCatalogModel, b: OllamaCatalogModel) => {
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    return b.paramsB - a.paramsB;
  };

  const verifiedCheck = async (modelName: string): Promise<boolean> => {
    if (!options?.verifyCandidate) return true;
    const res = await options.verifyCandidate(modelName);
    if (!res.available) {
      skippedCandidates.push({
        model: modelName,
        reason: res.reason || 'nem tölthető le az Ollama registryből',
      });
      return false;
    }
    return true;
  };

  const pickBestForCapability = async (
    cap: OllamaCapability,
    excludeNames: Set<string> = new Set(),
    allowRelaxedSpeed = false
  ): Promise<OllamaCatalogModel | null> => {
    const candidates = catalog.models
      .filter((m) => m.capabilities.includes(cap) && !excludeNames.has(m.name))
      .sort(sortBestFirst);
    for (const cand of candidates) {
      const fit = fitsCandidate(cand, allowRelaxedSpeed);
      if (!fit.ok) {
        skippedCandidates.push({ model: cand.name, reason: fit.reason! });
        continue;
      }
      if (await verifiedCheck(cand.name)) {
        return cand;
      }
    }
    return null;
  };

  let mainPick = await pickBestForCapability('general');
  if (!mainPick) {
    // Fallback to relaxed speed / smallest general model in catalog that fits disk
    const smallest = catalog.models
      .filter((m) => m.capabilities.includes('general'))
      .sort((a, b) => a.memoryMb - b.memoryMb);
    for (const cand of smallest) {
      if (hw.diskFreeMb >= cand.diskMb + 256 && (await verifiedCheck(cand.name))) {
        mainPick = cand;
        break;
      }
    }
    if (!mainPick && smallest.length > 0) {
      mainPick = smallest[0];
    }
  }

  const mainModel = mainPick?.name || catalog.models[0]?.name || 'qwen2.5:1.5b';
  const mainParamsB = mainPick?.paramsB ?? 1.5;
  const singleModelMutex = hw.ramTotalMb <= 2500 && !hasDedicatedGpu;

  // Fast / lightweight companion model when RAM & disk comfortably accommodate a second smaller model
  let fastModel = mainModel;
  if (!singleModelMutex && mainPick && mainPick.paramsB >= 7) {
    const smallCandidates = catalog.models
      .filter((m) => m.capabilities.includes('general') && m.paramsB <= 3.5 && m.name !== mainModel)
      .sort(sortBestFirst);
    for (const sc of smallCandidates) {
      if (hw.diskFreeMb >= (mainPick.diskMb + sc.diskMb + 512) && (await verifiedCheck(sc.name))) {
        fastModel = sc.name;
        break;
      }
    }
  }

  // Dedicated code model when memory & disk allow (otherwise shares mainModel)
  let codeModel = mainModel;
  if (!singleModelMutex || (mainPick && !mainPick.capabilities.includes('code'))) {
    const pickedCode = await pickBestForCapability('code', new Set());
    if (pickedCode) {
      const extraDiskNeed = pickedCode.name === mainModel ? 0 : (mainPick?.diskMb ?? 0) + pickedCode.diskMb + 512;
      if (pickedCode.name === mainModel || hw.diskFreeMb >= extraDiskNeed) {
        codeModel = pickedCode.name;
      }
    }
  }

  // Embedding model (small RAM/disk footprint; ultra_light_pi strictly prefers smallest disk/RAM model e.g. all-minilm)
  let embeddingModel = 'all-minilm';
  if (tier === 'ultra_light_pi') {
    const lightEmbeds = catalog.models
      .filter((m) => m.capabilities.includes('embedding'))
      .sort((a, b) => a.diskMb - b.diskMb);
    for (const cand of lightEmbeds) {
      const fit = fitsCandidate(cand, true);
      if (fit.ok && (await verifiedCheck(cand.name))) {
        embeddingModel = cand.name;
        break;
      }
    }
  } else {
    const pickedEmbed = await pickBestForCapability('embedding', new Set(), true);
    if (pickedEmbed) {
      embeddingModel = pickedEmbed.name;
    }
  }

  // Vision model if RAM >= 4GB / GPU VRAM >= 6GB and disk fits
  let visionModel: string | null = null;
  if (hw.ramTotalMb >= 4000 || hasDedicatedGpu) {
    const pickedVision = await pickBestForCapability('vision');
    if (pickedVision && hw.diskFreeMb >= (mainPick?.diskMb ?? 0) + pickedVision.diskMb + 1024) {
      visionModel = pickedVision.name;
    }
  }

  const keepAlive =
    tier === 'ultra_light_pi'
      ? '2m'
      : tier === 'mid_sbc_vps'
      ? '5m'
      : tier === 'standard_desktop'
      ? '10m'
      : '30m';
  const numParallel = singleModelMutex ? 1 : hasDedicatedGpu ? 4 : Math.min(3, Math.max(1, Math.floor(hw.cpuCores / 2)));
  const gpuLayers = hasDedicatedGpu ? 999 : 0;
  const estTps = mainPick ? estimateTokensPerSec(mainPick, hw, hasDedicatedGpu) : 6;

  const rationale: string[] = [
    `Hardver: ${hw.arch} | ${hw.cpuCores} mag | RAM: ${hw.ramFreeMb}/${hw.ramTotalMb} MB szabad | Lemez: ${hw.diskFreeMb} MB szabad (${hw.storageKind})`,
    `GPU: ${hasDedicatedGpu ? `${hw.gpuName} (${hw.gpuVramMb} MB VRAM)` : hw.gpuName} | Használható keret: ${usableMemoryBudgetMb} MB`,
    `Fő modell: ${mainModel} (${mainParamsB}B, becsült ${estTps} tok/s) · Kód: ${codeModel} · Gyors: ${fastModel} · Embedding: ${embeddingModel}`,
    `Paraméterek: num_ctx=${numCtx}, keep_alive=${keepAlive}, OLLAMA_NUM_PARALLEL=${numParallel}, GPU réteg=${gpuLayers}, Pi SD-kímélő=${sdRisk ? 'BE' : 'KI'}`,
  ];

  return {
    tier,
    tierLabel,
    usableMemoryBudgetMb,
    osAndNovaHeadroomMb,
    mainModel,
    mainModelParamsB: mainParamsB,
    fastModel,
    codeModel,
    embeddingModel,
    visionModel,
    numCtx,
    keepAlive,
    numParallel,
    gpuLayers,
    singleModelMutex,
    sdCardSparingMode: sdRisk,
    estimatedTokensPerSec: estTps,
    skippedCandidates,
    rationale,
  };
}

export async function verifyOllamaRegistryModel(
  modelName: string,
  options: {
    ollamaUrl?: string;
    fetchFn?: typeof fetch;
    checkRemoteRegistry?: boolean;
  } = {}
): Promise<CandidateVerificationResult> {
  const fetchImpl = options.fetchFn ?? fetch;
  const baseUrl = (options.ollamaUrl || getState().settings.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');

  // 1. Check already-installed local tags first via central router transport
  try {
    const { listInstalledOllamaModelsViaRouter } = await import('../providers/router');
    const probe = await listInstalledOllamaModelsViaRouter(baseUrl, fetchImpl);
    if (probe.reachable) {
      const names = probe.models.map((m) => String(m.name || '').toLowerCase());
      const needle = modelName.toLowerCase();
      if (names.some((n) => n === needle || n.startsWith(`${needle}:`) || (!needle.includes(':') && n === `${needle}:latest`))) {
        return { available: true, source: 'local_tags', reason: 'már letöltve helyben' };
      }
    }
  } catch {
    // local ollama might not be started yet during pre-install check
  }

  // 2. Check remote Ollama registry manifest (HEAD/GET without downloading weights)
  if (options.checkRemoteRegistry !== false) {
    try {
      const [repoRaw, tagRaw] = modelName.includes(':') ? modelName.split(':') : [modelName, 'latest'];
      const repo = repoRaw.includes('/') ? repoRaw : `library/${repoRaw}`;
      const manifestUrl = `https://registry.ollama.ai/v2/${repo}/manifests/${tagRaw || 'latest'}`;
      const res = await fetchImpl(manifestUrl, {
        method: 'HEAD',
        headers: {
          Accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
        },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok || res.status === 200) {
        return { available: true, source: 'registry_manifest' };
      }
      if (res.status === 404) {
        return { available: false, source: 'registry_manifest', reason: 'nem található az Ollama registryben (404)' };
      }
    } catch (err) {
      return {
        available: true,
        source: 'skipped',
        reason: `offline / registry nem elérhető: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { available: true, source: 'skipped' };
}

export async function benchmarkOllamaModel(
  modelName?: string,
  deps: {
    ollamaUrl?: string;
    invokeGenerateFn?: (prompt: string, model: string) => Promise<{ text: string; tokensPerSec?: number; latencyMs: number }>;
  } = {}
): Promise<{
  ok: boolean;
  telemetry?: OllamaBenchmarkTelemetry;
  error?: string;
}> {
  const s = getState();
  const targetModel = modelName?.trim() || s.settings.ollamaModel;
  if (!targetModel) {
    return { ok: false, error: 'Nincs beállított helyi Ollama modell a sebességméréshez.' };
  }

  const startedAt = Date.now();
  try {
    let latencyMs = 0;
    let tps = 0;
    if (deps.invokeGenerateFn) {
      const out = await deps.invokeGenerateFn('Válaszolj pontosan három szóban: Hardver teszt rendben.', targetModel);
      latencyMs = Math.max(1, out.latencyMs);
      tps = out.tokensPerSec ?? Number(((Math.max(4, out.text.split(/\s+/).length * 1.4)) / (latencyMs / 1000)).toFixed(2));
    } else {
      const { invokeOllamaBenchmarkDirect } = await import('../providers/router');
      const out = await invokeOllamaBenchmarkDirect(targetModel, deps.ollamaUrl || s.settings.ollamaUrl);
      latencyMs = out.latencyMs;
      tps = out.tokensPerSec;
    }

    const telemetry: OllamaBenchmarkTelemetry = {
      model: targetModel,
      tokensPerSec: Number(tps.toFixed(2)),
      latencyMs: Math.max(1, Math.round(latencyMs || Date.now() - startedAt)),
      evaluatedAt: new Date().toISOString(),
      hardwareTier: s.settings.detectedHardwareTier,
    };

    updateState((draft) => {
      draft.settings.ollamaBenchmark = telemetry;
    });

    appendAuditLog({
      type: 'system',
      sourceAgentId: 'ollama-selector',
      sourceAgentName: 'Ollama Sebességmérő',
      message: `Helyi Ollama benchmark (${targetModel}): ${telemetry.tokensPerSec} tok/s (${telemetry.latencyMs}ms)`,
      verifiedExecution: true,
    });

    return { ok: true, telemetry };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function reselectOllamaSuite(options: {
  pullMissing?: boolean;
  runBenchmark?: boolean;
  checkRemoteRegistry?: boolean;
  hardwareOverrides?: Partial<DetailedHardwareSpecs>;
  verifyCandidate?: (modelName: string) => Promise<CandidateVerificationResult>;
  listInstalledModelsFn?: () => Promise<string[]>;
  pullModelFn?: (modelName: string) => Promise<{ ok: boolean; error?: string }>;
  benchmarkFn?: (modelName: string) => Promise<{ ok: boolean; telemetry?: OllamaBenchmarkTelemetry; error?: string }>;
} = {}): Promise<{
  hardware: DetailedHardwareSpecs;
  selection: OllamaSuiteSelection;
  installedModels: string[];
  cleanupSuggestions: string[];
  pulledModels: string[];
  pendingPullModels: string[];
  benchmark?: OllamaBenchmarkTelemetry | null;
}> {
  const hw = detectDetailedHardware(options.hardwareOverrides);
  const s = getState();

  const verifyFn =
    options.verifyCandidate ??
    ((modelName: string) =>
      verifyOllamaRegistryModel(modelName, {
        ollamaUrl: s.settings.ollamaUrl,
        checkRemoteRegistry: options.checkRemoteRegistry ?? false,
      }));

  const selection = await selectOptimalOllamaSuite(hw, { verifyCandidate: verifyFn });

  let installedModels: string[] = [];
  try {
    if (options.listInstalledModelsFn) {
      installedModels = await options.listInstalledModelsFn();
    } else {
      const { listInstalledOllamaModelsViaRouter } = await import('../providers/router');
      const probed = await listInstalledOllamaModelsViaRouter(s.settings.ollamaUrl);
      installedModels = probed.models.map((m) => m.name);
    }
  } catch {
    installedModels = [];
  }

  const desiredSet = new Set(
    [
      selection.mainModel,
      selection.fastModel,
      selection.codeModel,
      selection.embeddingModel,
      selection.visionModel || '',
    ].filter(Boolean)
  );

  const pulledModels: string[] = [];
  const pendingPullModels: string[] = [];

  if (options.pullMissing) {
    const pullImpl =
      options.pullModelFn ??
      (async (m: string) => {
        const { pullOllamaModelViaRouter } = await import('../providers/router');
        return pullOllamaModelViaRouter(m, s.settings.ollamaUrl);
      });
    for (const model of desiredSet) {
      const already = installedModels.some((n) => n === model || n === `${model}:latest`);
      if (already) continue;
      const pullRes = await pullImpl(model);
      if (pullRes.ok) {
        pulledModels.push(model);
      } else {
        pendingPullModels.push(model);
      }
    }
  } else {
    for (const model of desiredSet) {
      if (installedModels.length > 0 && !installedModels.some((n) => n === model || n === `${model}:latest`)) {
        pendingPullModels.push(model);
      }
    }
  }

  const cleanupSuggestions = installedModels.filter((installed) => {
    const baseName = installed.replace(/:latest$/, '');
    return !desiredSet.has(installed) && !desiredSet.has(baseName);
  });

  let benchmark: OllamaBenchmarkTelemetry | null = s.settings.ollamaBenchmark || null;
  if (options.runBenchmark) {
    const bmRes = options.benchmarkFn
      ? await options.benchmarkFn(selection.mainModel)
      : await benchmarkOllamaModel(selection.mainModel);
    if (bmRes.ok && bmRes.telemetry) {
      benchmark = bmRes.telemetry;
    }
  }

  updateState((draft) => {
    draft.settings.detectedHardwareTier = selection.tier;
    draft.settings.ollamaModel = selection.mainModel;
    draft.settings.ollamaFastModel = selection.fastModel;
    draft.settings.ollamaCodeModel = selection.codeModel;
    draft.settings.ollamaEmbeddingModel = selection.embeddingModel;
    draft.settings.ollamaVisionModel = selection.visionModel || undefined;
    draft.settings.ollamaNumCtx = selection.numCtx;
    draft.settings.ollamaKeepAlive = selection.keepAlive;
    draft.settings.sdCardSparingMode = selection.sdCardSparingMode;
    draft.settings.compactLocalPrompt = selection.tier === 'ultra_light_pi';
    draft.settings.ollamaPendingPullModels = pendingPullModels;
    draft.settings.ollamaCleanupSuggestions = cleanupSuggestions;
    if (benchmark) {
      draft.settings.ollamaBenchmark = benchmark;
    }
    draft.hardwareProfile = {
      ...(draft.hardwareProfile || {
        tier: selection.tier,
        tierLabel: selection.tierLabel,
        arch: `${hw.platform}/${hw.arch}`,
        cpuCores: hw.cpuCores,
        ramTotalMb: hw.ramTotalMb,
        ramAvailableMb: hw.ramFreeMb,
        swapTotalMb: hw.swapTotalMb,
        storageKind: hw.storageKind,
        hasGpu: hw.gpuVendor !== 'none',
        gpuName: hw.gpuName,
        recommendedOllamaModel: selection.mainModel,
        recommendedNumCtx: selection.numCtx,
        recommendedHeapMb: selection.tier === 'ultra_light_pi' ? 640 : selection.tier === 'mid_sbc_vps' ? 896 : selection.tier === 'standard_desktop' ? 1280 : 2048,
        recommendedConcurrency: selection.numParallel,
        recommendedHeartbeatMinutes: selection.tier === 'ultra_light_pi' ? 8 : 4,
        recommendedNightShiftMinutes: selection.tier === 'ultra_light_pi' ? 45 : 20,
        recommendedDreamIdleMinutes: selection.tier === 'ultra_light_pi' ? 15 : 6,
        recommendedOllamaIdleUnloadMinutes: selection.tier === 'ultra_light_pi' ? 4 : 15,
        recommendedCpuThreshold: Number(Math.max(2, hw.cpuCores * 1.1).toFixed(1)),
        recommendedRamWatchdogPercent: selection.tier === 'ultra_light_pi' ? 84 : 90,
        sdCardSparingRecommended: selection.sdCardSparingMode,
        hybridLocalFirstRecommended: true,
        detectedAt: new Date().toISOString(),
        appliedNotes: selection.rationale,
      }),
      tier: selection.tier,
      tierLabel: selection.tierLabel,
      boardModel: hw.boardModel,
      isRaspberryPi: hw.isRaspberryPi,
      ramFreeMb: hw.ramFreeMb,
      diskFreeMb: hw.diskFreeMb,
      gpuVendor: hw.gpuVendor,
      gpuVramMb: hw.gpuVramMb,
      cpuFlags: hw.cpuFlags,
      zramPresent: hw.zramPresent,
      recommendedOllamaModel: selection.mainModel,
      recommendedFastModel: selection.fastModel,
      recommendedCodeModel: selection.codeModel,
      recommendedEmbeddingModel: selection.embeddingModel,
      recommendedVisionModel: selection.visionModel || undefined,
      recommendedGpuLayers: selection.gpuLayers,
      recommendedParallelism: selection.numParallel,
      singleModelMutex: selection.singleModelMutex,
      estimatedTokensPerSec: selection.estimatedTokensPerSec,
      recommendedNumCtx: selection.numCtx,
      appliedNotes: selection.rationale,
      detectedAt: new Date().toISOString(),
    };
  });

  appendAuditLog({
    type: 'system',
    sourceAgentId: 'ollama-selector',
    sourceAgentName: 'Hardver-Érzékeny Ollama Választó',
    message: `Ollama készlet újraválasztva [${selection.tierLabel}]: fő=${selection.mainModel}, kód=${selection.codeModel}, embedding=${selection.embeddingModel}${cleanupSuggestions.length ? ` | Törlésre javasolt régi modellek: ${cleanupSuggestions.join(', ')}` : ''}`,
    verifiedExecution: true,
  });

  return {
    hardware: hw,
    selection,
    installedModels,
    cleanupSuggestions,
    pulledModels,
    pendingPullModels,
    benchmark,
  };
}
