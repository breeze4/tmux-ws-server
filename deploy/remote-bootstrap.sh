#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

command -v tmux >/dev/null 2>&1 || {
  echo "tmux is required on the beebaby-admin host" >&2
  exit 1
}

npm ci
npm run build

mkdir -p ~/.config/systemd/user
cp deploy/beebaby-admin.service ~/.config/systemd/user/
systemctl --user daemon-reload
