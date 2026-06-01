#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${GITHUB_REPOSITORY:-}"
ENVIRONMENT_NAME="${GITHUB_ENVIRONMENT:-production}"
REQUIRED_SECRETS="${GITHUB_REQUIRED_ACTION_SECRETS-DEPLOY_SSH_HOST,DEPLOY_SSH_USER,DEPLOY_SSH_PRIVATE_KEY}"
RECOMMENDED_SECRETS="${GITHUB_RECOMMENDED_ACTION_SECRETS-DEPLOY_KNOWN_HOSTS}"
REQUIRED_VARIABLES="${GITHUB_REQUIRED_ACTION_VARIABLES-FRONTEND_API_URL}"
RECOMMENDED_VARIABLES="${GITHUB_RECOMMENDED_ACTION_VARIABLES-FRONTEND_KIOSK_STATUS_TOKEN}"
failures=0

usage() {
  cat <<'USAGE'
Usage:
  GITHUB_REPOSITORY=owner/repo GITHUB_ENVIRONMENT=production npm run ops:github-actions:check

Environment:
  GITHUB_REPOSITORY                   GitHub repo in owner/name form. Defaults to git remote origin when possible.
  GITHUB_ENVIRONMENT                  Environment name to audit. Defaults to production.
  GITHUB_REQUIRED_ACTION_SECRETS      Comma-separated secrets required in repo or environment.
                                      Defaults to DEPLOY_SSH_HOST,DEPLOY_SSH_USER,DEPLOY_SSH_PRIVATE_KEY.
  GITHUB_RECOMMENDED_ACTION_SECRETS   Comma-separated recommended secrets. Defaults to DEPLOY_KNOWN_HOSTS.
  GITHUB_REQUIRED_ACTION_VARIABLES    Comma-separated repository variables required by release workflows.
                                      Defaults to FRONTEND_API_URL.
  GITHUB_RECOMMENDED_ACTION_VARIABLES Comma-separated repository variables recommended for conditional workflows.
                                      Defaults to FRONTEND_KIOSK_STATUS_TOKEN.
  Custom list entries must use only letters, digits, and underscores; required lists must not be empty.
  Recommended lists may be set to an empty string to disable advisory checks.

Requires:
  gh authenticated with repository administration access.
USAGE
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

warn() {
  echo "WARN: $*" >&2
}

ok() {
  echo "ok $*"
}

repo_from_origin() {
  local origin
  origin="$(git remote get-url origin 2>/dev/null || true)"
  case "$origin" in
    git@github.com:*.git)
      origin="${origin#git@github.com:}"
      origin="${origin%.git}"
      ;;
    https://github.com/*.git)
      origin="${origin#https://github.com/}"
      origin="${origin%.git}"
      ;;
    https://github.com/*)
      origin="${origin#https://github.com/}"
      ;;
    *)
      origin=""
      ;;
  esac
  printf '%s' "$origin"
}

gh_api_or_fail() {
  local path="$1"
  local jq_filter="$2"
  local error_file
  error_file="$(mktemp)"
  if ! gh api "$path" --jq "$jq_filter" 2>"$error_file"; then
    local api_error
    api_error="$(tr '\n' ' ' <"$error_file" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
    rm -f "$error_file"
    fail "GitHub API request failed for $path: ${api_error:-request failed}"
  fi
  rm -f "$error_file"
}

contains_name() {
  local names="$1"
  local name="$2"
  grep -Fxq "$name" <<<"$names"
}

join_nonempty_names() {
  local names="$1"
  local joined
  joined="$(sed '/^$/d' <<<"$names" | sort -u | paste -sd ',' -)"
  printf '%s' "${joined:-none}"
}

validate_name_csv() {
  local env_name="$1"
  local label="$2"
  local names_csv="$3"
  local require_nonempty="$4"
  local name count
  local -a names
  count=0

  if [ -z "$(printf '%s' "$names_csv" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')" ]; then
    if [ "$require_nonempty" = "1" ]; then
      fail "$env_name must contain at least one $label name."
    fi
    return
  fi

  IFS=',' read -r -a names <<<"$names_csv"

  for name in "${names[@]}"; do
    name="$(printf '%s' "$name" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    if [ -z "$name" ]; then
      fail "$env_name must not contain empty entries."
    fi
    if ! [[ "$name" =~ ^[A-Za-z0-9_]+$ ]]; then
      fail "$env_name contains invalid $label name: $name."
    fi
    count=$((count + 1))
  done

  if [ "$require_nonempty" = "1" ] && [ "$count" -eq 0 ]; then
    fail "$env_name must contain at least one $label name."
  fi
}

audit_required_names() {
  local label="$1"
  local required_csv="$2"
  local repo_names="$3"
  local environment_names="$4"
  local location="$5"
  IFS=',' read -r -a required_names <<<"$required_csv"

  for required_name in "${required_names[@]}"; do
    required_name="$(printf '%s' "$required_name" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$required_name" ] && continue

    if contains_name "$repo_names" "$required_name" || contains_name "$environment_names" "$required_name"; then
      ok "$label $required_name"
    else
      echo "FAIL: missing $label $required_name in $location" >&2
      failures=$((failures + 1))
    fi
  done
}

audit_recommended_names() {
  local label="$1"
  local recommended_csv="$2"
  local repo_names="$3"
  local environment_names="$4"
  IFS=',' read -r -a recommended_names <<<"$recommended_csv"

  for recommended_name in "${recommended_names[@]}"; do
    recommended_name="$(printf '%s' "$recommended_name" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$recommended_name" ] && continue

    if contains_name "$repo_names" "$recommended_name" || contains_name "$environment_names" "$recommended_name"; then
      ok "$label $recommended_name"
    else
      warn "recommended $label $recommended_name is not set"
    fi
  done
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "Usage: $0" >&2
  exit 1
fi

validate_name_csv GITHUB_REQUIRED_ACTION_SECRETS secret "$REQUIRED_SECRETS" 1
validate_name_csv GITHUB_RECOMMENDED_ACTION_SECRETS secret "$RECOMMENDED_SECRETS" 0
validate_name_csv GITHUB_REQUIRED_ACTION_VARIABLES "repository variable" "$REQUIRED_VARIABLES" 1
validate_name_csv GITHUB_RECOMMENDED_ACTION_VARIABLES "repository variable" "$RECOMMENDED_VARIABLES" 0

if [ -z "$REPOSITORY" ]; then
  REPOSITORY="$(repo_from_origin)"
fi

repository_pattern='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
environment_pattern='^[A-Za-z0-9_. -]+$'
if ! [[ "$REPOSITORY" =~ $repository_pattern ]]; then
  fail "GITHUB_REPOSITORY must be in owner/repo form."
fi
if ! [[ "$ENVIRONMENT_NAME" =~ $environment_pattern ]]; then
  fail "GITHUB_ENVIRONMENT contains unsupported characters."
fi

if ! command -v gh >/dev/null 2>&1; then
  fail "gh CLI is required."
fi
if ! gh api user --jq '.login' >/dev/null 2>&1; then
  fail "gh CLI could not access the authenticated GitHub API."
fi

environment_name="$(gh_api_or_fail "repos/$REPOSITORY/environments?per_page=100" ".environments[]? | select(.name == \"$ENVIRONMENT_NAME\") | .name")"
if [ -z "$environment_name" ] || [ "$environment_name" != "$ENVIRONMENT_NAME" ]; then
  fail "GitHub Environment $ENVIRONMENT_NAME was not found in $REPOSITORY."
fi
ok "environment $REPOSITORY/$ENVIRONMENT_NAME"

repo_secrets="$(gh_api_or_fail "repos/$REPOSITORY/actions/secrets?per_page=100" '.secrets[]?.name')"
environment_secrets="$(gh_api_or_fail "repos/$REPOSITORY/environments/$ENVIRONMENT_NAME/secrets?per_page=100" '.secrets[]?.name')"
repo_variables="$(gh_api_or_fail "repos/$REPOSITORY/actions/variables?per_page=100" '.variables[]?.name')"
environment_variables="$(gh_api_or_fail "repos/$REPOSITORY/environments/$ENVIRONMENT_NAME/variables?per_page=100" '.variables[]?.name')"

ok "repository secrets $(join_nonempty_names "$repo_secrets")"
ok "environment secrets $(join_nonempty_names "$environment_secrets")"
ok "repository variables $(join_nonempty_names "$repo_variables")"
ok "environment variables $(join_nonempty_names "$environment_variables")"

audit_required_names "secret" "$REQUIRED_SECRETS" "$repo_secrets" "$environment_secrets" "repository or $ENVIRONMENT_NAME environment"
audit_recommended_names "secret" "$RECOMMENDED_SECRETS" "$repo_secrets" "$environment_secrets"
audit_required_names "repository variable" "$REQUIRED_VARIABLES" "$repo_variables" "" "repository variables"
audit_recommended_names "repository variable" "$RECOMMENDED_VARIABLES" "$repo_variables" ""

if [ "$failures" -gt 0 ]; then
  echo "GitHub Actions secrets and variables audit failed with $failures missing required item(s)." >&2
  exit 1
fi

echo "GitHub Actions secrets and variables audit passed for $REPOSITORY/$ENVIRONMENT_NAME"
