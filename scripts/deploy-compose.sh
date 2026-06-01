#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-aiosk}"
MONITORING_PROFILE="${MONITORING_PROFILE:-0}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
RUN_SMOKE="${RUN_SMOKE:-0}"
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-0}"

if [ "$#" -ne 0 ]; then
  echo "Usage: $0" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  echo "Copy .env.production.example to .env.production and set image tags and secrets." >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  local line value
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
    fi
    if [[ "$line" == "$key="* ]]; then
      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi
      printf '%s' "$value"
      return 0
    fi
  done < "$ENV_FILE"
}

validate_env_file_syntax() {
  local line line_number
  line_number=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
    fi
    if ! [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      echo "malformed env line $line_number in $ENV_FILE" >&2
      exit 1
    fi
  done < "$ENV_FILE"
}

wait_for_database() {
  local attempt container_id health_status
  for attempt in $(seq 1 30); do
    container_id="$(docker compose "${COMPOSE_ARGS[@]}" ps -q db || true)"
    if [ -n "$container_id" ]; then
      health_status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [ "$health_status" = "healthy" ] || [ "$health_status" = "running" ]; then
        return 0
      fi
    fi
    sleep 2
  done

  echo "Database did not become ready before migrations." >&2
  docker compose "${COMPOSE_ARGS[@]}" ps >&2 || true
  exit 1
}

if [ "$MONITORING_PROFILE" != "0" ] && [ "$MONITORING_PROFILE" != "1" ]; then
  echo "MONITORING_PROFILE must be 0 or 1." >&2
  exit 1
fi

if [ "$RUN_MIGRATIONS" != "0" ] && [ "$RUN_MIGRATIONS" != "1" ]; then
  echo "RUN_MIGRATIONS must be 0 or 1." >&2
  exit 1
fi

if [ "$RUN_SMOKE" != "0" ] && [ "$RUN_SMOKE" != "1" ]; then
  echo "RUN_SMOKE must be 0 or 1." >&2
  exit 1
fi

if [ "$SKIP_PREFLIGHT" != "0" ] && [ "$SKIP_PREFLIGHT" != "1" ]; then
  echo "SKIP_PREFLIGHT must be 0 or 1." >&2
  exit 1
fi

validate_env_file_syntax

if [ "$SKIP_PREFLIGHT" != "1" ]; then
  PREFLIGHT_ENV_FILE="$ENV_FILE" \
  PREFLIGHT_COMPOSE_FILE="$COMPOSE_FILE" \
  bash "$ROOT_DIR/scripts/production-preflight.sh"
fi

COMPOSE_ARGS=(-p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
if [ "$MONITORING_PROFILE" = "1" ]; then
  COMPOSE_ARGS=(--profile monitoring "${COMPOSE_ARGS[@]}")
fi

docker compose "${COMPOSE_ARGS[@]}" pull
if [ "$RUN_MIGRATIONS" = "1" ]; then
  ENV_DB_NAME="$(read_env_value COMPOSE_DB_NAME || true)"
  MIGRATION_DB_NAME="${COMPOSE_DB_NAME:-${ENV_DB_NAME:-kiosk_db}}"
  echo "Starting database service before migrations"
  docker compose "${COMPOSE_ARGS[@]}" up -d db
  echo "Waiting for database readiness before migrations"
  wait_for_database
  echo "Running database migrations for $MIGRATION_DB_NAME"
  docker compose "${COMPOSE_ARGS[@]}" run --rm --no-deps \
    -e "CONFIRM_MIGRATION_APPLY=$MIGRATION_DB_NAME" \
    backend node scripts/db-migrate.js up
else
  echo "Skipping database migrations because RUN_MIGRATIONS=0"
fi
docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans
docker compose "${COMPOSE_ARGS[@]}" ps

if [ "$RUN_SMOKE" = "1" ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "RUN_SMOKE=1 requires node on the deployment host." >&2
    exit 1
  fi

  if [ -z "${SMOKE_METRICS_TOKEN:-}" ]; then
    ENV_METRICS_TOKEN="$(read_env_value METRICS_TOKEN || true)"
    if [ -n "$ENV_METRICS_TOKEN" ]; then
      export SMOKE_METRICS_TOKEN="$ENV_METRICS_TOKEN"
    else
      ENV_METRICS_TOKEN_FILE="$(read_env_value METRICS_TOKEN_FILE || true)"
      if [ "$ENV_METRICS_TOKEN_FILE" = "/run/secrets/metrics_token" ]; then
        ENV_SECRETS_DIR="$(read_env_value AIOSK_SECRETS_DIR || true)"
        ENV_SECRETS_DIR="${ENV_SECRETS_DIR:-/run/secrets}"
        ENV_METRICS_TOKEN_SOURCE="$ENV_SECRETS_DIR/metrics_token"
        if [ -r "$ENV_METRICS_TOKEN_SOURCE" ]; then
          ENV_FILE_METRICS_TOKEN="$(tr -d '\r\n' < "$ENV_METRICS_TOKEN_SOURCE")"
          if [ -n "$ENV_FILE_METRICS_TOKEN" ]; then
            export SMOKE_METRICS_TOKEN="$ENV_FILE_METRICS_TOKEN"
          fi
        fi
      fi
    fi
  fi

  ENV_BACKEND_PORT="$(read_env_value COMPOSE_BACKEND_PORT || true)"
  SMOKE_BACKEND_PORT="${COMPOSE_BACKEND_PORT:-${ENV_BACKEND_PORT:-3000}}"
  SMOKE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:${SMOKE_BACKEND_PORT}}"
  echo "Running deployment smoke against $SMOKE_URL"
  SMOKE_BASE_URL="$SMOKE_URL" node "$ROOT_DIR/scripts/ops-smoke.js"
fi

echo "Deployment finished for project $PROJECT_NAME using $COMPOSE_FILE and $ENV_FILE"
