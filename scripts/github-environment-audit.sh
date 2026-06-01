#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT_NAME="${GITHUB_ENVIRONMENT:-production}"
REPOSITORY="${GITHUB_REPOSITORY:-}"
MIN_REVIEWERS="${GITHUB_ENV_MIN_REVIEWERS:-1}"
REQUIRE_REVIEWERS="${GITHUB_ENV_REQUIRE_REVIEWERS:-1}"
REQUIRE_BRANCH_POLICY="${GITHUB_ENV_REQUIRE_BRANCH_POLICY:-1}"
REQUIRE_WAIT_TIMER="${GITHUB_ENV_REQUIRE_WAIT_TIMER:-0}"
MIN_WAIT_TIMER_MINUTES="${GITHUB_ENV_MIN_WAIT_TIMER_MINUTES:-0}"
REQUIRED_BRANCH_POLICIES="${GITHUB_ENV_REQUIRED_BRANCH_POLICIES:-}"

usage() {
  cat <<'USAGE'
Usage:
  GITHUB_REPOSITORY=owner/repo GITHUB_ENVIRONMENT=production npm run ops:github-env:check

Environment:
  GITHUB_REPOSITORY                  GitHub repo in owner/name form. Defaults to git remote origin when possible.
  GITHUB_ENVIRONMENT                 Environment name to audit. Defaults to production.
  GITHUB_ENV_REQUIRE_REVIEWERS=1     Require GitHub Environment reviewers.
  GITHUB_ENV_MIN_REVIEWERS=1         Minimum reviewer entries when reviewers are required.
  GITHUB_ENV_REQUIRE_BRANCH_POLICY=1 Require protected/custom deployment branch policy.
  GITHUB_ENV_REQUIRED_BRANCH_POLICIES Comma-separated custom branch policies to require. Defaults to the repo default branch when custom branch policies are enabled.
  GITHUB_ENV_REQUIRE_WAIT_TIMER=0    Require a wait timer.
  GITHUB_ENV_MIN_WAIT_TIMER_MINUTES=0 Minimum wait timer minutes when wait timer is required.

Requires:
  gh authenticated with repo administration access.
USAGE
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "ok $*"
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

require_boolean() {
  local name="$1"
  local value="$2"
  if [ "$value" != "0" ] && [ "$value" != "1" ]; then
    fail "$name must be 0 or 1"
  fi
}

require_non_negative_integer() {
  local name="$1"
  local value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    fail "$name must be a non-negative integer"
  fi
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

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "Usage: $0" >&2
  exit 1
fi

require_boolean GITHUB_ENV_REQUIRE_REVIEWERS "$REQUIRE_REVIEWERS"
require_boolean GITHUB_ENV_REQUIRE_BRANCH_POLICY "$REQUIRE_BRANCH_POLICY"
require_boolean GITHUB_ENV_REQUIRE_WAIT_TIMER "$REQUIRE_WAIT_TIMER"
require_non_negative_integer GITHUB_ENV_MIN_REVIEWERS "$MIN_REVIEWERS"
require_non_negative_integer GITHUB_ENV_MIN_WAIT_TIMER_MINUTES "$MIN_WAIT_TIMER_MINUTES"

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

environment_names="$(gh_api_or_fail "repos/$REPOSITORY/environments?per_page=100" '.environments[]?.name')"
if ! grep -Fxq "$ENVIRONMENT_NAME" <<<"$environment_names"; then
  fail "GitHub Environment $ENVIRONMENT_NAME was not found in $REPOSITORY."
fi
ok "environment $REPOSITORY/$ENVIRONMENT_NAME"

if [ "$REQUIRE_REVIEWERS" = "1" ]; then
  reviewer_count="$(gh_api_or_fail "repos/$REPOSITORY/environments?per_page=100" ".environments[]? | select(.name == \"$ENVIRONMENT_NAME\") | [.protection_rules[]? | select(.type == \"required_reviewers\") | .reviewers[]?] | length" | head -n 1)"
  if [ "$reviewer_count" -lt "$MIN_REVIEWERS" ]; then
    fail "GitHub Environment $ENVIRONMENT_NAME must require at least $MIN_REVIEWERS reviewer(s); found $reviewer_count."
  fi
  ok "required reviewers $reviewer_count"
fi

if [ "$REQUIRE_BRANCH_POLICY" = "1" ]; then
  branch_policy_enabled="$(gh_api_or_fail "repos/$REPOSITORY/environments?per_page=100" ".environments[]? | select(.name == \"$ENVIRONMENT_NAME\") | ((.deployment_branch_policy.protected_branches // false) or (.deployment_branch_policy.custom_branch_policies // false))" | head -n 1)"
  if [ "$branch_policy_enabled" != "true" ]; then
    fail "GitHub Environment $ENVIRONMENT_NAME must restrict deployment branches."
  fi
  ok "deployment branch policy"

  custom_branch_policies="$(gh_api_or_fail "repos/$REPOSITORY/environments?per_page=100" ".environments[]? | select(.name == \"$ENVIRONMENT_NAME\") | .deployment_branch_policy.custom_branch_policies // false" | head -n 1)"
  if [ "$custom_branch_policies" = "true" ]; then
    required_branch_policies="$REQUIRED_BRANCH_POLICIES"
    if [ -z "$required_branch_policies" ]; then
      required_branch_policies="$(gh_api_or_fail "repos/$REPOSITORY" '.default_branch')"
    fi

    branch_policy_names="$(gh_api_or_fail "repos/$REPOSITORY/environments/$ENVIRONMENT_NAME/deployment-branch-policies" '.branch_policies[]?.name')"

    IFS=',' read -r -a required_policy_names <<<"$required_branch_policies"
    for required_policy_name in "${required_policy_names[@]}"; do
      required_policy_name="$(printf '%s' "$required_policy_name" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
      if [ -z "$required_policy_name" ]; then
        continue
      fi

      if ! grep -Fxq "$required_policy_name" <<<"$branch_policy_names"; then
        fail "GitHub Environment $ENVIRONMENT_NAME must allow deployment branch policy '$required_policy_name'."
      fi
    done

    policy_names="$(sed '/^$/d' <<<"$branch_policy_names" | paste -sd ',' -)"
    ok "custom deployment branch policies ${policy_names:-none}"
  fi
fi

if [ "$REQUIRE_WAIT_TIMER" = "1" ]; then
  wait_timer="$(gh_api_or_fail "repos/$REPOSITORY/environments?per_page=100" ".environments[]? | select(.name == \"$ENVIRONMENT_NAME\") | [.protection_rules[]? | select(.type == \"wait_timer\") | .wait_timer // 0] | max // 0" | head -n 1)"
  if [ "$wait_timer" -lt "$MIN_WAIT_TIMER_MINUTES" ]; then
    fail "GitHub Environment $ENVIRONMENT_NAME must have wait timer >= $MIN_WAIT_TIMER_MINUTES minute(s); found $wait_timer."
  fi
  ok "wait timer ${wait_timer}m"
fi

echo "GitHub Environment audit passed for $REPOSITORY/$ENVIRONMENT_NAME"
