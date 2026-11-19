#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NovaSwarm One-Command Linux Installer
# Checks dependencies, profiles hardware, recommends & installs Ollama model,
# builds NovaSwarm, registers systemd service, and opens the Web Setup Wizard.
# ==============================================================================

NOVASWARM_DIR="${NOVASWARM_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE_NAME="novaswarm"
DEFAULT_PORT=3000

echo "============================================================"
echo "  NovaSwarm — Autonóm AI Ágens Raj Telepítő"
echo "============================================================"

# Minimal terminal interaction: only port if stdin is interactive
APP_PORT="${NOVASWARM_PORT:-$DEFAULT_PORT}"
if [ -t 0 ]; then
  read -r -p "Web UI port [${APP_PORT}]: " USER_PORT || true
  APP_PORT="${USER_PORT:-$APP_PORT}"
fi

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

echo "[1/6] Rendszerfüggőségek ellenőrzése..."
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq curl git build-essential python3 make g++ espeak-ng pciutils lm-sensors bubblewrap iproute2 >/dev/null || true
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y -q curl git gcc-c++ make python3 espeak-ng pciutils bubblewrap iproute || true
elif command -v pacman >/dev/null 2>&1; then
  $SUDO pacman -Sy --noconfirm --needed curl git base-devel python espeak-ng pciutils bubblewrap iproute2 || true
fi

# Node.js >= 20 check
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
else
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    NEED_NODE=1
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "[2/6] Node.js 22 LTS telepítése..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | ${SUDO:-} bash -
  ${SUDO:-} apt-get install -y -qq nodejs
else
  echo "[2/6] Node.js $(node -v) rendben."
fi

# Hardware profiling for Ollama recommendation & memory safety
echo "[3/6] Hardver profilozása..."
CPU_CORES=$(nproc 2>/dev/null || echo 2)
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 4194304)
RAM_MB=$(( RAM_KB / 1024 ))
RAM_GB=$(( (RAM_MB + 512) / 1024 ))
SWAP_KB=$(grep SwapTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
SWAP_MB=$(( SWAP_KB / 1024 ))
HAS_GPU=0
GPU_INFO="none"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  HAS_GPU=1
  GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
elif command -v lspci >/dev/null 2>&1 && lspci | grep -qiE 'VGA|3D|Display'; then
  GPU_INFO=$(lspci | grep -iE 'VGA|3D|Display' | head -n 1)
fi

if [ "$HAS_GPU" -eq 1 ] || [ "$RAM_MB" -ge 15000 ]; then
  RECOMMENDED_MODEL="qwen2.5-coder:7b"
elif [ "$RAM_MB" -ge 7500 ]; then
  RECOMMENDED_MODEL="qwen2.5:3b"
else
  RECOMMENDED_MODEL="qwen2.5:1.5b"
fi

echo "  CPU magok: ${CPU_CORES} | RAM: ${RAM_MB} MB (~${RAM_GB} GB) | Swap: ${SWAP_MB} MB | GPU/iGPU: ${GPU_INFO}"
echo "  Ajánlott lokális Ollama modell: ${RECOMMENDED_MODEL}"

# Low-RAM (< 1.5 GB) swap guard so vite build & node-pty never OOM-kill on Raspberry Pi / small VPS
if [ "$RAM_MB" -lt 1536 ] && [ "$SWAP_MB" -lt 512 ]; then
  AVAIL_KB=$(df -k / | awk 'NR==2 {print $4}' || echo 0)
  if [ "$AVAIL_KB" -gt 3145728 ] && [ ! -f /swapfile ] && command -v swapon >/dev/null 2>&1; then
    echo "  Kevés fizikai RAM (<1.5 GB) és kevés swap észlelve — 1 GB /swapfile létrehozása a stabil buildhez..."
    (
      ${SUDO:-} fallocate -l 1G /swapfile 2>/dev/null || ${SUDO:-} dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
      ${SUDO:-} chmod 600 /swapfile
      ${SUDO:-} mkswap /swapfile >/dev/null
      ${SUDO:-} swapon /swapfile
      if ! grep -q '^/swapfile ' /etc/fstab 2>/dev/null; then
        echo '/swapfile none swap sw 0 0' | ${SUDO:-} tee -a /etc/fstab >/dev/null
      fi
    ) || echo "  Figyelem: swap létrehozása kihagyva (nem kritikus, --max-old-space-size=512 használatban)."
  fi
fi

# Install Ollama & pull recommended model
echo "[4/6] Ollama futtató és lokális modell beállítása..."
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh || echo "Figyelem: Ollama telepítése kihagyva (nincs jogosultság vagy hálózat)."
fi

if command -v ollama >/dev/null 2>&1; then
  (ollama serve >/dev/null 2>&1 &) || true
  sleep 2
  ollama pull "${RECOMMENDED_MODEL}" || echo "Figyelem: Modell letöltése sikertelen, a Web UI-ban később pótolható."
fi

# Build NovaSwarm
echo "[5/6] NovaSwarm függőségek telepítése és build..."
cd "${NOVASWARM_DIR}"
mkdir -p memory-vault backups skills
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
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=512"
  # Free RAM during Vite build on 1 GB hosts if ollama systemd service is running
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ollama 2>/dev/null; then
    ${SUDO:-} systemctl stop ollama || true
    RESTART_OLLAMA_AFTER_BUILD=1
  fi
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

# Register systemd service
echo "[6/6] systemd szolgáltatás létrehozása..."
RUN_USER="${SUDO_USER:-$(whoami)}"
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
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
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
  if ! ${SUDO:-} systemctl is-active --quiet "${SERVICE_NAME}"; then
    echo "HIBA: A ${SERVICE_NAME} szolgáltatás nem maradt aktív indulás után!"
    ${SUDO:-} systemctl status "${SERVICE_NAME}" --no-pager || true
    ${SUDO:-} journalctl -u "${SERVICE_NAME}" -n 40 --no-pager || true
    exit 1
  fi

  # Verify HTTP listener responds locally
  READY=0
  for _i in 1 2 3 4 5; do
    if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 1
  done
  if [ "$READY" -ne 1 ]; then
    echo "FIGYELEM: A systemd szolgáltatás fut, de a 127.0.0.1:${APP_PORT}/healthz még nem válaszolt:"
    ${SUDO:-} journalctl -u "${SERVICE_NAME}" -n 30 --no-pager || true
  fi
else
  echo "systemd nem érhető el ebben a környezetben; közvetlen indítás: PORT=${APP_PORT} npm start"
fi

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
TARGET_URL="http://${LAN_IP:-localhost}:${APP_PORT}"
echo "============================================================"
echo "  Telepítés kész! Nyisd meg:"
echo "  Lokálisan: http://localhost:${APP_PORT}"
if [ -n "${LAN_IP}" ]; then
  echo "  Hálózaton: http://${LAN_IP}:${APP_PORT}"
fi
echo "  Minden további beállítás a grafikus Setup Wizardban történik."
echo "============================================================"

if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  xdg-open "http://localhost:${APP_PORT}" >/dev/null 2>&1 &
fi
