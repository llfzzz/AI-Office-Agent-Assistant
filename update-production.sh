#!/usr/bin/env bash
# Update the production deployment of AI-Office-Agent-Assistant.
#
#   sudo ./update-production.sh
#
# The runtime is systemd-managed (office-agent.service + pocketbase.service,
# both User=lfz) with the API bound to loopback behind nginx, so this — not
# the old nohup-based start-production.sh — is the way to roll out updates.
# Git talks to GitHub with root's deploy key; everything that touches the
# working tree runs as the app user so ownership stays lfz:lfz.
set -euo pipefail

REPO=/var/www/AI-Office-Agent-Assistant
APP_USER=lfz

if [[ $EUID -ne 0 ]]; then
  echo "must run as root (needs systemctl and the GitHub deploy key)" >&2
  exit 1
fi
cd "$REPO"

echo "==> Pulling latest main"
git switch main
git pull --ff-only origin main
chown -R "$APP_USER:$APP_USER" "$REPO"

echo "==> Installing dependencies"
sudo -u "$APP_USER" -H npm install --no-audit --no-fund

echo "==> Building frontend"
sudo -u "$APP_USER" -H npm run build

echo "==> Applying PocketBase migrations"
sudo -u "$APP_USER" -H ./pocketbase migrate up

echo "==> Restarting services"
systemctl restart pocketbase.service
for _ in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8090/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
systemctl restart office-agent.service
for _ in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8788/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Health checks"
curl -fsS --max-time 5 http://127.0.0.1:8090/api/health >/dev/null
echo "pocketbase: OK"
curl -fsS --max-time 5 http://127.0.0.1:8788/api/health
echo
echo "==> Done — open https://woxiangchuanaj.top/office-agent/"
