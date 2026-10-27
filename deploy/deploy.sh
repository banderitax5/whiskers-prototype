#!/usr/bin/env bash
# Ship a new build to a provisioned VM. Run from the repo root on your machine:
#
#   HOST=deploy@1.2.3.4 ./deploy/deploy.sh
#
# What it does:
#   1. builds the frontend locally (Vite needs more RAM than a free VM has)
#   2. rsyncs backend sources + the built frontend dist to /opt/whiskers
#   3. runs npm ci --omit=dev on the VM (sharp downloads its ARM/x64 binary there)
#   4. restarts the API and reloads Caddy
#
# Backend .env is never touched: it lives only on the server. Node modules are
# skipped on upload and installed on the host so native binaries (sharp) match
# the VM's architecture.

set -euo pipefail

HOST="${HOST:?Set HOST=user@ip, e.g. HOST=deploy@20.1.2.3}"
REMOTE_DIR="${REMOTE_DIR:-/opt/whiskers}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building frontend"
(cd "$REPO_ROOT/frontend" && npm ci --no-audit --no-fund && npm run build)

echo "==> Uploading backend sources"
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'test/e2e.ps1' \
  "$REPO_ROOT/backend/" "$HOST:$REMOTE_DIR/backend/"

echo "==> Uploading frontend build"
rsync -az --delete "$REPO_ROOT/frontend/dist/" "$HOST:$REMOTE_DIR/frontend/dist/"

echo "==> Installing backend dependencies on the VM"
ssh "$HOST" "cd $REMOTE_DIR/backend && npm ci --omit=dev --no-audit --no-fund"

# The Caddyfile carries the production security headers (CSP included), so a
# header change has to ship with the code. Validate first: a bad config would
# otherwise only surface on the next reload/restart. Set SKIP_CADDYFILE=1 if
# the VM's live Caddyfile is hand-tuned (e.g. a Cloudflare Origin Certificate)
# and you would rather merge deploy/Caddyfile by hand.
if [[ "${SKIP_CADDYFILE:-0}" == "1" ]]; then
  echo "==> Skipping Caddyfile install (SKIP_CADDYFILE=1) - merge deploy/Caddyfile by hand"
else
  echo "==> Installing Caddy config"
  scp "$REPO_ROOT/deploy/Caddyfile" "$HOST:/tmp/whiskers-Caddyfile"
  ssh "$HOST" "sudo caddy validate --config /tmp/whiskers-Caddyfile --adapter caddyfile && sudo install -m 0644 /tmp/whiskers-Caddyfile /etc/caddy/Caddyfile && rm -f /tmp/whiskers-Caddyfile"
fi

echo "==> Restarting services"
ssh "$HOST" "sudo systemctl restart whiskers-api && sudo systemctl reload caddy"

echo "==> Health check"
sleep 2
ssh "$HOST" "curl -fsS http://127.0.0.1:4141/health && echo"

echo "Deployed to $HOST"
