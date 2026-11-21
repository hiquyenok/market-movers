#!/usr/bin/env bash
# Market Movers launcher: creates a local virtualenv, installs curl_cffi
# (needed so Yahoo Finance doesn't block requests), then starts the server.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "Creating virtualenv…"
  python3 -m venv .venv
fi
if ! .venv/bin/python -c "import curl_cffi" 2>/dev/null; then
  echo "Installing dependencies…"
  .venv/bin/pip install -q -r requirements.txt
fi

PORT="${1:-${PORT:-8787}}"
( sleep 1.5 && open "http://localhost:${PORT}" >/dev/null 2>&1 || true ) &
exec .venv/bin/python server.py "$PORT"
