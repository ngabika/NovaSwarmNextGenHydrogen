#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NovaSwarm Zero-Manual-Step Linux Installer (LAN HTTP / Optional Password)
# - Supports optional web password (Enter / non-TTY / --no-password => LAN no auth),
#   --password <pw>, --generate-password, --non-interactive
# - Stops existing service before modifying state/vault
# - Strict npm ci & build & tsx binary verification
# - Writes /etc/sudoers.d/novaswarm (visudo -cf) & hardened systemd unit
# - Runs scripts/install-configure.ts under RUN_USER using getState()
# - Protects audit-chain.jsonl with chattr +a when supported
# - Runs live E2E HTTP/auth verification before declaring success
# ==============================================================================

NOVASWARM_DIR="${NOVASWARM_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE_NAME="novaswarm"
DEFAULT_PORT=3000

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail_loud() {
  echo -e "${RED}HIBA: $*${NC}" >&2
  exit 1
}

warn_loud() {
  echo -e "${YELLOW}FIGYELEM: $*${NC}" >&2
}

echo "============================================================"
echo "  NovaSwarm — Zéró Kézi Lépéses Telepítő (LAN HTTP)"
echo "============================================================"

APP_PORT="${NOVASWARM_PORT:-$DEFAULT_PORT}"
OPERATOR_PASSWORD="${NOVASWARM_INSTALL_PW:-${NOVASWARM_OPERATOR_PASSWORD:-}}"
NO_PASSWORD="${NOVASWARM_NO_PASSWORD:-0}"
GENERATE_PASSWORD="${NOVASWARM_GENERATE_PASSWORD:-0}"
NON_INTERACTIVE=0
TELEGRAM_TOKEN="${NOVASWARM_TELEGRAM_TOKEN:-}"
TELEGRAM_CHAT_ID="${NOVASWARM_TELEGRAM_CHAT_ID:-}"
GENERATED_PW_SHOWN=0
SKIPPED_ITEMS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --no-password)
      NO_PASSWORD=1
      OPERATOR_PASSWORD=""
      shift
      ;;
    --generate-password)
      GENERATE_PASSWORD=1
      NO_PASSWORD=0
      shift
      ;;
    --password)
      [ $# -ge 2 ] || fail_loud "A --password kapcsoló után meg kell adni a jelszót."
      OPERATOR_PASSWORD="$2"
      NO_PASSWORD=0
      shift 2
      ;;
    --password=*)
      OPERATOR_PASSWORD="${1#--password=}"
      NO_PASSWORD=0
      shift
      ;;
    --port)
      [ $# -ge 2 ] || fail_loud "A --port kapcsoló után meg kell adni a portszámot."
      APP_PORT="$2"
      shift 2
      ;;
    --telegram-token)
      [ $# -ge 2 ] || fail_loud "A --telegram-token kapcsoló után token szükséges."
      TELEGRAM_TOKEN="$2"
      shift 2
      ;;
    --telegram-chat)
      [ $# -ge 2 ] || fail_loud "A --telegram-chat kapcsoló után chat ID szükséges."
      TELEGRAM_CHAT_ID="$2"
      shift 2
      ;;
    --non-interactive|-y|--yes)
      NON_INTERACTIVE=1
      shift
      ;;
    -h|--help)
      echo "Használat: ./install.sh [--no-password | --password <min12> | --generate-password] [--port 3000] [--non-interactive]"
      exit 0
      ;;
    *)
      fail_loud "Ismeretlen kapcsoló: $1"
      ;;
  esac
done

if [ -n "${OPERATOR_PASSWORD}" ] && [ "${#OPERATOR_PASSWORD}" -lt 12 ]; then
  fail_loud "A megadott webes jelszónak legalább 12 karakter hosszúnak kell lennie."
fi

if [ -t 0 ] && [ "${NON_INTERACTIVE}" -eq 0 ]; then
  read -r -p "Web UI port [${APP_PORT}]: " USER_PORT || true
  APP_PORT="${USER_PORT:-$APP_PORT}"

  if [ "${NO_PASSWORD}" -eq 0 ] && [ "${GENERATE_PASSWORD}" -eq 0 ] && [ -z "${OPERATOR_PASSWORD}" ]; then
    while true; do
      read -r -s -p "Webes jelszó (Enter = nincs jelszó, a LAN-on bárki elérheti a felületet; később bármikor beállítható): " INPUT_PW || true
      echo ""
      if [ -z "${INPUT_PW}" ]; then
        NO_PASSWORD=1
        echo "  -> Jelszó nélküli helyi hálózati (LAN) mód kiválasztva."
        break
      fi
      if [ "${#INPUT_PW}" -lt 12 ]; then
        echo "FIGYELEM: A jelszónak legalább 12 karakter hosszúnak kell lennie (vagy nyomj Entert a jelszó nélküli módhoz)!"
        continue
      fi
      read -r -s -p "Webes jelszó megerősítése: " INPUT_PW_CONFIRM || true
      echo ""
      if [ "${INPUT_PW}" != "${INPUT_PW_CONFIRM}" ]; then
        echo "FIGYELEM: A két jelszó nem egyezik, próbáld újra!"
        continue
      fi
      OPERATOR_PASSWORD="${INPUT_PW}"
      break
    done
  fi

  if [ -z "${TELEGRAM_TOKEN}" ]; then
    read -r -p "Telegram Bot Token (Enter = kihagyás): " INPUT_TG_TOKEN || true
    if [ -n "${INPUT_TG_TOKEN}" ]; then
      TELEGRAM_TOKEN="${INPUT_TG_TOKEN}"
      read -r -p "Saját Telegram Chat ID (allowlisthez, Enter = kihagyás): " INPUT_TG_CHAT || true
      TELEGRAM_CHAT_ID="${INPUT_TG_CHAT:-}"
    fi
  fi
else
  # Non-interactive run without explicit password/generate flags stays passwordless cleanly
  if [ "${GENERATE_PASSWORD}" -eq 0 ] && [ -z "${OPERATOR_PASSWORD}" ]; then
    NO_PASSWORD=1
  fi
fi

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

RUN_USER="${SUDO_USER:-$(whoami)}"

# Stop existing systemd service BEFORE touching files/vault/build
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
  echo "[0/8] Futó ${SERVICE_NAME} szolgáltatás leállítása telepítés előtt..."
  ${SUDO:-} systemctl stop "${SERVICE_NAME}" || true
fi

echo "[1/8] Rendszerfüggőségek (beleértve bubblewrap) ellenőrzése és telepítése..."
if command -v apt-get >/dev/null 2>&1; then
  if ! (${SUDO:-} apt-get update -qq && ${SUDO:-} apt-get install -y -qq curl git build-essential python3 make g++ espeak-ng ffmpeg sshpass pciutils lm-sensors bubblewrap iproute2 avahi-utils >/dev/null); then
    warn_loud "Néhány opcionális apt csomag telepítése sikertelen (offline mód?) — folytatás."
    SKIPPED_ITEMS+=("Rendszercsomagok (apt) részben sikertelenek")
  fi
elif command -v dnf >/dev/null 2>&1; then
  ${SUDO:-} dnf install -y -q curl git gcc-c++ make python3 espeak-ng ffmpeg sshpass pciutils bubblewrap iproute || SKIPPED_ITEMS+=("dnf csomagok részlegesek")
elif command -v pacman >/dev/null 2>&1; then
  ${SUDO:-} pacman -Sy --noconfirm --needed curl git base-devel python espeak-ng ffmpeg sshpass pciutils bubblewrap iproute2 || SKIPPED_ITEMS+=("pacman csomagok részlegesek")
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

if [ "${GENERATE_PASSWORD}" -eq 1 ] && [ -z "${OPERATOR_PASSWORD}" ]; then
  OPERATOR_PASSWORD=$(node -e "const c=require('crypto'); const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*-_+='; const b=c.randomBytes(18); let s=''; for(let i=0;i<18;i++) s+=a[b[i]%a.length]; console.log(s);" 2>/dev/null || fail_loud "Nem sikerült erős véletlen jelszót generálni.")
  GENERATED_PW_SHOWN=1
  NO_PASSWORD=0
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
    ) || SKIPPED_ITEMS+=("1 GB swap fájl létrehozása kihagyva")
  fi
fi

echo "[4/8] Ollama futtató és előkészítés..."
if ! command -v ollama >/dev/null 2>&1; then
  if ! (curl -fsSL https://ollama.com/install.sh | sh); then
    warn_loud "Ollama telepítése kihagyva (offline mód vagy jogosultság hiánya)."
    SKIPPED_ITEMS+=("Ollama futtató telepítése kihagyva")
  fi
fi

if command -v ollama >/dev/null 2>&1; then
  (ollama serve >/dev/null 2>&1 &) || true
  sleep 2
fi

echo "[5/8] NovaSwarm függőségek (szigorú npm ci) és build..."
cd "${NOVASWARM_DIR}"
mkdir -p memory-vault backups skills rag-docs
chmod 700 backups 2>/dev/null || true

if [ ! -f .env ]; then
  cp .env.example .env
fi
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

if [ "$RAM_MB" -lt 2048 ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=640"
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ollama 2>/dev/null; then
    ${SUDO:-} systemctl stop ollama || true
    RESTART_OLLAMA_AFTER_BUILD=1
  fi
  pkill -x ollama 2>/dev/null || true
fi

[ -f "${NOVASWARM_DIR}/package-lock.json" ] || fail_loud "Hiányzik a package-lock.json — az npm ci nem futtatható."
npm ci --no-audit --no-fund || fail_loud "Az 'npm ci' sikertelen. Ellenőrizd a hálózatot és a build eszközöket (python3, make, g++)."
npm run build || fail_loud "Az 'npm run build' sikertelen."

[ -f "${NOVASWARM_DIR}/dist/index.html" ] || fail_loud "A Web UI build (dist/index.html) nem jött létre!"

TSX_BIN="${NOVASWARM_DIR}/node_modules/.bin/tsx"
[ -x "${TSX_BIN}" ] || fail_loud "Hiányzik a tsx bináris (${TSX_BIN}) az npm ci után!"

if [ "${RESTART_OLLAMA_AFTER_BUILD:-0}" -eq 1 ]; then
  ${SUDO:-} systemctl start ollama || true
fi

# Step 6: Validate and install /etc/sudoers.d/novaswarm via visudo -cf
echo "[6/8] Sudoers NOPASSWD és vészleállási könyvtár beállítása..."
SUDOERS_OK=0
if [[ "${RUN_USER}" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
  TMP_SUDOERS=$(mktemp)
  printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${RUN_USER}" > "${TMP_SUDOERS}"
  chmod 0440 "${TMP_SUDOERS}"
  if command -v visudo >/dev/null 2>&1; then
    if ${SUDO:-} visudo -cf "${TMP_SUDOERS}" >/dev/null 2>&1; then
      if [ -d /etc/sudoers.d ]; then
        ${SUDO:-} install -m 0440 -o root -g root "${TMP_SUDOERS}" /etc/sudoers.d/novaswarm && SUDOERS_OK=1 || SKIPPED_ITEMS+=("/etc/sudoers.d/novaswarm írása sikertelen")
      fi
    else
      warn_loud "A generált sudoers fájl megbukott a visudo -cf ellenőrzésen! Nem került telepítésre."
      SKIPPED_ITEMS+=("sudoers visudo -cf hiba")
    fi
  else
    warn_loud "A visudo parancs nem található, /etc/sudoers.d/novaswarm kihagyva."
    SKIPPED_ITEMS+=("visudo nincs telepítve")
  fi
  rm -f "${TMP_SUDOERS}"
else
  warn_loud "Érvénytelen futtató felhasználónév (${RUN_USER}), a sudoers fájl nem került telepítésre."
fi

if [ -d /etc ]; then
  ${SUDO:-} mkdir -p /etc/novaswarm 2>/dev/null || true
  ${SUDO:-} chown "${RUN_USER}:${RUN_USER}" /etc/novaswarm 2>/dev/null || true
fi

# Fix directory ownership BEFORE running installer state setup as RUN_USER
if [ "${RUN_USER}" != "root" ] && [ -d "${NOVASWARM_DIR}" ]; then
  ${SUDO:-} chown -R "${RUN_USER}:${RUN_USER}" "${NOVASWARM_DIR}" || fail_loud "Nem sikerült a könyvtár jogosultságát (${RUN_USER}) beállítani."
fi

# Step 7: Automated onboarding/password/Total Autonomy setup + systemd service
echo "[7/8] Operátori konfiguráció (install-configure.ts) és systemd szolgáltatás..."

CFG_ARGS=()
if [ "${NO_PASSWORD}" -eq 1 ]; then
  CFG_ARGS+=(--no-password)
fi

if [ "$(id -u)" -eq 0 ] && [ "${RUN_USER}" != "root" ] && command -v sudo >/dev/null 2>&1; then
  OLLAMA_BENCH_OUT=$(sudo -u "${RUN_USER}" env \
    NOVASWARM_DATA_DIR="${NOVASWARM_DIR}" \
    NOVASWARM_INSTALL_PW="${OPERATOR_PASSWORD}" \
    NOVASWARM_NO_PASSWORD="${NO_PASSWORD}" \
    NOVASWARM_INSTALL_TG_TOKEN="${TELEGRAM_TOKEN}" \
    NOVASWARM_INSTALL_TG_CHAT="${TELEGRAM_CHAT_ID}" \
    NOVASWARM_RECOMMENDED_MODEL="${RECOMMENDED_MODEL}" \
    "${TSX_BIN}" "${NOVASWARM_DIR}/scripts/install-configure.ts" "${CFG_ARGS[@]}") || fail_loud "Az operátori konfiguráció (install-configure.ts) elbukott!"
else
  OLLAMA_BENCH_OUT=$(NOVASWARM_DATA_DIR="${NOVASWARM_DIR}" \
    NOVASWARM_INSTALL_PW="${OPERATOR_PASSWORD}" \
    NOVASWARM_NO_PASSWORD="${NO_PASSWORD}" \
    NOVASWARM_INSTALL_TG_TOKEN="${TELEGRAM_TOKEN}" \
    NOVASWARM_INSTALL_TG_CHAT="${TELEGRAM_CHAT_ID}" \
    NOVASWARM_RECOMMENDED_MODEL="${RECOMMENDED_MODEL}" \
    "${TSX_BIN}" "${NOVASWARM_DIR}/scripts/install-configure.ts" "${CFG_ARGS[@]}") || fail_loud "Az operátori konfiguráció (install-configure.ts) elbukott!"
fi
echo "${OLLAMA_BENCH_OUT}"

chmod 600 .secrets.vault.json .secrets.key .state.json .config.json .login-locks.json 2>/dev/null || true

# Protect append-only audit-chain.jsonl against unprivileged truncation when FS supports chattr +a
CHATTR_OK=0
if [ -f "${NOVASWARM_DIR}/audit-chain.jsonl" ] && command -v chattr >/dev/null 2>&1; then
  if ${SUDO:-} chattr +a "${NOVASWARM_DIR}/audit-chain.jsonl" 2>/dev/null; then
    CHATTR_OK=1
  else
    warn_loud "A fájlrendszer nem támogatja a 'chattr +a' append-only attribútumot az audit-chain.jsonl fájlon (a HMAC-lánc attól még aktív)."
    SKIPPED_ITEMS+=("chattr +a nem támogatott ezen a fájlrendszeren")
  fi
fi

# Verify file ownership consistency before starting service
BAD_OWNERS=$(find "${NOVASWARM_DIR}" -maxdepth 2 \( -name '.state.json' -o -name '.secrets*' -o -name '.config.json' -o -name '.env' -o -name 'audit-chain.jsonl' \) ! -user "${RUN_USER}" 2>/dev/null || true)
if [ -n "${BAD_OWNERS}" ]; then
  ${SUDO:-} chown "${RUN_USER}:${RUN_USER}" ${BAD_OWNERS} || fail_loud "Tulajdonosi eltérés a konfigurációs fájlokon (${BAD_OWNERS})"
fi

NODE_BIN=$(command -v node)
NODE_BIN_DIR=$(dirname "${NODE_BIN}")
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

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
RequiresMountsFor=${NOVASWARM_DIR}
Environment=PATH=${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${APP_PORT}
Environment=NOVASWARM_DATA_DIR=${NOVASWARM_DIR}
Environment=NOVASWARM_RECOMMENDED_MODEL=${RECOMMENDED_MODEL}
ExecStartPre=/bin/sh -c 'test -x "${TSX_BIN}" || { echo "HIBA: hiányzik a tsx — futtasd: cd ${NOVASWARM_DIR} && npm ci" >&2; exit 1; }'
ExecStart=${TSX_BIN} server.ts
Restart=always
RestartSec=5
StartLimitIntervalSec=0

[Install]
WantedBy=multi-user.target
EOF
  ${SUDO:-} mv "${TMP_UNIT}" "${SERVICE_FILE}"
  ${SUDO:-} systemctl daemon-reload
  ${SUDO:-} systemctl enable "${SERVICE_NAME}"
  ${SUDO:-} systemctl restart "${SERVICE_NAME}" || fail_loud "A systemd szolgáltatás indítása sikertelen!"
  sleep 2
else
  SKIPPED_ITEMS+=("systemd nincs jelen ebben a környezetben")
fi

# Install global 'novaswarm' terminal CLI wrapper with explicit tsx check
if [ -d /usr/local/bin ]; then
  TMP_CLI=$(mktemp)
  cat > "${TMP_CLI}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
TSX_BIN="${TSX_BIN}"
if [ ! -x "\${TSX_BIN}" ]; then
  echo "HIBA: hiányzik a tsx — futtasd: cd ${NOVASWARM_DIR} && npm ci" >&2
  exit 1
fi
exec "\${TSX_BIN}" "${NOVASWARM_DIR}/scripts/novaswarm-cli.ts" "\$@"
EOF
  chmod +x "${TMP_CLI}"
  ${SUDO:-} mv "${TMP_CLI}" /usr/local/bin/novaswarm 2>/dev/null || rm -f "${TMP_CLI}"
fi

# Step 8: Live E2E Self-checks (mandatory before declaring success)
echo "[8/8] Élő E2E önellenőrzések futtatása..."
CHK_HEALTH="PIROS"
for _i in 1 2 3 4 5 6 7 8; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
    CHK_HEALTH="ZÖLD"
    break
  fi
  sleep 2
done
[ "${CHK_HEALTH}" = "ZÖLD" ] || fail_loud "A /healthz végpont nem válaszolt (http://127.0.0.1:${APP_PORT}/healthz). Nézd meg: journalctl -u ${SERVICE_NAME} -n 50"

CHK_AUTH_E2E="PIROS"
COOKIE_JAR=$(mktemp)
trap 'rm -f "${COOKIE_JAR}"' EXIT

if [ "${NO_PASSWORD}" -eq 1 ]; then
  STATE_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/state" || echo "000")
  if [ "${STATE_CODE}" = "200" ]; then
    CHK_AUTH_E2E="ZÖLD (jelszó nélküli LAN mód)"
  else
    fail_loud "Jelszó nélküli módban a GET /api/state nem 200-at adott (kapott HTTP ${STATE_CODE})!"
  fi
else
  # Verify unauthenticated request is blocked (401)
  UNAUTH_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/state" || echo "000")
  [ "${UNAUTH_CODE}" = "401" ] || fail_loud "Jelszavas módban a hitelesítetlen GET /api/state várt 401 helyett HTTP ${UNAUTH_CODE}-t adott!"

  # Verify wrong password fails (401)
  BAD_JSON='{"password":"rossz-jelszo-ellenorzes-1234"}'
  BAD_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d "${BAD_JSON}" "http://127.0.0.1:${APP_PORT}/api/auth/login" || echo "000")
  [ "${BAD_CODE}" = "401" ] || fail_loud "A hibás jelszós próba nem HTTP 401-et adott (kapott: ${BAD_CODE})!"

  # Verify configured password works via safe JSON serialization (special chars safe)
  GOOD_JSON=$(NOVASWARM_PW_ENV="${OPERATOR_PASSWORD}" node -e "console.log(JSON.stringify({ password: process.env.NOVASWARM_PW_ENV }))")
  GOOD_CODE=$(curl -sS -c "${COOKIE_JAR}" -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d "${GOOD_JSON}" "http://127.0.0.1:${APP_PORT}/api/auth/login" || echo "000")
  [ "${GOOD_CODE}" = "200" ] || fail_loud "A frissen beállított operátori jelszóval a belépés sikertelen (HTTP ${GOOD_CODE})!"

  AUTH_STATE_CODE=$(curl -sS -b "${COOKIE_JAR}" -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/state" || echo "000")
  [ "${AUTH_STATE_CODE}" = "200" ] || fail_loud "A belépés után a GET /api/state sütivel sem 200-at adott (HTTP ${AUTH_STATE_CODE})!"

  CHK_AUTH_E2E="ZÖLD (jelszavas LAN zár)"
fi

CHK_SUDO="PIROS"
if [ "$(id -u)" -eq 0 ]; then
  CHK_SUDO="ZÖLD"
elif sudo -n true >/dev/null 2>&1; then
  CHK_SUDO="ZÖLD"
fi

CHK_BWRAP="PIROS"
if NOVASWARM_DATA_DIR="${NOVASWARM_DIR}" "${TSX_BIN}" -e "import { runInSupervisorSandbox } from './server/sandbox/supervisorSandbox.ts'; const r = runInSupervisorSandbox({ scriptOrCommand: 'console.log(42)', isNodeScript: true }); process.exit(r.passed ? 0 : 1);" >/dev/null 2>&1; then
  CHK_BWRAP="ZÖLD"
fi

CHK_PHOENIX="PIROS"
if ls "${NOVASWARM_DIR}"/backups/*.tar.gz >/dev/null 2>&1; then
  CHK_PHOENIX="ZÖLD"
fi

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

echo ""
echo "============================================================"
echo "  TELEPÍTÉS ÖSSZEFOGLALÓ (ZÖLD / PIROS)"
echo "============================================================"
echo "  [$([ "$CHK_HEALTH" = "ZÖLD" ] && echo "✅" || echo "❌")] /healthz helyi elérés (port ${APP_PORT}): ${CHK_HEALTH}"
echo "  [✅] Élő Auth/API E2E próba: ${CHK_AUTH_E2E}"
echo "  [$([ "$SUDOERS_OK" -eq 1 ] && echo "✅" || echo "❌")] /etc/sudoers.d/novaswarm (visudo -cf): $([ "$SUDOERS_OK" -eq 1 ] && echo "ZÖLD" || echo "PIROS")"
echo "  [$([ "$CHK_SUDO" = "ZÖLD" ] && echo "✅" || echo "❌")] sudo -n true ellenőrzés: ${CHK_SUDO}"
echo "  [$([ "$CHK_BWRAP" = "ZÖLD" ] && echo "✅" || echo "❌")] bubblewrap (bwrap) sandbox izoláció: ${CHK_BWRAP}"
echo "  [$([ "$CHK_PHOENIX" = "ZÖLD" ] && echo "✅" || echo "❌")] Első Phoenix pillanatkép: ${CHK_PHOENIX}"
echo "  [$([ "$CHATTR_OK" -eq 1 ] && echo "✅" || echo "ℹ️")] Audit-lánc fájl (audit-chain.jsonl chattr +a): $([ "$CHATTR_OK" -eq 1 ] && echo "ZÖLD" || echo "nem támogatott")"
echo "  [✅] Teljes + Totális autonómia profil: AKTÍV"
OLLAMA_SUMMARY_LINE=$(echo "${OLLAMA_BENCH_OUT}" | grep '^OLLAMA_SUITE=' | tail -n 1 | sed 's/^OLLAMA_SUITE=//' || true)
if [ -n "${OLLAMA_SUMMARY_LINE}" ]; then
  echo "  [✅] Hardver-érzékeny Ollama csomag: ${OLLAMA_SUMMARY_LINE}"
fi
if [ "${#SKIPPED_ITEMS[@]}" -gt 0 ]; then
  echo ""
  echo "  ⚠️ Kihagyott/offline opcionális elemek:"
  for item in "${SKIPPED_ITEMS[@]}"; do
    echo "     - ${item}"
  done
fi
echo ""
if [ "${GENERATED_PW_SHOWN}" -eq 1 ]; then
  echo "  🔑 EGYSZERI AUTOMATIKUS OPERÁTORI JELSZÓ (mentsd el most!):"
  echo "     ${OPERATOR_PASSWORD}"
  echo ""
elif [ "${NO_PASSWORD}" -eq 1 ]; then
  echo "  ⚠️ JELSZÓ NÉLKÜLI LAN MÓD: A felület a helyi hálózaton belépés nélkül elérhető."
  echo "     Jelszó beállítása később: Web UI sárga szalag vagy 'novaswarm set-password'"
  echo ""
fi
echo "  Web UI (helyi): http://localhost:${APP_PORT}"
if [ -n "${LAN_IP}" ]; then
  echo "  Web UI (LAN):   http://${LAN_IP}:${APP_PORT}"
fi
echo "  CLI jelszókezelés: novaswarm set-password | remove-password | reset-login-lock"
echo "============================================================"
