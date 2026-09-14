#!/usr/bin/env sh

set -eu

cd "$(git rev-parse --show-toplevel)"
unset NODE_OPTIONS V8_INSPECTOR_OPTIONS

pnpm run check
pnpm run build

printf '%s\n' 'pre-commit: all checks passed'
