#!/bin/sh
# Every check that tmux-ws-server must pass. The check workflow runs
# `bash scripts/ci-gates.sh all` inside the shared BeeBaby CI image, and
# `sh scripts/ci-local.sh all` runs the same command in the same image on your
# machine. scripts/stamp-ci.py stamps this file only when the repository has
# none, so add the project's own checks to gate_project.
#
# Usage: bash scripts/ci-gates.sh [workflows|project|all]
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

usage() {
  printf '%s\n' "Usage: bash scripts/ci-gates.sh [workflows|project|all]" >&2
}

# Woodpecker gives ghcr_token to plugin steps only. The check reads every
# workflow file, the main-only publish and deploy workflows too, so a pull
# request fails before main does.
gate_workflows() {
  python3 "$root/scripts/check-ghcr-token.py" "$root"
}

gate_project() {
  cd "$root"
  pnpm install --frozen-lockfile
  if command -v tmux >/dev/null 2>&1; then
    pnpm test
  else
    printf 'ci-gates: skipping tmux-backed integration tests: tmux is not installed on this gate host\n'
  fi
  pnpm run build
}

target="${1:-all}"

case "$target" in
  workflows) gate_workflows ;;
  project) gate_project ;;
  all)
    gate_workflows
    gate_project
    ;;
  *)
    usage
    exit 2
    ;;
esac
