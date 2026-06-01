#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RESTORE_ENV_FILE:-$ROOT_DIR/.env}"

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup.sql|backup.sql.gz>" >&2
  exit 1
fi

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

unquote() {
  local value
  value="$(trim "$1")"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

load_env_file() {
  local line key line_number value
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  line_number=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
    fi
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      key="${line%%=*}"
      value="${line#*=}"
      export "$key=$(unquote "$value")"
    else
      echo "malformed env line $line_number in $ENV_FILE" >&2
      exit 1
    fi
  done < "$ENV_FILE"
}

load_env_file

resolve_secret_file_path() {
  local file_path="$1"
  local secrets_dir relative_path

  if [[ "$file_path" == /run/secrets/* ]]; then
    secrets_dir="${AIOSK_SECRETS_DIR:-/run/secrets}"
    relative_path="${file_path#/run/secrets/}"
    printf '%s/%s' "${secrets_dir%/}" "$relative_path"
  else
    printf '%s' "$file_path"
  fi
}

load_db_password_file() {
  local source_path

  if [ -n "${DB_PASSWORD:-}" ] && [ -n "${DB_PASSWORD_FILE:-}" ]; then
    echo "DB_PASSWORD and DB_PASSWORD_FILE must not both be set." >&2
    exit 1
  fi

  if [ -z "${DB_PASSWORD_FILE:-}" ]; then
    return
  fi

  source_path="$(resolve_secret_file_path "$DB_PASSWORD_FILE")"
  if [ ! -f "$source_path" ]; then
    echo "DB_PASSWORD_FILE points to a missing file on the host: $source_path" >&2
    exit 1
  fi
  if [ ! -r "$source_path" ]; then
    echo "DB_PASSWORD_FILE points to an unreadable file on the host: $source_path" >&2
    exit 1
  fi

  DB_PASSWORD="$(cat "$source_path")"
  if [ -z "$DB_PASSWORD" ]; then
    echo "DB_PASSWORD_FILE points to an empty file on the host: $source_path" >&2
    exit 1
  fi
}

validate_database_identifier() {
  local name="$1"
  if ! [[ "$name" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "DB_NAME/COMPOSE_DB_NAME must contain only letters, numbers, and underscores." >&2
    exit 1
  fi
}

reject_option_like_path() {
  local label="$1"
  local value="$2"
  if [[ "$value" == -* ]]; then
    echo "$label must not start with '-'." >&2
    exit 1
  fi
}

COMPOSE_DB_HOST="${COMPOSE_DB_HOST:-}"
if [ -z "$COMPOSE_DB_HOST" ] && [ -n "${COMPOSE_DB_BIND:-}" ]; then
  if [ "$COMPOSE_DB_BIND" = "0.0.0.0" ]; then
    COMPOSE_DB_HOST="127.0.0.1"
  else
    COMPOSE_DB_HOST="$COMPOSE_DB_BIND"
  fi
fi

DB_HOST="${DB_HOST:-${COMPOSE_DB_HOST:-localhost}}"
DB_PORT="${DB_PORT:-${COMPOSE_DB_PORT:-3306}}"
DB_USER="${DB_USER:-${COMPOSE_DB_USER:-root}}"
load_db_password_file
DB_PASSWORD="${DB_PASSWORD:-${COMPOSE_DB_PASSWORD:-}}"
DB_NAME="${DB_NAME:-${COMPOSE_DB_NAME:-}}"
ALLOW_PRODUCTION_RESTORE="${ALLOW_PRODUCTION_RESTORE:-0}"
BACKUP_FILE="$1"

if [ -z "$DB_NAME" ]; then
  echo "DB_NAME is required." >&2
  exit 1
fi
validate_database_identifier "$DB_NAME"

if ! [[ "$DB_PORT" =~ ^[1-9][0-9]*$ ]] || [ "${#DB_PORT}" -gt 5 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo "DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535." >&2
  exit 1
fi

if [ "$ALLOW_PRODUCTION_RESTORE" != "0" ] && [ "$ALLOW_PRODUCTION_RESTORE" != "1" ]; then
  echo "ALLOW_PRODUCTION_RESTORE must be 0 or 1." >&2
  exit 1
fi

reject_option_like_path "backup file path" "$BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo "mysql client is required. Install a MySQL client or run this script in the backend Docker image." >&2
  exit 1
fi

if [ "$ALLOW_PRODUCTION_RESTORE" != "1" ] && [[ "$DB_NAME" != aiosk_restore* && "$DB_NAME" != aiosk_e2e* ]]; then
  echo "Refusing to restore into DB_NAME=$DB_NAME without ALLOW_PRODUCTION_RESTORE=1." >&2
  exit 1
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gzip -t "$BACKUP_FILE"
  RESTORE_CMD=(gzip -dc "$BACKUP_FILE")
else
  RESTORE_CMD=(cat "$BACKUP_FILE")
fi

"${RESTORE_CMD[@]}" | MYSQL_PWD="$DB_PASSWORD" mysql \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  "$DB_NAME"

echo "Database restore completed for $DB_NAME from $BACKUP_FILE"
