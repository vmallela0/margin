#!/usr/bin/env bash
# Packages dist/ into margin-v<version>.zip for Chrome Web Store upload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -p "require('./manifest.json').version")
OUT="$ROOT/releases"
ZIP="$OUT/margin-v${VERSION}.zip"

mkdir -p "$OUT"
rm -f "$ZIP"

bun run build

# Strip sourcemaps and .map references from dist before packing — the store
# doesn't need them and they bloat the bundle.
find dist -type f -name "*.map" -delete
find dist -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.css" \) \
  -exec sed -i '' -E '/^\/\/# sourceMappingURL=/d; /^\/\*# sourceMappingURL=.*\*\/$/d' {} +

( cd dist && zip -qr "$ZIP" . -x "*.DS_Store" )

echo ""
echo "packaged: $ZIP"
du -h "$ZIP" | awk '{print "size:     " $1}'
