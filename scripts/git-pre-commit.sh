#!/usr/bin/env sh

set -eu

ROOT_DIR=$(git rev-parse --show-toplevel)

printf '%s\n' 'pre-commit: checking Biome formatting/lint'
(
	cd "$ROOT_DIR"
	unset NODE_OPTIONS
	unset V8_INSPECTOR_OPTIONS
	if ! pnpm exec biome check .; then
		printf '%s\n' 'pre-commit: Biome check failed. Run `pnpm run lint`, re-stage, and commit again.' >&2
		exit 1
	fi
)

printf '%s\n' 'pre-commit: checking Prettier formatting'
(
	cd "$ROOT_DIR"
	unset NODE_OPTIONS
	unset V8_INSPECTOR_OPTIONS
	if ! pnpm exec prettier . --check; then
		printf '%s\n' 'pre-commit: Prettier check failed. Run `pnpm exec prettier . --write`, re-stage, and commit again.' >&2
		exit 1
	fi
)

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
