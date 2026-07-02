#!/usr/bin/env bash
# Start the OpenVideoKit dev stack in the background (nohup).
#
#   Python API  →  http://localhost:8000   (log → /tmp/ovk-api.log)
#   Vite dev    →  http://localhost:3000   (log → /tmp/ovk-vite.log)
#
# Usage:
#   ./scripts/dev.sh                # start both
#   ./scripts/dev.sh --stop         # kill both servers
#   API_PORT=9000 DEV_PORT=4000 ./scripts/dev.sh
#
# Both servers run detached — the script returns immediately.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$PROJECT_DIR/ovk-web"

API_PORT="${API_PORT:-8000}"
DEV_PORT="${DEV_PORT:-3000}"
MODE="${1:-}"

API_LOG="/tmp/ovk-server.log"
VITE_LOG="/tmp/ovk-vite.log"

# ── Stop ─────────────────────────────────────────────────────────────────
# Scoped to OUR ports only — never touch other vite/uvicorn processes on
# this machine (only what's bound to API_PORT / DEV_PORT).
if [[ "$MODE" == "--stop" ]]; then
  echo "Stopping OpenVideoKit servers..."
  lsof -ti ":$API_PORT" 2>/dev/null | xargs kill 2>/dev/null \
    && echo "  ✓ API stopped (port $API_PORT)" \
    || echo "  · API not running on port $API_PORT"
  lsof -ti ":$DEV_PORT" 2>/dev/null | xargs kill 2>/dev/null \
    && echo "  ✓ Vite stopped (port $DEV_PORT)" \
    || echo "  · Vite not running on port $DEV_PORT"
  exit 0
fi

# ── Kill anything already on our ports ───────────────────────────────────
lsof -ti ":$API_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti ":$DEV_PORT" 2>/dev/null | xargs kill 2>/dev/null || true

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || echo '192.168.1.x')"

# ── Start Python API (nohup, background) ─────────────────────────────────
cd "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/data"
OVK_PORT="$API_PORT" OVK_DATA_DIR="$PROJECT_DIR/data" nohup uv run python -m uvicorn openvideokit.app:app \
  --host 127.0.0.1 \
  --port "$API_PORT" \
  >"$API_LOG" 2>&1 &
API_PID=$!

for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$API_PORT/api/projects" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "  ✓ API   PID $API_PID  →  http://localhost:$API_PORT  (log: $API_LOG)"

# ── Start Vite dev (nohup, background) ───────────────────────────────────
cd "$WEB_DIR"
nohup pnpm dev -- --port "$DEV_PORT" --host 0.0.0.0 \
  >"$VITE_LOG" 2>&1 &
VITE_PID=$!

for i in $(seq 1 20); do
  if curl -sf "http://localhost:$DEV_PORT/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "  ✓ Vite  PID $VITE_PID  →  http://localhost:$DEV_PORT  (log: $VITE_LOG)"
echo "  ✓ LAN            →  http://$LAN_IP:$DEV_PORT"
echo ""
echo "  Stop: ./scripts/dev.sh --stop"
echo "  Logs: tail -f $API_LOG  |  tail -f $VITE_LOG"
