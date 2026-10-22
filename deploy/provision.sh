#!/usr/bin/env bash
# One-time provisioning for a fresh Ubuntu 22.04/24.04 VM (Azure B2s or any
# similar small Linux host). Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/.../deploy/provision.sh | bash
#
# or copy it to the VM and run:  sudo bash provision.sh
#
# What it does:
#   1. creates an unprivileged `whiskers` user and an /opt/whiskers tree
#   2. installs Node.js 22 and Caddy
#   3. turns on 2 GB of swap (a 2 GB RAM box needs headroom for sharp/Node)
#   4. enables the firewall (22/80/443 only)
#   5. installs the systemd unit and the Caddyfile
#
# It deliberately does NOT create backend/.env - that file holds secrets and
# must be written by hand on the server. See deploy/DEPLOY.md.

set -euo pipefail

APP_USER=whiskers
APP_DIR=/opt/whiskers
NODE_MAJOR=22

if [[ $EUID -ne 0 ]]; then
  echo "This script must run as root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Base packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw git jq

echo "==> App user and directory layout"
id -u "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"/{backend,frontend/dist,deploy,secrets}
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "==> Node.js $NODE_MAJOR"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
node --version

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
caddy version

echo "==> Swap (2 GB)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Prefer disk over swap until memory is genuinely tight, so a burst does not
# turn into seconds of thrash on a small VM.
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "==> Firewall (22/80/443)"
ufw --force default deny incoming >/dev/null
ufw --force default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> systemd unit"
install -m 0644 "$(dirname "$0")/whiskers-api.service" /etc/systemd/system/whiskers-api.service
systemctl daemon-reload
systemctl enable whiskers-api >/dev/null 2>&1 || true

echo "==> Caddyfile"
install -m 0644 "$(dirname "$0")/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null 2>&1 || true

cat <<EOF

Provisioning complete. Next steps (see deploy/DEPLOY.md):

  1. Write secrets:   sudo -u whiskers nano $APP_DIR/backend/.env
     (copy backend/.env.example and fill in SUPABASE_URL, SUPABASE_SERVICE_KEY,
      SUPABASE_ANON_KEY, ENCRYPTION_KEY, BREVO_API_KEY, MAIL_FROM_EMAIL)
  2. Ship code:       run deploy/deploy.sh from your machine
  3. Point DNS:       A record for your domain -> this VM's public IP
  4. Start:           sudo systemctl start whiskers-api caddy
EOF
