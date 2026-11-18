#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NovaSwarm Uninstaller
# Stops and removes systemd service, offers final backup of memory/keys,
# and optionally removes build artifacts (node_modules, dist).
# ==============================================================================

NOVASWARM_DIR="${NOVASWARM_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE_NAME="novaswarm"
cd "${NOVASWARM_DIR}"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "${SERVICE_NAME}.service"; then
  echo "[1/3] systemd szolgáltatás leállítása és eltávolítása..."
  $SUDO systemctl stop "${SERVICE_NAME}" || true
  $SUDO systemctl disable "${SERVICE_NAME}" || true
  $SUDO rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  $SUDO systemctl daemon-reload
else
  echo "[1/3] Aktív systemd szolgáltatás nem található."
fi

read -r -p "Szeretnél egy végső biztonsági mentést a memóriáról és kulcsokról törlés előtt? [I/n]: " DO_BACKUP || true
if [[ "${DO_BACKUP:-I}" =~ ^[IiYy]$ ]]; then
  OUT_ARCHIVE="${HOME}/novaswarm-final-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "${OUT_ARCHIVE}" --ignore-failed-read .env .config.json .state.json memory-vault skills 2>/dev/null || true
  echo "Mentés elkészítve: ${OUT_ARCHIVE}"
fi

read -r -p "Eltávolítsam a build mappákat is (node_modules, dist)? [i/N]: " REMOVE_BUILD || true
if [[ "${REMOVE_BUILD:-N}" =~ ^[IiYy]$ ]]; then
  rm -rf node_modules dist
  echo "Build mappák eltávolítva."
fi

echo "NovaSwarm eltávolítás befejezve."
