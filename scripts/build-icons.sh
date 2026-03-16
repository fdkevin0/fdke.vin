#!/usr/bin/env bash

set -euo pipefail

src="public/icons/icon-source.png"

if [[ ! -f "$src" ]]; then
	echo "Missing source icon: $src" >&2
	exit 1
fi

mkdir -p public/icons

build_png() {
	local size="$1"
	local output="$2"
	magick "$src" -resize "${size}x${size}" "$output"
}

build_png 32 "public/favicon-32x32.png"
build_png 96 "public/icons/icon-96.png"
build_png 120 "public/icons/icon-120.png"
build_png 180 "public/icons/apple-touch-icon.png"
build_png 192 "public/icons/icon-192.png"
build_png 512 "public/icons/icon-512.png"

echo "Generated $(find public/icons -maxdepth 1 -name '*.png' | wc -l | tr -d ' ') icon variants"
