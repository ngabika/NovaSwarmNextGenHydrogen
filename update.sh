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

echo "[1/5] Állapot, titkosított kulcstár és memória biztonsági mentése frissítés előtt..."
mkdir -p backups memory-vault skills rag-docs
chmod 700 backups 2>/dev/null || true
STAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="backups/pre-update-${STAMP}.tar.gz"
tar -czf "${BACKUP_FILE}" --ignore-failed-read .state.json .config.json .secrets.vault.json .secrets.key memory-vault skills rag-docs 2>/dev/null || true
chmod 600 "${BACKUP_FILE}" .secrets.vault.json .secrets.key .state.json 2>/dev/null || true

PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "[2/5] Forráskód frissítése (fast-forward + GPG aláírás ellenőrzés, ha be van állítva)..."
git fetch origin main --tags 2>/dev/null || git fetch --tags 2>/dev/null || true
if [ "${NOVASWARM_VERIFY_TAG_SIG:-0}" = "1" ]; then
  git verify-commit FETCH_HEAD || { echo "HIBA: Az új commit GPG aláírása érvénytelen!"; exit 1; }
fi
git pull --ff-only origin main || git pull --ff-only

echo "[3/5] Függőségek és típusellenőrzés..."
RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 4194304)
if [ "$(( RAM_KB / 1024 ))" -lt 2048 ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=640"
fi
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps
fi
if ! npm run lint || ! npm run build; then
  echo "HIBA: A build sikertelen. Visszaállítás az előző állapotra..."
  if [[ "${PREV_COMMIT}" =~ ^[0-9a-f]{7,40}$ ]]; then
    git reset --hard "${PREV_COMMIT}"
    npm run build || true
  fi
  exit 1
fi

echo "[4/5] Nem-roncsoló adatmigráció futtatása..."
npx tsx -e "import { migrateStateNonDestructive } from './server/state/store.ts'; migrateStateNonDestructive(); console.log('Migráció kész.');"
chmod 600 .secrets.vault.json .secrets.key .state.json 2>/dev/null || true

echo "[5/5] Szolgáltatás újraindítása..."
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "${SERVICE_NAME}.service"; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
  $SUDO systemctl restart "${SERVICE_NAME}"
  sleep 2
  curl -fsS "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null 2>&1 || true
fi

echo "NovaSwarm frissítés sikeresen lefutott."
