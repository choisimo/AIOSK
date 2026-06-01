#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_SSH_HOST="${DEPLOY_SSH_HOST:-}"
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_REMOTE_PATH="${DEPLOY_REMOTE_PATH:-/opt/aiosk}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.env.production}"
SSH_KEY_FILE="${SSH_KEY_FILE:-}"
SSH_KNOWN_HOSTS_FILE="${SSH_KNOWN_HOSTS_FILE:-}"
AIOSK_BACKEND_IMAGE="${AIOSK_BACKEND_IMAGE:-}"
AIOSK_FRONTEND_IMAGE="${AIOSK_FRONTEND_IMAGE:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-aiosk}"
MONITORING_PROFILE="${MONITORING_PROFILE:-0}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
RUN_SMOKE="${RUN_SMOKE:-0}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-}"

if [ "$#" -ne 0 ]; then
  echo "Usage: $0" >&2
  exit 1
fi

require_value() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "$name is required." >&2
    exit 1
  fi
}

require_value DEPLOY_SSH_HOST "$DEPLOY_SSH_HOST"
require_value DEPLOY_SSH_USER "$DEPLOY_SSH_USER"
require_value AIOSK_BACKEND_IMAGE "$AIOSK_BACKEND_IMAGE"
require_value AIOSK_FRONTEND_IMAGE "$AIOSK_FRONTEND_IMAGE"

if ! [[ "$DEPLOY_SSH_PORT" =~ ^[1-9][0-9]*$ ]] || [ "${#DEPLOY_SSH_PORT}" -gt 5 ] || [ "$DEPLOY_SSH_PORT" -gt 65535 ]; then
  echo "DEPLOY_SSH_PORT must be a positive integer between 1 and 65535." >&2
  exit 1
fi

if ! [[ "$DEPLOY_REMOTE_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]] || [ "$DEPLOY_REMOTE_PATH" = "/" ]; then
  echo "DEPLOY_REMOTE_PATH must be an absolute non-root path containing only letters, numbers, dot, underscore, dash, and slash." >&2
  exit 1
fi

if ! [[ "$DEPLOY_ENV_FILE" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_ENV_FILE must contain only letters, numbers, dot, underscore, dash, and slash." >&2
  exit 1
fi

if ! [[ "$COMPOSE_PROJECT_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "COMPOSE_PROJECT_NAME must contain only letters, numbers, underscore, and dash." >&2
  exit 1
fi

if ! [[ "$AIOSK_BACKEND_IMAGE" =~ ^[A-Za-z0-9._/:@-]+$ ]] || ! [[ "$AIOSK_FRONTEND_IMAGE" =~ ^[A-Za-z0-9._/:@-]+$ ]]; then
  echo "AIOSK image references contain unsupported characters." >&2
  exit 1
fi

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

if [ -n "$SSH_KEY_FILE" ] && { [ ! -r "$SSH_KEY_FILE" ] || [ ! -s "$SSH_KEY_FILE" ]; }; then
  echo "SSH_KEY_FILE must point to a readable non-empty file." >&2
  exit 1
fi

if [ -n "$SSH_KNOWN_HOSTS_FILE" ] && { [ ! -r "$SSH_KNOWN_HOSTS_FILE" ] || [ ! -s "$SSH_KNOWN_HOSTS_FILE" ]; }; then
  echo "SSH_KNOWN_HOSTS_FILE must point to a readable non-empty file." >&2
  exit 1
fi

SAFE_URL_PATTERN='^https?://[^[:space:]]+$'
if [ -n "$SMOKE_BASE_URL" ] && ! [[ "$SMOKE_BASE_URL" =~ $SAFE_URL_PATTERN ]]; then
  echo "SMOKE_BASE_URL must be an http or https URL with safe characters." >&2
  exit 1
fi

SSH_OPTS=(-p "$DEPLOY_SSH_PORT" -o BatchMode=yes)
if [ -n "$SSH_KEY_FILE" ]; then
  SSH_OPTS+=(-i "$SSH_KEY_FILE")
fi
if [ -n "$SSH_KNOWN_HOSTS_FILE" ]; then
  SSH_OPTS+=(-o "UserKnownHostsFile=$SSH_KNOWN_HOSTS_FILE" -o StrictHostKeyChecking=yes)
fi

REMOTE="${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}"
REMOTE_PATH_Q="$(printf '%q' "$DEPLOY_REMOTE_PATH")"
REMOTE_ENV_Q="$(printf '%q' "$DEPLOY_ENV_FILE")"
BACKEND_IMAGE_Q="$(printf '%q' "$AIOSK_BACKEND_IMAGE")"
FRONTEND_IMAGE_Q="$(printf '%q' "$AIOSK_FRONTEND_IMAGE")"
COMPOSE_PROJECT_Q="$(printf '%q' "$COMPOSE_PROJECT_NAME")"
MONITORING_PROFILE_Q="$(printf '%q' "$MONITORING_PROFILE")"
RUN_MIGRATIONS_Q="$(printf '%q' "$RUN_MIGRATIONS")"
RUN_SMOKE_Q="$(printf '%q' "$RUN_SMOKE")"
SMOKE_BASE_URL_Q="$(printf '%q' "$SMOKE_BASE_URL")"

ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p $REMOTE_PATH_Q"

tar -C "$ROOT_DIR" -czf - \
  docker-compose.prod.yml \
  .env.production.example \
  database_schema.sql \
  monitoring \
  scripts/deploy-compose.sh \
  scripts/db-backup.sh \
  scripts/db-restore.sh \
  scripts/db-restore-drill.sh \
  scripts/db-apply-schema.sh \
  scripts/production-preflight.sh \
  scripts/ops-smoke.js \
  scripts/heartbeat-soak.js \
  deploy/systemd \
  database/migrations | ssh "${SSH_OPTS[@]}" "$REMOTE" "cd $REMOTE_PATH_Q && tar -xzf -"

ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "cd $REMOTE_PATH_Q && DEPLOY_ENV_FILE=$REMOTE_ENV_Q AIOSK_BACKEND_IMAGE=$BACKEND_IMAGE_Q AIOSK_FRONTEND_IMAGE=$FRONTEND_IMAGE_Q COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_Q MONITORING_PROFILE=$MONITORING_PROFILE_Q RUN_MIGRATIONS=$RUN_MIGRATIONS_Q RUN_SMOKE=$RUN_SMOKE_Q SMOKE_BASE_URL=$SMOKE_BASE_URL_Q bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

if [ ! -f "$DEPLOY_ENV_FILE" ]; then
  echo "Remote environment file not found: $PWD/$DEPLOY_ENV_FILE" >&2
  echo "Create it from .env.production.example and set production secrets before deploying." >&2
  exit 1
fi

backup_file="${DEPLOY_ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp -p "$DEPLOY_ENV_FILE" "$backup_file"
deploy_completed=0

restore_env_on_failure() {
  local exit_code="$?"
  if [ "$exit_code" -ne 0 ] && [ "$deploy_completed" = "0" ] && [ -f "$backup_file" ]; then
    cp -p "$backup_file" "$DEPLOY_ENV_FILE" || true
    echo "Remote env restored from backup after failed deploy: $backup_file" >&2
  fi
  exit "$exit_code"
}

trap restore_env_on_failure EXIT

set_env_key() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "$DEPLOY_ENV_FILE" > "$tmp_file"
  cat "$tmp_file" > "$DEPLOY_ENV_FILE"
  rm -f "$tmp_file"
}

set_env_key AIOSK_BACKEND_IMAGE "$AIOSK_BACKEND_IMAGE"
set_env_key AIOSK_FRONTEND_IMAGE "$AIOSK_FRONTEND_IMAGE"

ENV_FILE="$PWD/$DEPLOY_ENV_FILE" \
COMPOSE_FILE="$PWD/docker-compose.prod.yml" \
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
MONITORING_PROFILE="$MONITORING_PROFILE" \
RUN_MIGRATIONS="$RUN_MIGRATIONS" \
RUN_SMOKE="$RUN_SMOKE" \
SMOKE_BASE_URL="$SMOKE_BASE_URL" \
bash scripts/deploy-compose.sh
deploy_completed=1
trap - EXIT

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$DEPLOY_ENV_FILE" -f docker-compose.prod.yml ps
echo "Remote env backup: $backup_file"
REMOTE_SCRIPT
