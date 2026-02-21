#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.verapdf.yml"
SERVICE_URL="${VERAPDF_LOCAL_URL:-http://127.0.0.1:8081}"
PROFILE="${VERAPDF_VALIDATION_PROFILE:-ua1}"
FIXTURE_DEFAULT="$ROOT_DIR/fixtures/accessible.pdf"

usage() {
  cat <<'EOF'
Usage: scripts/verapdf-local.sh <up|down|status|smoke> [fixture.pdf]

Commands:
  up      Start local veraPDF REST service with docker compose.
  down    Stop and remove local veraPDF REST service.
  status  Print basic service status using /api/info.
  smoke   Validate a PDF fixture via /api/validate/<profile> and assert report shape.

Env:
  VERAPDF_LOCAL_URL            Default http://127.0.0.1:8081
  VERAPDF_VALIDATION_PROFILE   Default ua1
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

wait_for_ready() {
  local attempts=45
  local info_url="$SERVICE_URL/api/info"
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$info_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

run_up() {
  compose up -d
  if wait_for_ready; then
    echo "veraPDF is ready at $SERVICE_URL"
    return 0
  fi
  echo "veraPDF did not become ready at $SERVICE_URL within timeout." >&2
  exit 1
}

run_down() {
  compose down
}

run_status() {
  local info_url="$SERVICE_URL/api/info"
  if curl -fsS "$info_url"; then
    echo
  else
    echo "veraPDF is not reachable at $info_url" >&2
    exit 1
  fi
}

run_smoke() {
  local fixture="${1:-$FIXTURE_DEFAULT}"
  if [[ ! -f "$fixture" ]]; then
    echo "Fixture file not found: $fixture" >&2
    exit 1
  fi

  run_up

  local out_file
  out_file="$(mktemp /tmp/verapdf-report-XXXXXX.xml)"
  local validate_url="$SERVICE_URL/api/validate/$PROFILE"
  local http_code

  http_code="$(curl -sS -o "$out_file" -w '%{http_code}' -F "file=@$fixture;type=application/pdf" "$validate_url")"

  if [[ "$http_code" != "200" ]]; then
    echo "veraPDF validate request failed with status $http_code" >&2
    head -c 1000 "$out_file" >&2 || true
    exit 1
  fi

  if ! rg -q "validationReport" "$out_file"; then
    echo "veraPDF report does not contain a validationReport block." >&2
    head -c 1000 "$out_file" >&2 || true
    exit 1
  fi

  echo "Smoke test passed."
  echo "Report saved at $out_file"
}

main() {
  local cmd="${1:-}"
  if [[ -z "$cmd" ]]; then
    usage
    exit 1
  fi
  shift || true

  case "$cmd" in
    up)
      require_cmd docker
      require_cmd curl
      run_up
      ;;
    down)
      require_cmd docker
      run_down
      ;;
    status)
      require_cmd curl
      run_status
      ;;
    smoke)
      require_cmd docker
      require_cmd curl
      require_cmd rg
      run_smoke "${1:-}"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
