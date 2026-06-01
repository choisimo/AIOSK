#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$ROOT_DIR/.env}"

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [backup.sql.gz]" >&2
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
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
BACKUP_VERIFY="${BACKUP_VERIFY:-1}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-7}"
BACKUP_REMOTE_DIR="${BACKUP_REMOTE_DIR:-}"
RAW_BACKUP_UPLOAD_COMMAND="${BACKUP_UPLOAD_COMMAND:-}"
BACKUP_UPLOAD_COMMAND="$(trim "$RAW_BACKUP_UPLOAD_COMMAND")"
OUTPUT="${1:-$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz}"
TEMP_OUTPUT=""

cleanup_temp_output() {
  if [ -n "${TEMP_OUTPUT:-}" ] && [ -f "$TEMP_OUTPUT" ]; then
    rm -f "$TEMP_OUTPUT"
  fi
}

trap cleanup_temp_output EXIT

if [ -z "$DB_NAME" ]; then
  echo "DB_NAME is required." >&2
  exit 1
fi
validate_database_identifier "$DB_NAME"

if ! [[ "$DB_PORT" =~ ^[1-9][0-9]*$ ]] || [ "${#DB_PORT}" -gt 5 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo "DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535." >&2
  exit 1
fi

if [ "$BACKUP_VERIFY" != "0" ] && [ "$BACKUP_VERIFY" != "1" ]; then
  echo "BACKUP_VERIFY must be 0 or 1." >&2
  exit 1
fi

if [ -n "$RAW_BACKUP_UPLOAD_COMMAND" ] && [ -z "$BACKUP_UPLOAD_COMMAND" ]; then
  echo "BACKUP_UPLOAD_COMMAND must not be blank." >&2
  exit 1
fi

reject_option_like_path "backup output path" "$OUTPUT"
if [ -n "$BACKUP_REMOTE_DIR" ]; then
  reject_option_like_path "BACKUP_REMOTE_DIR" "$BACKUP_REMOTE_DIR"
fi

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "mysqldump is required. Install a MySQL client or run this script in the backend Docker image." >&2
  exit 1
fi

if [ -n "$BACKUP_RETENTION_DAYS" ] && ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
  exit 1
fi

if ! [[ "$BACKUP_MIN_KEEP" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_MIN_KEEP must be a non-negative integer." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$OUTPUT")"
TEMP_OUTPUT="$(mktemp "${OUTPUT}.tmp.XXXXXX")"

MYSQL_PWD="$DB_PASSWORD" mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$TEMP_OUTPUT"

if [ "$BACKUP_VERIFY" = "1" ]; then
  gzip -t "$TEMP_OUTPUT"
fi

mv -f "$TEMP_OUTPUT" "$OUTPUT"
TEMP_OUTPUT=""

if [ -n "$BACKUP_REMOTE_DIR" ]; then
  mkdir -p "$BACKUP_REMOTE_DIR"
  cp -p "$OUTPUT" "$BACKUP_REMOTE_DIR/$(basename "$OUTPUT")"
  echo "Database backup copied to $BACKUP_REMOTE_DIR/$(basename "$OUTPUT")"
fi

if [ -n "$BACKUP_UPLOAD_COMMAND" ]; then
  BACKUP_FILE="$OUTPUT" \
    BACKUP_BASENAME="$(basename "$OUTPUT")" \
    BACKUP_DB_NAME="$DB_NAME" \
    bash -c "$BACKUP_UPLOAD_COMMAND"
  echo "Database backup upload command completed for $(basename "$OUTPUT")"
fi

if [ -n "$BACKUP_RETENTION_DAYS" ]; then
  backup_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" | wc -l | tr -d ' ')"

  while IFS= read -r -d '' old_backup; do
    if [ "$backup_count" -le "$BACKUP_MIN_KEEP" ]; then
      break
    fi

    rm -f "$old_backup"
    backup_count=$((backup_count - 1))
    echo "Removed expired backup $old_backup"
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" -mtime +"$BACKUP_RETENTION_DAYS" -print0 | sort -z)
fi

echo "Database backup written to $OUTPUT"
