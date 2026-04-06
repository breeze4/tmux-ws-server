#!/usr/bin/env bash
# Deploy beebaby-admin to beebaby from dev machine.
# Usage: ./deploy/deploy.sh
set -euo pipefail

HOST=beebaby
APP_DIR=dev/beebaby-admin
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Syncing code to $HOST:~/$APP_DIR"
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='server/public' \
  "$PROJECT_DIR/" "$HOST:$APP_DIR/"

echo "==> Installing deps and building"
ssh "$HOST" "cd ~/$APP_DIR && npm install && npm run build"

echo "==> Installing user systemd service"
ssh "$HOST" "mkdir -p ~/.config/systemd/user && cp ~/$APP_DIR/deploy/beebaby-admin.service ~/.config/systemd/user/ && systemctl --user daemon-reload"

echo "==> Restarting service"
ssh "$HOST" "systemctl --user restart beebaby-admin"

echo "==> Done. Status:"
ssh "$HOST" "systemctl --user status beebaby-admin --no-pager -l" || true
