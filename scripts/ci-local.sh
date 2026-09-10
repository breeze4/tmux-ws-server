#!/bin/sh
# Run this repository's gate script inside the shared BeeBaby CI image, with
# the image that the check workflow pins and the two processors that the
# Woodpecker step gets. A browser test that depends on timing then fails on
# your machine before it fails in Woodpecker.
#
# Usage: sh scripts/ci-local.sh [GATE_ARGS...]
#
# The script takes no repository-specific value. It reads the image from
# .woodpecker/check.yaml and refuses an image that is not pinned by digest.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workflow="$root/.woodpecker/check.yaml"

if [ ! -f "$workflow" ]; then
  printf 'ci-local: no check workflow at %s\n' "$workflow" >&2
  exit 2
fi

image=$(sed -n 's/^[[:space:]]*image:[[:space:]]*\([^[:space:]#]*\).*$/\1/p' "$workflow" | head -1)

if [ -z "$image" ]; then
  printf 'ci-local: %s names no image\n' "$workflow" >&2
  exit 2
fi

case "$image" in
  *@sha256:*) ;;
  *)
    printf 'ci-local: %s names the image as %s, which is not a digest\n' "$workflow" "$image" >&2
    exit 2
    ;;
esac

printf 'ci-local: running the gate in %s\n' "$image"

exec docker run --rm --platform linux/amd64 --cpus 2 \
  -e CI=true \
  -v "$root":/work \
  -w /work \
  "$image" \
  bash scripts/ci-gates.sh "$@"
