#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SCHEMA_ENV_FILE:-$ROOT_DIR/.env}"

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [schema.sql]" >&2
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
SCHEMA_FILE="${1:-$ROOT_DIR/database_schema.sql}"

if [ -z "$DB_NAME" ]; then
  echo "DB_NAME is required." >&2
  exit 1
fi
validate_database_identifier "$DB_NAME"

if ! [[ "$DB_PORT" =~ ^[1-9][0-9]*$ ]] || [ "${#DB_PORT}" -gt 5 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo "DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535." >&2
  exit 1
fi

reject_option_like_path "schema file path" "$SCHEMA_FILE"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "Schema file not found: $SCHEMA_FILE" >&2
  exit 1
fi

if [ "${CONFIRM_SCHEMA_APPLY:-}" != "$DB_NAME" ] && [[ "$DB_NAME" != aiosk_e2e* ]]; then
  echo "Refusing to apply schema to DB_NAME=$DB_NAME without CONFIRM_SCHEMA_APPLY=$DB_NAME." >&2
  exit 1
fi

MYSQL_PWD="$DB_PASSWORD" mysql \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  "$DB_NAME" < "$SCHEMA_FILE"

echo "Schema applied to $DB_NAME from $SCHEMA_FILE"
