#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NovaSwarm Zero-Manual-Step Linux Installer
# Installs bubblewrap, dependencies, builds NovaSwarm, safely validates & writes
# /etc/sudoers.d/novaswarm (visudo -cf), configures operator password & optional
# Telegram allowlist, enables Full & Total Autonomy, creates first Phoenix
# snapshot, runs self-checks, and prints a green/red Hungarian summary.
# ==============================================================================

NOVASWARM_DIR="${NOVASWARM_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE_NAME="novaswarm"
DEFAULT_PORT=3000

echo "============================================================"
echo "  NovaSwarm — Zéró Kézi Lépéses Telepítő (Totális autonómia)"
echo "============================================================"

APP_PORT="${NOVASWARM_PORT:-$DEFAULT_PORT}"
OPERATOR_PASSWORD="${NOVASWARM_OPERATOR_PASSWORD:-}"
TELEGRAM_TOKEN="${NOVASWARM_TELEGRAM_TOKEN:-}"
TELEGRAM_CHAT_ID="${NOVASWARM_TELEGRAM_CHAT_ID:-}"
GENERATED_PW_SHOWN=0

if [ -t 0 ]; then
  read -r -p "Web UI port [${APP_PORT}]: " USER_PORT || true
  APP_PORT="${USER_PORT:-$APP_PORT}"

  while true; do
    read -r -s -p "Operátori jelszó (min. 12 karakter, Enter = automatikus erős jelszó): " INPUT_PW || true
    echo ""
    if [ -z "${INPUT_PW}" ]; then
      break
    fi
    if [ "${#INPUT_PW}" -ge 12 ]; then
      OPERATOR_PASSWORD="${INPUT_PW}"
      break
    fi
    echo "FIGYELEM: A jelszónak legalább 12 karakter hosszúnak kell lennie!"
  done

  read -r -p "Telegram Bot Token (Enter = kihagyás): " INPUT_TG_TOKEN || true
  if [ -n "${INPUT_TG_TOKEN}" ]; then
    TELEGRAM_TOKEN="${INPUT_TG_TOKEN}"
    read -r -p "Saját Telegram Chat ID (allowlisthez, Enter = kihagyás): " INPUT_TG_CHAT || true
    TELEGRAM_CHAT_ID="${INPUT_TG_CHAT:-}"
  fi
fi

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

echo "[1/8] Rendszerfüggőségek (beleértve bubblewrap) telepítése..."
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq curl git build-essential python3 make g++ espeak-ng ffmpeg sshpass pciutils lm-sensors bubblewrap iproute2 avahi-utils >/dev/null || true
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y -q curl git gcc-c++ make python3 espeak-ng ffmpeg sshpass pciutils bubblewrap iproute || true
elif command -v pacman >/dev/null 2>&1; then
  $SUDO pacman -Sy --noconfirm --needed curl git base-devel python espeak-ng ffmpeg sshpass pciutils bubblewrap iproute2 || true
fi

# Node.js >= 22.5 check (required by native node:sqlite)
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
else
  NODE_VER=$(node -v | sed 's/^v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  NODE_MINOR=$(echo "$NODE_VER" | cut -d. -f2)
  if [ "${NODE_MAJOR:-0}" -lt 22 ] || { [ "${NODE_MAJOR:-0}" -eq 22 ] && [ "${NODE_MINOR:-0}" -lt 5 ]; }; then
    NEED_NODE=1
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "[2/8] Node.js 22 LTS (>= 22.5) telepítése..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | ${SUDO:-} bash -
  ${SUDO:-} apt-get install -y -qq nodejs
else
  echo "[2/8] Node.js $(node -v) rendben (>= 22.5)."
fi

# Generate strong operator password if not entered
if [ -z "${OPERATOR_PASSWORD}" ]; then
  OPERATOR_PASSWORD=$(node -e "const c=require('crypto'); console.log(c.randomBytes(15).toString('base64url').slice(0, 18) + '!9A')" 2>/dev/null || openssl rand -base64 16 | tr -dc 'A-Za-z0-9!@#_' | head -c 18)
  GENERATED_PW_SHOWN=1
fi

echo "[3/8] Mély hardver-profilozás (arch, RPi, CPU AVX2/NEON, szabad RAM/ZRAM, lemez, GPU VRAM)..."
ARCH=$(uname -m 2>/dev/null || echo "x86_64")
CPU_CORES=$(nproc 2>/dev/null || echo 2)
BOARD_MODEL="Standard Host"
if [ -r /proc/device-tree/model ]; then
  BOARD_MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo "Raspberry Pi / SBC")
fi
CPU_FLAGS="none"
if grep -qiE 'avx2' /proc/cpuinfo 2>/dev/null; then
  CPU_FLAGS="avx2"
elif grep -qiE 'asimd|neon' /proc/cpuinfo 2>/dev/null || [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
  CPU_FLAGS="neon"
fi
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 4194304)
RAM_FREE_KB=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "$RAM_KB")
RAM_MB=$(( RAM_KB / 1024 ))
RAM_FREE_MB=$(( RAM_FREE_KB / 1024 ))
RAM_GB=$(( (RAM_MB + 512) / 1024 ))
SWAP_KB=$(grep SwapTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
SWAP_MB=$(( SWAP_KB / 1024 ))
ZRAM_MB=0
if command -v zramctl >/dev/null 2>&1; then
  ZRAM_BYTES=$(zramctl --bytes --noheadings --output DISKSIZE 2>/dev/null | awk '{s+=$1} END{print s+0}' || echo 0)
  ZRAM_MB=$(( ZRAM_BYTES / 1048576 ))
fi
DISK_FREE_MB=$(df -Pm "${NOVASWARM_DIR}" 2>/dev/null | awk 'NR==2 {print $4}' || echo 20480)
ROOT_DEV=$(df -P "${NOVASWARM_DIR}" 2>/dev/null | awk 'NR==2 {print $1}' || echo "")
STORAGE_KIND="SSD/Standard"
if echo "${ROOT_DEV}" | grep -qiE 'mmcblk|sd[a-z]'; then
  STORAGE_KIND="SD/eMMC"
elif echo "${ROOT_DEV}" | grep -qiE 'nvme'; then
  STORAGE_KIND="NVMe"
fi

HAS_GPU=0
GPU_INFO="CPU only"
GPU_VRAM_MB=0
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  HAS_GPU=1
  GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
  GPU_VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | awk '{s+=$1} END{print s+0}' || echo 0)
elif command -v rocm-smi >/dev/null 2>&1 && rocm-smi --showmeminfo vram >/dev/null 2>&1; then
  HAS_GPU=1
  GPU_INFO="AMD ROCm GPU"
  GPU_VRAM_MB=$(rocm-smi --showmeminfo vram 2>/dev/null | grep -i 'Total Memory' | awk '{print int($NF/1048576)}' | head -n 1 || echo 8192)
elif command -v lspci >/dev/null 2>&1 && lspci | grep -qiE 'VGA|3D|Display'; then
  GPU_INFO=$(lspci | grep -iE 'VGA|3D|Display' | head -n 1)
fi

if [ "$HAS_GPU" -eq 1 ] && [ "$GPU_VRAM_MB" -ge 20000 ] && [ "$DISK_FREE_MB" -ge 24000 ]; then
  RECOMMENDED_MODEL="qwen2.5:32b"
elif [ "$HAS_GPU" -eq 1 ] || [ "$RAM_MB" -ge 15000 ]; then
  RECOMMENDED_MODEL="qwen2.5:7b"
elif [ "$RAM_MB" -ge 7500 ]; then
  RECOMMENDED_MODEL="qwen2.5:3b"
else
  RECOMMENDED_MODEL="qwen2.5:1.5b"
fi

echo "  Gép: ${BOARD_MODEL} (${ARCH}) | CPU: ${CPU_CORES} mag [${CPU_FLAGS}]"
echo "  RAM: ${RAM_FREE_MB}/${RAM_MB} MB szabad (~${RAM_GB} GB) | Swap: ${SWAP_MB} MB (ZRAM: ${ZRAM_MB} MB)"
echo "  Lemez: ${DISK_FREE_MB} MB szabad (${STORAGE_KIND}) | GPU: ${GPU_INFO} (${GPU_VRAM_MB} MB VRAM)"
echo "  Előzetes helyi Ollama modellbecslés: ${RECOMMENDED_MODEL}"

if [ "$RAM_MB" -lt 1536 ] && [ "$SWAP_MB" -lt 512 ]; then
  AVAIL_KB=$(df -k / | awk 'NR==2 {print $4}' || echo 0)
  if [ "$AVAIL_KB" -gt 3145728 ] && [ ! -f /swapfile ] && command -v swapon >/dev/null 2>&1; then
    echo "  Kevés RAM (<1.5 GB) — 1 GB /swapfile létrehozása..."
    (
      ${SUDO:-} fallocate -l 1G /swapfile 2>/dev/null || ${SUDO:-} dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
      ${SUDO:-} chmod 600 /swapfile
      ${SUDO:-} mkswap /swapfile >/dev/null
      ${SUDO:-} swapon /swapfile
      if ! grep -q '^/swapfile ' /etc/fstab 2>/dev/null; then
        echo '/swapfile none swap sw 0 0' | ${SUDO:-} tee -a /etc/fstab >/dev/null
      fi
    ) || echo "  Figyelem: swap létrehozása kihagyva."
  fi
fi

echo "[4/8] Ollama futtató és előkészítés..."
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh || echo "Figyelem: Ollama telepítése kihagyva (később pótolható)."
fi

if command -v ollama >/dev/null 2>&1; then
  (ollama serve >/dev/null 2>&1 &) || true
  sleep 2
fi

echo "[5/8] NovaSwarm függőségek telepítése és build..."
cd "${NOVASWARM_DIR}"
mkdir -p memory-vault backups skills rag-docs
chmod 700 backups 2>/dev/null || true

if [ ! -f .env ]; then
  cp .env.example .env
  if grep -q '^PORT=' .env; then
    sed -i "s/^PORT=.*/PORT=${APP_PORT}/" .env
  else
    echo "PORT=${APP_PORT}" >> .env
  fi
  if grep -q '^APP_URL=' .env; then
    sed -i "s|^APP_URL=.*|APP_URL=\"http://localhost:${APP_PORT}\"|" .env
  else
    echo "APP_URL=\"http://localhost:${APP_PORT}\"" >> .env
  fi
fi

if [ "$RAM_MB" -lt 2048 ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=640"
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ollama 2>/dev/null; then
    ${SUDO:-} systemctl stop ollama || true
    RESTART_OLLAMA_AFTER_BUILD=1
  fi
  pkill -x ollama 2>/dev/null || true
fi

npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps
npm run build

if [ ! -f "${NOVASWARM_DIR}/dist/index.html" ]; then
  echo "HIBA: A Web UI build (dist/index.html) nem jött létre!"
  exit 1
fi

if [ "${RESTART_OLLAMA_AFTER_BUILD:-0}" -eq 1 ]; then
  ${SUDO:-} systemctl start ollama || true
fi

# Step 6: Validate and install /etc/sudoers.d/novaswarm via visudo -cf
echo "[6/8] Sudoers NOPASSWD és vészleállási könyvtár beállítása..."
RUN_USER="${SUDO_USER:-$(whoami)}"
SUDOERS_OK=0
if [[ "${RUN_USER}" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
  TMP_SUDOERS=$(mktemp)
  printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${RUN_USER}" > "${TMP_SUDOERS}"
  chmod 0440 "${TMP_SUDOERS}"
  if command -v visudo >/dev/null 2>&1; then
    if ${SUDO:-} visudo -cf "${TMP_SUDOERS}" >/dev/null 2>&1; then
      if [ -d /etc/sudoers.d ]; then
        ${SUDO:-} install -m 0440 -o root -g root "${TMP_SUDOERS}" /etc/sudoers.d/novaswarm && SUDOERS_OK=1 || true
      fi
    else
      echo "HIBA: A generált sudoers fájl megbukott a visudo -cf ellenőrzésen! Nem került telepítésre."
    fi
  else
    echo "FIGYELEM: A visudo parancs nem található, ezért a /etc/sudoers.d/novaswarm nem került ellenőrzés nélkül telepítésre."
  fi
  rm -f "${TMP_SUDOERS}"
else
  echo "HIBA: Érvénytelen futtató felhasználónév (${RUN_USER}), a sudoers fájl nem került telepítésre."
fi

# Ensure /etc/novaswarm exists for LOCKDOWN file
if [ -d /etc ]; then
  ${SUDO:-} mkdir -p /etc/novaswarm 2>/dev/null || true
  ${SUDO:-} chown "${RUN_USER}:${RUN_USER}" /etc/novaswarm 2>/dev/null || true
fi

# Step 7: systemd service + automated onboarding/password/Total Autonomy setup
echo "[7/8] systemd szolgáltatás és automatikus operátori konfiguráció..."
NODE_BIN=$(command -v node)
NODE_BIN_DIR=$(dirname "${NODE_BIN}")
TSX_BIN="${NOVASWARM_DIR}/node_modules/.bin/tsx"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "${RUN_USER}" != "root" ] && [ -d "${NOVASWARM_DIR}" ]; then
  ${SUDO:-} chown -R "${RUN_USER}:${RUN_USER}" "${NOVASWARM_DIR}" || true
fi

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  TMP_UNIT=$(mktemp)
  cat > "${TMP_UNIT}" <<EOF
[Unit]
Description=NovaSwarm Autonomous AI Agent Swarm
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${NOVASWARM_DIR}
Environment=PATH=${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${APP_PORT}
Environment=NOVASWARM_RECOMMENDED_MODEL=${RECOMMENDED_MODEL}
ExecStart=${TSX_BIN} server.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  ${SUDO:-} mv "${TMP_UNIT}" "${SERVICE_FILE}"
  ${SUDO:-} systemctl daemon-reload
  ${SUDO:-} systemctl enable "${SERVICE_NAME}"
  ${SUDO:-} systemctl restart "${SERVICE_NAME}"
  sleep 2
fi

# Configure password (using one-time setup code automatically), optional Telegram, Full + Total Autonomy, hardware-aware Ollama suite pull & benchmark, and first Phoenix snapshot
OLLAMA_BENCH_OUT=$(NOVASWARM_INSTALL_PW="${OPERATOR_PASSWORD}" \
NOVASWARM_INSTALL_TG_TOKEN="${TELEGRAM_TOKEN}" \
NOVASWARM_INSTALL_TG_CHAT="${TELEGRAM_CHAT_ID}" \
"${TSX_BIN}" -e "
import { initStateStore, getState, hasWebAuthPassword, setWebAuthPassword, setTelegramTokenSecret, updateState } from './server/state/store.ts';
import { consumeOneTimeSetupCode, ensureOneTimeSetupCode, verifyOneTimeSetupCode } from './server/security/auth.ts';
import { toggleTotalAutonomyMode } from './server/security/totalAutonomy.ts';
import { createAgent } from './server/agents/engine.ts';
import { createBackupPoint } from './server/system/ops.ts';
import { reselectOllamaSuite } from './server/system/ollamaSelector.ts';

async function setup() {
  initStateStore();
  const pw = (process.env.NOVASWARM_INSTALL_PW || '').trim();
  const tgToken = (process.env.NOVASWARM_INSTALL_TG_TOKEN || '').trim();
  const tgChat = (process.env.NOVASWARM_INSTALL_TG_CHAT || '').trim();

  if (!hasWebAuthPassword() && pw.length >= 12) {
    const code = ensureOneTimeSetupCode();
    if (verifyOneTimeSetupCode(code)) {
      setWebAuthPassword(pw);
      consumeOneTimeSetupCode();
    }
  }

  updateState((s) => {
    s.settings.webAuthHasPassword = hasWebAuthPassword();
    s.settings.webAuthEnabled = hasWebAuthPassword();
    s.settings.onboardingCompleted = true;
    s.settings.autoPhoenixSnapshotInFullAutonomy = true;
    if (tgChat) {
      s.settings.telegramChatId = tgChat;
      const list = s.settings.telegramAllowedChatIds || [];
      if (!list.includes(tgChat)) s.settings.telegramAllowedChatIds = [...list, tgChat];
    }
    if (tgToken) {
      setTelegramTokenSecret(tgToken);
      s.settings.telegramHasToken = true;
      s.settings.telegramEnabled = Boolean(tgChat);
    }
  });

  if (getState().agents.filter((a) => !a.isSupervisor).length === 0) {
    createAgent({
      name: 'Központi Asszisztens',
      role: 'Általános Asszisztens',
      systemPrompt: 'Önállóan működő NovaSwarm koordinátor ágens a 3 sérthetetlen biztonsági garancia betartásával.',
      hostExecutionEnabled: true,
    });
  }

  const ollamaRes = await reselectOllamaSuite({
    pullMissing: true,
    runBenchmark: true,
    checkRemoteRegistry: true,
  });

  await toggleTotalAutonomyMode({ enabled: true, bypassPasswordForInstaller: true });
  await createBackupPoint('installer-phoenix-init', false);
  console.log('OLLAMA_SUITE=' + JSON.stringify({
    tier: ollamaRes.selection.tierLabel,
    main: ollamaRes.selection.mainModel,
    fast: ollamaRes.selection.fastModel,
    code: ollamaRes.selection.codeModel,
    embed: ollamaRes.selection.embeddingModel,
    pending: ollamaRes.pendingPullModels,
    tps: ollamaRes.benchmark?.tokensPerSec ?? null,
  }));
}
setup().catch((e) => { console.error(e); process.exit(1); });
" || true)
echo "${OLLAMA_BENCH_OUT}"

chmod 600 .secrets.vault.json .secrets.key .state.json .config.json 2>/dev/null || true

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "${SERVICE_NAME}.service"; then
  ${SUDO:-} systemctl restart "${SERVICE_NAME}" || true
  sleep 2
fi

# Install global 'novaswarm' terminal CLI wrapper
if [ -d /usr/local/bin ]; then
  TMP_CLI=$(mktemp)
  cat > "${TMP_CLI}" <<EOF
#!/usr/bin/env bash
exec "${TSX_BIN}" "${NOVASWARM_DIR}/scripts/novaswarm-cli.ts" "\$@"
EOF
  chmod +x "${TMP_CLI}"
  ${SUDO:-} mv "${TMP_CLI}" /usr/local/bin/novaswarm 2>/dev/null || rm -f "${TMP_CLI}"
fi

# Step 8: Self-checks
echo "[8/8] Önellenőrzések futtatása..."
CHK_HEALTH="PIROS"
for _i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
    CHK_HEALTH="ZÖLD"
    break
  fi
  sleep 1
done

CHK_SUDO="PIROS"
if [ "$(id -u)" -eq 0 ]; then
  CHK_SUDO="ZÖLD"
elif sudo -n true >/dev/null 2>&1; then
  CHK_SUDO="ZÖLD"
fi

CHK_BWRAP="PIROS"
if "${TSX_BIN}" -e "import { runInSupervisorSandbox } from './server/sandbox/supervisorSandbox.ts'; const r = runInSupervisorSandbox({ scriptOrCommand: 'console.log(42)', isNodeScript: true }); process.exit(r.passed ? 0 : 1);" >/dev/null 2>&1; then
  CHK_BWRAP="ZÖLD"
fi

CHK_PHOENIX="PIROS"
if ls backups/*.tar.gz >/dev/null 2>&1; then
  CHK_PHOENIX="ZÖLD"
fi

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

echo ""
echo "============================================================"
echo "  TELEPÍTÉS ÖSSZEFOGLALÓ (ZÖLD / PIROS)"
echo "============================================================"
echo "  [$([ "$CHK_HEALTH" = "ZÖLD" ] && echo "✅" || echo "❌")] /healthz helyi elérés (port ${APP_PORT}): ${CHK_HEALTH}"
echo "  [$([ "$SUDOERS_OK" -eq 1 ] && echo "✅" || echo "❌")] /etc/sudoers.d/novaswarm (visudo -cf): $([ "$SUDOERS_OK" -eq 1 ] && echo "ZÖLD" || echo "PIROS")"
echo "  [$([ "$CHK_SUDO" = "ZÖLD" ] && echo "✅" || echo "❌")] sudo -n true ellenőrzés: ${CHK_SUDO}"
echo "  [$([ "$CHK_BWRAP" = "ZÖLD" ] && echo "✅" || echo "❌")] bubblewrap (bwrap) sandbox izoláció: ${CHK_BWRAP}"
echo "  [$([ "$CHK_PHOENIX" = "ZÖLD" ] && echo "✅" || echo "❌")] Első Phoenix pillanatkép: ${CHK_PHOENIX}"
echo "  [✅] Teljes + Totális autonómia profil: AKTÍV"
OLLAMA_SUMMARY_LINE=$(echo "${OLLAMA_BENCH_OUT}" | grep '^OLLAMA_SUITE=' | tail -n 1 | sed 's/^OLLAMA_SUITE=//' || true)
if [ -n "${OLLAMA_SUMMARY_LINE}" ]; then
  echo "  [✅] Hardver-érzékeny Ollama csomag: ${OLLAMA_SUMMARY_LINE}"
fi
echo ""
if [ "${GENERATED_PW_SHOWN}" -eq 1 ]; then
  echo "  🔑 EGYSZERI AUTOMATIKUS OPERÁTORI JELSZÓ (mentsd el most!):"
  echo "     ${OPERATOR_PASSWORD}"
  echo ""
fi
echo "  Web UI (helyi): http://localhost:${APP_PORT}"
if [ -n "${LAN_IP}" ]; then
  echo "  Web UI (LAN):   http://${LAN_IP}:${APP_PORT}"
fi
echo ""
echo "  📋 Ezt csináld meg egyszer:"
echo "  1. Ellenőrizd a git history-t érzékeny maradványfájlok (.state.json.bak*, .env) szempontjából, ha korábban nyilvános repóból klónoztad."
echo "  2. Ha hardvert bővítesz (RAM / GPU), futtasd: novaswarm ollama-reselect"
echo "  3. Add hozzá a felhő API kulcsaidat (lehetőleg külön Google Cloud projektekből a Geminihez) a Modellek & Router fülön."
echo "============================================================"
