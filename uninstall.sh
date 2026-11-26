#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NovaSwarm Safe Uninstaller
# - Supports --service-only to remove systemd unit/CLI without touching node_modules
# - Separates backup, systemd service removal, and build folder cleanup clearly
# - NEVER deletes node_modules/dist without explicit 'igen'/'i' confirmation
# ==============================================================================

NOVASWARM_DIR="${NOVASWARM_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE_NAME="novaswarm"
cd "${NOVASWARM_DIR}"

SERVICE_ONLY=0
AUTO_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --service-only) SERVICE_ONLY=1; shift ;;
    --yes|-y) AUTO_YES=1; shift ;;
    *) echo "Ismeretlen kapcsoló: $1" >&2; exit 1 ;;
  esac
done

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
  echo "[1/3] systemd szolgáltatás leállítása és eltávolítása..."
  $SUDO systemctl stop "${SERVICE_NAME}" || true
  $SUDO systemctl disable "${SERVICE_NAME}" || true
  $SUDO rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  $SUDO systemctl daemon-reload
else
  echo "[1/3] Aktív systemd szolgáltatás nem található."
fi

if [ -f /usr/local/bin/novaswarm ]; then
  $SUDO rm -f /usr/local/bin/novaswarm || true
  echo "  Globális /usr/local/bin/novaswarm parancs eltávolítva."
fi

if [ "${SERVICE_ONLY}" -eq 1 ]; then
  echo "[2/3] --service-only mód: a node_modules, dist és felhasználói adatok érintetlenek maradtak."
  echo "NovaSwarm szolgáltatás-eltávolítás kész."
  exit 0
fi

if [ -t 0 ] && [ "${AUTO_YES}" -eq 0 ]; then
  read -r -p "[2/3] Szeretnél egy végső biztonsági mentést a memóriáról, állapotról és kulcsokról? [I/n]: " DO_BACKUP || true
else
  DO_BACKUP="I"
fi
if [[ "${DO_BACKUP:-I}" =~ ^[IiYy]$ ]]; then
  OUT_ARCHIVE="${HOME}/novaswarm-final-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "${OUT_ARCHIVE}" --ignore-failed-read .env .config.json .state.json .secrets.vault.json .secrets.key audit-chain.jsonl memory-vault skills 2>/dev/null || true
  chmod 600 "${OUT_ARCHIVE}" 2>/dev/null || true
  echo "Mentés elkészítve: ${OUT_ARCHIVE}"
fi

REMOVE_BUILD="N"
if [ -t 0 ] && [ "${AUTO_YES}" -eq 0 ]; then
  read -r -p "[3/3] Eltávolítsam a build mappákat is (node_modules, dist) [VIGYÁZAT: eltávolítja a tsx-et is]? (írd be: igen / [N]): " REMOVE_BUILD || true
fi
if [[ "${REMOVE_BUILD}" =~ ^(igen|IGEN|i|I|yes|YES)$ ]]; then
  rm -rf node_modules dist
  echo "Build mappák eltávolítva (újraépítéshez később: npm ci && npm run build)."
else
  echo "A node_modules és dist mappák megmaradtak."
fi

echo "NovaSwarm eltávolítás befejezve."
