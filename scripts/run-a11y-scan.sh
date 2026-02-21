#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/docs/ux/a11y-scan"
mkdir -p "$OUT_DIR"

pushd "$ROOT_DIR" >/dev/null

npm run build >/tmp/a11y_build.log 2>&1
npm run start -- --hostname 127.0.0.1 --port 3000 >/tmp/a11y_start.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT

for i in {1..60}; do
  if curl -sSf http://127.0.0.1:3000 >/dev/null; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "Server did not start. Check /tmp/a11y_start.log"
    exit 1
  fi
done

npx axe http://127.0.0.1:3000 --save home.json --dir "$OUT_DIR" --load-delay 1000 || true
npx axe http://127.0.0.1:3000/app --save app.json --dir "$OUT_DIR" --load-delay 1000 || true
npx axe http://127.0.0.1:3000/about --save about.json --dir "$OUT_DIR" --load-delay 1000 || true
npx axe http://127.0.0.1:3000/app/demo/compare --save compare.json --dir "$OUT_DIR" --load-delay 1000 || true

echo "A11y scan complete. Reports saved in $OUT_DIR"

popd >/dev/null
