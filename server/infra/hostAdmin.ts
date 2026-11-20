import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import type { SshHostProfile, SslWatchTarget } from '../../shared/types';
import { invokeWithFailover } from '../providers/router';
import { assertHostPermission, requireDestructiveApproval, shouldRequireApproval } from '../security/permissionGate';
import { detectActiveSandboxBackend } from '../sandbox/supervisorSandbox';
import { appendAuditLog, getState, updateState } from '../state/store';

function runSafeCmd(cmd: string, args: string[], timeout = 4000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const res = spawnSync(cmd, args, { encoding: 'utf8', timeout });
    return {
      ok: res.status === 0,
      stdout: (res.stdout || '').trim(),
      stderr: (res.stderr || '').trim(),
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : String(err) };
  }
}

/** M25: 1-Click Host Self-Diagnostics */
export async function runHostSelfDiagnostics(): Promise<{
  checkedAt: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}> {
  const state = getState();
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  // 1. Ollama reachability
  try {
    const res = await fetch(`${state.settings.ollamaUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      checks.push({
        name: 'Lokális Ollama Motor',
        ok: true,
        detail: `Elérhető (${data.models?.length ?? 0} telepített modell)`,
      });
    } else {
      checks.push({ name: 'Lokális Ollama Motor', ok: false, detail: `HTTP ${res.status}` });
    }
  } catch {
    checks.push({
      name: 'Lokális Ollama Motor',
      ok: false,
      detail: `Nem érhető el itt: ${state.settings.ollamaUrl}`,
    });
  }

  // 2. Sandbox Backend
  const sandbox = detectActiveSandboxBackend();
  checks.push({
    name: 'Linux Sandbox Izoláció',
    ok: sandbox !== 'isolated_tmpfs_subprocess',
    detail: `Aktív motor: ${sandbox}`,
  });

  // 3. Swap & Memory check
  const totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeRamMb = Math.round(os.freemem() / (1024 * 1024));
  const meminfo = fs.existsSync('/proc/meminfo') ? fs.readFileSync('/proc/meminfo', 'utf8') : '';
  const swapMatch = meminfo.match(/SwapTotal:\s+(\d+)\s+kB/);
  const swapMb = swapMatch ? Math.round(Number(swapMatch[1]) / 1024) : 0;
  checks.push({
    name: 'Memória & Swap',
    ok: totalRamMb >= 1536 || swapMb >= 512,
    detail: `RAM: ${freeRamMb}/${totalRamMb} MB szabad · Swap: ${swapMb} MB`,
  });

  // 4. .env & Vault
  checks.push({
    name: '.env & Titkosított Tároló',
    ok: fs.existsSync(path.join(process.cwd(), '.env')),
    detail: fs.existsSync(path.join(process.cwd(), '.env'))
      ? '.env konfiguráció jelen van'
      : '.env fájl hiányzik (.env.example másolása ajánlott)',
  });

  // 5. Git Repo / OTA
  const hasGit = fs.existsSync(path.join(process.cwd(), '.git'));
  checks.push({
    name: 'GitHub OTA Tároló',
    ok: hasGit,
    detail: hasGit ? 'Helyi git tároló aktív' : 'Nem git klónból fut (OTA csak figyelmeztetés)',
  });

  // 6. systemd unit
  const sysCheck = runSafeCmd('systemctl', ['is-active', 'novaswarm'], 2000);
  checks.push({
    name: 'systemd Szolgáltatás (novaswarm)',
    ok: sysCheck.ok && sysCheck.stdout === 'active',
    detail: sysCheck.stdout || sysCheck.stderr || 'systemd nem aktív ebben a környezetben',
  });

  return { checkedAt: new Date().toISOString(), checks };
}

/** M26: Safe Non-Secret .env Reader & Updater */
const ALLOWED_SAFE_ENV_KEYS = new Set([
  'PORT',
  'APP_URL',
  'OLLAMA_URL',
  'TELEGRAM_CHAT_ID',
  'NOVASWARM_OTA_REPO',
  'NOVASWARM_RECOMMENDED_MODEL',
]);

export function readSafeEnvConfig(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (ALLOWED_SAFE_ENV_KEYS.has(key)) {
      out[key] = val;
    }
  }
  return out;
}

export function updateSafeEnvConfig(updates: Record<string, string>): Record<string, string> {
  assertHostPermission('update_safe_env');
  const envPath = path.join(process.cwd(), '.env');
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  const applied = new Set<string>();

  const nextLines = lines.map((line) => {
    const eq = line.indexOf('=');
    if (eq === -1) return line;
    const key = line.slice(0, eq).trim();
    if (ALLOWED_SAFE_ENV_KEYS.has(key) && typeof updates[key] === 'string') {
      applied.add(key);
      const safeVal = updates[key].replace(/[\r\n"]/g, '');
      return `${key}="${safeVal}"`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (ALLOWED_SAFE_ENV_KEYS.has(k) && !applied.has(k) && typeof v === 'string') {
      nextLines.push(`${k}="${v.replace(/[\r\n"]/g, '')}"`);
    }
  }

  fs.writeFileSync(envPath, `${nextLines.filter((l, i, arr) => i < arr.length - 1 || l !== '').join('\n')}\n`, 'utf8');
  return readSafeEnvConfig();
}

/** Ú9: Docker & Compose Inspector */
export function listDockerContainers(): {
  available: boolean;
  containers: Array<{ id: string; name: string; image: string; status: string; state: string }>;
  error?: string;
} {
  const res = runSafeCmd('docker', ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}']);
  if (!res.ok) {
    return {
      available: false,
      containers: [],
      error: res.stderr || 'Docker démon nem elérhető ezen a gépen.',
    };
  }
  const containers = res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, name, image, status, state] = line.split('|');
      return { id, name, image, status, state };
    });
  return { available: true, containers };
}

export function getDockerContainerLogs(containerId: string, lines = 60): string {
  assertHostPermission(`docker_logs:${containerId}`);
  const safeId = containerId.replace(/[^a-zA-Z0-9_.-]/g, '');
  const res = runSafeCmd('docker', ['logs', '--tail', String(lines), safeId], 5000);
  return res.stdout || res.stderr || '(nincs log kimenet)';
}

export function controlDockerContainer(containerId: string, action: 'start' | 'stop' | 'restart'): {
  ok: boolean;
  pendingApproval?: boolean;
  approvalId?: string;
  message: string;
} {
  assertHostPermission(`docker_${action}:${containerId}`);
  const safeId = containerId.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (action === 'stop' && shouldRequireApproval()) {
    const req = requireDestructiveApproval(
      'docker_control',
      `Docker konténer leállítása: ${safeId}`,
      `docker stop ${safeId}`,
      'Web UI'
    );
    return { ok: false, pendingApproval: true, approvalId: req.id, message: `Jóváhagyási sorba téve: ${req.id}` };
  }
  const res = runSafeCmd('docker', [action, safeId], 15000);
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'docker-ops',
    sourceAgentName: 'Docker Kezelő',
    message: `Docker ${action} (${safeId}): ${res.ok ? 'OK' : res.stderr}`,
    verifiedExecution: res.ok,
  });
  return { ok: res.ok, message: res.ok ? `${safeId} -> ${action} kész.` : res.stderr };
}

/** Ú10: Systemd & Journalctl Inspector + AI Log Analyzer */
export function listSystemdUnits(): {
  available: boolean;
  units: Array<{ unit: string; load: string; active: string; sub: string; description: string }>;
  error?: string;
} {
  const res = runSafeCmd('systemctl', ['list-units', '--type=service', '--no-pager', '--plain', '--no-legend']);
  if (!res.ok && !res.stdout) {
    return { available: false, units: [], error: res.stderr || 'systemd nem érhető el.' };
  }
  const units = res.stdout
    .split('\n')
    .filter(Boolean)
    .slice(0, 40)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        unit: parts[0] || '',
        load: parts[1] || '',
        active: parts[2] || '',
        sub: parts[3] || '',
        description: parts.slice(4).join(' '),
      };
    });
  return { available: true, units };
}

export async function inspectAndAnalyzeSystemdUnit(unit: string): Promise<{
  unit: string;
  logs: string;
  aiAnalysis?: string;
}> {
  const safeUnit = unit.replace(/[^a-zA-Z0-9_.@-]/g, '');
  const res = runSafeCmd('journalctl', ['-u', safeUnit, '-n', '50', '--no-pager'], 5000);
  const logs = res.stdout || res.stderr || '(nincs elérhető journalctl napló)';
  let aiAnalysis: string | undefined;
  try {
    const llm = await invokeWithFailover({
      complexity: 'simple',
      prompt: `Elemezd röviden (2-3 pontban, magyarul) az alábbi systemd szolgáltatás (${safeUnit}) naplóját, és ha van hiba, javasolj konkrét javítást:\n\n${logs.slice(-3000)}`,
    });
    aiAnalysis = llm.text;
  } catch {
    aiAnalysis = undefined;
  }
  return { unit: safeUnit, logs, aiAnalysis };
}

/** Ú11: LAN Device Scanner (ip neigh / arp) */
export function scanLanDevices(): {
  devices: Array<{ ip: string; mac: string; iface: string; state: string }>;
  method: string;
} {
  const ipRes = runSafeCmd('ip', ['neigh', 'show']);
  if (ipRes.ok && ipRes.stdout) {
    const devices = ipRes.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const devIdx = parts.indexOf('dev');
        const llIdx = parts.indexOf('lladdr');
        return {
          ip: parts[0] || '',
          iface: devIdx >= 0 ? parts[devIdx + 1] || '' : '',
          mac: llIdx >= 0 ? parts[llIdx + 1] || 'ismeretlen' : 'ismeretlen',
          state: parts[parts.length - 1] || 'UNKNOWN',
        };
      });
    return { devices, method: 'ip neigh show' };
  }
  const arpRes = runSafeCmd('arp', ['-an']);
  const devices = (arpRes.stdout || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const ipMatch = line.match(/\(([^)]+)\)/);
      const macMatch = line.match(/at\s+([0-9a-f:]+)/i);
      return {
        ip: ipMatch?.[1] || 'unknown',
        mac: macMatch?.[1] || 'unknown',
        iface: 'eth0',
        state: 'ARP',
      };
    });
  return { devices, method: 'arp -an' };
}

/** Ú12: Tailscale / WireGuard VPN Status */
export function getVpnStatus(): {
  tailscale: { installed: boolean; running: boolean; ip?: string; dnsName?: string; peers: number; rawError?: string };
  wireguard: { installed: boolean; active: boolean; output?: string };
} {
  let tailscale: { installed: boolean; running: boolean; ip?: string; dnsName?: string; peers: number; rawError?: string } = {
    installed: false,
    running: false,
    peers: 0,
  };
  const tsCheck = runSafeCmd('which', ['tailscale']);
  if (tsCheck.ok) {
    tailscale.installed = true;
    const st = runSafeCmd('tailscale', ['status', '--json']);
    if (st.ok && st.stdout) {
      try {
        const parsed = JSON.parse(st.stdout) as {
          BackendState?: string;
          Self?: { TailscaleIPs?: string[]; DNSName?: string };
          Peer?: Record<string, unknown>;
        };
        tailscale = {
          installed: true,
          running: parsed.BackendState === 'Running',
          ip: parsed.Self?.TailscaleIPs?.[0],
          dnsName: parsed.Self?.DNSName,
          peers: parsed.Peer ? Object.keys(parsed.Peer).length : 0,
        };
      } catch {
        tailscale.rawError = st.stderr || 'JSON hiba';
      }
    } else {
      tailscale.rawError = st.stderr || 'Tailscale nem fut';
    }
  }

  let wireguard: { installed: boolean; active: boolean; output?: string } = {
    installed: false,
    active: false,
  };
  const wgCheck = runSafeCmd('which', ['wg']);
  if (wgCheck.ok) {
    wireguard.installed = true;
    const wgShow = runSafeCmd('wg', ['show']);
    wireguard.active = wgShow.ok && wgShow.stdout.length > 0;
    wireguard.output = wgShow.stdout || wgShow.stderr;
  }

  return { tailscale, wireguard };
}

/** Ú14: Disk Health (df, lsblk, smartctl) & External Rsync Backup */
export function inspectDiskHealth(): {
  dfOutput: string;
  blockDevices: Array<{ name: string; size: string; mountpoint: string | null; smartHealth?: string }>;
} {
  const dfRes = runSafeCmd('df', ['-h']);
  const lsblkRes = runSafeCmd('lsblk', ['-J', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT']);
  const blockDevices: Array<{ name: string; size: string; mountpoint: string | null; smartHealth?: string }> = [];

  if (lsblkRes.ok && lsblkRes.stdout) {
    try {
      const parsed = JSON.parse(lsblkRes.stdout) as {
        blockdevices?: Array<{ name: string; size: string; type: string; mountpoint?: string | null }>;
      };
      for (const dev of (parsed.blockdevices || []).slice(0, 12)) {
        let smartHealth: string | undefined;
        if (dev.type === 'disk') {
          const sm = runSafeCmd('smartctl', ['-H', `/dev/${dev.name}`], 2500);
          smartHealth = sm.ok
            ? sm.stdout.split('\n').find((l) => /health|result/i.test(l)) || 'OK'
            : 'smartctl jogosultság/csomag hiányzik';
        }
        blockDevices.push({
          name: dev.name,
          size: dev.size,
          mountpoint: dev.mountpoint ?? null,
          smartHealth,
        });
      }
    } catch {
      // ignore json error
    }
  }

  return {
    dfOutput: dfRes.stdout || dfRes.stderr,
    blockDevices,
  };
}

export function runRsyncExternalBackup(targetDir: string): { ok: boolean; output: string } {
  assertHostPermission(`rsync_backup:${targetDir}`);
  const cleanTarget = targetDir.trim();
  if (!cleanTarget) throw new Error('Cél könyvtár vagy SSH útvonal kötelező az rsync mentéshez.');
  const backupsDir = path.join(process.cwd(), 'backups');
  const vaultDir = path.join(process.cwd(), 'memory-vault');
  const sources = [backupsDir, vaultDir].filter((d) => fs.existsSync(d));
  const res = runSafeCmd('rsync', ['-avz', '--delete', ...sources, cleanTarget], 30000);
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'rsync-backup',
    sourceAgentName: 'Külső Rsync Mentés',
    message: `Rsync mentés (${cleanTarget}): ${res.ok ? 'SIKERES' : 'HIBA'}`,
    verifiedExecution: res.ok,
  });
  return { ok: res.ok, output: res.stdout || res.stderr };
}

/** Ú15: SSH Fleet Manager */
export function addSshProfile(input: {
  name: string;
  host: string;
  port?: number;
  username: string;
  keyPath?: string;
}): SshHostProfile {
  const profile: SshHostProfile = {
    id: `ssh-${Date.now().toString(36)}`,
    name: input.name.trim(),
    host: input.host.trim().replace(/[^a-zA-Z0-9._-]/g, ''),
    port: Number(input.port) || 22,
    username: input.username.trim().replace(/[^a-zA-Z0-9._-]/g, ''),
    keyPath: input.keyPath?.trim() || undefined,
    lastStatus: 'unknown',
  };
  updateState((s) => {
    s.sshProfiles.push(profile);
  });
  return profile;
}

export function executeSshProfileCommand(
  profileId: string,
  command = 'uname -a && uptime'
): { ok: boolean; output: string } {
  assertHostPermission(`ssh_exec:${profileId}`);
  const state = getState();
  const prof = state.sshProfiles.find((p) => p.id === profileId);
  if (!prof) throw new Error(`SSH profil nem található: ${profileId}`);

  const args = [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=5',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-p',
    String(prof.port || 22),
  ];
  if (prof.keyPath) {
    args.push('-i', prof.keyPath);
  }
  args.push(`${prof.username}@${prof.host}`, command);

  const res = runSafeCmd('ssh', args, 12000);
  const output = (res.stdout || res.stderr || '(üres SSH válasz)').slice(0, 3000);
  updateState((s) => {
    const ref = s.sshProfiles.find((p) => p.id === profileId);
    if (ref) {
      ref.lastCheckedAt = new Date().toISOString();
      ref.lastStatus = res.ok ? 'online' : 'error';
      ref.lastOutput = output.slice(0, 400);
    }
  });
  appendAuditLog({
    type: 'action',
    sourceAgentId: 'ssh-fleet',
    sourceAgentName: 'SSH Flotta',
    message: `SSH [${prof.name}] (${prof.host}): ${res.ok ? 'OK' : 'ERR'} — ${command}`,
    verifiedExecution: res.ok,
  });
  return { ok: res.ok, output };
}

/** Ú26: Real TLS/SSL Certificate Expiry Inspector via node:tls */
export function checkSslCertificate(host: string, port = 443): Promise<{
  host: string;
  port: number;
  issuer?: string;
  expiresAt?: string;
  daysRemaining: number | null;
  error?: string;
}> {
  const cleanHost = host.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: cleanHost, port, servername: cleanHost, rejectUnauthorized: false, timeout: 5000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          resolve({ host: cleanHost, port, daysRemaining: null, error: 'Nem érkezett tanúsítvány adat.' });
          return;
        }
        const expMs = Date.parse(cert.valid_to);
        const daysRemaining = Number.isNaN(expMs) ? null : Math.floor((expMs - Date.now()) / 86_400_000);
        const rawIssuer = cert.issuer?.O || cert.issuer?.CN;
        const issuer = Array.isArray(rawIssuer) ? rawIssuer.join(', ') : rawIssuer || 'Ismeretlen kibocsátó';
        resolve({
          host: cleanHost,
          port,
          issuer,
          expiresAt: new Date(expMs).toISOString(),
          daysRemaining,
        });
      }
    );
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ host: cleanHost, port, daysRemaining: null, error: 'TLS időtúllépés' });
    });
    socket.on('error', (err) => {
      resolve({ host: cleanHost, port, daysRemaining: null, error: err.message });
    });
  });
}

export async function checkAllSslTargets(): Promise<SslWatchTarget[]> {
  const targets = [...getState().sslTargets];
  for (const t of targets) {
    const res = await checkSslCertificate(t.host, t.port);
    updateState((s) => {
      const ref = s.sslTargets.find((x) => x.id === t.id);
      if (ref) {
        ref.issuer = res.issuer;
        ref.expiresAt = res.expiresAt;
        ref.daysRemaining = res.daysRemaining;
        ref.lastError = res.error;
        ref.lastCheckedAt = new Date().toISOString();
      }
    });
  }
  return getState().sslTargets;
}

/** M17: Isolated Git Branch Binding for Kanban cards */
export function ensureKanbanGitBranch(cardId: string): { ok: boolean; branch: string; message: string } {
  const state = getState();
  const card = state.kanban.find((c) => c.id === cardId);
  if (!card) throw new Error('Kanban kártya nem található.');
  const slug = card.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'task';
  const branch = `kanban/${card.id}-${slug}`;

  if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
    updateState((s) => {
      const ref = s.kanban.find((c) => c.id === cardId);
      if (ref) ref.gitBranch = branch;
    });
    return {
      ok: true,
      branch,
      message: `Branch név rögzítve (${branch}); valós git checkout .git tárolóval aktív.`,
    };
  }

  try {
    execFileSync('git', ['checkout', '-B', branch], { cwd: process.cwd(), stdio: 'ignore' });
    updateState((s) => {
      const ref = s.kanban.find((c) => c.id === cardId);
      if (ref) ref.gitBranch = branch;
    });
    return { ok: true, branch, message: `Átváltva a(z) ${branch} izolált git ágra.` };
  } catch (err) {
    return {
      ok: false,
      branch,
      message: `Git ág váltás sikertelen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
