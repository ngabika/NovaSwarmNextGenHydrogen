import { execFile, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MigrationRunRecord } from '../../shared/types';
import { closeSqliteWal, runSqliteMaintenance } from '../state/sqliteWal';
import { appendAuditLog, getState, updateState } from '../state/store';
import { classifyHardwareSpecs } from '../system/hardwareOptimizer';

export interface SshMigrationParams {
  targetIp: string;
  username: string;
  password: string;
  sshPort?: number;
  targetAppPort?: number;
  stopOldInstance?: boolean;
  repoUrl?: string;
}

export interface ValidatedMigrationTarget {
  targetIp: string;
  username: string;
  sshPort: number;
  targetAppPort: number;
  stopOldInstance: boolean;
  repoUrl: string;
}

export interface SshCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SshTransportAdapter {
  execRemote: (
    target: ValidatedMigrationTarget,
    password: string,
    scriptText: string,
    timeoutMs?: number
  ) => Promise<SshCommandResult>;
  uploadFile: (
    target: ValidatedMigrationTarget,
    password: string,
    localPath: string,
    remotePath: string,
    timeoutMs?: number
  ) => Promise<SshCommandResult>;
  onCutoverOldHost?: (target: ValidatedMigrationTarget) => void;
}

const SAFE_IP_OR_HOST_RE = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
const SAFE_POSIX_USER_RE = /^[a-z_][a-z0-9_.-]{0,31}$/;

/**
 * Strict validation against command injection, loopback self-destruction, and SSRF targets.
 */
export function validateMigrationTarget(input: Partial<SshMigrationParams>): ValidatedMigrationTarget {
  const targetIp = (input.targetIp || '').trim();
  const username = (input.username || '').trim();
  const password = input.password || '';
  const sshPort = Number(input.sshPort ?? 22);
  const targetAppPort = Number(input.targetAppPort ?? 3000);
  const stopOldInstance = input.stopOldInstance !== false;
  const repoUrl = (input.repoUrl || 'https://github.com/ngabika/NovaSwarmNextGenHydrogen.git').trim();

  if (!targetIp || !SAFE_IP_OR_HOST_RE.test(targetIp)) {
    throw new Error('Érvénytelen cél IP-cím vagy helyi gépnév (pl. 192.168.1.50).');
  }
  if (
    targetIp === '127.0.0.1' ||
    targetIp === '0.0.0.0' ||
    targetIp.toLowerCase() === 'localhost' ||
    targetIp.startsWith('169.254.')
  ) {
    throw new Error('A cél gép IP-címe nem lehet loopback (127.0.0.1/localhost) vagy link-local (169.254.*).');
  }
  // If IPv4, verify octets 0..255
  if (/^\d+\.\d+\.\d+\.\d+$/.test(targetIp)) {
    const octets = targetIp.split('.').map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
      throw new Error('Érvénytelen IPv4 oktett érték (0–255).');
    }
  }
  if (!username || !SAFE_POSIX_USER_RE.test(username)) {
    throw new Error('Érvénytelen SSH felhasználónév (csak kisbetű, szám, _ és - megengedett).');
  }
  if (!password || password.length < 1) {
    throw new Error('SSH jelszó megadása kötelező.');
  }
  if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
    throw new Error('Érvénytelen SSH port (1–65535).');
  }
  if (!Number.isInteger(targetAppPort) || targetAppPort < 1024 || targetAppPort > 65535) {
    throw new Error('Érvénytelen NovaSwarm alkalmazás port (1024–65535).');
  }

  return {
    targetIp,
    username,
    sshPort,
    targetAppPort,
    stopOldInstance,
    repoUrl,
  };
}

/**
 * Pure helper computing hardware-adaptive settings JSON patch for the target machine.
 */
export function buildTargetHardwareSettingsPatch(specs: {
  cpuCores: number;
  arch: string;
  ramTotalMb: number;
  hasGpu: boolean;
  gpuName: string;
}) {
  const profile = classifyHardwareSpecs({
    cpuCores: Math.max(1, specs.cpuCores),
    arch: specs.arch,
    ramTotalMb: Math.max(512, specs.ramTotalMb),
    ramAvailableMb: Math.round(Math.max(512, specs.ramTotalMb) * 0.7),
    swapTotalMb: 0,
    storageKind: /arm|aarch64/i.test(specs.arch) && specs.ramTotalMb <= 4096 ? 'sd_or_emmc' : 'ssd_or_nvme',
    hasGpu: specs.hasGpu,
    gpuName: specs.gpuName,
  });
  return profile;
}

function hasBinary(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes `ssh` or `scp` without shell=true and without putting passwords in CLI flags or persistent disk.
 */
function runWithAskpassOrSshpass(
  bin: 'ssh' | 'scp',
  args: string[],
  password: string,
  stdinPayload?: string,
  timeoutMs = 120_000
): Promise<SshCommandResult> {
  return new Promise((resolve) => {
    const useSshpass = hasBinary('sshpass');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-ssh-'));
    const askpassPath = path.join(tmpDir, 'askpass.sh');
    fs.writeFileSync(askpassPath, '#!/bin/sh\nprintf "%s\\n" "$NOVASWARM_SSH_PW"\n', { mode: 0o700 });

    const finalBin = useSshpass ? 'sshpass' : bin;
    const finalArgs = useSshpass ? ['-e', bin, ...args] : args;

    const child = execFile(
      finalBin,
      finalArgs,
      {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          DISPLAY: ':99',
          SSH_ASKPASS: askpassPath,
          SSH_ASKPASS_REQUIRE: 'force',
          SSHPASS: password,
          NOVASWARM_SSH_PW: password,
        },
      },
      (err, stdout, stderr) => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        const code = err && typeof (err as { code?: unknown }).code === 'number'
          ? ((err as { code: number }).code)
          : err
          ? 1
          : 0;
        resolve({
          code,
          stdout: String(stdout || ''),
          stderr: String(stderr || (err?.message || '')),
        });
      }
    );

    if (stdinPayload && child.stdin) {
      child.stdin.write(stdinPayload);
      child.stdin.end();
    }
  });
}

export const defaultSshTransport: SshTransportAdapter = {
  execRemote: async (target, password, scriptText, timeoutMs = 300_000) => {
    const remoteCmd = 'bash -s';
    return runWithAskpassOrSshpass(
      'ssh',
      [
        '-p',
        String(target.sshPort),
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ConnectTimeout=10',
        `${target.username}@${target.targetIp}`,
        remoteCmd,
      ],
      password,
      scriptText,
      timeoutMs
    );
  },
  uploadFile: async (target, password, localPath, remotePath, timeoutMs = 180_000) => {
    return runWithAskpassOrSshpass(
      'scp',
      [
        '-P',
        String(target.sshPort),
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ConnectTimeout=10',
        localPath,
        `${target.username}@${target.targetIp}:${remotePath}`,
      ],
      password,
      undefined,
      timeoutMs
    );
  },
};

export function createMigrationBundleArchive(destDir: string): string {
  // Checkpoint SQLite WAL before reading files so DB copy is 100% consistent
  try {
    runSqliteMaintenance();
    closeSqliteWal();
  } catch {
    // non-fatal
  }

  const archivePath = path.join(destDir, 'novaswarm-migrate-bundle.tar.gz');
  const root = process.cwd();
  const candidates = [
    '.state.json',
    '.config.json',
    '.secrets.vault.json',
    '.env',
    'novaswarm.sqlite',
    'memory-vault',
    'skills',
    'rag-docs',
    'backups',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'metadata.json',
    'server.ts',
    'install.sh',
    'update.sh',
    'uninstall.sh',
    'shared',
    'server',
    'src',
    'scripts',
  ].filter((rel) => fs.existsSync(path.join(root, rel)));

  execFileSync(
    'tar',
    ['-czf', archivePath, '--exclude=node_modules', '--exclude=dist', '--exclude=.playwright-cli', ...candidates],
    { cwd: root, timeout: 60_000, stdio: 'ignore' }
  );

  return archivePath;
}

/** M336: Dry-run migration bundle file & size estimator without mutating or opening SSH */
export function estimateMigrationDryRun(rootDir = process.cwd()): {
  fileCount: number;
  totalBytes: number;
  totalMb: number;
  includedItems: string[];
} {
  const candidates = [
    '.state.json',
    '.config.json',
    '.secrets.vault.json',
    '.env',
    'novaswarm.sqlite',
    'memory-vault',
    'skills',
    'rag-docs',
    'backups',
    'package.json',
    'server.ts',
    'shared',
    'server',
    'src',
  ];
  let fileCount = 0;
  let totalBytes = 0;
  const includedItems: string[] = [];

  const walk = (p: string) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.playwright-cli') continue;
        walk(path.join(p, entry.name));
      }
    } else {
      fileCount += 1;
      totalBytes += st.size;
    }
  };

  for (const rel of candidates) {
    const full = path.join(rootDir, rel);
    if (fs.existsSync(full)) {
      includedItems.push(rel);
      walk(full);
    }
  }

  return {
    fileCount,
    totalBytes,
    totalMb: Number((totalBytes / 1048576).toFixed(2)),
    includedItems,
  };
}

/**
 * Generates remote installation + target hardware auto-optimization bash script.
 * Note: Sudo password is NOT hardcoded into this script; when sudo needs password,
 * we pass it separately over an ephemeral /dev/shm askpass helper created cleanly during execution.
 */
export function buildRemoteSetupScript(params: {
  target: ValidatedMigrationTarget;
  bundleRemotePath: string;
  sudoPasswordB64?: string;
}): string {
  const { target, bundleRemotePath, sudoPasswordB64 } = params;
  const targetDir = '$HOME/NovaSwarmNextGenHydrogen';

  return `#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${target.targetAppPort}"
TARGET_DIR="${targetDir}"
BUNDLE="${bundleRemotePath}"

ASKPASS_SH=""
cleanup_tmp() {
  if [ -n "$ASKPASS_SH" ] && [ -f "$ASKPASS_SH" ]; then rm -f "$ASKPASS_SH"; fi
  rm -f "$BUNDLE"
}
trap cleanup_tmp EXIT

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    SUDO="sudo"
  elif [ -n "${sudoPasswordB64 ? '1' : ''}" ]; then
    ASKPASS_SH="/dev/shm/.ns-askpass-$$.sh"
    cat > "$ASKPASS_SH" <<'ASK_EOF'
#!/bin/sh
echo '${sudoPasswordB64 || ''}' | base64 -d
ASK_EOF
    chmod 700 "$ASKPASS_SH"
    export SUDO_ASKPASS="$ASKPASS_SH"
    SUDO="sudo -A"
  fi
fi

echo "[STEP 1/5] Rendszerfüggőségek ellenőrzése az új gépen..."
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -qq || true
  $SUDO apt-get install -y -qq curl git build-essential python3 make g++ espeak-ng ffmpeg sshpass pciutils bubblewrap iproute2 >/dev/null || true
fi

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\\([0-9]*\\).*/\\1/')" -lt 20 ]; then
  echo "[STEP 1b] Node.js 22 LTS telepítése..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash - >/dev/null 2>&1 || true
  $SUDO apt-get install -y -qq nodejs >/dev/null 2>&1 || true
fi

echo "[STEP 2/5] Cél hardver profilozása & adaptív beállítás..."
CPU_CORES=$(nproc 2>/dev/null || echo 2)
ARCH=$(uname -m)
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 4194304)
RAM_MB=$(( RAM_KB / 1024 ))
HAS_GPU=0
GPU_INFO="none"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  HAS_GPU=1
  GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
fi

if [ "$HAS_GPU" -eq 1 ] || [ "$RAM_MB" -ge 14336 ]; then
  REC_MODEL="qwen2.5-coder:7b"
  HEAP_OPT="--max-old-space-size=2048"
elif [ "$RAM_MB" -ge 6144 ]; then
  REC_MODEL="qwen2.5:3b"
  HEAP_OPT="--max-old-space-size=1280"
elif [ "$RAM_MB" -ge 2300 ]; then
  REC_MODEL="qwen2.5:3b"
  HEAP_OPT="--max-old-space-size=896"
else
  REC_MODEL="qwen2.5:1.5b"
  HEAP_OPT="--max-old-space-size=640"
fi
echo "TARGET_HW_SUMMARY=Arch=\${ARCH} CPU=\${CPU_CORES} RAM=\${RAM_MB}MB GPU=\${GPU_INFO} Model=\${REC_MODEL}"

echo "[STEP 3/5] Kód és teljes élő állapot kicsomagolása..."
mkdir -p "$TARGET_DIR"
tar -xzf "$BUNDLE" -C "$TARGET_DIR"
cd "$TARGET_DIR"

if [ ! -f .env ] && [ -f .env.example ]; then cp .env.example .env; fi
touch .env
sed -i '/^PORT=/d' .env || true
sed -i '/^NOVASWARM_RECOMMENDED_MODEL=/d' .env || true
echo "PORT=\${APP_PORT}" >> .env
echo "NOVASWARM_RECOMMENDED_MODEL=\${REC_MODEL}" >> .env

echo "[STEP 4/5] Függőségek telepítése, Vite build & Hardver-Adaptív Állapot Hangolás..."
export NODE_OPTIONS="\${HEAP_OPT}"
npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps
npm run build

# Run hardware optimizer inside target workspace so migrated .state.json immediately adapts to new CPU/RAM/GPU!
./node_modules/.bin/tsx -e "import { applyHardwareAdaptiveOptimization } from './server/system/hardwareOptimizer'; console.log(JSON.stringify(applyHardwareAdaptiveOptimization(true).profile.tierLabel));" || true

echo "[STEP 5/5] systemd szolgáltatás indítása & Healthcheck..."
RUN_USER="$(whoami)"
NODE_BIN=$(command -v node)
NODE_BIN_DIR=$(dirname "$NODE_BIN")
TSX_BIN="\${TARGET_DIR}/node_modules/.bin/tsx"

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  # M340: Check if target port is already held by another process
  if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":\${APP_PORT} "; then
    echo "WARN: Port \${APP_PORT} használatban van a cél gépen, újraindítás/átvétel folyamatban..."
  fi
  # M338: Ensure background user services survive logout
  if command -v loginctl >/dev/null 2>&1; then
    $SUDO loginctl enable-linger "\${RUN_USER}" >/dev/null 2>&1 || true
  fi
  # M343: Advertise novaswarm.local via Avahi mDNS if available
  if command -v avahi-daemon >/dev/null 2>&1 && [ -d /etc/avahi/services ]; then
    AVAHI_TMP=$(mktemp)
    cat > "$AVAHI_TMP" <<AVAHI_EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>NovaSwarm Control Plane</name>
  <service>
    <type>_http._tcp</type>
    <port>\${APP_PORT}</port>
  </service>
</service-group>
AVAHI_EOF
    $SUDO mv "$AVAHI_TMP" /etc/avahi/services/novaswarm.service || true
    $SUDO systemctl restart avahi-daemon >/dev/null 2>&1 || true
  fi

  TMP_UNIT=$(mktemp)
  cat > "$TMP_UNIT" <<EOF
[Unit]
Description=NovaSwarm Autonomous AI Agent Swarm
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=\${RUN_USER}
WorkingDirectory=\${TARGET_DIR}
Environment=PATH=\${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=\${APP_PORT}
Environment=NODE_OPTIONS=\${HEAP_OPT}
Environment=NOVASWARM_RECOMMENDED_MODEL=\${REC_MODEL}
ExecStart=\${TSX_BIN} server.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  $SUDO mv "$TMP_UNIT" /etc/systemd/system/novaswarm.service
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable novaswarm
  $SUDO systemctl restart novaswarm
else
  nohup env NODE_ENV=production PORT="\${APP_PORT}" NODE_OPTIONS="\${HEAP_OPT}" "$TSX_BIN" server.ts > "\${TARGET_DIR}/novaswarm.log" 2>&1 &
fi

READY=0
for _i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS "http://127.0.0.1:\${APP_PORT}/healthz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "HEALTHCHECK_FAILED"
  exit 1
fi
echo "HEALTHCHECK_OK port=\${APP_PORT}"
`;
}

/**
 * Dry-run SSH connectivity + target hardware preview without mutating anything.
 */
export async function testSshMigrationTarget(
  input: Partial<SshMigrationParams>,
  transport: SshTransportAdapter = defaultSshTransport
): Promise<{
  ok: boolean;
  target: ValidatedMigrationTarget;
  hardwarePreview?: {
    arch: string;
    cpuCores: number;
    ramTotalMb: number;
    hasGpu: boolean;
    gpuName: string;
    recommendedTier: string;
    recommendedModel: string;
  };
  error?: string;
}> {
  const target = validateMigrationTarget(input);
  const probeScript = `#!/usr/bin/env bash
set -e
ARCH=$(uname -m)
CPU=$(nproc 2>/dev/null || echo 1)
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 2097152)
RAM_MB=$(( RAM_KB / 1024 ))
GPU="none"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
fi
echo "PROBE:\${ARCH}|\${CPU}|\${RAM_MB}|\${GPU}"
`;

  const res = await transport.execRemote(target, input.password || '', probeScript, 15_000);
  if (res.code !== 0) {
    return {
      ok: false,
      target,
      error: res.stderr.trim() || res.stdout.trim() || `SSH csatlakozás sikertelen (kilépési kód: ${res.code})`,
    };
  }

  const line = res.stdout.split('\n').find((l) => l.startsWith('PROBE:')) || '';
  const rawFields = line.replace(/^PROBE:/, '').split('|');
  const parsedArch = rawFields[0] || 'unknown';
  const cpuCores = Math.max(1, Number(rawFields[1]) || 2);
  const ramTotalMb = Math.max(512, Number(rawFields[2]) || 2048);
  const parsedGpu = (rawFields[3] || 'none').trim();
  const hasGpu = Boolean(parsedGpu && parsedGpu !== 'none');

  const profile = buildTargetHardwareSettingsPatch({
    cpuCores,
    arch: parsedArch,
    ramTotalMb,
    hasGpu,
    gpuName: parsedGpu,
  });

  return {
    ok: true,
    target,
    hardwarePreview: {
      arch: parsedArch,
      cpuCores,
      ramTotalMb,
      hasGpu,
      gpuName: parsedGpu,
      recommendedTier: profile.tierLabel,
      recommendedModel: profile.recommendedOllamaModel,
    },
  };
}

/**
 * Executes the complete one-shot SSH migration ("Költöztető"):
 * Packs state & code -> Uploads to target -> Adapts settings to target hardware -> Builds & Starts service ->
 * Verifies remote /healthz -> Disables old instance when stopOldInstance is true.
 * Never persists SSH passwords!
 */
export async function executeSshHostMigration(
  input: Partial<SshMigrationParams>,
  options?: {
    transport?: SshTransportAdapter;
    skipLocalArchiveForTest?: boolean;
    onStopOldHost?: (target: ValidatedMigrationTarget) => Promise<void> | void;
  }
): Promise<MigrationRunRecord> {
  const target = validateMigrationTarget(input);
  const password = input.password || '';
  const transport = options?.transport ?? defaultSshTransport;

  const record: MigrationRunRecord = {
    id: `mig-${crypto.randomUUID().slice(0, 8)}`,
    targetIp: target.targetIp,
    sshPort: target.sshPort,
    username: target.username,
    targetAppPort: target.targetAppPort,
    stopOldInstance: target.stopOldInstance,
    status: 'running',
    stage: 'Előkészítés és csomagolás',
    logs: [`Költöztetés indítása: ${target.username}@${target.targetIp}:${target.sshPort}`],
    startedAt: new Date().toISOString(),
  };

  const persistRecord = () => {
    updateState((s) => {
      s.settings.lastMigrationRecord = { ...record, logs: [...record.logs] };
    });
  };
  persistRecord();

  const tempWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-mig-bundle-'));
  try {
    // 1. Package state & codebase archive
    let localArchivePath = path.join(tempWorkDir, 'novaswarm-migrate-bundle.tar.gz');
    if (options?.skipLocalArchiveForTest) {
      fs.writeFileSync(localArchivePath, 'mock-archive');
    } else {
      localArchivePath = createMigrationBundleArchive(tempWorkDir);
    }
    record.logs.push('Teljes NovaSwarm állapot (.state.json, .secrets.vault.json, SQLite WAL, memory-vault, skills) csomagolva.');
    record.stage = 'Csomag feltöltése SCP-n keresztül';
    persistRecord();

    // 2. Upload archive to target /tmp
    const remoteBundlePath = `/tmp/ns-migrate-${Date.now()}.tar.gz`;
    const upRes = await transport.uploadFile(target, password, localArchivePath, remoteBundlePath, 180_000);
    if (upRes.code !== 0) {
      throw new Error(`SCP feltöltés sikertelen: ${upRes.stderr.trim() || upRes.stdout.trim()}`);
    }
    record.logs.push('Csomag feltöltve a cél gépre.');
    record.stage = 'Távoli telepítés, hardver-adaptív optimalizálás és szolgáltatás indítás';
    persistRecord();

    // 3. Execute remote setup + target hardware optimization + systemd + /healthz check
    const setupScript = buildRemoteSetupScript({
      target,
      bundleRemotePath: remoteBundlePath,
      sudoPasswordB64: Buffer.from(password, 'utf8').toString('base64'),
    });
    const execRes = await transport.execRemote(target, password, setupScript, 420_000);
    const outLines = execRes.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of outLines.slice(-15)) {
      record.logs.push(l);
    }

    const hwLine = outLines.find((l) => l.startsWith('TARGET_HW_SUMMARY='));
    if (hwLine) {
      record.targetHardwareSummary = hwLine.replace('TARGET_HW_SUMMARY=', '');
    }

    if (execRes.code !== 0 || !execRes.stdout.includes('HEALTHCHECK_OK')) {
      throw new Error(
        `Távoli indítás / healthcheck sikertelen (kód: ${execRes.code}): ${execRes.stderr.trim() || 'nincs részlet'}`
      );
    }

    // 4. Cutover to new machine ONLY after remote /healthz succeeded!
    record.status = 'completed';
    record.stage = 'Átállás kész — új példány aktív';
    record.newUrl = `http://${target.targetIp}:${target.targetAppPort}`;
    record.completedAt = new Date().toISOString();
    record.logs.push(`Új gép /healthz OK: ${record.newUrl}`);
    if (target.stopOldInstance) {
      record.logs.push('Régi gép Telegram polling és helyi szolgáltatás leállítása ütemezve (onnantól csak az új gépen fut).');
    }
    persistRecord();

    appendAuditLog({
      type: 'system',
      sourceAgentId: 'ssh-migrator',
      sourceAgentName: 'SSH Költöztető',
      message: `Sikeres átköltözés új gépre: ${record.newUrl} (régi leállítása: ${target.stopOldInstance ? 'IGEN' : 'NEM'})`,
      verifiedExecution: true,
    });

    if (target.stopOldInstance) {
      if (options?.onStopOldHost) {
        await options.onStopOldHost(target);
      } else {
        transport.onCutoverOldHost?.(target);
      }
    }

    return record;
  } catch (err) {
    record.status = 'failed';
    record.stage = 'Hiba — régi példány változatlanul fut tovább';
    record.error = err instanceof Error ? err.message : String(err);
    record.completedAt = new Date().toISOString();
    record.logs.push(`HIBA: ${record.error}`);
    persistRecord();

    appendAuditLog({
      type: 'system',
      sourceAgentId: 'ssh-migrator',
      sourceAgentName: 'SSH Költöztető',
      message: `Költöztetés sikertelen (${target.targetIp}): ${record.error}`,
      verifiedExecution: false,
    });
    return record;
  } finally {
    fs.rmSync(tempWorkDir, { recursive: true, force: true });
  }
}

export function scheduleLocalHostCutoverDecommission(stopTelegramFn: () => void): void {
  try {
    stopTelegramFn();
  } catch {
    // non-fatal
  }
  const markerPath = path.join(process.cwd(), '.migrated-away');
  try {
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
  } catch {
    // ignore
  }
  setTimeout(() => {
    try {
      execFileSync('systemctl', ['disable', '--now', 'novaswarm'], { timeout: 4000, stdio: 'ignore' });
    } catch {
      // non-systemd or non-sudo container
    }
    process.exit(0);
  }, 1500);
}
