import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import type { ClusterNode, WolDevice } from '../../shared/types';
import { redactLeakedSecrets } from '../security/egressAndCrypto';
import { generateQrSvg } from '../power/lifeAndFinanceStudio';
import { appendAuditLog, getState, updateState } from '../state/store';

/** Ú120: Real UDP Wake-on-LAN Magic Packet */
export async function sendWakeOnLanPacket(macAddress: string, broadcastIp = '255.255.255.255'): Promise<{
  ok: boolean;
  mac: string;
  broadcastIp: string;
  message: string;
}> {
  const cleanHex = macAddress.replace(/[^0-9a-fA-F]/g, '');
  if (cleanHex.length !== 12) {
    return { ok: false, mac: macAddress, broadcastIp, message: 'Érvénytelen MAC cím (12 hex karakter szükséges).' };
  }
  const targetIp = (broadcastIp || '255.255.255.255').trim();
  const isPrivateOrBroadcastIpv4 =
    targetIp === '255.255.255.255' ||
    targetIp.startsWith('192.168.') ||
    targetIp.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(targetIp);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(targetIp) || !isPrivateOrBroadcastIpv4) {
    return {
      ok: false,
      mac: macAddress,
      broadcastIp,
      message: 'Érvénytelen vagy nem privát LAN broadcast IP-cím a Wake-on-LAN csomaghoz.',
    };
  }
  const macBytes = Buffer.from(cleanHex, 'hex');
  const magic = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(magic, 6 + i * 6);
  }

  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', (err) => {
      socket.close();
      resolve({ ok: false, mac: macAddress, broadcastIp, message: `WOL UDP hiba: ${err.message}` });
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(magic, 9, broadcastIp, (err) => {
        socket.close();
        if (err) {
          resolve({ ok: false, mac: macAddress, broadcastIp, message: `Küldési hiba: ${err.message}` });
        } else {
          appendAuditLog({
            type: 'system',
            sourceAgentId: 'wol-engine',
            sourceAgentName: 'Wake-on-LAN',
            message: `Magic Packet elküldve: ${macAddress} -> ${broadcastIp}:9`,
            verifiedExecution: true,
          });
          resolve({ ok: true, mac: macAddress, broadcastIp, message: `Magic Packet elküldve (${macAddress} -> ${broadcastIp})` });
        }
      });
    });
  });
}

export function addWolDevice(input: { name: string; mac: string; broadcastIp?: string }): WolDevice {
  const dev: WolDevice = {
    id: `wol-${crypto.randomUUID().slice(0, 6)}`,
    name: input.name.trim(),
    mac: input.mac.trim(),
    broadcastIp: input.broadcastIp?.trim() || '255.255.255.255',
  };
  updateState((s) => {
    s.wolDevices.unshift(dev);
  });
  return dev;
}

/** Ú121: Real X25519 WireGuard Keypair + Client Config + QR SVG */
export function generateWireGuardClientBundle(input: {
  clientName?: string;
  endpointHost?: string;
  clientIp?: string;
  serverPublicKey?: string;
}): {
  privateKeyBase64: string;
  publicKeyBase64: string;
  configText: string;
  qrSvg: string;
} {
  // Real X25519 key generation using Node crypto
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  // X25519 raw 32-byte keys are the last 32 bytes of SPKI / PKCS8 DER
  const rawPub = pubDer.subarray(pubDer.length - 32).toString('base64');
  const rawPriv = privDer.subarray(privDer.length - 32).toString('base64');

  const endpoint = input.endpointHost?.trim() || `${os.hostname()}:51820`;
  const clientIp = input.clientIp?.trim() || '10.66.66.2/32';
  const peerPub = input.serverPublicKey?.trim() || rawPub;

  const configText = [
    `# NovaSwarm WireGuard Kliens (${input.clientName || 'Mobil'})`,
    `[Interface]`,
    `PrivateKey = ${rawPriv}`,
    `Address = ${clientIp}`,
    `DNS = 1.1.1.1`,
    ``,
    `[Peer]`,
    `PublicKey = ${peerPub}`,
    `AllowedIPs = 10.66.66.0/24, 192.168.0.0/16`,
    `Endpoint = ${endpoint}`,
    `PersistentKeepalive = 25`,
  ].join('\n');

  const qrSvg = generateQrSvg(configText.slice(0, 52), 200);
  return { privateKeyBase64: rawPriv, publicKeyBase64: rawPub, configText, qrSvg };
}

/** Ú122: LAN ARP Neighbor Scanner */
export function scanLanArpTable(): {
  ok: boolean;
  devices: Array<{ ip: string; mac: string; iface: string; state: string }>;
  source: string;
} {
  const devices: Array<{ ip: string; mac: string; iface: string; state: string }> = [];
  try {
    const out = execSync('ip neigh show 2>/dev/null || arp -an 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    for (const line of out.split('\n')) {
      const m = line.match(/^(\S+)\s+dev\s+(\S+)\s+lladdr\s+([0-9a-f:]{17})\s+(\S+)/i);
      if (m) {
        devices.push({ ip: m[1], iface: m[2], mac: m[3], state: m[4] });
      }
    }
    if (devices.length > 0) return { ok: true, devices, source: 'ip neigh' };
  } catch {
    // fallback /proc/net/arp
  }

  try {
    if (fs.existsSync('/proc/net/arp')) {
      const lines = fs.readFileSync('/proc/net/arp', 'utf8').split('\n').slice(1);
      for (const l of lines) {
        const parts = l.trim().split(/\s+/);
        if (parts.length >= 6 && parts[3] !== '00:00:00:00:00:00') {
          devices.push({ ip: parts[0], mac: parts[3], iface: parts[5], state: parts[2] === '0x2' ? 'REACHABLE' : 'STALE' });
        }
      }
    }
    return { ok: true, devices, source: '/proc/net/arp' };
  } catch {
    return { ok: false, devices, source: 'unavailable' };
  }
}

/** Ú125: SSH Auth Log Inspector */
export function inspectSshAuthLogs(): {
  available: boolean;
  failedAttempts: number;
  topIps: Array<{ ip: string; count: number }>;
  recentLines: string[];
  note: string;
} {
  const candidates = ['/var/log/auth.log', '/var/log/secure'];
  const foundPath = candidates.find((p) => fs.existsSync(p));
  if (!foundPath) {
    return {
      available: false,
      failedAttempts: 0,
      topIps: [],
      recentLines: [],
      note: 'A /var/log/auth.log nem elérhető ebben a konténerben/környezetben. Éles Debian/Ubuntu gépen valós SSH sikertelen kísérletek jelennek meg itt.',
    };
  }
  try {
    const raw = fs.readFileSync(foundPath, 'utf8');
    const lines = raw.split('\n').slice(-400);
    const failed = lines.filter((l) => /Failed password|Invalid user/i.test(l));
    const ipCounts: Record<string, number> = {};
    for (const l of failed) {
      const m = l.match(/from\s+(\d+\.\d+\.\d+\.\d+)/);
      if (m) ipCounts[m[1]] = (ipCounts[m[1]] || 0) + 1;
    }
    const topIps = Object.entries(ipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));
    return {
      available: true,
      failedAttempts: failed.length,
      topIps,
      recentLines: failed.slice(-10).map((l) => redactLeakedSecrets(l).redacted),
      note: `${foundPath} elemezve`,
    };
  } catch (err) {
    return {
      available: false,
      failedAttempts: 0,
      topIps: [],
      recentLines: [],
      note: `Naplóolvasási hiba: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Ú126: Local Secret Hygiene & Permission Auditor */
export function auditSecretFilePermissions(): Array<{ file: string; exists: boolean; modeOctal: string; risk: string }> {
  const targets = ['.novaswarm.secrets.json', '.env', 'novaswarm.config.json'];
  return targets.map((file) => {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) return { file, exists: false, modeOctal: '-', risk: 'none' };
    const st = fs.statSync(full);
    const modeOctal = (st.mode & 0o777).toString(8).padStart(3, '0');
    const worldReadable = (st.mode & 0o004) !== 0;
    return {
      file,
      exists: true,
      modeOctal,
      risk: worldReadable ? 'Magas (mások által olvasható — chmod 600 ajánlott)' : 'Rendben (privát)',
    };
  });
}

/** Ú128: Real Network Download / Ping Speedtest */
export async function runNetworkSpeedtest(): Promise<{
  ok: boolean;
  pingMs: number;
  downloadMbps: number;
  testedEndpoint: string;
  error?: string;
}> {
  const endpoint = 'https://speed.cloudflare.com/__down?bytes=500000';
  try {
    const pingT0 = Date.now();
    await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(4000) });
    const pingMs = Date.now() - pingT0;

    const dlT0 = Date.now();
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    const buf = await res.arrayBuffer();
    const elapsedSec = Math.max(0.01, (Date.now() - dlT0) / 1000);
    const downloadMbps = Number((((buf.byteLength * 8) / elapsedSec) / 1_000_000).toFixed(2));
    return { ok: true, pingMs, downloadMbps, testedEndpoint: endpoint };
  } catch (err) {
    return {
      ok: false,
      pingMs: 0,
      downloadMbps: 0,
      testedEndpoint: endpoint,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Ú130: OSINT Domain Inspector (DNS + SPF/DMARC + TLS + Headers) */
export async function inspectDomainOsint(domainInput: string): Promise<{
  domain: string;
  aRecords: string[];
  mxRecords: Array<{ exchange: string; priority: number }>;
  spfRecord: string | null;
  dmarcRecord: string | null;
  tlsSubject?: string;
  tlsIssuer?: string;
  tlsValidTo?: string;
  httpHeaders: Record<string, string>;
}> {
  const domain = domainInput.replace(/^https?:\/\//i, '').split('/')[0].trim();
  const aRecords = await dns.resolve4(domain).catch(() => []);
  const mxRecords = await dns.resolveMx(domain).catch(() => []);
  const txtRoot = await dns.resolveTxt(domain).catch(() => []);
  const txtDmarc = await dns.resolveTxt(`_dmarc.${domain}`).catch(() => []);
  const spfRecord = txtRoot.flat().find((t) => t.toLowerCase().includes('v=spf1')) || null;
  const dmarcRecord = txtDmarc.flat().find((t) => t.toLowerCase().includes('v=dmarc1')) || null;

  let tlsSubject: string | undefined;
  let tlsIssuer: string | undefined;
  let tlsValidTo: string | undefined;
  await new Promise<void>((resolve) => {
    const sock = tls.connect({ host: domain, port: 443, servername: domain, timeout: 4000 }, () => {
      const cert = sock.getPeerCertificate();
      const rawSubj = cert.subject?.CN;
      const rawIssuer = cert.issuer?.O || cert.issuer?.CN;
      tlsSubject = Array.isArray(rawSubj) ? rawSubj[0] : rawSubj;
      tlsIssuer = Array.isArray(rawIssuer) ? rawIssuer[0] : rawIssuer;
      tlsValidTo = cert.valid_to;
      sock.destroy();
      resolve();
    });
    sock.on('error', () => resolve());
    sock.on('timeout', () => {
      sock.destroy();
      resolve();
    });
  });

  const httpHeaders: Record<string, string> = {};
  try {
    const res = await fetch(`https://${domain}`, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    for (const k of ['server', 'strict-transport-security', 'x-frame-options', 'content-security-policy']) {
      const val = res.headers.get(k);
      if (val) httpHeaders[k] = val;
    }
  } catch {
    // ignore
  }

  return { domain, aRecords, mxRecords, spfRecord, dmarcRecord, tlsSubject, tlsIssuer, tlsValidTo, httpHeaders };
}

/** Ú152-Ú153: Multi-Node Cluster & GPU Ollama Offloading */
export function registerClusterNode(input: { name: string; url: string; role: ClusterNode['role'] }): ClusterNode {
  const node: ClusterNode = {
    id: `node-${crypto.randomUUID().slice(0, 6)}`,
    name: input.name.trim(),
    url: input.url.trim().replace(/\/+$/, ''),
    role: input.role,
    status: 'unknown',
  };
  updateState((s) => {
    s.clusterNodes.unshift(node);
  });
  return node;
}

export async function pingClusterNodes(): Promise<ClusterNode[]> {
  const nodes = getState().clusterNodes;
  for (const n of nodes) {
    const t0 = Date.now();
    try {
      const probeUrl = n.role === 'gpu_ollama' ? `${n.url}/api/tags` : `${n.url}/healthz`;
      const res = await fetch(probeUrl, { signal: AbortSignal.timeout(3500) });
      const latencyMs = Date.now() - t0;
      let gpuVramMb: number | undefined;
      if (n.role === 'gpu_ollama' && res.ok) {
        const data = (await res.json()) as { models?: Array<{ size?: number }> };
        const maxModel = Math.max(0, ...(data.models || []).map((m) => m.size || 0));
        if (maxModel > 0) gpuVramMb = Math.round(maxModel / (1024 * 1024));
      }
      updateState((s) => {
        const ref = s.clusterNodes.find((x) => x.id === n.id);
        if (ref) {
          ref.status = res.ok ? 'online' : 'offline';
          ref.latencyMs = latencyMs;
          ref.lastSeenAt = new Date().toISOString();
          if (gpuVramMb) ref.gpuVramMb = gpuVramMb;
        }
      });
    } catch {
      updateState((s) => {
        const ref = s.clusterNodes.find((x) => x.id === n.id);
        if (ref) {
          ref.status = 'offline';
          ref.lastSeenAt = new Date().toISOString();
        }
      });
    }
  }
  return getState().clusterNodes;
}

/** Ú160: Phoenix Recovery Bundle (Export & Restore complete system snapshot) */
export function createPhoenixSnapshot(): { fileName: string; sizeBytes: number; sha256: string; createdAt: string } {
  const dir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `novaswarm-phoenix-${stamp}.json`;
  const fullPath = path.join(dir, fileName);
  const payload = JSON.stringify(
    {
      format: 'novaswarm-phoenix-v3',
      exportedAt: new Date().toISOString(),
      state: getState(),
    },
    null,
    2
  );
  fs.writeFileSync(fullPath, payload, 'utf8');
  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
  const createdAt = new Date().toISOString();
  updateState((s) => {
    s.settings.lastPhoenixSnapshotAt = createdAt;
  });
  return {
    fileName,
    sizeBytes: Buffer.byteLength(payload, 'utf8'),
    sha256,
    createdAt,
  };
}
