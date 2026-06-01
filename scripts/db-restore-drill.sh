#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DRILL_ENV_FILE:-$ROOT_DIR/.env}"

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
SOURCE_DB_NAME="${DRILL_SOURCE_DB_NAME:-${DB_NAME:-}}"
DRILL_DB_NAME="${DRILL_DB_NAME:-aiosk_restore_drill_$(date +%Y%m%d%H%M%S)}"
DRILL_KEEP_DB="${DRILL_KEEP_DB:-0}"
ALLOW_UNSAFE_RESTORE_DRILL="${ALLOW_UNSAFE_RESTORE_DRILL:-0}"
DRILL_EXPECT_TABLES="${DRILL_EXPECT_TABLES:-Admins Categories Menus Orders OrderItems KioskStatuses Sessions}"
BACKUP_FILE="${1:-${DRILL_BACKUP_FILE:-}}"
TEMP_DIR=""
DRILL_DB_CREATED=0

usage() {
  cat >&2 <<'USAGE'
Usage:
  npm run db:restore:drill -- <backup.sql|backup.sql.gz>
  DRILL_SOURCE_DB_NAME=kiosk_db npm run db:restore:drill

Environment:
  DRILL_ENV_FILE            Optional env file. Defaults to .env.
  DRILL_SOURCE_DB_NAME      Source DB for generated backup when no file is provided.
  DRILL_DB_NAME             Scratch restore DB. Defaults to aiosk_restore_drill_<timestamp>.
  DRILL_KEEP_DB=1           Keep scratch DB after the drill.
  DRILL_EXPECT_TABLES       Space-separated table names to verify after restore.
USAGE
}

if [ "$#" -gt 1 ]; then
  usage
  exit 1
fi

escape_identifier() {
  local identifier="$1"
  if ! [[ "$identifier" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "Unsafe database identifier: $identifier" >&2
    exit 1
  fi
  printf '`%s`' "$identifier"
}

reject_option_like_path() {
  local label="$1"
  local value="$2"
  if [[ "$value" == -* ]]; then
    echo "$label must not start with '-'." >&2
    exit 1
  fi
}

mysql_exec() {
  MYSQL_PWD="$DB_PASSWORD" mysql \
    -h "$DB_HOST" \
    -P "$DB_PORT" \
    -u "$DB_USER" \
    "$@"
}

cleanup() {
  if [ "$DRILL_DB_CREATED" = "1" ] && [ -n "$DRILL_DB_NAME" ] && [ "$DRILL_KEEP_DB" != "1" ]; then
    mysql_exec -e "DROP DATABASE IF EXISTS $(escape_identifier "$DRILL_DB_NAME")" >/dev/null 2>&1 || true
  fi

  if [ -n "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! [[ "$DB_PORT" =~ ^[1-9][0-9]*$ ]] || [ "${#DB_PORT}" -gt 5 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo "DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535." >&2
  exit 1
fi

if [ "$DRILL_KEEP_DB" != "0" ] && [ "$DRILL_KEEP_DB" != "1" ]; then
  echo "DRILL_KEEP_DB must be 0 or 1." >&2
  exit 1
fi

if [ "$ALLOW_UNSAFE_RESTORE_DRILL" != "0" ] && [ "$ALLOW_UNSAFE_RESTORE_DRILL" != "1" ]; then
  echo "ALLOW_UNSAFE_RESTORE_DRILL must be 0 or 1." >&2
  exit 1
fi

trap cleanup EXIT

escape_identifier "$DRILL_DB_NAME" >/dev/null
if [ "$ALLOW_UNSAFE_RESTORE_DRILL" != "1" ] && [[ "$DRILL_DB_NAME" != aiosk_restore* && "$DRILL_DB_NAME" != aiosk_e2e* ]]; then
  echo "Refusing to use DRILL_DB_NAME=$DRILL_DB_NAME. Use aiosk_restore* or aiosk_e2e*, or set ALLOW_UNSAFE_RESTORE_DRILL=1 intentionally." >&2
  exit 1
fi

for table in $DRILL_EXPECT_TABLES; do
  escape_identifier "$table" >/dev/null
done

if [ -z "$BACKUP_FILE" ]; then
  if [ -z "$SOURCE_DB_NAME" ]; then
    echo "Provide a backup file or set DRILL_SOURCE_DB_NAME/DB_NAME for generated backup drill." >&2
    usage
    exit 1
  fi

  escape_identifier "$SOURCE_DB_NAME" >/dev/null
else
  reject_option_like_path "backup file path" "$BACKUP_FILE"
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo "mysql client is required. Install a MySQL client or run this script in the backend Docker image." >&2
  exit 1
fi

if [ -z "$BACKUP_FILE" ]; then
  TEMP_DIR="$(mktemp -d)"
  BACKUP_FILE="$TEMP_DIR/${SOURCE_DB_NAME}_restore_drill.sql.gz"
  echo "Creating restore drill backup from $SOURCE_DB_NAME"
  BACKUP_ENV_FILE=/dev/null \
    DB_HOST="$DB_HOST" \
    DB_PORT="$DB_PORT" \
    DB_USER="$DB_USER" \
    DB_PASSWORD="$DB_PASSWORD" \
    DB_NAME="$SOURCE_DB_NAME" \
    BACKUP_DIR="$TEMP_DIR" \
    BACKUP_REMOTE_DIR= \
    BACKUP_UPLOAD_COMMAND= \
    BACKUP_RETENTION_DAYS= \
    bash "$ROOT_DIR/scripts/db-backup.sh" "$BACKUP_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

mysql_exec -e "DROP DATABASE IF EXISTS $(escape_identifier "$DRILL_DB_NAME")"
mysql_exec -e "CREATE DATABASE $(escape_identifier "$DRILL_DB_NAME") CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
DRILL_DB_CREATED=1

echo "Restoring $BACKUP_FILE into scratch DB $DRILL_DB_NAME"
RESTORE_ENV_FILE=/dev/null \
  DB_HOST="$DB_HOST" \
  DB_PORT="$DB_PORT" \
  DB_USER="$DB_USER" \
  DB_PASSWORD="$DB_PASSWORD" \
  DB_NAME="$DRILL_DB_NAME" \
  bash "$ROOT_DIR/scripts/db-restore.sh" "$BACKUP_FILE"

for table in $DRILL_EXPECT_TABLES; do
  table_exists="$(mysql_exec -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DRILL_DB_NAME' AND table_name = '$table'")"
  if [ "$table_exists" != "1" ]; then
    echo "Expected table missing after restore: $DRILL_DB_NAME.$table" >&2
    exit 1
  fi

  row_count="$(mysql_exec -N -B -e "SELECT COUNT(*) FROM $(escape_identifier "$DRILL_DB_NAME").$(escape_identifier "$table")")"
  echo "ok restored table $DRILL_DB_NAME.$table rows=$row_count"
done

echo "ok restore drill backup=$BACKUP_FILE scratch_db=$DRILL_DB_NAME"
