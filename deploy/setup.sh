#!/usr/bin/env bash
# One-time setup on beebaby. Run from dev machine:
#   ssh beebaby 'bash -s' < deploy/setup.sh
set -euo pipefail

APP_DIR=~/dev/beebaby-admin

echo "==> Creating app directory"
mkdir -p "$APP_DIR"

echo "==> Enabling lingering (so user services start on boot)"
loginctl enable-linger "$(whoami)" 2>/dev/null || echo "Warning: could not enable linger."

echo "==> Setup complete. Run deploy.sh from your dev machine to deploy."
