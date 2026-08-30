#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
if command -v tmux >/dev/null 2>&1; then
  pnpm test
else
  echo "Skipping tmux-backed integration tests: tmux is not installed on this gate host."
fi
pnpm run build
