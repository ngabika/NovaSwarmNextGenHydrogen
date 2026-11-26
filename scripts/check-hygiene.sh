#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[hygiene] NovaSwarm repo higiénia ellenőrzése (${ROOT_DIR})..."

FAIL=0

# 1. Conflicting lockfile check
if [ -e "bun.lock" ] || [ -e "bun.lockb" ]; then
  echo "HIBA: Nem kívánt bun.lock / bun.lockb fájl található a repó gyökerében! Használj egységesen package-lock.json-t." >&2
  FAIL=1
fi

# 2. package-lock.json & npm ci --dry-run
if [ ! -f "package-lock.json" ]; then
  echo "HIBA: Hiányzik a package-lock.json a repó gyökeréből!" >&2
  FAIL=1
fi

# 3. Verify .gitignore covers all runtime/secret files
REQUIRED_IGNORES=(
  ".env"
  ".secrets*"
  ".state.json*"
  ".config.json"
  ".novaswarm-setup.log"
  ".login-locks.json"
  "audit-chain.jsonl*"
  "novaswarm.sqlite*"
  "backups/"
)
for pattern in "${REQUIRED_IGNORES[@]}"; do
  if ! grep -Fq -- "${pattern}" .gitignore; then
    echo "HIBA: A .gitignore nem tartalmazza a kötelező mintát: ${pattern}" >&2
    FAIL=1
  fi
done

# 4. Forbidden leftover runtime/backup artifacts in repo root (if git exists, check tracked; otherwise check root files)
if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
  TRACKED_SECRETS=$(git ls-files | grep -E '(^|/)\.(env(\..+)?|secrets.*|state\.json.*|config\.json|login-locks\.json|novaswarm-setup\.log)$|(^|/)audit-chain.*\.jsonl$|(^|/)bun\.lockb?$' || true)
  if [ -n "${TRACKED_SECRETS}" ]; then
    echo "HIBA: Érzékeny vagy tiltott futásidejű fájlok vannak Git alatt:" >&2
    echo "${TRACKED_SECRETS}" >&2
    FAIL=1
  fi
else
  for leftover in .env .secrets.key .secrets.vault.json .state.json .state.json.bak1 .config.json .novaswarm-setup.log .login-locks.json audit-chain.jsonl; do
    if [ -e "${leftover}" ]; then
      echo "FIGYELEM: Futásidejű maradványfájl a repó gyökerében: ${leftover}" >&2
    fi
  done
fi

if command -v npm >/dev/null 2>&1; then
  if ! npm ci --dry-run >/dev/null 2>&1; then
    echo "HIBA: Az 'npm ci --dry-run' elbukott — szinkronizáld a package.json és package-lock.json fájlokat!" >&2
    FAIL=1
  fi
fi

if [ "${FAIL}" -ne 0 ]; then
  exit 1
fi

echo "[hygiene] Minden higiénia-ellenőrzés sikeres."
