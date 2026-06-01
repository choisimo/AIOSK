#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "Usage: $0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PREFLIGHT_ENV_FILE:-${ENV_FILE:-$ROOT_DIR/.env.production}}"
COMPOSE_FILE="${PREFLIGHT_COMPOSE_FILE:-${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}}"
ALLOW_PLACEHOLDERS="${PREFLIGHT_ALLOW_PLACEHOLDERS:-0}"
ALLOW_OPEN_CORS="${PREFLIGHT_ALLOW_OPEN_CORS:-0}"
ALLOW_LATEST_IMAGE="${PREFLIGHT_ALLOW_LATEST_IMAGE:-0}"
ALLOW_LOCAL_BACKUP_ONLY="${PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY:-0}"
ALLOW_NOOP_ALERTS="${PREFLIGHT_ALLOW_NOOP_ALERTS:-0}"
ALLOW_OPEN_METRICS="${PREFLIGHT_ALLOW_OPEN_METRICS:-0}"
ALLOW_WEAK_ENV_FILE_PERMS="${PREFLIGHT_ALLOW_WEAK_ENV_FILE_PERMS:-0}"
VALIDATE_MONITORING="${PREFLIGHT_VALIDATE_MONITORING:-0}"

declare -A ENV_VALUES=()
failures=0
warnings=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

warn() {
  echo "WARN: $*" >&2
  warnings=$((warnings + 1))
}

ok() {
  echo "ok $*"
}

validate_binary_flag() {
  local name value
  name="$1"
  value="$2"

  if [ "$value" != "0" ] && [ "$value" != "1" ]; then
    fail "$name must be 0 or 1"
  fi
}

validate_control_flags() {
  validate_binary_flag PREFLIGHT_ALLOW_PLACEHOLDERS "$ALLOW_PLACEHOLDERS"
  validate_binary_flag PREFLIGHT_ALLOW_OPEN_CORS "$ALLOW_OPEN_CORS"
  validate_binary_flag PREFLIGHT_ALLOW_LATEST_IMAGE "$ALLOW_LATEST_IMAGE"
  validate_binary_flag PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY "$ALLOW_LOCAL_BACKUP_ONLY"
  validate_binary_flag PREFLIGHT_ALLOW_NOOP_ALERTS "$ALLOW_NOOP_ALERTS"
  validate_binary_flag PREFLIGHT_ALLOW_OPEN_METRICS "$ALLOW_OPEN_METRICS"
  validate_binary_flag PREFLIGHT_ALLOW_WEAK_ENV_FILE_PERMS "$ALLOW_WEAK_ENV_FILE_PERMS"
  validate_binary_flag PREFLIGHT_VALIDATE_MONITORING "$VALIDATE_MONITORING"
}

validate_runtime_boolean_flag() {
  local name value
  name="$1"
  value="$(get_env "$name")"

  if [ -n "$value" ] && [ "$value" != "true" ] && [ "$value" != "false" ]; then
    fail "$name must be true or false"
  fi
}

validate_runtime_boolean_flags() {
  validate_runtime_boolean_flag ALLOW_OPEN_CORS
  validate_runtime_boolean_flag ALLOW_OPEN_METRICS
}

validate_database_name_policy() {
  local db_name
  db_name="$(get_env COMPOSE_DB_NAME)"
  db_name="${db_name:-kiosk_db}"
  if ! is_mysql_identifier "$db_name"; then
    fail "COMPOSE_DB_NAME must contain only letters, numbers, and underscores"
  else
    ok "database name COMPOSE_DB_NAME"
  fi
}

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
      ENV_VALUES["$key"]="$(unquote "$value")"
    else
      fail "malformed env line $line_number in $ENV_FILE"
    fi
  done < "$ENV_FILE"
}

get_env() {
  local key="$1"
  printf '%s' "${ENV_VALUES[$key]:-}"
}

RESOLVED_ENV_VALUE=""

resolve_secret_file_path() {
  local file_path="$1"
  local secrets_dir relative_path

  if [[ "$file_path" == /run/secrets/* ]]; then
    secrets_dir="$(get_env AIOSK_SECRETS_DIR)"
    secrets_dir="${secrets_dir:-/run/secrets}"
    relative_path="${file_path#/run/secrets/}"
    printf '%s/%s' "${secrets_dir%/}" "$relative_path"
  else
    printf '%s' "$file_path"
  fi
}

resolve_env_or_file() {
  local key file_key value file_path source_path
  key="$1"
  file_key="${key}_FILE"
  RESOLVED_ENV_VALUE=""
  value="$(get_env "$key")"
  file_path="$(get_env "$file_key")"

  if [ -n "$value" ] && [ -n "$file_path" ]; then
    fail "$key and $file_key must not both be set"
    return 1
  fi

  if [ -n "$file_path" ]; then
    source_path="$(resolve_secret_file_path "$file_path")"
    if [ ! -f "$source_path" ]; then
      fail "$file_key points to a missing file on the compose host: $source_path"
      return 1
    fi
    if [ ! -r "$source_path" ]; then
      fail "$file_key points to an unreadable file on the compose host: $source_path"
      return 1
    fi

    value="$(cat "$source_path")"
    if [ -z "$value" ]; then
      fail "$file_key points to an empty file on the compose host: $source_path"
      return 1
    fi
  fi

  RESOLVED_ENV_VALUE="$value"
}

is_placeholder() {
  local value lower
  value="$1"
  lower="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == change_this* ||
     "$lower" == replace_with* ||
     "$lower" == your_* ||
     "$lower" == your-* ||
     "$lower" == *example-owner* ||
     "$lower" == *example.com* ]]
}

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    fail "required file is missing: $file"
  else
    ok "file $file"
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "$command_name is required"
  else
    ok "command $command_name"
  fi
}

is_positive_integer() {
  local value="$1"
  [[ "$value" =~ ^[1-9][0-9]*$ ]]
}

is_non_negative_integer() {
  local value="$1"
  [[ "$value" =~ ^(0|[1-9][0-9]*)$ ]]
}

is_tcp_port() {
  local value="$1"
  is_positive_integer "$value" && [ "${#value}" -le 5 ] && [ "$value" -le 65535 ]
}

is_trust_proxy_value() {
  local value="$1"
  [[ "$value" =~ ^(true|false|1|0|yes|no|on|off|[1-9][0-9]*)$ ]]
}

is_mysql_identifier() {
  local value="$1"
  [[ "$value" =~ ^[A-Za-z0-9_]+$ ]]
}

get_file_mode() {
  local file="$1"
  local mode

  if mode="$(stat -c '%a' "$file" 2>/dev/null)"; then
    printf '%s' "$mode"
    return
  fi

  if mode="$(stat -f '%Lp' "$file" 2>/dev/null)"; then
    printf '%s' "$mode"
    return
  fi

  return 1
}

validate_env_file_permissions() {
  local raw_mode mode special_bits owner_mode group_mode other_mode starting_failures
  if [[ "$(basename "$ENV_FILE")" == *.example ]]; then
    ok "env file permissions skipped for example"
    return
  fi

  if [ "$ALLOW_WEAK_ENV_FILE_PERMS" = "1" ]; then
    warn "env file permission check is bypassed"
    return
  fi

  if ! raw_mode="$(get_file_mode "$ENV_FILE")"; then
    fail "could not inspect permissions for $ENV_FILE"
    return
  fi

  mode="${raw_mode: -3}"
  special_bits="${raw_mode%$mode}"
  if ! [[ "$mode" =~ ^[0-7]{3}$ ]]; then
    fail "could not parse permissions for $ENV_FILE: $raw_mode"
    return
  fi

  starting_failures="$failures"
  owner_mode="${mode:0:1}"
  group_mode="${mode:1:1}"
  other_mode="${mode:2:1}"

  if [ -n "$special_bits" ] && [ "$special_bits" != "0" ]; then
    fail "$ENV_FILE must not use setuid, setgid, or sticky permission bits: $raw_mode"
  fi
  if (( (8#$owner_mode & 1) != 0 )); then
    fail "$ENV_FILE must not be executable: $raw_mode"
  fi
  if (( (8#$group_mode & 3) != 0 )); then
    fail "$ENV_FILE group permissions must be read-only or empty, not writable/executable: $raw_mode"
  fi
  if (( 8#$other_mode != 0 )); then
    fail "$ENV_FILE must not be accessible by other users: $raw_mode"
  fi

  if [ "$failures" -eq "$starting_failures" ]; then
    ok "env file permissions $raw_mode"
  fi
}

require_env() {
  local key="$1"
  local value
  if ! resolve_env_or_file "$key"; then
    return
  fi
  value="$RESOLVED_ENV_VALUE"
  if [ -z "$value" ]; then
    fail "$key must be set in $ENV_FILE"
    return
  fi
  if [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$value"; then
    fail "$key is still a placeholder"
    return
  fi
  ok "env $key"
}

require_secret() {
  local key="$1"
  local value
  if ! resolve_env_or_file "$key"; then
    return
  fi
  value="$RESOLVED_ENV_VALUE"
  if [ -z "$value" ]; then
    fail "$key must be set in $ENV_FILE"
    return
  fi
  if [ "${#value}" -lt 32 ]; then
    fail "$key must be at least 32 characters"
    return
  fi
  if [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$value"; then
    fail "$key is still a placeholder"
    return
  fi
  ok "secret $key"
}

require_operational_password() {
  local key="$1"
  local value
  value="$(get_env "$key")"
  if [ -z "$value" ]; then
    fail "$key must be set in $ENV_FILE"
    return
  fi
  if [ "${#value}" -lt 16 ]; then
    fail "$key must be at least 16 characters"
    return
  fi
  if [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$value"; then
    fail "$key is still a placeholder"
    return
  fi
  ok "operational password $key"
}

validate_optional_secret() {
  local key="$1"
  local value file_path
  file_path="$(get_env "${key}_FILE")"
  if [ -z "$(get_env "$key")" ] && [ -z "$file_path" ]; then
    ok "env $key optional"
    return
  fi

  if ! resolve_env_or_file "$key"; then
    return
  fi
  value="$RESOLVED_ENV_VALUE"
  if [ -z "$value" ]; then
    fail "$key must not be empty when set"
    return
  fi
  if [ "${#value}" -lt 16 ]; then
    fail "$key must be at least 16 characters when set"
    return
  fi
  if [[ "$value" =~ [[:space:]] ]]; then
    fail "$key must not contain whitespace"
    return
  fi
  if [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$value"; then
    fail "$key is still a placeholder"
    return
  fi
  ok "optional secret $key"
}

validate_image_ref() {
  local key value
  key="$1"
  value="$(get_env "$key")"
  if [ -z "$value" ]; then
    fail "$key must be set"
    return
  fi
  if ! [[ "$value" =~ ^[A-Za-z0-9._/:@-]+$ ]]; then
    fail "$key has unsupported image reference characters"
    return
  fi
  if [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$value"; then
    fail "$key uses an example image owner or placeholder"
    return
  fi
  if [[ "$value" == *:latest ]] && [ "$ALLOW_LATEST_IMAGE" != "1" ]; then
    fail "$key uses :latest; pin an immutable release tag or digest"
    return
  fi
  ok "image $key"
}

validate_cors() {
  local cors allow_open socket_cors
  cors="$(get_env CORS_ORIGIN)"
  allow_open="$(get_env ALLOW_OPEN_CORS)"
  socket_cors="$(get_env SOCKET_CORS_ORIGIN)"

  if [ -z "$cors" ]; then
    if [ "$allow_open" = "true" ] && [ "$ALLOW_OPEN_CORS" = "1" ]; then
      warn "CORS_ORIGIN is empty with ALLOW_OPEN_CORS=true"
    else
      fail "CORS_ORIGIN must be set, or PREFLIGHT_ALLOW_OPEN_CORS=1 with ALLOW_OPEN_CORS=true must be intentional"
    fi
  elif [[ "$cors" =~ (^|,)[[:space:]]*\*[[:space:]]*(,|$) ]]; then
    fail "CORS_ORIGIN must not use wildcard origin in production"
  elif [[ "$cors" =~ https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|/|,|$) ]]; then
    fail "CORS_ORIGIN must not use local origins in production"
  elif [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$cors"; then
    fail "CORS_ORIGIN is still a placeholder"
  else
    ok "env CORS_ORIGIN"
  fi

  if [ -z "$socket_cors" ]; then
    fail "SOCKET_CORS_ORIGIN must be set"
  elif [[ "$socket_cors" =~ (^|,)[[:space:]]*\*[[:space:]]*(,|$) ]]; then
    fail "SOCKET_CORS_ORIGIN must not use wildcard origin in production"
  elif [[ "$socket_cors" =~ https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|/|,|$) ]]; then
    fail "SOCKET_CORS_ORIGIN must not use local origins in production"
  elif [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$socket_cors"; then
    fail "SOCKET_CORS_ORIGIN is still a placeholder"
  else
    ok "env SOCKET_CORS_ORIGIN"
  fi
}

validate_optional_public_url() {
  local key value
  key="$1"
  value="$(get_env "$key")"

  if [ -z "$value" ]; then
    ok "env $key optional"
    return
  fi
  if ! [[ "$value" =~ ^https?://[^[:space:]]+$ ]]; then
    fail "$key must be an absolute http or https URL"
  elif [[ "$value" =~ ^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|/|$) ]]; then
    fail "$key must not use a local URL in production"
  elif [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$value"; then
    fail "$key is still a placeholder"
  else
    ok "env $key"
  fi
}

validate_session_cookie() {
  local secure same_site max_age cleanup_interval trust_proxy session_store
  secure="$(get_env SESSION_COOKIE_SECURE)"
  same_site="$(get_env SESSION_COOKIE_SAME_SITE)"
  max_age="$(get_env SESSION_COOKIE_MAX_AGE_MS)"
  cleanup_interval="$(get_env SESSION_CLEANUP_INTERVAL_MS)"
  trust_proxy="$(get_env TRUST_PROXY)"
  session_store="$(get_env SESSION_STORE)"

  [ "$session_store" = "mysql" ] || fail "SESSION_STORE must be mysql for production"
  [ "$secure" = "true" ] || fail "SESSION_COOKIE_SECURE must be true for production"
  [[ "$same_site" =~ ^(lax|strict|none)$ ]] || fail "SESSION_COOKIE_SAME_SITE must be lax, strict, or none"
  is_positive_integer "$max_age" || fail "SESSION_COOKIE_MAX_AGE_MS must be a positive integer"
  is_positive_integer "$cleanup_interval" || fail "SESSION_CLEANUP_INTERVAL_MS must be a positive integer"
  is_trust_proxy_value "$trust_proxy" || fail "TRUST_PROXY must be boolean-like or a non-negative integer"
  if [ "$secure" = "true" ] &&
     [[ "$same_site" =~ ^(lax|strict|none)$ ]] &&
     is_positive_integer "$max_age" &&
     is_positive_integer "$cleanup_interval"; then
    ok "session cookie contract"
  fi
}

validate_upload_policy() {
  local upload_dir max_file_size
  upload_dir="$(get_env UPLOAD_DIR)"
  max_file_size="$(get_env MAX_FILE_SIZE)"

  [ -n "$upload_dir" ] || fail "UPLOAD_DIR must be set"
  is_positive_integer "$max_file_size" || fail "MAX_FILE_SIZE must be a positive integer"

  if [ -n "$upload_dir" ] && is_positive_integer "$max_file_size"; then
    ok "upload contract"
  fi
}

validate_readiness_policy() {
  local timeout_ms
  timeout_ms="$(get_env READINESS_DB_TIMEOUT_MS)"

  [ -n "$timeout_ms" ] || fail "READINESS_DB_TIMEOUT_MS must be set"
  is_positive_integer "$timeout_ms" || fail "READINESS_DB_TIMEOUT_MS must be a positive integer"

  if is_positive_integer "$timeout_ms"; then
    ok "readiness timeout contract"
  fi
}

validate_request_body_policy() {
  local body_limit
  body_limit="$(get_env REQUEST_BODY_LIMIT)"

  [ -n "$body_limit" ] || fail "REQUEST_BODY_LIMIT must be set"
  [[ "$body_limit" =~ ^[1-9][0-9]*([bB]|[kK][bB]|[mM][bB])$ ]] || fail "REQUEST_BODY_LIMIT must be a positive byte size with b, kb, or mb units"

  if [[ "$body_limit" =~ ^[1-9][0-9]*([bB]|[kK][bB]|[mM][bB])$ ]]; then
    ok "request body size contract"
  fi
}

validate_rate_limit_policy() {
  local api_window api_max auth_window auth_max
  api_window="$(get_env RATE_LIMIT_WINDOW_MS)"
  api_max="$(get_env RATE_LIMIT_MAX_REQUESTS)"
  auth_window="$(get_env AUTH_RATE_LIMIT_WINDOW_MS)"
  auth_max="$(get_env AUTH_RATE_LIMIT_MAX_REQUESTS)"

  is_positive_integer "$api_window" || fail "RATE_LIMIT_WINDOW_MS must be a positive integer"
  is_positive_integer "$api_max" || fail "RATE_LIMIT_MAX_REQUESTS must be a positive integer"
  is_positive_integer "$auth_window" || fail "AUTH_RATE_LIMIT_WINDOW_MS must be a positive integer"
  is_positive_integer "$auth_max" || fail "AUTH_RATE_LIMIT_MAX_REQUESTS must be a positive integer"

  if is_positive_integer "$api_window" &&
     is_positive_integer "$api_max" &&
     is_positive_integer "$auth_window" &&
     is_positive_integer "$auth_max"; then
    ok "rate limit contract"
  fi
}

validate_shutdown_policy() {
  local timeout_ms
  timeout_ms="$(get_env SHUTDOWN_TIMEOUT_MS)"

  [ -n "$timeout_ms" ] || fail "SHUTDOWN_TIMEOUT_MS must be set"
  is_positive_integer "$timeout_ms" || fail "SHUTDOWN_TIMEOUT_MS must be a positive integer"

  if is_positive_integer "$timeout_ms"; then
    ok "shutdown timeout contract"
  fi
}

validate_compose_port() {
  local key default_value value
  key="$1"
  default_value="$2"
  value="$(get_env "$key")"
  value="${value:-$default_value}"

  is_tcp_port "$value" || fail "$key must be a positive integer between 1 and 65535"
}

validate_compose_port_policy() {
  local starting_failures
  starting_failures="$failures"

  validate_compose_port COMPOSE_DB_PORT 3306
  validate_compose_port COMPOSE_BACKEND_PORT 3000
  validate_compose_port COMPOSE_FRONTEND_PORT 5173
  validate_compose_port COMPOSE_PROMETHEUS_PORT 9090
  validate_compose_port COMPOSE_ALERTMANAGER_PORT 9093
  validate_compose_port COMPOSE_GRAFANA_PORT 3001

  if [ "$failures" -eq "$starting_failures" ]; then
    ok "compose port contract"
  fi
}

validate_backup_policy() {
  local backup_dir backup_verify backup_retention backup_min_keep backup_remote_dir backup_upload_raw backup_upload upload_command
  backup_dir="$(get_env BACKUP_DIR)"
  backup_verify="$(get_env BACKUP_VERIFY)"
  backup_retention="$(get_env BACKUP_RETENTION_DAYS)"
  backup_min_keep="$(get_env BACKUP_MIN_KEEP)"
  backup_remote_dir="$(get_env BACKUP_REMOTE_DIR)"
  backup_upload_raw="$(get_env BACKUP_UPLOAD_COMMAND)"
  backup_upload="$(trim "$backup_upload_raw")"

  [ -n "$backup_dir" ] || fail "BACKUP_DIR must be set"
  [ "$backup_verify" = "1" ] || fail "BACKUP_VERIFY must be 1"
  is_non_negative_integer "$backup_retention" || fail "BACKUP_RETENTION_DAYS must be a non-negative integer"
  is_non_negative_integer "$backup_min_keep" || fail "BACKUP_MIN_KEEP must be a non-negative integer"
  if [ -n "$backup_upload_raw" ] && [ -z "$backup_upload" ]; then
    fail "BACKUP_UPLOAD_COMMAND must not be blank"
  fi

  if [ -z "$backup_remote_dir" ] && [ -z "$backup_upload" ]; then
    if [ "$ALLOW_LOCAL_BACKUP_ONLY" = "1" ]; then
      warn "offsite backup is not configured"
    else
      fail "configure BACKUP_REMOTE_DIR or BACKUP_UPLOAD_COMMAND for offsite backup, or set PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY=1 intentionally"
    fi
  else
    ok "offsite backup target"
  fi

  if [ -n "$backup_upload" ]; then
    upload_command="${backup_upload%%[[:space:]]*}"
    upload_command="${upload_command%\"}"
    upload_command="${upload_command#\"}"
    upload_command="${upload_command%\'}"
    upload_command="${upload_command#\'}"
    if ! command -v "$upload_command" >/dev/null 2>&1; then
      fail "BACKUP_UPLOAD_COMMAND first command is not available: $upload_command"
    else
      ok "backup upload command $upload_command"
    fi
  fi
}

validate_metrics_monitoring_contract() {
  local metrics_token metrics_token_file metrics_token_source_dir metrics_token_source_file open_metrics
  metrics_token="$(get_env METRICS_TOKEN)"
  metrics_token_file="$(get_env METRICS_TOKEN_FILE)"
  open_metrics="$(get_env ALLOW_OPEN_METRICS)"

  if [ -n "$metrics_token" ] && [ -n "$metrics_token_file" ]; then
    fail "METRICS_TOKEN and METRICS_TOKEN_FILE must not both be set"
    return
  fi

  if [ -n "$metrics_token_file" ]; then
    if [ "$metrics_token_file" != "/run/secrets/metrics_token" ]; then
      fail "METRICS_TOKEN_FILE must be /run/secrets/metrics_token so backend and Prometheus read the same mounted token"
      return
    fi

    metrics_token_source_dir="$(get_env AIOSK_SECRETS_DIR)"
    metrics_token_source_dir="${metrics_token_source_dir:-/run/secrets}"
    metrics_token_source_file="$metrics_token_source_dir/metrics_token"
    if [ ! -f "$metrics_token_source_file" ]; then
      fail "METRICS_TOKEN_FILE source is missing on the compose host: $metrics_token_source_file"
      return
    fi
    if [ ! -r "$metrics_token_source_file" ]; then
      fail "METRICS_TOKEN_FILE source is unreadable on the compose host: $metrics_token_source_file"
      return
    fi

    metrics_token="$(cat "$metrics_token_source_file")"
    if [ -z "$metrics_token" ]; then
      fail "METRICS_TOKEN_FILE source is empty on the compose host: $metrics_token_source_file"
      return
    fi
  fi

  if [ -z "$metrics_token" ]; then
    if [ "$ALLOW_OPEN_METRICS" = "1" ] && [ "$open_metrics" = "true" ]; then
      warn "METRICS_TOKEN is empty; /metrics will be unauthenticated"
      return
    fi

    fail "METRICS_TOKEN or METRICS_TOKEN_FILE must be set for production metrics, or set ALLOW_OPEN_METRICS=true and PREFLIGHT_ALLOW_OPEN_METRICS=1 intentionally"
    return
  fi

  if [ -z "$metrics_token_file" ]; then
    fail "METRICS_TOKEN_FILE must be set so production Prometheus can mount the scrape token"
    return
  fi

  if [ "${#metrics_token}" -lt 32 ]; then
    fail "METRICS_TOKEN must be at least 32 characters"
    return
  fi

  if [ "$ALLOW_PLACEHOLDERS" != "1" ] && is_placeholder "$metrics_token"; then
    fail "METRICS_TOKEN is still a placeholder"
    return
  fi

  if ! grep -Eq "authorization|credentials_file:[[:space:]]*/run/secrets/metrics_token" "$ROOT_DIR/monitoring/prometheus.secure.yml"; then
    fail "METRICS_TOKEN_FILE is set but monitoring/prometheus.secure.yml does not configure the scrape token file"
  else
    ok "metrics scrape contract"
  fi
}

validate_alertmanager_receiver() {
  local alertmanager_config has_noop_route has_receiver_config
  alertmanager_config="$ROOT_DIR/monitoring/alertmanager.yml"
  has_noop_route=0
  has_receiver_config=0

  if grep -Eq '^[[:space:]]*receiver:[[:space:]]*"?noop"?' "$alertmanager_config"; then
    has_noop_route=1
  fi

  if grep -Eq '^[[:space:]]*(email_configs|slack_configs|pagerduty_configs|webhook_configs|opsgenie_configs|victorops_configs|wechat_configs|telegram_configs|msteams_configs):' "$alertmanager_config"; then
    has_receiver_config=1
  fi

  if [ "$has_receiver_config" = "1" ] && [ "$has_noop_route" = "0" ]; then
    ok "alertmanager receiver"
    return
  fi

  if [ "$ALLOW_NOOP_ALERTS" = "1" ]; then
    warn "alertmanager external receiver is not configured"
  else
    fail "monitoring/alertmanager.yml routes alerts to noop or has no external receiver; configure an alert receiver or set PREFLIGHT_ALLOW_NOOP_ALERTS=1 intentionally"
  fi
}

validate_dashboard_json() {
  if command -v node >/dev/null 2>&1; then
    node - <<'NODE'
const fs = require('fs');
const path = require('path');
const dashboardDir = path.join(process.cwd(), 'monitoring/grafana/dashboards');
for (const file of fs.readdirSync(dashboardDir)) {
  if (file.endsWith('.json')) {
    JSON.parse(fs.readFileSync(path.join(dashboardDir, file), 'utf8'));
  }
}
NODE
    ok "grafana dashboard JSON"
  else
    warn "node is not available; skipping Grafana dashboard JSON parse"
  fi
}

run_compose_config() {
  local args
  args=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
  if docker compose "${args[@]}" config >/dev/null; then
    ok "docker compose production config"
  else
    fail "docker compose production config failed"
  fi

  if docker compose --profile monitoring "${args[@]}" config >/dev/null; then
    ok "docker compose monitoring config"
  else
    fail "docker compose monitoring config failed"
  fi
}

validate_monitoring_with_docker() {
  if [ "$VALIDATE_MONITORING" != "1" ]; then
    warn "skipping promtool/amtool docker validation; set PREFLIGHT_VALIDATE_MONITORING=1 to enable"
    return
  fi

  if docker run --rm --entrypoint promtool -v "$ROOT_DIR/monitoring:/etc/prometheus:ro" prom/prometheus:v2.55.1 check config /etc/prometheus/prometheus.yml >/dev/null; then
    ok "prometheus config"
  else
    fail "prometheus config validation failed"
  fi

  local temp_secret_dir
  temp_secret_dir="$(mktemp -d)"
  printf '%s' 'promtool-metrics-token-at-least-32-characters' > "$temp_secret_dir/metrics_token"
  chmod 755 "$temp_secret_dir"
  chmod 644 "$temp_secret_dir/metrics_token"
  if docker run --rm --entrypoint promtool -v "$ROOT_DIR/monitoring:/etc/prometheus:ro" -v "$temp_secret_dir:/run/secrets:ro" prom/prometheus:v2.55.1 check config /etc/prometheus/prometheus.secure.yml >/dev/null; then
    ok "prometheus secure config"
  else
    rm -rf "$temp_secret_dir"
    fail "prometheus secure config validation failed"
  fi
  rm -rf "$temp_secret_dir"

  if docker run --rm --entrypoint amtool -v "$ROOT_DIR/monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" prom/alertmanager:v0.27.0 check-config /etc/alertmanager/alertmanager.yml >/dev/null; then
    ok "alertmanager config"
  else
    fail "alertmanager config validation failed"
  fi
}

main() {
  validate_control_flags

  require_file "$ENV_FILE"
  require_file "$COMPOSE_FILE"
  require_file "$ROOT_DIR/database_schema.sql"
  require_file "$ROOT_DIR/monitoring/prometheus.yml"
  require_file "$ROOT_DIR/monitoring/prometheus.secure.yml"
  require_file "$ROOT_DIR/monitoring/alerts.yml"
  require_file "$ROOT_DIR/monitoring/alertmanager.yml"
  require_file "$ROOT_DIR/deploy/systemd/aiosk-db-backup.service"
  require_file "$ROOT_DIR/deploy/systemd/aiosk-db-backup.timer"

  if [ "$failures" -gt 0 ]; then
    echo "Production preflight failed before env parsing." >&2
    exit 1
  fi

  if [[ "$(basename "$ENV_FILE")" == *.example ]] && [ "$ALLOW_PLACEHOLDERS" != "1" ]; then
    fail "refusing to use example env file without PREFLIGHT_ALLOW_PLACEHOLDERS=1"
  fi

  validate_env_file_permissions

  load_env_file
  validate_runtime_boolean_flags
  validate_database_name_policy

  if [ "$failures" -gt 0 ]; then
    echo "Production preflight failed before docker checks." >&2
    exit 1
  fi

  require_command docker
  if docker compose version >/dev/null 2>&1; then
    ok "command docker compose"
  else
    fail "docker compose plugin is required"
  fi

  require_operational_password COMPOSE_DB_PASSWORD
  require_operational_password COMPOSE_MYSQL_ROOT_PASSWORD
  require_secret JWT_SECRET
  require_secret SESSION_SECRET
  validate_optional_secret KIOSK_STATUS_TOKEN
  validate_cors
  validate_optional_public_url KIOSK_FRONTEND_URL
  validate_optional_public_url API_PUBLIC_URL
  validate_session_cookie
  validate_upload_policy
  validate_readiness_policy
  validate_request_body_policy
  validate_rate_limit_policy
  validate_shutdown_policy
  validate_compose_port_policy
  validate_image_ref AIOSK_BACKEND_IMAGE
  validate_image_ref AIOSK_FRONTEND_IMAGE
  require_operational_password GRAFANA_ADMIN_PASSWORD
  validate_backup_policy
  validate_metrics_monitoring_contract
  validate_alertmanager_receiver
  validate_dashboard_json

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    run_compose_config
    validate_monitoring_with_docker
  fi

  if [ "$failures" -gt 0 ]; then
    echo "Production preflight failed with $failures failure(s) and $warnings warning(s)." >&2
    exit 1
  fi

  echo "Production preflight passed with $warnings warning(s)."
}

main "$@"
