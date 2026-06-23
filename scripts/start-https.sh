#!/usr/bin/env bash
# Generate a self-signed TLS certificate for OpenVideoKit and start the server over HTTPS.
#
# Usage:
#   ./scripts/start-https.sh              # generates cert if missing, serves HTTPS on :8765
#   ./scripts/start-https.sh --regen      # force regenerate the certificate
#   PORT=9000 ./scripts/start-https.sh    # custom port
#
# First load in a browser will warn about the self-signed cert.
# Click "Advanced → Proceed" to accept. After that it's cached.

set -euo pipefail

PORT="${OVK_PORT:-8765}"
CERT_DIR="${OVK_CERT_DIR:-/tmp/openvideokit-certs}"
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Generate cert if missing or --regen
if [[ "${1:-}" == "--regen" || ! -f "$CERT" || ! -f "$KEY" ]]; then
  echo "▸ Generating self-signed certificate..."
  mkdir -p "$CERT_DIR"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=openvideokit" \
    -addext "subjectAltName=IP:127.0.0.1,IP:0.0.0.0,DNS:localhost" \
    2>/dev/null
  echo "  ✓ $CERT"
  echo "  ✓ $KEY"
fi

# Kill any existing server on this port
lsof -ti ":$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

echo "▸ Starting OpenVideoKit on https://0.0.0.0:$PORT"
echo ""
echo "  Local:   https://localhost:$PORT"
echo "  LAN:     https://$(ipconfig getifaddr en0 2>/dev/null || echo '192.168.1.x'):$PORT"
echo ""
echo "  ⚠  Accept the self-signed cert warning on first load."
echo "  Press Ctrl+C to stop."
echo ""

cd "$PROJECT_DIR"
exec uv run python -m uvicorn openvideokit.app:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --ssl-certfile "$CERT" \
  --ssl-keyfile "$KEY"
