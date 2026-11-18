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

# Minimal terminal interaction: only port if user wants non-default
read -r -p "Web UI port [${DEFAULT_PORT}]: " USER_PORT || true
APP_PORT="${USER_PORT:-$DEFAULT_PORT}"

echo "[1/6] Rendszerfüggőségek ellenőrzése..."
if command -v apt-get >/dev/null 2>&1; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  fi
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq curl git build-essential python3 make g++ espeak-ng pciutils lm-sensors bubblewrap >/dev/null || true
elif command -v dnf >/dev/null 2>&1; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
  $SUDO dnf install -y -q curl git gcc-c++ make python3 espeak-ng pciutils bubblewrap || true
elif command -v pacman >/dev/null 2>&1; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
  $SUDO pacman -Sy --noconfirm --needed curl git base-devel python espeak-ng pciutils bubblewrap || true
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

# Hardware profiling for Ollama recommendation
echo "[3/6] Hardver profilozása..."
CPU_CORES=$(nproc 2>/dev/null || echo 2)
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 4194304)
RAM_GB=$(( RAM_KB / 1024 / 1024 ))
HAS_GPU=0
GPU_INFO="none"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  HAS_GPU=1
  GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
elif command -v lspci >/dev/null 2>&1 && lspci | grep -qiE 'VGA|3D|Display'; then
  GPU_INFO=$(lspci | grep -iE 'VGA|3D|Display' | head -n 1)
fi

if [ "$HAS_GPU" -eq 1 ] || [ "$RAM_GB" -ge 16 ]; then
  RECOMMENDED_MODEL="qwen2.5-coder:7b"
elif [ "$RAM_GB" -ge 8 ]; then
  RECOMMENDED_MODEL="qwen2.5:3b"
else
  RECOMMENDED_MODEL="qwen2.5:1.5b"
fi

echo "  CPU magok: ${CPU_CORES} | RAM: ${RAM_GB} GB | GPU/iGPU: ${GPU_INFO}"
echo "  Ajánlott lokális Ollama modell: ${RECOMMENDED_MODEL}"

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
  sed -i "s/^PORT=.*/PORT=${APP_PORT}/" .env
  sed -i "s|^APP_URL=.*|APP_URL=\"http://localhost:${APP_PORT}\"|" .env
fi

npm install --no-audit --no-fund
npm run build

# Register systemd service
echo "[6/6] systemd szolgáltatás létrehozása..."
RUN_USER="${SUDO_USER:-$(whoami)}"
NODE_BIN="$(command -v node)"
NPX_BIN="$(command -v npx)"
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
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=NOVASWARM_RECOMMENDED_MODEL=${RECOMMENDED_MODEL}
ExecStart=${NPX_BIN} tsx server.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  ${SUDO:-} mv "${TMP_UNIT}" "${SERVICE_FILE}"
  ${SUDO:-} systemctl daemon-reload
  ${SUDO:-} systemctl enable "${SERVICE_NAME}"
  ${SUDO:-} systemctl restart "${SERVICE_NAME}"
else
  echo "systemd nem érhető el ebben a környezetben; közvetlen indítás: PORT=${APP_PORT} npm start"
fi

TARGET_URL="http://localhost:${APP_PORT}"
echo "============================================================"
echo "  Telepítés kész! Nyisd meg: ${TARGET_URL}"
echo "  Minden további beállítás a grafikus Setup Wizardban történik."
echo "============================================================"

if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  xdg-open "${TARGET_URL}" >/dev/null 2>&1 &
fi
