import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseConnection } from '../../shared/types';
import { detectActiveSandboxBackend } from '../sandbox/supervisorSandbox';
import { assertHostPermission, requireDestructiveApproval, shouldRequireApproval } from '../security/permissionGate';
import { appendAuditLog, getState, updateState } from '../state/store';
import { executeSshProfileCommand } from './hostAdmin';

function runSafe(cmd: string, args: string[], timeout = 5000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const res = spawnSync(cmd, args, { encoding: 'utf8', timeout });
    return { ok: res.status === 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : String(err) };
  }
}

/** M31: Real git worktree isolation per Kanban card */
export function ensureKanbanWorktree(cardId: string): { ok: boolean; worktreePath: string; branch: string; message: string } {
  assertHostPermission(`kanban_worktree:${cardId}`);
  const state = getState();
  const card = state.kanban.find((c) => c.id === cardId);
  if (!card) throw new Error('Kanban kártya nem található.');

  const slug = card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'task';
  const branch = card.gitBranch || `kanban/${card.id}-${slug}`;
  const relWorktree = `.worktrees/${card.id}-${slug}`;
  const absWorktree = path.resolve(process.cwd(), relWorktree);

  if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
    updateState((s) => {
      const ref = s.kanban.find((c) => c.id === cardId);
      if (ref) {
        ref.gitBranch = branch;
        ref.worktreePath = relWorktree;
      }
    });
    return {
      ok: true,
      worktreePath: relWorktree,
      branch,
      message: `Worktree útvonal (${relWorktree}) előkészítve — valós git worktree .git tárolóval működik.`,
    };
  }

  fs.mkdirSync(path.dirname(absWorktree), { recursive: true });
  if (!fs.existsSync(absWorktree)) {
    const res = runSafe('git', ['worktree', 'add', '-B', branch, absWorktree], 10000);
    if (!res.ok) {
      return { ok: false, worktreePath: relWorktree, branch, message: res.stderr || 'git worktree add sikertelen' };
    }
  }
  updateState((s) => {
    const ref = s.kanban.find((c) => c.id === cardId);
    if (ref) {
      ref.gitBranch = branch;
      ref.worktreePath = relWorktree;
    }
  });
  return { ok: true, worktreePath: relWorktree, branch, message: `Izolált worktree aktív: ${relWorktree} (${branch})` };
}

export function removeKanbanWorktree(cardId: string): { ok: boolean; message: string } {
  const card = getState().kanban.find((c) => c.id === cardId);
  if (!card?.worktreePath) return { ok: true, message: 'Nincs csatolt worktree.' };
  const abs = path.resolve(process.cwd(), card.worktreePath);
  if (fs.existsSync(path.join(process.cwd(), '.git')) && fs.existsSync(abs)) {
    runSafe('git', ['worktree', 'remove', '--force', abs], 8000);
  }
  updateState((s) => {
    const ref = s.kanban.find((c) => c.id === cardId);
    if (ref) ref.worktreePath = undefined;
  });
  return { ok: true, message: 'Worktree leválasztva.' };
}

/** M52: OTA commit history selector & safe rollback */
export function getOtaCommitHistory(limit = 10): Array<{ hash: string; shortHash: string; date: string; message: string }> {
  if (!fs.existsSync(path.join(process.cwd(), '.git'))) return [];
  const res = runSafe('git', ['log', '-n', String(limit), '--pretty=format:%H|%h|%aI|%s'], 4000);
  if (!res.ok || !res.stdout) return [];
  return res.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, shortHash, date, ...msg] = line.split('|');
    return { hash, shortHash, date, message: msg.join('|') };
  });
}

export function rollbackOtaToCommit(commitHash: string): { ok: boolean; message: string } {
  assertHostPermission(`ota_rollback:${commitHash}`);
  const clean = commitHash.trim().replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 6) throw new Error('Érvénytelen commit hash.');
  if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
    return { ok: false, message: 'Nincs .git tároló ebben a munkakönyvtárban.' };
  }
  const res = runSafe('git', ['checkout', clean], 10000);
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'ota-rollback',
    sourceAgentName: 'OTA Verzió-visszaállító',
    message: `OTA commit váltás -> ${clean}: ${res.ok ? 'OK' : res.stderr}`,
    verifiedExecution: res.ok,
  });
  return { ok: res.ok, message: res.ok ? `Átállítva a(z) ${clean} commitra.` : res.stderr };
}

/** M54: Security Hardening Score (0–100%) & actionable checklist */
export function computeSecurityHardeningScore(): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  checks: Array<{ id: string; label: string; ok: boolean; points: number; hint: string }>;
} {
  const s = getState();
  const sandbox = detectActiveSandboxBackend();
  const recentBkpAgeDays = s.settings.lastBackupAt
    ? (Date.now() - Date.parse(s.settings.lastBackupAt)) / 86_400_000
    : 999;

  const checks = [
    {
      id: 'lan_auth',
      label: 'LAN Operátori Jelszózár (scrypt + cookie)',
      ok: Boolean(s.settings.webAuthEnabled && s.settings.webAuthHasPassword),
      points: 20,
      hint: 'Kapcsold be a LAN operátori zárat a Beállításokban, ha hálózaton éred el.',
    },
    {
      id: 'guardrails',
      label: 'AI Gateway Guardrails (Titok + Injection szűrés)',
      ok: Boolean(s.settings.guardrailsEnabled && s.settings.guardrailBlockSecrets && s.settings.guardrailBlockPromptInjection),
      points: 15,
      hint: 'Aktiváld a Guardrail titok- és prompt-injection védelmet a Gateway fülön.',
    },
    {
      id: 'sandbox',
      label: 'Erős Linux Sandbox Izoláció (bwrap / firejail / docker)',
      ok: sandbox !== 'isolated_tmpfs_subprocess',
      points: 15,
      hint: 'Telepítsd a bubblewrap (bwrap) vagy firejail csomagot a kernel szintű névtérhez.',
    },
    {
      id: 'pairing',
      label: 'Csatorna Párosítási Kód Védelem (Zero-Trust)',
      ok: Boolean(s.settings.channelPairingRequired),
      points: 15,
      hint: 'Tartsd bekapcsolva a külső csatornák párosítási engedélyezését.',
    },
    {
      id: 'budget_cap',
      label: 'Napi API Költségkorlát Aktív',
      ok: Boolean(s.settings.dailyCostLimitEnabled && s.settings.dailyCostLimitUsd > 0),
      points: 10,
      hint: 'Állíts be napi költséglimitet a túlköltekezés megelőzésére.',
    },
    {
      id: 'backup_fresh',
      label: 'Friss Biztonsági Mentés (< 7 nap)',
      ok: recentBkpAgeDays <= 7,
      points: 15,
      hint: 'Készíts biztonsági mentést a Rendszer & Biztonság nézetben.',
    },
    {
      id: 'env_vault',
      label: 'Titkosított Kulcstár (.secrets.vault.json)',
      ok: fs.existsSync(path.join(process.cwd(), '.secrets.vault.json')) || Object.values(s.settings.providerKeys).every((arr) => arr.length === 0),
      points: 10,
      hint: 'Minden API kulcs AES-256-GCM titkosítással kerül tárolásra.',
    },
  ];

  const score = checks.reduce((sum, c) => sum + (c.ok ? c.points : 0), 0);
  const grade = score >= 85 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D';
  return { score, grade, checks };
}

/** M55: SSH Fleet parallel bulk execution */
export async function executeSshFleetBulk(
  profileIds: string[],
  command: string
): Promise<Array<{ profileId: string; name: string; host: string; ok: boolean; durationMs: number; output: string }>> {
  assertHostPermission(`ssh_fleet_bulk:${command}`);
  const profiles = getState().sshProfiles.filter((p) => profileIds.length === 0 || profileIds.includes(p.id));
  return Promise.all(
    profiles.map(async (p) => {
      const t0 = Date.now();
      try {
        const res = executeSshProfileCommand(p.id, command);
        return {
          profileId: p.id,
          name: p.name,
          host: p.host,
          ok: res.ok,
          durationMs: Date.now() - t0,
          output: res.output,
        };
      } catch (err) {
        return {
          profileId: p.id,
          name: p.name,
          host: p.host,
          ok: false,
          durationMs: Date.now() - t0,
          output: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );
}

/** M56: Systemd dependency tree & Memory/Restart telemetry */
export function inspectSystemdDependenciesAndResources(unit: string): {
  unit: string;
  memoryMb: number | null;
  restarts: number | null;
  dependencies: string[];
  raw: string;
} {
  const safe = unit.replace(/[^a-zA-Z0-9_.@-]/g, '');
  const show = runSafe('systemctl', ['show', safe, '-p', 'MemoryCurrent,NRestarts,ActiveState,SubState']);
  const deps = runSafe('systemctl', ['list-dependencies', safe, '--plain', '--no-pager']);
  let memoryMb: number | null = null;
  let restarts: number | null = null;
  const memMatch = show.stdout.match(/MemoryCurrent=(\d+)/);
  if (memMatch) {
    const bytes = Number(memMatch[1]);
    if (Number.isFinite(bytes) && bytes < 1e15) memoryMb = Number((bytes / (1024 * 1024)).toFixed(1));
  }
  const restMatch = show.stdout.match(/NRestarts=(\d+)/);
  if (restMatch) restarts = Number(restMatch[1]);

  return {
    unit: safe,
    memoryMb,
    restarts,
    dependencies: deps.ok ? deps.stdout.split('\n').slice(1, 20).map((l) => l.trim()).filter(Boolean) : [],
    raw: show.stdout || show.stderr || 'systemd adat nem elérhető',
  };
}

/** Ú33: Live SQLite & PostgreSQL Read-Only Explorer */
export async function exploreDatabase(params: {
  connectionId?: string;
  engine?: 'sqlite' | 'postgres';
  target?: string;
  sql: string;
}): Promise<{ ok: boolean; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; error?: string }> {
  const state = getState();
  const conn: DatabaseConnection | undefined = params.connectionId
    ? state.databaseConnections.find((c) => c.id === params.connectionId)
    : undefined;
  const engine = params.engine || conn?.engine || 'sqlite';
  const target = (params.target || conn?.target || '').trim();
  const sql = params.sql.trim();

  if (!target || !sql) {
    return { ok: false, columns: [], rows: [], rowCount: 0, error: 'Adatbázis útvonal/URI és SQL lekérdezés kötelező.' };
  }
  if (!/^(SELECT|PRAGMA|EXPLAIN|WITH|SHOW)\b/i.test(sql)) {
    return {
      ok: false,
      columns: [],
      rows: [],
      rowCount: 0,
      error: 'Biztonsági védelem: csak írásvédett (SELECT / PRAGMA / EXPLAIN / SHOW) lekérdezések engedélyezettek az SQL Böngészőben.',
    };
  }

  if (engine === 'sqlite') {
    const abs = path.resolve(process.cwd(), target);
    if (!fs.existsSync(abs)) {
      return { ok: false, columns: [], rows: [], rowCount: 0, error: `SQLite fájl nem található: ${target}` };
    }
    try {
      const sqliteMod = (await import('node:sqlite')) as { DatabaseSync: new (p: string, opts?: { readOnly?: boolean }) => { prepare: (q: string) => { all: () => Array<Record<string, unknown>> }; close: () => void } };
      const db = new sqliteMod.DatabaseSync(abs, { readOnly: true });
      try {
        const rows = db.prepare(sql).all().slice(0, 200);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return { ok: true, columns, rows, rowCount: rows.length };
      } finally {
        db.close();
      }
    } catch (err) {
      return { ok: false, columns: [], rows: [], rowCount: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Postgres via psql CLI
  const res = runSafe('psql', [target, '-AtF', '\t', '-c', sql], 8000);
  if (!res.ok) {
    return { ok: false, columns: [], rows: [], rowCount: 0, error: res.stderr || 'psql parancs nem érhető el vagy sikertelen.' };
  }
  const lines = res.stdout.split('\n').filter(Boolean).slice(0, 200);
  const rows = lines.map((line, i) => ({ row: i + 1, value: line }));
  return { ok: true, columns: ['row', 'value'], rows, rowCount: rows.length };
}

/** Ú37: Firewall (UFW/nft) & Open Ports (ss) Inspector */
export function inspectFirewallAndOpenPorts(): {
  portsOutput: string;
  firewallOutput: string;
  firewallTool: 'ufw' | 'nft' | 'none';
} {
  const ssRes = runSafe('ss', ['-tulpn']);
  const portsOutput = ssRes.ok ? ssRes.stdout : runSafe('netstat', ['-tuln']).stdout || ssRes.stderr;
  const ufwRes = runSafe('ufw', ['status', 'verbose']);
  if (ufwRes.ok || /status:/i.test(ufwRes.stdout)) {
    return { portsOutput, firewallOutput: ufwRes.stdout || ufwRes.stderr, firewallTool: 'ufw' };
  }
  const nftRes = runSafe('nft', ['list', 'ruleset']);
  if (nftRes.ok) {
    return { portsOutput, firewallOutput: nftRes.stdout, firewallTool: 'nft' };
  }
  return {
    portsOutput,
    firewallOutput: 'Sem ufw, sem nftables nem olvasható root jogosultság nélkül ebben a környezetben.',
    firewallTool: 'none',
  };
}

export function proposeUfwRule(rule: string): { approvalId?: string; executed?: boolean; command: string; output?: string } {
  assertHostPermission(`ufw:${rule}`);
  const clean = rule.trim().replace(/[^a-zA-Z0-9 /.:_-]/g, '');
  if (!clean) throw new Error('Érvénytelen tűzfalszabály.');
  const cmd = `sudo ufw ${clean}`;
  if (shouldRequireApproval()) {
    const req = requireDestructiveApproval('firewall_modify', `UFW tűzfalszabály: ${clean}`, cmd, 'Rendszeroperátor');
    return { approvalId: req.id, executed: false, command: cmd };
  }
  const args = clean.split(/\s+/).filter(Boolean);
  const res = runSafe('ufw', args, 8000);
  return { executed: res.ok, command: cmd, output: res.stdout || res.stderr };
}

/** Ú38: Hardware / Raspberry Pi GPIO, I2C & Thermal Sensor Inspector */
export function inspectHardwareSensorsAndGpio(): {
  thermalZones: Array<{ name: string; tempC: number }>;
  piVcgencmd: { available: boolean; temp?: string; throttled?: string };
  gpio: { available: boolean; output: string };
  i2c: { available: boolean; buses: string };
} {
  const thermalZones: Array<{ name: string; tempC: number }> = [];
  if (fs.existsSync('/sys/class/thermal')) {
    for (const dir of fs.readdirSync('/sys/class/thermal').filter((d) => d.startsWith('thermal_zone'))) {
      try {
        const type = fs.existsSync(`/sys/class/thermal/${dir}/type`)
          ? fs.readFileSync(`/sys/class/thermal/${dir}/type`, 'utf8').trim()
          : dir;
        const raw = Number(fs.readFileSync(`/sys/class/thermal/${dir}/temp`, 'utf8').trim());
        if (Number.isFinite(raw) && raw > 0) {
          thermalZones.push({ name: type, tempC: Number((raw > 1000 ? raw / 1000 : raw).toFixed(1)) });
        }
      } catch {
        // ignore unreadable zone
      }
    }
  }

  const vcTemp = runSafe('vcgencmd', ['measure_temp']);
  const vcThrot = runSafe('vcgencmd', ['get_throttled']);
  const gpioRes = runSafe('gpioinfo', []);
  const i2cRes = runSafe('i2cdetect', ['-l']);

  return {
    thermalZones,
    piVcgencmd: {
      available: vcTemp.ok,
      temp: vcTemp.ok ? vcTemp.stdout : undefined,
      throttled: vcThrot.ok ? vcThrot.stdout : undefined,
    },
    gpio: {
      available: gpioRes.ok,
      output: gpioRes.ok ? gpioRes.stdout.slice(0, 3000) : 'gpioinfo (gpiod csomag) nincs telepítve vagy nincs GPIO chip.',
    },
    i2c: {
      available: i2cRes.ok,
      buses: i2cRes.ok ? i2cRes.stdout : 'i2c-tools nincs telepítve vagy nincs I2C busz.',
    },
  };
}

/** Ú39: Network Diagnostics (DNS, Ping, Traceroute, Public IP) */
export async function runNetworkDiagnostics(targetHost: string): Promise<{
  target: string;
  dnsAddresses: string[];
  pingOutput: string;
  tracerouteOutput: string;
  publicIp?: string;
}> {
  const cleanTarget = targetHost.trim().replace(/^https?:\/\//i, '').split('/')[0].replace(/[^a-zA-Z0-9._-]/g, '');
  if (!cleanTarget) throw new Error('Érvényes cél domain vagy IP szükséges.');

  let dnsAddresses: string[] = [];
  try {
    const looked = await dns.lookup(cleanTarget, { all: true });
    dnsAddresses = looked.map((x) => `${x.address} (IPv${x.family})`);
  } catch (err) {
    dnsAddresses = [`DNS hiba: ${err instanceof Error ? err.message : String(err)}`];
  }

  const pingRes = runSafe('ping', ['-c', '3', '-W', '2', cleanTarget], 8000);
  const traceRes = runSafe('tracepath', ['-m', '8', cleanTarget], 8000);
  const trFallback = traceRes.ok ? traceRes : runSafe('traceroute', ['-m', '8', cleanTarget], 8000);

  let publicIp: string | undefined;
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const d = (await r.json()) as { ip?: string };
      publicIp = d.ip;
    }
  } catch {
    publicIp = undefined;
  }

  return {
    target: cleanTarget,
    dnsAddresses,
    pingOutput: pingRes.stdout || pingRes.stderr || 'ping nem elérhető',
    tracerouteOutput: trFallback.stdout || trFallback.stderr || 'tracepath/traceroute nem elérhető',
    publicIp,
  };
}

/** Ú40: Linux Host Crontab & Systemd Timers Inspector */
export function inspectLinuxCronAndTimers(): {
  userCrontab: string;
  systemdTimers: string;
} {
  const cronRes = runSafe('crontab', ['-l']);
  const timersRes = runSafe('systemctl', ['list-timers', '--all', '--no-pager']);
  return {
    userCrontab: cronRes.ok ? cronRes.stdout || '(üres crontab)' : cronRes.stderr || 'crontab nem elérhető',
    systemdTimers: timersRes.ok ? timersRes.stdout : timersRes.stderr || 'systemctl timers nem elérhető',
  };
}

/** Ú41: AES-256-GCM File Locker & Unlocker inside safe workspace */
function resolveWorkspaceSafePath(relPath: string): string {
  const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(process.cwd(), clean);
  if (!abs.startsWith(process.cwd() + path.sep)) {
    throw new Error('Csak a munkakönyvtáron belüli fájlok zárolhatók.');
  }
  return abs;
}

export function encryptFileAes256(relPath: string, passphrase: string): { outputPath: string; bytes: number } {
  assertHostPermission(`file_encrypt:${relPath}`);
  if (!passphrase || passphrase.length < 4) throw new Error('Legalább 4 karakteres jelszó szükséges.');
  const abs = resolveWorkspaceSafePath(relPath);
  if (!fs.existsSync(abs)) throw new Error(`Fájl nem található: ${relPath}`);
  const plain = fs.readFileSync(abs);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([Buffer.from('NSV1'), salt, iv, tag, enc]);
  const outAbs = `${abs}.nsenc`;
  fs.writeFileSync(outAbs, payload);
  return { outputPath: path.relative(process.cwd(), outAbs), bytes: payload.length };
}

export function decryptFileAes256(relEncPath: string, passphrase: string): { outputPath: string; bytes: number } {
  assertHostPermission(`file_decrypt:${relEncPath}`);
  const abs = resolveWorkspaceSafePath(relEncPath);
  if (!fs.existsSync(abs)) throw new Error(`Titkosított fájl nem található: ${relEncPath}`);
  const raw = fs.readFileSync(abs);
  if (raw.subarray(0, 4).toString('utf8') !== 'NSV1' || raw.length < 48) {
    throw new Error('Érvénytelen NovaSwarm titkosított fájlformátum.');
  }
  const salt = raw.subarray(4, 20);
  const iv = raw.subarray(20, 32);
  const tag = raw.subarray(32, 48);
  const enc = raw.subarray(48);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  const outAbs = abs.endsWith('.nsenc') ? abs.slice(0, -6) : `${abs}.dec`;
  fs.writeFileSync(outAbs, plain);
  return { outputPath: path.relative(process.cwd(), outAbs), bytes: plain.length };
}

/** Ú42: Nginx / Caddy Reverse Proxy Inspector & Template Generator */
export function inspectReverseProxyConfigs(): {
  nginxAvailable: boolean;
  caddyAvailable: boolean;
  nginxTestOutput: string;
  sites: string[];
} {
  const nginxCheck = runSafe('nginx', ['-t']);
  const caddyCheck = runSafe('caddy', ['version']);
  const sitesDir = '/etc/nginx/sites-enabled';
  const sites = fs.existsSync(sitesDir) ? fs.readdirSync(sitesDir) : [];
  return {
    nginxAvailable: runSafe('which', ['nginx']).ok,
    caddyAvailable: caddyCheck.ok,
    nginxTestOutput: `${nginxCheck.stdout}\n${nginxCheck.stderr}`.trim() || 'nginx nem telepített vagy jogosultság szükséges',
    sites,
  };
}

export function generateReverseProxyTemplate(kind: 'nginx' | 'caddy', domain: string, upstreamPort = 3000): string {
  const cleanDomain = domain.trim() || 'novaswarm.local';
  const port = Number(upstreamPort) || 3000;
  if (kind === 'caddy') {
    return `${cleanDomain} {\n  reverse_proxy 127.0.0.1:${port}\n  encode gzip\n}`;
  }
  return `server {\n  listen 80;\n  server_name ${cleanDomain};\n  location / {\n    proxy_pass http://127.0.0.1:${port};\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection "upgrade";\n    proxy_set_header Host $host;\n  }\n}`;
}

/** Ú57: Docker Compose Stack Generator */
export function generateDockerComposeTemplate(
  stack: 'searxng' | 'mosquitto' | 'ntfy' | 'uptime_kuma' | 'postgres'
): string {
  const templates: Record<typeof stack, string> = {
    searxng: `services:\n  searxng:\n    image: searxng/searxng:latest\n    restart: unless-stopped\n    ports:\n      - "8080:8080"\n    volumes:\n      - ./searxng:/etc/searxng`,
    mosquitto: `services:\n  mosquitto:\n    image: eclipse-mosquitto:2\n    restart: unless-stopped\n    ports:\n      - "1883:1883"\n    volumes:\n      - ./mosquitto/data:/mosquitto/data`,
    ntfy: `services:\n  ntfy:\n    image: binwiederhier/ntfy:latest\n    command: serve\n    restart: unless-stopped\n    ports:\n      - "8090:80"`,
    uptime_kuma: `services:\n  uptime-kuma:\n    image: louislam/uptime-kuma:1\n    restart: unless-stopped\n    ports:\n      - "3001:3001"\n    volumes:\n      - ./uptime-kuma:/app/data`,
    postgres: `services:\n  postgres:\n    image: postgres:16-alpine\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: novaswarm\n      POSTGRES_PASSWORD: change-me-strong-password\n      POSTGRES_DB: novaswarm\n    ports:\n      - "5432:5432"\n    volumes:\n      - ./pgdata:/var/lib/postgresql/data`,
  };
  return templates[stack];
}
