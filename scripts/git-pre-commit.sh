#!/usr/bin/env sh

set -eu

ROOT_DIR=$(git rev-parse --show-toplevel)

printf '%s\n' 'pre-commit: running pnpm run check'
(
	cd "$ROOT_DIR"
	unset NODE_OPTIONS
	unset V8_INSPECTOR_OPTIONS
	pnpm run check
)

printf '%s\n' 'pre-commit: running pnpm run build'
(
	cd "$ROOT_DIR"
	unset NODE_OPTIONS
	unset V8_INSPECTOR_OPTIONS
	pnpm run build
)

printf '%s\n' 'pre-commit: all checks passed'
