#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NovaSwarm Non-Destructive OTA Updater
# Pulls latest Git changes, backs up state & memory, migrates schema safely,
# rebuilds, and restarts systemd service with automatic rollback on failure.
# ==============================================================================

NOVASWARM_DIR="${NOVASWARM_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE_NAME="novaswarm"
cd "${NOVASWARM_DIR}"

echo "[1/5] Állapot és memória biztonsági mentése frissítés előtt..."
mkdir -p backups
STAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="backups/pre-update-${STAMP}.tar.gz"
tar -czf "${BACKUP_FILE}" --ignore-failed-read .state.json .config.json memory-vault skills 2>/dev/null || true

PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "[2/5] Forráskód frissítése..."
git pull --ff-only

echo "[3/5] Függőségek és típusellenőrzés..."
npm install --no-audit --no-fund
if ! npm run lint || ! npm run build; then
  echo "HIBA: A build sikertelen. Visszaállítás az előző állapotra..."
  if [ -n "${PREV_COMMIT}" ]; then
    git reset --hard "${PREV_COMMIT}"
    npm run build || true
  fi
  exit 1
fi

echo "[4/5] Nem-roncsoló adatmigráció futtatása..."
npx tsx -e "import { migrateStateNonDestructive } from './server/state/store.ts'; migrateStateNonDestructive(); console.log('Migráció kész.');"

echo "[5/5] Szolgáltatás újraindítása..."
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "${SERVICE_NAME}.service"; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
  $SUDO systemctl restart "${SERVICE_NAME}"
fi

echo "NovaSwarm frissítés sikeresen lefutott."
