import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';
import type {
  DeviceAdapterActionRecord,
  DeviceAdapterType,
  LanDeviceInventoryItem,
  PendingDeviceCredentialPrompt,
} from '../../shared/types';
import { scanLanArpTable, sendWakeOnLanPacket } from '../infra/networkAndCluster';
import { redactLeakedSecrets } from '../security/egressAndCrypto';
import { KillSwitchActiveError } from '../security/permissionGate';
import {
  evaluateUntrustedActionGuard,
  isSystemLockedDown,
  notifyExceptionToTelegram,
  recordAutonomyDecision,
  tagUntrustedContent,
} from '../security/totalAutonomy';
import {
  appendAuditLog,
  getDeviceCredentialSecret,
  getState,
  setDeviceCredentialSecret,
  updateState,
} from '../state/store';

/** Strict RFC1918 + local LAN only enforcement (no public IPs/domains, no cloud metadata). */
function parseIpv4Octets(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split('.').map((p) => Number(p));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

export function extractTargetHost(rawTarget: string): string {
  const trimmed = String(rawTarget || '').trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    }
  } catch {
    // fall through to manual cleanup
  }
  const noPath = trimmed.split('/')[0];
  if (noPath.startsWith('[')) {
    const endIdx = noPath.indexOf(']');
    if (endIdx > 0) return noPath.slice(1, endIdx).toLowerCase();
  }
  return noPath.split(':')[0].toLowerCase();
}

export function isPrivateLanTarget(rawTarget: string): { allowed: boolean; host: string; reason?: string } {
  const host = extractTargetHost(rawTarget);
  if (!host) {
    return { allowed: false, host: '', reason: 'Üres hálózati célpont.' };
  }

  // Block cloud metadata hostnames and IPs explicitly
  if (
    host === 'metadata.google.internal' ||
    host === 'metadata.goog' ||
    host === 'metadata.azure.internal' ||
    host === '169.254.169.254' ||
    host === '100.100.100.200'
  ) {
    return { allowed: false, host, reason: `Tiltott felhő metadata célpont: ${host}` };
  }

  const octets = parseIpv4Octets(host);
  if (octets) {
    const [a, b] = octets;
    // Block link-local 169.254.0.0/16 & CGNAT 100.64.0.0/10 & unspecified 0.0.0.0
    if (a === 169 && b === 254) {
      return { allowed: false, host, reason: `Tiltott link-local/metadata IP: ${host}` };
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return { allowed: false, host, reason: `Tiltott CGNAT/metadata IP: ${host}` };
    }
    if (a === 0) {
      return { allowed: false, host, reason: `Tiltott IP: ${host}` };
    }
    const isRfc1918 =
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127;
    if (!isRfc1918) {
      return {
        allowed: false,
        host,
        reason: `Csak privát LAN (RFC1918: 10/8, 172.16/12, 192.168/16) célpont engedélyezett; publikus IP tiltva: ${host}`,
      };
    }
    return { allowed: true, host };
  }

  // IPv6 check: allow only loopback ::1, ULA fc00::/7, link-local fe80::/10
  if (host.includes(':')) {
    const cleanV6 = host.split('%')[0];
    if (cleanV6 === '::1' || /^(fc|fd)[0-9a-f]{2}:/i.test(cleanV6) || /^fe[89ab][0-9a-f]:/i.test(cleanV6)) {
      return { allowed: true, host };
    }
    return { allowed: false, host, reason: `Publikus IPv6 cím tiltva LAN eszközvezérlésnél: ${host}` };
  }

  // Hostname check: allow localhost, single-label mDNS/LAN names, or .local / .lan / .home / .internal
  if (
    host === 'localhost' ||
    !host.includes('.') ||
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    host.endsWith('.home') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.internal')
  ) {
    return { allowed: true, host };
  }

  return {
    allowed: false,
    host,
    reason: `Publikus domain név tiltva LAN felderítésben/vezérlésben: ${host}`,
  };
}

const OUI_VENDOR_MAP: Record<string, string> = {
  'b8:27:eb': 'Raspberry Pi Foundation',
  'dc:a6:32': 'Raspberry Pi Trading',
  'e4:5f:01': 'Raspberry Pi Trading',
  '2c:cf:67': 'Raspberry Pi Trading',
  'd8:3a:dd': 'Raspberry Pi Trading',
  '3c:61:05': 'Shelly / Espressif IoT',
  'c8:c9:a3': 'Shelly / Allterco Robotics',
  'e8:db:84': 'Shelly / Espressif IoT',
  'a8:03:2a': 'Espressif / Tasmota IoT',
  '24:6f:28': 'Espressif IoT',
  '30:ae:a4': 'Espressif IoT',
  'ec:fa:bc': 'Espressif IoT',
  '00:11:32': 'Synology NAS',
  '00:17:88': 'Philips Hue (Signify)',
  'ec:b5:fa': 'Philips Hue (Signify)',
  '74:83:c2': 'Ubiquiti UniFi',
  'fc:ec:da': 'Ubiquiti UniFi',
  '18:e8:29': 'Ubiquiti UniFi',
  '50:c7:bf': 'TP-Link / OpenWrt',
  'b0:be:76': 'TP-Link / OpenWrt',
  '52:54:00': 'Proxmox / QEMU KVM',
  '00:50:56': 'VMware Host',
  '00:1b:a9': 'Brother Printer',
  '3c:d9:2b': 'HP Printer',
  '00:26:ab': 'Epson Printer',
  'a4:83:e7': 'Apple',
};

export function lookupOuiVendor(mac: string): string {
  const normalized = String(mac || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, ':');
  const prefix = normalized.slice(0, 8);
  return OUI_VENDOR_MAP[prefix] || 'Ismeretlen gyártó';
}

const SAFE_DISCOVERY_PORTS = [22, 80, 443, 445, 554, 631, 1883, 5000, 8006, 8123, 8443];

async function probeTcpPort(ip: string, port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port, timeout: timeoutMs });
    let done = false;
    const finish = (res: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(res);
    };
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function probeHttpBannerDefault(ip: string, port: number): Promise<string | null> {
  const check = isPrivateLanTarget(ip);
  if (!check.allowed) return null;
  const proto = port === 443 || port === 8006 || port === 8443 ? 'https' : 'http';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    const res = await fetch(`${proto}://${ip}:${port}/`, {
      method: 'GET',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const serverHdr = res.headers.get('server') || '';
    const text = (await res.text().catch(() => '')).slice(0, 400);
    const titleMatch = text.match(/<title>([^<]{1,80})<\/title>/i);
    const raw = [serverHdr, titleMatch?.[1] || '', text.slice(0, 120)].filter(Boolean).join(' · ');
    return raw ? redactLeakedSecrets(raw).redacted.slice(0, 220) : `HTTP ${res.status}`;
  } catch {
    return null;
  }
}

async function probeSsdpDefault(timeoutMs = 700): Promise<Array<{ ip: string; server: string }>> {
  return new Promise((resolve) => {
    const found: Array<{ ip: string; server: string }> = [];
    const socket = dgram.createSocket('udp4');
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n'
    );
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(found);
    }, timeoutMs);

    socket.on('error', () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(found);
    });

    socket.on('message', (buf, rinfo) => {
      if (!isPrivateLanTarget(rinfo.address).allowed) return;
      const str = buf.toString('utf8');
      const serverLine = str.match(/^SERVER:\s*(.+)$/im)?.[1]?.trim() || 'UPnP/SSDP eszköz';
      if (!found.some((f) => f.ip === rinfo.address)) {
        found.push({ ip: rinfo.address, server: serverLine.slice(0, 120) });
      }
    });

    try {
      socket.bind(() => {
        socket.send(msg, 1900, '239.255.255.250', () => {});
      });
    } catch {
      clearTimeout(timer);
      resolve(found);
    }
  });
}

function probeMdnsDefault(): Array<{ ip: string; hostname: string; service: string }> {
  try {
    const out = execFileSync('avahi-browse', ['-at', '-p', '-r'], {
      encoding: 'utf8',
      timeout: 1800,
    });
    const list: Array<{ ip: string; hostname: string; service: string }> = [];
    for (const line of out.split('\n')) {
      if (!line.startsWith('=')) continue;
      const parts = line.split(';');
      const hostname = parts[6] || '';
      const ip = parts[7] || '';
      const service = parts[4] || parts[3] || '';
      if (ip && isPrivateLanTarget(ip).allowed) {
        list.push({ ip, hostname, service });
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function inferDeviceTypeAndAdapter(params: {
  vendor: string;
  openPorts: number[];
  banner?: string;
  hostname?: string;
}): { inferredType: string; adapterType: DeviceAdapterType; services: string[] } {
  const text = `${params.vendor} ${params.banner || ''} ${params.hostname || ''}`.toLowerCase();
  const ports = new Set(params.openPorts);
  const services: string[] = [];
  if (ports.has(22)) services.push('ssh');
  if (ports.has(80)) services.push('http');
  if (ports.has(443) || ports.has(8443)) services.push('https');
  if (ports.has(445)) services.push('smb');
  if (ports.has(554)) services.push('rtsp');
  if (ports.has(631)) services.push('ipp');
  if (ports.has(1883)) services.push('mqtt');
  if (ports.has(5000)) services.push('dsm');
  if (ports.has(8006)) services.push('proxmox-api');
  if (ports.has(8123)) services.push('home-assistant');

  if (ports.has(8123) || text.includes('home assistant')) {
    return { inferredType: 'Okosotthon központ (Home Assistant)', adapterType: 'home_assistant', services };
  }
  if (ports.has(8006) || text.includes('proxmox')) {
    return { inferredType: 'Proxmox VE hipervizor', adapterType: 'proxmox', services };
  }
  if (text.includes('synology') || text.includes('diskstation') || ports.has(5000)) {
    return { inferredType: 'Synology NAS', adapterType: 'synology_nas', services };
  }
  if (text.includes('shelly') || text.includes('tasmota') || text.includes('espressif')) {
    return { inferredType: 'Okosrelé / IoT kapcsoló (Shelly/Tasmota)', adapterType: 'shelly_tasmota', services };
  }
  if (text.includes('philips') || text.includes('hue') || text.includes('signify')) {
    return { inferredType: 'Philips Hue Bridge / világítás', adapterType: 'philips_hue', services };
  }
  if (text.includes('openwrt') || text.includes('luci') || text.includes('unifi') || text.includes('ubiquiti')) {
    return { inferredType: 'Router / AP (OpenWrt / UniFi)', adapterType: 'openwrt_unifi', services };
  }
  if (ports.has(631) || text.includes('printer') || text.includes('brother') || text.includes('epson') || text.includes('hp ')) {
    return { inferredType: 'Hálózati nyomtató (IPP)', adapterType: 'ipp_printer', services };
  }
  if (ports.has(1883)) {
    return { inferredType: 'MQTT Broker / szenzor', adapterType: 'mqtt', services };
  }
  if (ports.has(22)) {
    return { inferredType: 'Linux / Raspberry Pi / SSH hoszt', adapterType: 'ssh', services };
  }
  if (ports.has(80) || ports.has(443) || ports.has(8443)) {
    return { inferredType: 'Hálózati HTTP/REST eszköz', adapterType: 'http_rest', services };
  }
  return { inferredType: 'Passzív LAN eszköz (WOL)', adapterType: 'wol', services };
}

export interface DiscoveryProbes {
  arpReader?: () => { ok: boolean; devices: Array<{ ip: string; mac: string; iface: string; state: string }> };
  mdnsProbe?: () => Array<{ ip: string; hostname: string; service: string }>;
  ssdpProbe?: () => Promise<Array<{ ip: string; server: string }>>;
  tcpPortProbe?: (ip: string, port: number) => Promise<boolean>;
  httpBannerProbe?: (ip: string, port: number) => Promise<string | null>;
  telegramSender?: (text: string) => Promise<unknown>;
}

function collectLocalLanSubnets(): string[] {
  const ifaces = os.networkInterfaces();
  const prefixes = new Set<string>();
  for (const entries of Object.values(ifaces)) {
    for (const e of entries || []) {
      if (e.family === 'IPv4' && !e.internal && isPrivateLanTarget(e.address).allowed) {
        const parts = e.address.split('.');
        if (parts.length === 4) {
          prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      }
    }
  }
  return [...prefixes];
}

export async function discoverLanDevicesSafe(opts?: {
  targets?: string[];
  probes?: DiscoveryProbes;
}): Promise<{
  discoveredCount: number;
  newDevicesCount: number;
  devices: LanDeviceInventoryItem[];
  rejectedTargets: string[];
}> {
  if (isSystemLockedDown()) {
    throw new KillSwitchActiveError();
  }

  const rejectedTargets: string[] = [];
  const explicitTargets: string[] = [];
  for (const raw of opts?.targets || []) {
    const check = isPrivateLanTarget(raw);
    if (!check.allowed) {
      rejectedTargets.push(`${raw} (${check.reason})`);
    } else {
      explicitTargets.push(check.host);
    }
  }
  if (opts?.targets && opts.targets.length > 0 && explicitTargets.length === 0) {
    throw new Error(`LAN felderítés megtagadva: csak privát RFC1918 célpont engedélyezett (${rejectedTargets.join('; ')})`);
  }

  const arpRes = (opts?.probes?.arpReader || scanLanArpTable)();
  const mdnsList = (opts?.probes?.mdnsProbe || probeMdnsDefault)();
  const ssdpList = await (opts?.probes?.ssdpProbe || (() => probeSsdpDefault()))();

  const candidateMap = new Map<string, { ip: string; mac: string; hostname?: string; extraBanner?: string }>();
  for (const t of explicitTargets) {
    candidateMap.set(t, { ip: t, mac: '00:00:00:00:00:00' });
  }
  for (const d of arpRes.devices) {
    if (!isPrivateLanTarget(d.ip).allowed) continue;
    candidateMap.set(d.ip, { ip: d.ip, mac: d.mac || '00:00:00:00:00:00' });
  }
  for (const m of mdnsList) {
    if (!isPrivateLanTarget(m.ip).allowed) continue;
    const prev = candidateMap.get(m.ip) || { ip: m.ip, mac: '00:00:00:00:00:00' };
    prev.hostname = prev.hostname || m.hostname;
    prev.extraBanner = [prev.extraBanner, m.service].filter(Boolean).join(' · ');
    candidateMap.set(m.ip, prev);
  }
  for (const s of ssdpList) {
    if (!isPrivateLanTarget(s.ip).allowed) continue;
    const prev = candidateMap.get(s.ip) || { ip: s.ip, mac: '00:00:00:00:00:00' };
    prev.extraBanner = [prev.extraBanner, s.server].filter(Boolean).join(' · ');
    candidateMap.set(s.ip, prev);
  }

  // Optional bounded ping sweep only if ARP yielded nothing and no explicit targets given (bounded to 8 hosts)
  if (candidateMap.size === 0 && explicitTargets.length === 0) {
    const subnets = collectLocalLanSubnets().slice(0, 1);
    for (const prefix of subnets) {
      for (const lastOctet of [1, 2, 10, 20, 50, 100]) {
        const ip = `${prefix}.${lastOctet}`;
        try {
          execFileSync('ping', ['-c', '1', '-W', '1', ip], { stdio: 'ignore', timeout: 1200 });
          candidateMap.set(ip, { ip, mac: '00:00:00:00:00:00' });
        } catch {
          // unreachable
        }
      }
    }
  }

  const tcpProbe = opts?.probes?.tcpPortProbe || ((ip: string, port: number) => probeTcpPort(ip, port));
  const httpProbe = opts?.probes?.httpBannerProbe || probeHttpBannerDefault;

  const now = new Date().toISOString();
  const discovered: LanDeviceInventoryItem[] = [];
  const newDevices: LanDeviceInventoryItem[] = [];

  for (const entry of [...candidateMap.values()].slice(0, 32)) {
    const openPorts: number[] = [];
    for (const p of SAFE_DISCOVERY_PORTS) {
      const ok = await Promise.resolve(tcpProbe(entry.ip, p)).catch(() => false);
      if (ok) openPorts.push(p);
    }
    let httpBanner: string | undefined = entry.extraBanner;
    const webPort = [8123, 8006, 5000, 80, 443, 8443].find((p) => openPorts.includes(p));
    if (webPort) {
      const b = await Promise.resolve(httpProbe(entry.ip, webPort)).catch(() => null);
      if (b) httpBanner = [httpBanner, b].filter(Boolean).join(' · ');
    }

    const vendor = lookupOuiVendor(entry.mac);
    const inferred = inferDeviceTypeAndAdapter({
      vendor,
      openPorts,
      banner: httpBanner,
      hostname: entry.hostname,
    });
    const safeBanner = httpBanner ? tagUntrustedContent(`LAN:${entry.ip}`, httpBanner) : undefined;

    const existing = (getState().lanDeviceInventory || []).find(
      (d) => d.ip === entry.ip || (entry.mac !== '00:00:00:00:00:00' && d.mac.toLowerCase() === entry.mac.toLowerCase())
    );
    const hasVaultCred = existing ? Boolean(getDeviceCredentialSecret(existing.id)) : false;

    const item: LanDeviceInventoryItem = {
      id: existing?.id || `dev-${crypto.randomUUID().slice(0, 8)}`,
      ip: entry.ip,
      mac: entry.mac,
      hostname: entry.hostname || existing?.hostname,
      vendor: vendor !== 'Ismeretlen gyártó' ? vendor : existing?.vendor || vendor,
      inferredType: inferred.inferredType,
      adapterType: existing?.adapterType || inferred.adapterType,
      openPorts,
      services: inferred.services,
      bannerExcerpt: safeBanner ? safeBanner.slice(0, 260) : existing?.bannerExcerpt,
      hasCredentials: hasVaultCred,
      credentialFieldsMask: existing?.credentialFieldsMask || [],
      status: hasVaultCred || openPorts.length > 0 ? 'online' : 'unknown',
      lastSeenAt: now,
      discoveredAt: existing?.discoveredAt || now,
    };

    discovered.push(item);
    if (!existing) {
      newDevices.push(item);
    }
  }

  updateState((s) => {
    const current = [...(s.lanDeviceInventory || [])];
    for (const dev of discovered) {
      const idx = current.findIndex((x) => x.id === dev.id || x.ip === dev.ip);
      if (idx >= 0) current[idx] = dev;
      else current.unshift(dev);
    }
    s.lanDeviceInventory = current.slice(0, 200);
  });

  if (newDevices.length > 0) {
    const summaryList = newDevices.map((d) => `${d.ip} (${d.vendor} · ${d.adapterType})`).join(', ');
    appendAuditLog({
      type: 'system',
      sourceAgentId: 'lan-discovery',
      sourceAgentName: 'LAN Eszközfelderítő',
      message: `${newDevices.length} új LAN eszköz észlelve: ${summaryList}`,
      verifiedExecution: true,
    });
    await notifyExceptionToTelegram(
      `🛰️ [ÚJ LAN ESZKÖZ] ${newDevices.length} új eszköz a helyi hálózaton:\n${newDevices
        .map((d) => `• ${d.ip} (${d.mac}) — ${d.vendor} [${d.adapterType}]`)
        .join('\n')}`,
      true,
      opts?.probes?.telegramSender
    ).catch(() => {});
  }

  return {
    discoveredCount: discovered.length,
    newDevicesCount: newDevices.length,
    devices: getState().lanDeviceInventory || [],
    rejectedTargets,
  };
}

export function saveDeviceCredentialsSafe(
  deviceId: string,
  credentials: Record<string, string>
): { ok: boolean; device?: LanDeviceInventoryItem; fieldsMask: string[] } {
  const cleanCreds: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials || {})) {
    const key = k.trim();
    const val = String(v ?? '').trim();
    if (key && val) {
      cleanCreds[key] = val;
    }
  }
  const fieldsMask = Object.keys(cleanCreds);
  if (fieldsMask.length === 0) {
    throw new Error('Legalább egy nem üres hitelesítő mező (pl. token, password, username) megadása kötelező.');
  }

  const dev = (getState().lanDeviceInventory || []).find((d) => d.id === deviceId);
  if (!dev) {
    throw new Error(`LAN eszköz nem található: ${deviceId}`);
  }

  setDeviceCredentialSecret(deviceId, {
    username: cleanCreds.username,
    password: cleanCreds.password,
    apiToken: cleanCreds.apiToken || cleanCreds.token || cleanCreds.apiKey || cleanCreds.community,
    sshPrivateKey: cleanCreds.sshPrivateKey || cleanCreds.privateKeyPath,
    extraNotes: JSON.stringify(cleanCreds),
  });

  const now = new Date().toISOString();
  let updated: LanDeviceInventoryItem | undefined;
  updateState((s) => {
    const target = (s.lanDeviceInventory || []).find((d) => d.id === deviceId);
    if (target) {
      target.hasCredentials = true;
      target.credentialFieldsMask = fieldsMask;
      if (target.status === 'needs_credentials') target.status = 'online';
      updated = { ...target };
    }
    for (const p of s.pendingDevicePrompts || []) {
      if (p.deviceId === deviceId && p.status === 'pending') {
        p.status = 'resolved';
        p.resolvedAt = now;
      }
    }
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: 'device-vault',
    sourceAgentName: 'Eszköz Titkosított Széf',
    message: `Eszköz hitelesítő adatok elmentve a titkosított széfbe (${dev.ip} · mezők: ${fieldsMask.join(', ')}).`,
    verifiedExecution: true,
  });

  return { ok: true, device: updated, fieldsMask };
}

function loadAdapterCredentialsMap(deviceId: string): Record<string, string> {
  const payload = getDeviceCredentialSecret(deviceId);
  if (!payload) return {};
  const map: Record<string, string> = {};
  if (payload.extraNotes) {
    try {
      const parsed = JSON.parse(payload.extraNotes) as Record<string, string>;
      Object.assign(map, parsed);
    } catch {
      // ignore plain string extraNotes
    }
  }
  if (payload.username) map.username = payload.username;
  if (payload.password) map.password = payload.password;
  if (payload.sshPrivateKey) {
    map.sshPrivateKey = payload.sshPrivateKey;
    map.privateKeyPath = map.privateKeyPath || payload.sshPrivateKey;
  }
  if (payload.apiToken) {
    map.apiToken = payload.apiToken;
    map.token = map.token || payload.apiToken;
    map.apiKey = map.apiKey || payload.apiToken;
    map.community = map.community || payload.apiToken;
  }
  return map;
}

export interface AdapterTransportOverrides {
  httpCall?: (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; data: unknown }>;
  sshExec?: (opts: { host: string; username: string; password?: string; privateKeyPath?: string; command: string }) => Promise<{ ok: boolean; output: string }>;
  mqttPublish?: (opts: { host: string; port: number; topic: string; payload: string; username?: string; password?: string }) => Promise<{ ok: boolean; message: string }>;
  wolSend?: (mac: string, broadcastIp?: string) => Promise<{ ok: boolean; message: string }>;
  snmpRead?: (opts: { host: string; community: string; oid: string }) => Promise<{ ok: boolean; value: string }>;
  telegramSender?: (text: string) => Promise<unknown>;
}

export interface AdapterExecutionContext {
  device: LanDeviceInventoryItem;
  credentials: Record<string, string>;
  action: string;
  params: Record<string, unknown>;
  dryRun: boolean;
  priorState?: Record<string, unknown> | null;
  transport: AdapterTransportOverrides;
}

export interface DeviceAdapter {
  type: DeviceAdapterType;
  label: string;
  requiredCredentials: string[];
  connect: (ctx: AdapterExecutionContext) => Promise<{ ok: boolean; detail: string }>;
  status: (ctx: AdapterExecutionContext) => Promise<{ ok: boolean; status: string; data?: Record<string, unknown> }>;
  read: (ctx: AdapterExecutionContext) => Promise<{ ok: boolean; state: Record<string, unknown> }>;
  act: (ctx: AdapterExecutionContext) => Promise<{ ok: boolean; result: string; appliedState?: Record<string, unknown> }>;
  undo: (ctx: AdapterExecutionContext) => Promise<{ ok: boolean; result: string }>;
}

async function defaultHttpCall(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const check = isPrivateLanTarget(url);
  if (!check.allowed) {
    throw new Error(check.reason || 'Tiltott hálózati célpont.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // plain text response
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function makeHttpBearerAdapter(
  type: DeviceAdapterType,
  label: string,
  requiredCredentials: string[],
  defaultPort: number,
  statusPath: string
): DeviceAdapter {
  const baseUrl = (dev: LanDeviceInventoryItem) => {
    const scheme = defaultPort === 443 || defaultPort === 8006 || defaultPort === 8443 ? 'https' : 'http';
    return `${scheme}://${dev.ip}:${defaultPort}`;
  };
  const headersFor = (creds: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (creds.token) h.Authorization = `Bearer ${creds.token}`;
    if (creds.apiKey) h['X-API-Key'] = creds.apiKey;
    return h;
  };
  return {
    type,
    label,
    requiredCredentials,
    async connect(ctx) {
      const httpFn = ctx.transport.httpCall || defaultHttpCall;
      const res = await httpFn(`${baseUrl(ctx.device)}${statusPath}`, {
        method: 'GET',
        headers: headersFor(ctx.credentials),
      });
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    },
    async status(ctx) {
      const httpFn = ctx.transport.httpCall || defaultHttpCall;
      const res = await httpFn(`${baseUrl(ctx.device)}${statusPath}`, {
        method: 'GET',
        headers: headersFor(ctx.credentials),
      });
      return { ok: res.ok, status: res.ok ? 'online' : `http_${res.status}`, data: { response: res.data } };
    },
    async read(ctx) {
      const path = String(ctx.params.path || statusPath);
      const httpFn = ctx.transport.httpCall || defaultHttpCall;
      const res = await httpFn(`${baseUrl(ctx.device)}${path}`, {
        method: 'GET',
        headers: headersFor(ctx.credentials),
      });
      return { ok: res.ok, state: { path, status: res.status, data: res.data } };
    },
    async act(ctx) {
      const path = String(ctx.params.path || statusPath);
      const method = String(ctx.params.method || 'POST').toUpperCase();
      if (ctx.dryRun) {
        return {
          ok: true,
          result: `[DRY-RUN] ${label}: ${method} ${baseUrl(ctx.device)}${path} (${ctx.action})`,
          appliedState: { dryRun: true, action: ctx.action, params: ctx.params },
        };
      }
      const httpFn = ctx.transport.httpCall || defaultHttpCall;
      const res = await httpFn(`${baseUrl(ctx.device)}${path}`, {
        method,
        headers: headersFor(ctx.credentials),
        body: ctx.params.body ? JSON.stringify(ctx.params.body) : undefined,
      });
      return {
        ok: res.ok,
        result: `${label} válasz (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`,
        appliedState: { action: ctx.action, path, body: ctx.params.body },
      };
    },
    async undo(ctx) {
      if (!ctx.priorState) return { ok: false, result: 'Nincs mentett korábbi állapot a visszavonáshoz.' };
      const undoPath = String(ctx.params.undoPath || ctx.priorState.path || statusPath);
      const httpFn = ctx.transport.httpCall || defaultHttpCall;
      const res = await httpFn(`${baseUrl(ctx.device)}${undoPath}`, {
        method: 'POST',
        headers: headersFor(ctx.credentials),
        body: JSON.stringify(ctx.priorState.data ?? ctx.priorState),
      });
      return {
        ok: res.ok,
        result: res.ok
          ? `${label} visszavonás sikeres (HTTP ${res.status}).`
          : `${label} visszavonás sikertelen (HTTP ${res.status}).`,
      };
    },
  };
}

export const DEVICE_ADAPTERS: Record<DeviceAdapterType, DeviceAdapter> = {
  ssh: {
    type: 'ssh',
    label: 'SSH Parancs Adapter',
    requiredCredentials: ['username'],
    async connect(ctx) {
      const sshFn = ctx.transport.sshExec;
      if (sshFn) {
        const res = await sshFn({
          host: ctx.device.ip,
          username: ctx.credentials.username,
          password: ctx.credentials.password,
          privateKeyPath: ctx.credentials.privateKeyPath,
          command: 'echo ok',
        });
        return { ok: res.ok, detail: res.output };
      }
      const out = execFileSync(
        'ssh',
        ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4', '-o', 'StrictHostKeyChecking=accept-new', `${ctx.credentials.username}@${ctx.device.ip}`, 'echo ok'],
        { encoding: 'utf8', timeout: 5000 }
      );
      return { ok: out.includes('ok'), detail: out.trim() };
    },
    async status(ctx) {
      const res = await this.connect(ctx);
      return { ok: res.ok, status: res.ok ? 'online' : 'unreachable', data: { detail: res.detail } };
    },
    async read(ctx) {
      const cmd = String(ctx.params.readCommand || 'uname -a && uptime');
      if (ctx.transport.sshExec) {
        const res = await ctx.transport.sshExec({
          host: ctx.device.ip,
          username: ctx.credentials.username,
          password: ctx.credentials.password,
          command: cmd,
        });
        return { ok: res.ok, state: { output: res.output, readCommand: cmd } };
      }
      const out = execFileSync(
        'ssh',
        ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', `${ctx.credentials.username}@${ctx.device.ip}`, cmd],
        { encoding: 'utf8', timeout: 6000 }
      );
      return { ok: true, state: { output: out.trim(), readCommand: cmd } };
    },
    async act(ctx) {
      const command = String(ctx.params.command || ctx.action || '').trim();
      if (!command) return { ok: false, result: 'Hiányzó SSH parancs.' };
      if (ctx.dryRun) {
        return { ok: true, result: `[DRY-RUN] SSH ${ctx.device.ip}: ${command}`, appliedState: { command } };
      }
      if (ctx.transport.sshExec) {
        const res = await ctx.transport.sshExec({
          host: ctx.device.ip,
          username: ctx.credentials.username,
          password: ctx.credentials.password,
          command,
        });
        return { ok: res.ok, result: res.output, appliedState: { command, undoCommand: ctx.params.undoCommand } };
      }
      const out = execFileSync(
        'ssh',
        ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', `${ctx.credentials.username}@${ctx.device.ip}`, command],
        { encoding: 'utf8', timeout: 10000 }
      );
      return { ok: true, result: out.trim() || 'SSH parancs lefutott.', appliedState: { command } };
    },
    async undo(ctx) {
      const undoCmd = String(ctx.params.undoCommand || ctx.priorState?.undoCommand || '').trim();
      if (!undoCmd) {
        return { ok: false, result: 'SSH visszavonáshoz szükséges az undoCommand vagy korábbi állapot-helyreállító parancs.' };
      }
      if (ctx.transport.sshExec) {
        const res = await ctx.transport.sshExec({
          host: ctx.device.ip,
          username: ctx.credentials.username,
          password: ctx.credentials.password,
          command: undoCmd,
        });
        return { ok: res.ok, result: res.output };
      }
      const out = execFileSync(
        'ssh',
        ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', `${ctx.credentials.username}@${ctx.device.ip}`, undoCmd],
        { encoding: 'utf8', timeout: 10000 }
      );
      return { ok: true, result: out.trim() || 'SSH visszavonó parancs végrehajtva.' };
    },
  },
  http_rest: makeHttpBearerAdapter('http_rest', 'HTTP/REST Eszköz', [], 80, '/'),
  mqtt: {
    type: 'mqtt',
    label: 'MQTT Broker / Eszköz',
    requiredCredentials: [],
    async connect(ctx) {
      const ok = await probeTcpPort(ctx.device.ip, 1883, 500);
      return { ok, detail: ok ? 'MQTT port 1883 elérhető' : 'MQTT port 1883 nem elérhető' };
    },
    async status(ctx) {
      const res = await this.connect(ctx);
      return { ok: res.ok, status: res.ok ? 'online' : 'offline' };
    },
    async read(ctx) {
      return {
        ok: true,
        state: { topic: String(ctx.params.topic || 'cmnd/device/POWER'), knownState: ctx.device.status },
      };
    },
    async act(ctx) {
      const topic = String(ctx.params.topic || 'cmnd/device/POWER');
      const payload = String(ctx.params.payload || ctx.action || 'TOGGLE');
      if (ctx.dryRun) {
        return { ok: true, result: `[DRY-RUN] MQTT ${ctx.device.ip}:1883 ${topic} => ${payload}` };
      }
      if (ctx.transport.mqttPublish) {
        const res = await ctx.transport.mqttPublish({
          host: ctx.device.ip,
          port: 1883,
          topic,
          payload,
          username: ctx.credentials.username,
          password: ctx.credentials.password,
        });
        return { ok: res.ok, result: res.message, appliedState: { topic, payload } };
      }
      execFileSync('mosquitto_pub', ['-h', ctx.device.ip, '-t', topic, '-m', payload], { timeout: 3000 });
      return { ok: true, result: `MQTT üzenet elküldve: ${topic} => ${payload}`, appliedState: { topic, payload } };
    },
    async undo(ctx) {
      const topic = String(ctx.priorState?.topic || ctx.params.topic || 'cmnd/device/POWER');
      const prevPayload = String(ctx.priorState?.knownState === 'ON' ? 'ON' : 'OFF');
      if (ctx.transport.mqttPublish) {
        const res = await ctx.transport.mqttPublish({
          host: ctx.device.ip,
          port: 1883,
          topic,
          payload: prevPayload,
        });
        return { ok: res.ok, result: `MQTT visszavonva: ${res.message}` };
      }
      return { ok: false, result: 'MQTT broker kliens (mosquitto_pub / transport) nem érhető el a visszavonáshoz.' };
    },
  },
  home_assistant: makeHttpBearerAdapter('home_assistant', 'Home Assistant', ['token'], 8123, '/api/'),
  snmp: {
    type: 'snmp',
    label: 'SNMP Olvasó Adapter (Read-Only)',
    requiredCredentials: ['community'],
    async connect(ctx) {
      if (ctx.transport.snmpRead) {
        const res = await ctx.transport.snmpRead({
          host: ctx.device.ip,
          community: ctx.credentials.community,
          oid: '1.3.6.1.2.1.1.1.0',
        });
        return { ok: res.ok, detail: res.value };
      }
      return { ok: true, detail: 'SNMP read-only konfigurálva' };
    },
    async status(ctx) {
      const res = await this.connect(ctx);
      return { ok: res.ok, status: res.ok ? 'online' : 'error', data: { sysDescr: res.detail } };
    },
    async read(ctx) {
      const oid = String(ctx.params.oid || '1.3.6.1.2.1.1.1.0');
      if (ctx.transport.snmpRead) {
        const res = await ctx.transport.snmpRead({
          host: ctx.device.ip,
          community: ctx.credentials.community,
          oid,
        });
        return { ok: res.ok, state: { oid, value: res.value } };
      }
      const out = execFileSync('snmpget', ['-v2c', '-c', ctx.credentials.community, ctx.device.ip, oid], {
        encoding: 'utf8',
        timeout: 4000,
      });
      return { ok: true, state: { oid, value: out.trim() } };
    },
    async act() {
      return { ok: false, result: 'Az SNMP adapter biztonsági okból szigorúan csak olvasási (read) módban működik.' };
    },
    async undo() {
      return { ok: false, result: 'Az SNMP adapter csak olvasási műveleteket támogat.' };
    },
  },
  openwrt_unifi: makeHttpBearerAdapter('openwrt_unifi', 'OpenWrt / UniFi Router', ['token'], 443, '/api/status'),
  proxmox: makeHttpBearerAdapter('proxmox', 'Proxmox VE API', ['token'], 8006, '/api2/json/version'),
  synology_nas: makeHttpBearerAdapter('synology_nas', 'Synology NAS DSM', ['token'], 5000, '/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query'),
  shelly_tasmota: makeHttpBearerAdapter('shelly_tasmota', 'Shelly / Tasmota IoT', [], 80, '/rpc/Shelly.GetStatus'),
  philips_hue: makeHttpBearerAdapter('philips_hue', 'Philips Hue Bridge', ['apiKey'], 80, '/api/config'),
  ipp_printer: makeHttpBearerAdapter('ipp_printer', 'IPP Hálózati Nyomtató', [], 631, '/'),
  wol: {
    type: 'wol',
    label: 'Wake-on-LAN (Magic Packet)',
    requiredCredentials: [],
    async connect(ctx) {
      return {
        ok: /^[0-9a-f:]{17}$/i.test(ctx.device.mac),
        detail: `MAC: ${ctx.device.mac}`,
      };
    },
    async status(ctx) {
      return { ok: true, status: ctx.device.status, data: { mac: ctx.device.mac, ip: ctx.device.ip } };
    },
    async read(ctx) {
      return { ok: true, state: { mac: ctx.device.mac, ip: ctx.device.ip, power: ctx.device.status } };
    },
    async act(ctx) {
      if (ctx.dryRun) {
        return { ok: true, result: `[DRY-RUN] Wake-on-LAN Magic Packet -> ${ctx.device.mac}` };
      }
      const sendFn = ctx.transport.wolSend || sendWakeOnLanPacket;
      const res = await sendFn(ctx.device.mac, String(ctx.params.broadcastIp || '255.255.255.255'));
      return { ok: res.ok, result: res.message, appliedState: { wolSentTo: ctx.device.mac } };
    },
    async undo() {
      return { ok: false, result: 'A Wake-on-LAN ébresztő csomag fizikailag nem vonható vissza UDP-n; leállításhoz használd az SSH/HTTP adaptert.' };
    },
  },
};

export async function executeDeviceControl(params: {
  deviceId: string;
  mode: 'status' | 'read' | 'act';
  action?: string;
  actionParams?: Record<string, unknown>;
  dryRun?: boolean;
  hasUntrustedContext?: boolean;
  transportOverrides?: AdapterTransportOverrides;
}): Promise<{
  ok: boolean;
  needsCredentials?: boolean;
  prompt?: PendingDeviceCredentialPrompt;
  actionRecord?: DeviceAdapterActionRecord;
  data?: unknown;
  message: string;
}> {
  if (isSystemLockedDown()) {
    throw new KillSwitchActiveError();
  }

  const device = (getState().lanDeviceInventory || []).find((d) => d.id === params.deviceId);
  if (!device) {
    return { ok: false, message: `LAN eszköz nem található: ${params.deviceId}` };
  }

  const targetCheck = isPrivateLanTarget(device.ip);
  if (!targetCheck.allowed) {
    return { ok: false, message: targetCheck.reason || 'Tiltott nem-privát LAN célpont.' };
  }

  if (params.mode === 'act') {
    const guard = evaluateUntrustedActionGuard({
      hasUntrustedContext: Boolean(params.hasUntrustedContext),
      actionName: 'device_control',
      actionArgsText: JSON.stringify({ deviceId: device.id, action: params.action, params: params.actionParams }),
      sourcePromptOrContext: device.bannerExcerpt || '',
    });
    if (!guard.allowed) {
      return { ok: false, message: guard.reason || 'Kritikus Felülvizsgáló blokkolta a műveletet.' };
    }
  }

  const adapter = DEVICE_ADAPTERS[device.adapterType];
  if (!adapter) {
    return { ok: false, message: `Ismeretlen adapter típus: ${device.adapterType}` };
  }

  // Load credentials strictly from encrypted vault
  const creds = loadAdapterCredentialsMap(device.id);

  const missingFields = adapter.requiredCredentials.filter((f) => !creds[f]);
  if (missingFields.length > 0) {
    // NEVER guess passwords or try defaults: prompt owner on Telegram + UI
    const existingPrompt = (getState().pendingDevicePrompts || []).find(
      (p) => p.deviceId === device.id && p.status === 'pending'
    );
    const prompt: PendingDeviceCredentialPrompt = existingPrompt || {
      id: `dprompt-${crypto.randomUUID().slice(0, 8)}`,
      deviceId: device.id,
      ip: device.ip,
      vendor: device.vendor,
      adapterType: device.adapterType,
      requiredFields: missingFields,
      message: `A(z) ${device.ip} (${device.vendor} · ${adapter.label}) vezérléséhez hiányoznak a hitelesítő adatok: ${missingFields.join(', ')}. Kérlek add meg őket az Autonómia központban (soha nem próbálok alapértelmezett jelszót)!`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    updateState((s) => {
      const target = (s.lanDeviceInventory || []).find((d) => d.id === device.id);
      if (target) target.status = 'needs_credentials';
      if (!existingPrompt) {
        s.pendingDevicePrompts = [prompt, ...(s.pendingDevicePrompts || [])].slice(0, 100);
      }
    });
    await notifyExceptionToTelegram(
      `🔑 [ESZKÖZ HITELESÍTÉS SZÜKSÉGES]\n${prompt.message}`,
      true,
      params.transportOverrides?.telegramSender
    ).catch(() => {});

    return {
      ok: false,
      needsCredentials: true,
      prompt,
      message: prompt.message,
    };
  }

  const ctx: AdapterExecutionContext = {
    device,
    credentials: creds,
    action: params.action || params.mode,
    params: params.actionParams || {},
    dryRun: Boolean(params.dryRun),
    transport: params.transportOverrides || {},
  };

  if (params.mode === 'status') {
    const st = await adapter.status(ctx);
    const cleanStatus = redactLeakedSecrets(JSON.stringify(st)).redacted;
    return { ok: st.ok, data: st, message: cleanStatus };
  }

  if (params.mode === 'read') {
    const rd = await adapter.read(ctx);
    const cleanRead = redactLeakedSecrets(JSON.stringify(rd)).redacted;
    return { ok: rd.ok, data: rd.state, message: cleanRead };
  }

  // Capture priorState before mutating ('act')
  let priorState: Record<string, unknown> | null = null;
  try {
    const before = await adapter.read(ctx);
    if (before.ok) priorState = before.state;
  } catch {
    priorState = null;
  }

  const actRes = await adapter.act({ ...ctx, priorState });
  const safeResultSummary = redactLeakedSecrets(actRes.result).redacted.slice(0, 500);
  const safeParamsSummary = redactLeakedSecrets(JSON.stringify(params.actionParams || {})).redacted.slice(0, 200);

  const actionRecord: DeviceAdapterActionRecord = {
    id: `devact-${crypto.randomUUID().slice(0, 8)}`,
    deviceId: device.id,
    adapterType: device.adapterType,
    action: params.action || 'act',
    paramsSummary: safeParamsSummary,
    priorState,
    resultSummary: safeResultSummary,
    ok: actRes.ok,
    dryRun: Boolean(params.dryRun),
    undone: false,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.deviceActionHistory = [actionRecord, ...(s.deviceActionHistory || [])].slice(0, 200);
  });

  if (!params.dryRun) {
    recordAutonomyDecision({
      agentId: 'device-control',
      category: 'device_control',
      decision: `${adapter.label} (${device.ip}): ${params.action || 'act'}`,
      rationale: `Privát LAN eszköz vezérlés (${device.adapterType}).`,
      rejectedAlternatives: ['Kézi beavatkozás nélkül hagyás'],
      outcome: actRes.ok ? 'applied' : 'failed',
      highImpact: true,
    });
    appendAuditLog({
      type: 'action',
      sourceAgentId: 'device-control',
      sourceAgentName: adapter.label,
      message: `[${device.ip}] ${params.action || 'act'} -> ${actRes.ok ? 'OK' : 'HIBA'}: ${safeResultSummary.slice(0, 180)}`,
      verifiedExecution: actRes.ok,
    });
  }

  return {
    ok: actRes.ok,
    actionRecord,
    data: actRes.appliedState,
    message: safeResultSummary,
  };
}

export async function undoDeviceAction(
  actionId: string,
  transportOverrides?: AdapterTransportOverrides
): Promise<{ ok: boolean; message: string }> {
  if (isSystemLockedDown()) {
    throw new KillSwitchActiveError();
  }
  const state = getState();
  const record = (state.deviceActionHistory || []).find((a) => a.id === actionId);
  if (!record) {
    return { ok: false, message: `Eszközművelet nem található: ${actionId}` };
  }
  if (record.undone) {
    return { ok: false, message: 'Ez az eszközművelet már vissza lett vonva.' };
  }
  const device = (state.lanDeviceInventory || []).find((d) => d.id === record.deviceId);
  if (!device) {
    return { ok: false, message: `Kapcsolódó eszköz nem található: ${record.deviceId}` };
  }
  const adapter = DEVICE_ADAPTERS[device.adapterType];
  const creds = loadAdapterCredentialsMap(device.id);

  let parsedParams: Record<string, unknown> = {};
  try {
    parsedParams = JSON.parse(record.paramsSummary) as Record<string, unknown>;
  } catch {
    parsedParams = {};
  }

  const undoRes = await adapter.undo({
    device,
    credentials: creds,
    action: `undo:${record.action}`,
    params: parsedParams,
    dryRun: false,
    priorState: record.priorState,
    transport: transportOverrides || {},
  });

  const cleanMsg = redactLeakedSecrets(undoRes.result).redacted;
  if (undoRes.ok) {
    updateState((s) => {
      const target = (s.deviceActionHistory || []).find((a) => a.id === actionId);
      if (target) target.undone = true;
    });
    appendAuditLog({
      type: 'action',
      sourceAgentId: 'device-control',
      sourceAgentName: `${adapter.label} Undo`,
      message: `Eszközművelet visszavonva (${device.ip} · ${record.action}): ${cleanMsg}`,
      verifiedExecution: true,
    });
  }
  return { ok: undoRes.ok, message: cleanMsg };
}
