#!/usr/bin/env bash
# Release main to production from your own computer, then check the live site.
#
#   bash scripts/release-to-production.sh             # everything
#   bash scripts/release-to-production.sh --help      # options
#
# Steps:
#   1. Update main and install dependencies.
#   2. Local checks: typecheck, lint, tests with coverage, release gate, build,
#      and the browser suite against a local production build.
#   3. Deploy that commit to Vercel production with the Vercel CLI.
#   4. Wait until production's /api/health reports that commit.
#   5. Run the browser suite against production (regression, axe checks and
#      the visual walkthrough; screenshots in test-results/walkthrough/).
#   6. Optionally store VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID as
#      GitHub secrets, so later merges to main deploy from CI on their own.
#
# Needs: git, Node 22 (see .nvmrc), npm, curl. The Vercel CLI is run with npx
# and asks you to log in the first time. Step 6 needs the GitHub CLI (gh).
# A summary is written to test-results/release-report.md.

set -euo pipefail

PRODUCTION_URL="${PRODUCTION_URL:-https://pdf-remediator-codex.vercel.app}"
VERCEL_CLI="vercel@63.1.2"
LOCAL_PORT="${LOCAL_PORT:-3100}"
BRANCH="main"

checks_only=0
run_checks=1
run_deploy=1
run_live=1
set_secrets=ask

usage() {
  cat <<'EOF'
Usage: bash scripts/release-to-production.sh [options]

  --checks-only     Run steps 1 and 2 only (no deploy, nothing sent anywhere).
  --skip-checks     Skip the local checks (step 2).
  --skip-deploy     Don't deploy; only check what production serves now.
  --skip-live       Stop after deploying; don't run the live browser suite.
  --set-secrets     Store the Vercel secrets in GitHub without asking.
  --no-secrets      Don't offer to store the Vercel secrets.
  --branch NAME     Release a branch other than main (for testing the script).
  -h, --help        Show this help.

Environment: PRODUCTION_URL (default https://pdf-remediator-codex.vercel.app),
LOCAL_PORT (default 3100), VERCEL_TOKEN (used instead of an interactive login),
PLAYWRIGHT_CHROMIUM_PATH (use an installed Chromium instead of downloading one).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --checks-only) checks_only=1 ;;
    --skip-checks) run_checks=0 ;;
    --skip-deploy) run_deploy=0 ;;
    --skip-live) run_live=0 ;;
    --set-secrets) set_secrets=yes ;;
    --no-secrets) set_secrets=no ;;
    --branch) BRANCH="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
mkdir -p test-results
report="test-results/release-report.md"
server_pid=""

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }
fail() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; record "FAILED: $*"; exit 1; }
record() { printf -- '- %s\n' "$*" >> "$report"; }

cleanup() {
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT

vercel_cli() {
  if [ -n "${VERCEL_TOKEN:-}" ]; then
    npx --yes "$VERCEL_CLI" "$@" --token="$VERCEL_TOKEN"
  else
    npx --yes "$VERCEL_CLI" "$@"
  fi
}

install_browser() {
  # PLAYWRIGHT_CHROMIUM_PATH points the browser suite at an existing Chromium.
  [ -n "${PLAYWRIGHT_CHROMIUM_PATH:-}" ] || npx playwright install chromium
}

health_version() {
  curl -sS --max-time 15 "$PRODUCTION_URL/api/health" 2>/dev/null |
    sed -n 's/.*"version":"\([0-9a-f]*\)".*/\1/p'
}

# 1. Update and install ---------------------------------------------------------
bold "1. Updating $BRANCH and installing dependencies"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "You have uncommitted changes. Commit or stash them first."
fi
git fetch -q origin "$BRANCH"
git checkout -q "$BRANCH"
git pull -q --ff-only origin "$BRANCH"
sha="$(git rev-parse HEAD)"
short_sha="${sha:0:7}"

required_node="$(tr -d '[:space:]v' < .nvmrc)"
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo none)"
case "$node_major" in
  20|21|22) [ "$node_major" = "$required_node" ] || note "Node $node_major works, but CI uses Node $required_node (.nvmrc)." ;;
  *) fail "Node 20 to 22 is required, $required_node preferred (found: $node_major). With nvm: nvm install && nvm use" ;;
esac

{
  echo "# Release report"
  echo
  echo "- Commit: $sha ($BRANCH)"
  echo "- Production: $PRODUCTION_URL"
  echo "- Started: $(date -u '+%Y-%m-%d %H:%M UTC')"
} > "$report"

npm ci --no-audit --no-fund
note "Installed dependencies for $short_sha."

if ! grep -q 'APP_COMMIT_SHA' next.config.mjs; then
  note "Warning: this commit predates the build-time version in /api/health, so a CLI deploy can't be confirmed by commit."
fi

# 2. Local checks ---------------------------------------------------------------
if [ "$run_checks" = 1 ]; then
  bold "2. Local checks"
  npm run typecheck || fail "typecheck"
  npm run lint || fail "lint"
  npm audit --omit=dev --audit-level=critical || fail "npm audit found a critical production advisory"
  npm run test:coverage || fail "unit tests"
  npm run test:release-gate || fail "release gate"
  npm run build || fail "production build"
  record "Typecheck, lint, audit, unit tests with coverage, release gate and build passed."

  install_browser
  npx next start -p "$LOCAL_PORT" > test-results/next-start.log 2>&1 &
  server_pid=$!
  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:$LOCAL_PORT/" > /dev/null && break
    sleep 1
  done
  curl -sf "http://127.0.0.1:$LOCAL_PORT/" > /dev/null || fail "local production server did not start (see test-results/next-start.log)"
  LIVE_BASE_URL="http://127.0.0.1:$LOCAL_PORT" npm run test:e2e || fail "browser suite against the local build"
  kill "$server_pid" 2>/dev/null || true
  server_pid=""
  record "Browser suite passed against a local production build."
else
  bold "2. Local checks skipped"
fi

if [ "$checks_only" = 1 ]; then
  bold "Done (checks only)"
  cat "$report"
  exit 0
fi

# 3. Deploy ---------------------------------------------------------------------
if [ "$run_deploy" = 1 ]; then
  bold "3. Deploying $short_sha to Vercel production"
  if [ -z "${VERCEL_TOKEN:-}" ] && ! npx --yes "$VERCEL_CLI" whoami > /dev/null 2>&1; then
    note "Log in to Vercel (a browser window opens)."
    npx --yes "$VERCEL_CLI" login
  fi
  if [ ! -f .vercel/project.json ]; then
    note "Link this folder to the existing Vercel project (choose pdf-remediator-codex)."
    vercel_cli link
  fi
  export GITHUB_SHA="$sha"
  vercel_cli pull --yes --environment=production
  vercel_cli build --prod
  deployment_json="test-results/vercel-deployment.json"
  vercel_cli deploy --prebuilt --prod --json > "$deployment_json" || fail "Vercel production deployment"
  deploy_url="$(node scripts/read-vercel-deployment.mjs "$deployment_json")" || fail "Vercel did not confirm a ready production deployment (see $deployment_json)"
  record "Deployed $short_sha to production ($deploy_url)."
else
  bold "3. Deploy skipped"
fi

# 4. Confirm production serves this commit -------------------------------------
bold "4. Waiting for $PRODUCTION_URL to serve $short_sha"
served=""
for _ in $(seq 1 40); do
  served="$(health_version || true)"
  [ "$served" = "$short_sha" ] && break
  note "Production reports '${served:-no version}'; waiting..."
  sleep 15
done
if [ "$served" != "$short_sha" ]; then
  fail "Production is not serving $short_sha (it reports '${served:-no version}')."
fi
record "Production serves $short_sha: $(curl -sS --max-time 15 "$PRODUCTION_URL/api/health")"

# 5. Live browser suite ---------------------------------------------------------
if [ "$run_live" = 1 ]; then
  bold "5. Browser suite against production"
  install_browser
  rm -rf test-results/walkthrough
  if LIVE_BASE_URL="$PRODUCTION_URL" npm run test:e2e; then
    record "Live browser suite passed (regression, axe and walkthrough)."
  else
    record "Live browser suite FAILED. See the output above and test-results/."
    live_failed=1
  fi
  record "Screenshots: test-results/walkthrough/"
  if command -v open > /dev/null 2>&1 && [ -d test-results/walkthrough ]; then
    open test-results/walkthrough
  fi
else
  bold "5. Live browser suite skipped"
fi

# 6. GitHub secrets for automatic deploys --------------------------------------
if [ "$set_secrets" != no ] && [ -f .vercel/project.json ]; then
  bold "6. Automatic deploys from CI"
  if ! command -v gh > /dev/null 2>&1; then
    note "Install the GitHub CLI (brew install gh) to store the Vercel secrets, or add them in the repo settings."
  else
    answer="y"
    if [ "$set_secrets" = ask ]; then
      printf '  Store VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID as GitHub secrets now? [y/N] '
      read -r answer
    fi
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
      org_id="$(node -p "require('./.vercel/project.json').orgId")"
      project_id="$(node -p "require('./.vercel/project.json').projectId")"
      token="${VERCEL_TOKEN:-}"
      if [ -z "$token" ]; then
        note "Create a token at https://vercel.com/account/tokens (scope: the team that owns the project)."
        printf '  Paste the Vercel token (input hidden): '
        read -rs token
        echo
      fi
      [ -n "$token" ] || fail "no token entered"
      printf '%s' "$token" | gh secret set VERCEL_TOKEN
      printf '%s' "$org_id" | gh secret set VERCEL_ORG_ID
      printf '%s' "$project_id" | gh secret set VERCEL_PROJECT_ID
      record "Stored VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID as GitHub secrets."
    fi
  fi
fi

bold "Done"
cat "$report"
[ "${live_failed:-0}" = 0 ] || exit 1
