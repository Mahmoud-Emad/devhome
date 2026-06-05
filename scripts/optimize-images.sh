#!/usr/bin/env bash
# Downscale the wallpaper images for performance: cap the longest side and
# re-compress as JPEG. Safe to re-run (won't upscale). Uses macOS `sips`,
# falling back to `ffmpeg`.
set -euo pipefail

MAX="${MAX:-2560}"
QUALITY="${QUALITY:-72}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/frontend/src/assets/images"

if [ ! -d "$DIR" ]; then
  echo "Image directory not found: $DIR" >&2
  exit 1
fi

have() { command -v "$1" >/dev/null 2>&1; }

if ! have sips && ! have ffmpeg; then
  echo "Need either 'sips' (macOS) or 'ffmpeg' installed." >&2
  exit 1
fi

optimize() {
  local f="$1"
  if have sips; then
    sips -Z "$MAX" -s formatOptions "$QUALITY" "$f" >/dev/null
  else
    local tmp="${f}.opt.jpg"
    ffmpeg -y -loglevel error -i "$f" \
      -vf "scale='min($MAX,iw)':-2" -q:v 4 "$tmp"
    mv "$tmp" "$f"
  fi
}

before=$(du -sh "$DIR" | awk '{print $1}')
count=0
shopt -s nullglob
for f in "$DIR"/*.jpg "$DIR"/*.jpeg "$DIR"/*.png; do
  optimize "$f"
  count=$((count + 1))
done
after=$(du -sh "$DIR" | awk '{print $1}')

echo "Optimized $count images (max ${MAX}px, q${QUALITY}): $before → $after"
