#!/usr/bin/env bash
# Builds a standalone copy of the ELYSION website: plain static files with ELYSION at the site root and
# three.js served from the site itself (no CDN), for hosts where you upload a single site folder
# (Netlify drop, an S3 bucket, your own server). GitHub Pages needs no build: it serves elysion/ as is.
#
#   tools/build-site.sh [out-dir]            (default: dist/site)
#   SITE_URL=https://example.org/ tools/build-site.sh   (where it will live, for link previews)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/site}"
SITE_URL="${SITE_URL:-}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$ROOT/src" "$ROOT/vendor" "$OUT/"
cp "$ROOT/styles.css" "$ROOT/elysion/site.css" "$ROOT/elysion/manifest.webmanifest" "$OUT/"
cp -r "$ROOT/elysion/icons" "$OUT/"

# the site page lives one folder down in the repository; at the site root its "../" paths become "./"
# (import maps only accept paths that start with "./", "../" or "/")
sed -e 's#\.\./#./#g' "$ROOT/elysion/index.html" > "$OUT/index.html"
# link previews point at the live site; pass SITE_URL to point them at another host
if [ -n "$SITE_URL" ]; then
  sed -i -e "s#https://raycoding1-collab.github.io/Space-/elysion/#${SITE_URL%/}/#g" "$OUT/index.html"
fi

# GitHub Pages: serve the files as they are (no Jekyll)
touch "$OUT/.nojekyll"
echo "built $(find "$OUT" -type f | wc -l) files in $OUT"
