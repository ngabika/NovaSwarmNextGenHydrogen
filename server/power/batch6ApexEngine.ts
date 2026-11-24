import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import type {
  AutonomyRule,
  ClusterNode,
  ForensicReportSnapshot,
  MacroStepKind,
  MeshDispatchRecord,
  NetworkSpeedRecord,
  QuickMacro,
  SmartReminder,
} from '../../shared/types';
import { controlDockerContainer, listDockerContainers, scanLanDevices } from '../infra/hostAdmin';
import { sendWakeOnLanPacket } from '../infra/networkAndCluster';
import { invokeWithFailover, unloadOllamaModel } from '../providers/router';
import { validateSafeOutboundUrl } from '../security/egressAndCrypto';
import { appendAuditLog, getState, updateState } from '../state/store';
import { flushTelemetryRingBuffer, runRamOomWatchdogTick } from '../system/hardwareOptimizer';
import { collectHardwareMetrics } from '../system/ops';
import {
  buildProactiveBrief,
  readOrWriteGpioPin,
  runSelfHealingDaemonTick,
  speakHostSpeakerAnnouncement,
} from './batch5AutonomyEngine';

function execQuiet(bin: string, args: string[], timeoutMs = 4000): string {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
    const out = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8') || '';
    return out.trim();
  }
}

async function notifyTelegramSafe(text: string): Promise<boolean> {
  try {
    const { sendTelegramMessage } = await import('../telegram/bot');
    const res = await sendTelegramMessage(text);
    return res.sent;
  } catch {
    return false;
  }
}

// ============================================================================
// 1. Smart Time Reminders ("/emlekezteto 15m ..." & "08:30 ...")
// ============================================================================

export function parseReminderDelayMs(expr: string, nowMs = Date.now()): { triggerAtIso: string; delayMs: number } {
  const clean = (expr || '').trim().toLowerCase();
  const relMatch = clean.match(/^(\d+)\s*(s|mp|sec|m|p|perc|h|ó|ora|óra|d|nap)$/);
  if (relMatch) {
    const val = Math.max(1, Number(relMatch[1]));
    const unit = relMatch[2];
    const mult =
      unit.startsWith('s') || unit === 'mp'
        ? 1000
        : unit.startsWith('h') || unit.startsWith('ó') || unit === 'ora'
        ? 3_600_000
        : unit === 'd' || unit === 'nap'
        ? 86_400_000
        : 60_000;
    const delayMs = Math.min(val * mult, 30 * 86_400_000);
    return { triggerAtIso: new Date(nowMs + delayMs).toISOString(), delayMs };
  }

  const hhmmMatch = clean.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmmMatch) {
    const target = new Date(nowMs);
    target.setHours(Number(hhmmMatch[1]), Number(hhmmMatch[2]), 0, 0);
    if (target.getTime() <= nowMs) {
      target.setDate(target.getDate() + 1);
    }
    const delayMs = Math.max(1000, target.getTime() - nowMs);
    return { triggerAtIso: target.toISOString(), delayMs };
  }

  // Iso timestamp fallback
  const parsed = Date.parse(expr);
  if (Number.isFinite(parsed) && parsed > nowMs) {
    return { triggerAtIso: new Date(parsed).toISOString(), delayMs: parsed - nowMs };
  }

  throw new Error('Érvénytelen időformátum. Használat: 10m, 2h, 30s, 1d vagy 08:30.');
}

export function createSmartReminder(input: {
  timeExpr: string;
  message: string;
  channel?: SmartReminder['channel'];
  nowMs?: number;
}): SmartReminder {
  const msg = (input.message || '').trim();
  if (!msg) throw new Error('Emlékeztető szöveg kötelező.');
  const { triggerAtIso } = parseReminderDelayMs(input.timeExpr, input.nowMs);
  const reminder: SmartReminder = {
    id: `rem-${crypto.randomUUID().slice(0, 8)}`,
    message: msg.slice(0, 400),
    triggerAt: triggerAtIso,
    channel: input.channel || 'both',
    fired: false,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.smartReminders = s.smartReminders || [];
    s.smartReminders.unshift(reminder);
    s.smartReminders = s.smartReminders.slice(0, 80);
  });

  return reminder;
}

export async function processDueSmartReminders(nowMs = Date.now()): Promise<{
  firedCount: number;
  firedIds: string[];
}> {
  const state = getState();
  const pending = (state.smartReminders || []).filter((r) => !r.fired && Date.parse(r.triggerAt) <= nowMs);
  if (pending.length === 0) return { firedCount: 0, firedIds: [] };

  const firedIds: string[] = [];
  for (const r of pending) {
    if (r.channel === 'telegram' || r.channel === 'both') {
      await notifyTelegramSafe(`⏰ Emlékeztető:\n${r.message}`);
    }
    if (state.settings.ttsHostSpeakerEnabled) {
      try {
        speakHostSpeakerAnnouncement(`Emlékeztető: ${r.message}`);
      } catch {
        // non-fatal
      }
    }
    firedIds.push(r.id);
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'smart-reminder',
      sourceAgentName: 'Okos Emlékeztető',
      message: `Emlékeztető teljesítve: ${r.message}`,
      verifiedExecution: true,
    });
  }

  updateState((s) => {
    s.smartReminders = (s.smartReminders || []).map((r) =>
      firedIds.includes(r.id) ? { ...r, fired: true, firedAt: new Date(nowMs).toISOString() } : r
    );
  });

  return { firedCount: firedIds.length, firedIds };
}

// ============================================================================
// 2. Event-Action Autonomy Rule Engine ("Ha ez történik -> Csináld ezt")
// ============================================================================

export function createAutonomyRule(input: {
  name: string;
  triggerKind: AutonomyRule['triggerKind'];
  thresholdValue: number;
  actionKind: AutonomyRule['actionKind'];
  actionTarget: string;
  cooldownMinutes?: number;
}): AutonomyRule {
  const name = (input.name || '').trim();
  if (!name) throw new Error('Szabály neve kötelező.');
  const rule: AutonomyRule = {
    id: `rule-${crypto.randomUUID().slice(0, 8)}`,
    name,
    enabled: true,
    triggerKind: input.triggerKind,
    thresholdValue: Number.isFinite(input.thresholdValue) ? Number(input.thresholdValue) : 85,
    actionKind: input.actionKind,
    actionTarget: (input.actionTarget || 'auto').trim(),
    cooldownMinutes: Math.max(1, Math.min(1440, Number(input.cooldownMinutes ?? 10))),
    triggerCount: 0,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.autonomyRules = s.autonomyRules || [];
    s.autonomyRules.unshift(rule);
  });
  return rule;
}

export interface RuleMetricsSnapshot {
  ramPercent: number;
  cpuPercent: number;
  tempCelsius: number | null;
  diskPercent: number;
  downUptimeCount: number;
  unknownLanMacCount: number;
  manualTrigger?: boolean;
}

export function doesRuleTriggerMatch(rule: AutonomyRule, snap: RuleMetricsSnapshot, nowMs = Date.now()): boolean {
  if (!rule.enabled) return false;
  if (rule.lastTriggeredAt) {
    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
    if (nowMs - Date.parse(rule.lastTriggeredAt) < cooldownMs) return false;
  }

  switch (rule.triggerKind) {
    case 'ram_above':
      return snap.ramPercent >= rule.thresholdValue;
    case 'cpu_above':
      return snap.cpuPercent >= rule.thresholdValue;
    case 'temp_above':
      return snap.tempCelsius !== null && snap.tempCelsius >= rule.thresholdValue;
    case 'disk_above':
      return snap.diskPercent >= rule.thresholdValue;
    case 'uptime_down':
      return snap.downUptimeCount >= Math.max(1, rule.thresholdValue || 1);
    case 'new_lan_mac':
      return snap.unknownLanMacCount >= Math.max(1, rule.thresholdValue || 1);
    case 'manual_event':
      return Boolean(snap.manualTrigger);
    default:
      return false;
  }
}

export async function evaluateAutonomyRules(overrides?: Partial<RuleMetricsSnapshot>): Promise<{
  checkedRules: number;
  triggered: Array<{ ruleId: string; ruleName: string; actionResult: string }>;
}> {
  const s = getState();
  const hw = collectHardwareMetrics();
  const snap: RuleMetricsSnapshot = {
    ramPercent: overrides?.ramPercent ?? hw.ramPercent,
    cpuPercent: overrides?.cpuPercent ?? hw.cpuLoadPercent,
    tempCelsius: overrides?.tempCelsius !== undefined ? overrides.tempCelsius : hw.temperatureCelsius,
    diskPercent: overrides?.diskPercent ?? hw.diskPercent,
    downUptimeCount: overrides?.downUptimeCount ?? s.uptimeTargets.filter((u) => u.status === 'down').length,
    unknownLanMacCount: overrides?.unknownLanMacCount ?? 0,
    manualTrigger: overrides?.manualTrigger ?? false,
  };

  const rules = s.autonomyRules || [];
  const triggered: Array<{ ruleId: string; ruleName: string; actionResult: string }> = [];
  const nowMs = Date.now();

  for (const rule of rules) {
    if (!doesRuleTriggerMatch(rule, snap, nowMs)) continue;

    let actionResult = '';
    try {
      switch (rule.actionKind) {
        case 'ram_cleanup': {
          const ram = await runRamOomWatchdogTick();
          actionResult = `RAM ${ram.ramPercent}% (küszöb ${ram.thresholdPercent}%): ${ram.actionsTaken.join(', ') || 'rendben'}`;
          break;
        }
        case 'telegram_notify': {
          const sent = await notifyTelegramSafe(
            `⚡ Autonóm Szabály Aktiválva [${rule.name}]\nCél: ${rule.actionTarget} | RAM ${snap.ramPercent}% | CPU ${snap.cpuPercent}%`
          );
          actionResult = sent ? 'Telegram értesítés elküldve' : 'Telegram nincs konfigurálva (audit naplózva)';
          break;
        }
        case 'gpio_set': {
          const [pinStr, valStr] = rule.actionTarget.split(':');
          const pin = Number(pinStr);
          const val: 0 | 1 = Number(valStr) === 1 ? 1 : 0;
          const out = readOrWriteGpioPin('set', pin, val);
          actionResult = out.message;
          break;
        }
        case 'wol_wake': {
          const wol = s.wolDevices.find(
            (w) => w.mac.toLowerCase() === rule.actionTarget.toLowerCase() || w.name.toLowerCase() === rule.actionTarget.toLowerCase()
          );
          if (wol) {
            const res = await sendWakeOnLanPacket(wol.mac, wol.broadcastIp);
            actionResult = res.ok ? `WoL ébresztés elküldve (${wol.name})` : res.message;
          } else if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(rule.actionTarget)) {
            const res = await sendWakeOnLanPacket(rule.actionTarget);
            actionResult = res.ok ? `WoL ébresztés elküldve (${rule.actionTarget})` : res.message;
          } else {
            actionResult = 'WoL célpont nem található.';
          }
          break;
        }
        case 'docker_heal': {
          const healed = await runDockerWatchtowerHeal({ autoRestartExited: true });
          actionResult = healed.summary;
          break;
        }
        case 'speak_tts': {
          const sp = speakHostSpeakerAnnouncement(rule.actionTarget || `Riasztás: ${rule.name}`);
          actionResult = sp.detail;
          break;
        }
        case 'run_agent_prompt': {
          const ai = await invokeWithFailover({
            prompt: `${rule.actionTarget}\nKontextus: RAM ${snap.ramPercent}%, CPU ${snap.cpuPercent}%, Disk ${snap.diskPercent}%`,
            complexity: 'simple',
          });
          actionResult = ai.text.slice(0, 180);
          break;
        }
      }
    } catch (err) {
      actionResult = `Hiba: ${err instanceof Error ? err.message : String(err)}`;
    }

    triggered.push({ ruleId: rule.id, ruleName: rule.name, actionResult });
    updateState((draft) => {
      draft.autonomyRules = (draft.autonomyRules || []).map((r) =>
        r.id === rule.id
          ? {
              ...r,
              triggerCount: r.triggerCount + 1,
              lastTriggeredAt: new Date(nowMs).toISOString(),
            }
          : r
      );
    });
    appendAuditLog({
      type: 'workflow',
      sourceAgentId: 'apex-rule-engine',
      sourceAgentName: 'Autonóm Szabálymotor',
      message: `Szabály teljesült (${rule.name}): ${actionResult}`,
      verifiedExecution: true,
    });
  }

  return { checkedRules: rules.length, triggered };
}

// ============================================================================
// 3. Multi-Node Swarm Mesh GPU/Task Offload Dispatcher
// ============================================================================

export function selectBestMeshNode(nodes: ClusterNode[], preferredRole?: ClusterNode['role']): ClusterNode | null {
  const online = nodes.filter((n) => n.status === 'online' && Boolean(n.ollamaUrl || n.url));
  if (online.length === 0) return null;

  const scored = [...online].sort((a, b) => {
    const roleBonusA = preferredRole && a.role === preferredRole ? 10000 : a.role === 'gpu_ollama' ? 5000 : 0;
    const roleBonusB = preferredRole && b.role === preferredRole ? 10000 : b.role === 'gpu_ollama' ? 5000 : 0;
    const vramA = a.gpuVramMb ?? 0;
    const vramB = b.gpuVramMb ?? 0;
    const latA = a.latencyMs ?? 150;
    const latB = b.latencyMs ?? 150;
    return roleBonusB + vramB - latB - (roleBonusA + vramA - latA);
  });

  return scored[0] || null;
}

export async function dispatchSwarmMeshTask(
  input: {
    prompt: string;
    preferredRole?: ClusterNode['role'];
  },
  fetchImpl: typeof fetch = fetch
): Promise<MeshDispatchRecord> {
  const prompt = (input.prompt || '').trim();
  if (!prompt) throw new Error('Mesh feladat prompt kötelező.');

  const s = getState();
  const chosen = s.settings.meshOffloadEnabled !== false ? selectBestMeshNode(s.clusterNodes, input.preferredRole) : null;
  const startedAt = Date.now();

  let status: MeshDispatchRecord['status'] = 'fallback_local';
  let nodeName = s.settings.instanceName;
  let nodeUrl = s.settings.ollamaUrl;
  let responsePreview = '';

  if (chosen) {
    nodeName = chosen.name;
    nodeUrl = chosen.ollamaUrl || chosen.url;
    try {
      const targetUrl = chosen.ollamaUrl
        ? `${chosen.ollamaUrl.replace(/\/+$/, '')}/api/generate`
        : `${chosen.url.replace(/\/+$/, '')}/v1/chat/completions`;
      const urlCheck = validateSafeOutboundUrl(targetUrl);
      if (!urlCheck.ok) throw new Error(urlCheck.reason || 'Tiltott mesh célpont URL.');
      const body = chosen.ollamaUrl
        ? JSON.stringify({ model: s.settings.ollamaModel, prompt, stream: false })
        : JSON.stringify({ model: s.settings.ollamaModel, messages: [{ role: 'user', content: prompt }] });

      const res = await fetchImpl(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        response?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      responsePreview = (json.response || json.choices?.[0]?.message?.content || JSON.stringify(json)).slice(0, 350);
      status = 'ok';
    } catch (err) {
      responsePreview = `Távoli node hiba (${chosen.name}): ${err instanceof Error ? err.message : String(err)} — helyi fallback futtatva.`;
    }
  }

  if (status !== 'ok') {
    try {
      const local = await invokeWithFailover({ prompt, complexity: 'simple' });
      responsePreview = local.text.slice(0, 350);
      status = chosen ? 'fallback_local' : 'ok';
    } catch (err) {
      responsePreview = err instanceof Error ? err.message : String(err);
      status = 'failed';
    }
  }

  const record: MeshDispatchRecord = {
    id: `mesh-${crypto.randomUUID().slice(0, 8)}`,
    nodeName,
    nodeUrl,
    promptPreview: prompt.slice(0, 80),
    latencyMs: Math.max(1, Date.now() - startedAt),
    status,
    responsePreview,
    createdAt: new Date().toISOString(),
  };

  updateState((draft) => {
    draft.meshDispatches = draft.meshDispatches || [];
    draft.meshDispatches.unshift(record);
    draft.meshDispatches = draft.meshDispatches.slice(0, 40);
  });

  return record;
}

// ============================================================================
// 4. Docker Watchtower & Exited/Unhealthy Container Auto-Healer
// ============================================================================

export async function runDockerWatchtowerHeal(opts?: { autoRestartExited?: boolean }): Promise<{
  dockerAvailable: boolean;
  totalContainers: number;
  unhealthyOrExited: string[];
  restarted: string[];
  summary: string;
}> {
  const autoRestart = opts?.autoRestartExited ?? true;
  const listed = listDockerContainers();
  if (!listed.available) {
    return {
      dockerAvailable: false,
      totalContainers: 0,
      unhealthyOrExited: [],
      restarted: [],
      summary: listed.error || 'Docker démon nem elérhető ezen a gépen.',
    };
  }

  const bad = listed.containers.filter(
    (c) =>
      c.state === 'exited' ||
      c.state === 'dead' ||
      /unhealthy/i.test(c.status)
  );
  const unhealthyOrExited = bad.map((c) => `${c.name} (${c.status})`);
  const restarted: string[] = [];

  if (autoRestart) {
    for (const c of bad) {
      const ctrl = controlDockerContainer(c.name || c.id, 'restart');
      if (ctrl.ok) {
        restarted.push(c.name || c.id);
      }
    }
  }

  const summary =
    bad.length === 0
      ? `Docker Watchtower: mind a(z) ${listed.containers.length} konténer egészséges.`
      : `Docker Watchtower: ${bad.length} hibás konténer (${restarted.length} újraindítva: ${restarted.join(', ') || 'nincs'}).`;

  if (restarted.length > 0) {
    await notifyTelegramSafe(`🐳 ${summary}`);
  }

  return {
    dockerAvailable: true,
    totalContainers: listed.containers.length,
    unhealthyOrExited,
    restarted,
    summary,
  };
}

// ============================================================================
// 5. Proactive LAN Sentinel & Live Speedtest Monitor
// ============================================================================

export async function runLanSentinelAndSpeedtest(
  opts?: { runSpeedtest?: boolean; notifyUnknown?: boolean },
  fetchImpl: typeof fetch = fetch
): Promise<{
  record: NetworkSpeedRecord;
  unknownMacs: Array<{ ip: string; mac: string }>;
}> {
  const scan = scanLanDevices();
  const s = getState();
  const knownSet = new Set((s.knownLanMacs || []).map((k) => k.mac.toLowerCase()));
  const validDevices = scan.devices.filter((d) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(d.mac));
  const unknownMacs = validDevices
    .filter((d) => !knownSet.has(d.mac.toLowerCase()))
    .map((d) => ({ ip: d.ip, mac: d.mac }));

  let pingMs: number | null = null;
  let downloadMbps: number | null = null;

  if (opts?.runSpeedtest) {
    try {
      const t0 = Date.now();
      const pingRes = await fetchImpl('https://speed.cloudflare.com/__down?bytes=0', {
        signal: AbortSignal.timeout(5000),
      });
      if (pingRes.ok) {
        pingMs = Math.max(1, Date.now() - t0);
      }
      const dlStart = Date.now();
      const dlRes = await fetchImpl('https://speed.cloudflare.com/__down?bytes=250000', {
        signal: AbortSignal.timeout(8000),
      });
      if (dlRes.ok) {
        const buf = await dlRes.arrayBuffer();
        const elapsedSec = Math.max(0.05, (Date.now() - dlStart) / 1000);
        downloadMbps = Number((((buf.byteLength * 8) / 1_000_000) / elapsedSec).toFixed(2));
      }
    } catch {
      // offline or blocked WAN
    }
  }

  const note =
    unknownMacs.length > 0
      ? `Új ismeretlen LAN eszközök: ${unknownMacs.map((u) => `${u.ip} (${u.mac})`).join(', ')}`
      : `LAN rendben (${validDevices.length} eszköz ellenőrizve)`;

  const record: NetworkSpeedRecord = {
    id: `net-${crypto.randomUUID().slice(0, 8)}`,
    pingMs,
    downloadMbps,
    lanDeviceCount: validDevices.length,
    unknownMacCount: unknownMacs.length,
    checkedAt: new Date().toISOString(),
    note,
  };

  updateState((draft) => {
    draft.networkSpeeds = draft.networkSpeeds || [];
    draft.networkSpeeds.unshift(record);
    draft.networkSpeeds = draft.networkSpeeds.slice(0, 48);
  });

  if (unknownMacs.length > 0 && (opts?.notifyUnknown ?? s.settings.lanSentinelAutoAlert)) {
    await notifyTelegramSafe(
      `🛡️ LAN Őrszem Riasztás:\n${unknownMacs.map((u) => `• ${u.ip} — ${u.mac}`).join('\n')}\nElfogadás: /trustmac ${unknownMacs[0].mac}`
    );
  }

  return { record, unknownMacs };
}

export function trustLanMacAddress(mac: string, label?: string): { ok: boolean; mac: string; message: string } {
  const cleanMac = (mac || '').trim().toLowerCase();
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(cleanMac)) {
    throw new Error('Érvénytelen MAC-cím formátum (pl. aa:bb:cc:dd:ee:ff).');
  }
  const devices = scanLanDevices().devices;
  const found = devices.find((d) => d.mac.toLowerCase() === cleanMac);
  const now = new Date().toISOString();

  updateState((s) => {
    const rest = (s.knownLanMacs || []).filter((k) => k.mac.toLowerCase() !== cleanMac);
    rest.unshift({
      mac: cleanMac,
      label: label?.trim() || `Megbízható eszköz (${cleanMac.slice(-5)})`,
      ip: found?.ip || '0.0.0.0',
      firstSeenAt: now,
      lastSeenAt: now,
    });
    s.knownLanMacs = rest;
  });

  return { ok: true, mac: cleanMac, message: `MAC cím (${cleanMac}) felvéve a megbízható LAN listára.` };
}

// ============================================================================
// 6. Live Host Forensic Root-Cause Doctor ("/korkep")
// ============================================================================

export function runForensicSystemSnapshot(): ForensicReportSnapshot {
  const hw = collectHardwareMetrics();

  const psRaw = execQuiet('ps', ['-eo', 'pid,comm,%mem,%cpu', '--sort=-%mem'], 3000);
  const topMemoryProcesses = psRaw
    .split('\n')
    .slice(1, 7)
    .map((l) => l.trim())
    .filter(Boolean);

  const failedRaw = execQuiet('systemctl', ['--failed', '--no-legend', '--plain'], 3000);
  const failedUnits = failedRaw
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean);

  const journalRaw = execQuiet('journalctl', ['-k', '-n', '60', '--no-pager'], 3000);
  const oomKernelHits = journalRaw
    .split('\n')
    .filter((l) => /oom|killed process|out of memory|throttl|under-voltage/i.test(l))
    .slice(0, 6);

  const dfInodeRaw = execQuiet('df', ['-iP', '/'], 3000);
  const inodeUsageLines = dfInodeRaw.split('\n').slice(1, 3).map((l) => l.trim()).filter(Boolean);

  const recommendations: string[] = [];
  if (hw.ramPercent >= 82) {
    recommendations.push('Magas RAM-használat: futtasd a RAM/OOM Őrszem vagy Éjszakai Takarítás makrót.');
  }
  if (failedUnits.length > 0) {
    recommendations.push(`Hibás systemd egységek javítása: ${failedUnits.join(', ')}`);
  }
  if (oomKernelHits.length > 0) {
    recommendations.push('Kernel OOM / tápfeszültség figyelmeztetés észlelve — ellenőrizd a swap méretet és a tápegységet.');
  }
  if (recommendations.length === 0) {
    recommendations.push('A gazdagép stabil állapotban van, kritikus rendellenesség nem található.');
  }

  const snapshot: ForensicReportSnapshot = {
    id: `forensic-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    topMemoryProcesses,
    failedUnits,
    oomKernelHits,
    inodeUsageLines,
    diagnosisSummary: `CPU ${hw.cpuLoadPercent}% · RAM ${hw.ramPercent}% (${hw.ramUsedMb}/${hw.ramTotalMb} MB) · Lemez ${hw.diskPercent}% · Hibás unit: ${failedUnits.length} · Kernel OOM/feszültség találat: ${oomKernelHits.length}`,
    recommendations,
  };

  updateState((s) => {
    s.lastForensicReport = snapshot;
  });

  return snapshot;
}

// ============================================================================
// 7. 1-Tap Composite Quick Macros ("/makro <slug>")
// ============================================================================

export function createQuickMacro(input: {
  slug: string;
  name: string;
  description: string;
  steps: MacroStepKind[];
}): QuickMacro {
  const slug = (input.slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!slug || !input.name.trim() || !Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error('Érvényes slug, név és legalább egy lépés kötelező.');
  }
  const macro: QuickMacro = {
    id: `macro-${crypto.randomUUID().slice(0, 8)}`,
    slug,
    name: input.name.trim(),
    description: input.description.trim() || 'Egyéni automatizált makró',
    steps: input.steps,
    runCount: 0,
  };

  updateState((s) => {
    s.quickMacros = (s.quickMacros || []).filter((m) => m.slug !== slug);
    s.quickMacros.unshift(macro);
  });

  return macro;
}

export async function executeQuickMacro(idOrSlug: string): Promise<{
  macro: QuickMacro;
  stepOutputs: string[];
  summary: string;
}> {
  const s = getState();
  const target = (s.quickMacros || []).find(
    (m) => m.id === idOrSlug || m.slug.toLowerCase() === idOrSlug.trim().toLowerCase()
  );
  if (!target) {
    throw new Error(`Ismeretlen makró: ${idOrSlug}`);
  }

  const stepOutputs: string[] = [];
  for (const step of target.steps) {
    switch (step) {
      case 'ram_watchdog': {
        const res = await runRamOomWatchdogTick();
        stepOutputs.push(`[RAM Őrszem] RAM ${res.ramPercent}% (${res.actionsTaken.join(', ') || 'rendben'})`);
        break;
      }
      case 'sd_flush': {
        const res = flushTelemetryRingBuffer();
        stepOutputs.push(`[SD Puffer] ${res.flushedSamples} minta kiírva`);
        break;
      }
      case 'ollama_unload': {
        const res = await unloadOllamaModel();
        stepOutputs.push(`[Ollama] ${res.message}`);
        break;
      }
      case 'docker_heal': {
        const res = await runDockerWatchtowerHeal({ autoRestartExited: true });
        stepOutputs.push(`[Docker] ${res.summary}`);
        break;
      }
      case 'lan_sentinel': {
        const res = await runLanSentinelAndSpeedtest({ runSpeedtest: false, notifyUnknown: false });
        stepOutputs.push(`[LAN] ${res.record.note}`);
        break;
      }
      case 'forensic_snapshot': {
        const res = runForensicSystemSnapshot();
        stepOutputs.push(`[Kórkép] ${res.diagnosisSummary}`);
        break;
      }
      case 'morning_brief': {
        const res = await buildProactiveBrief('morning');
        stepOutputs.push(`[Brief] ${res.title} elkészült`);
        break;
      }
      case 'self_heal': {
        const res = await runSelfHealingDaemonTick();
        stepOutputs.push(`[Öngyógyítás] ${res.healedActions.length} beavatkozás, ${res.failedServices.length} hibás service`);
        break;
      }
    }
  }

  const summary = stepOutputs.join('\n');
  const now = new Date().toISOString();
  let updatedMacro = target;
  updateState((draft) => {
    draft.quickMacros = (draft.quickMacros || []).map((m) => {
      if (m.id === target.id) {
        updatedMacro = {
          ...m,
          runCount: m.runCount + 1,
          lastRunAt: now,
          lastSummary: summary.slice(0, 400),
        };
        return updatedMacro;
      }
      return m;
    });
  });

  appendAuditLog({
    type: 'workflow',
    sourceAgentId: 'quick-macro',
    sourceAgentName: `Makró: ${target.name}`,
    message: `Makró lefutott (${target.steps.length} lépés)`,
    verifiedExecution: true,
  });

  return { macro: updatedMacro, stepOutputs, summary };
}
