#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci
if command -v tmux >/dev/null 2>&1; then
  npm test
else
  echo "Skipping tmux-backed integration tests: tmux is not installed on this gate host."
fi
npm run build
