#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THE_TOWER_ROOT="${THE_TOWER_ROOT:-/opt/thetower}"
ENV_FILE="${ENV_FILE:-$THE_TOWER_ROOT/backend/thetower.env}"
JAR_PATH="${JAR_PATH:-$THE_TOWER_ROOT/backend/thetower-backend-all.jar}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

mkdir -p "$THE_TOWER_ROOT/data" "$THE_TOWER_ROOT/data/runs" "$THE_TOWER_ROOT/data/logs"

export PORT="${PORT:-8080}"
export THETOWER_BROWSER="${THETOWER_BROWSER:-chromium}"
export THETOWER_HEADLESS="${THETOWER_HEADLESS:-true}"
export THETOWER_DEFAULT_TIMEOUT_MS="${THETOWER_DEFAULT_TIMEOUT_MS:-10000}"

cd "$THE_TOWER_ROOT"
exec java -jar "$JAR_PATH"