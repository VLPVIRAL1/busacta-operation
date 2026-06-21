#!/usr/bin/env bash
# Build BusAcTa Operations desktop apps for Windows + macOS.
# The desktop app is a thin Electron shell that loads the published web app,
# so we package ONLY electron/ + a minimal package.json — never the project's
# node_modules. This keeps each ZIP under ~120 MB.
# Output: /mnt/documents/BusAcTaOne-{win32,darwin}-x64.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/electron-release"
STAGE="$ROOT/electron-stage"
DOCS="${DOCS_DIR:-/mnt/documents}"

cd "$ROOT"

if [ ! -d node_modules/electron ]; then
  echo "==> Installing electron + packager (one-time, ~150MB)"
  bun add -d electron @electron/packager
fi

# Build a minimal staging directory: just the Electron main/preload + a tiny
# package.json. Nothing else gets bundled into app.asar.
echo "==> Preparing minimal staging dir"
rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/electron"
cp electron/main.cjs electron/preload.cjs "$STAGE/electron/"
[ -f electron/icon.png ] && cp electron/icon.png "$STAGE/electron/" || true

cat > "$STAGE/package.json" <<'JSON'
{
  "name": "busacta-one-desktop",
  "version": "1.0.0",
  "description": "BusAcTa Operations desktop shell",
  "main": "electron/main.cjs",
  "private": true
}
JSON

mkdir -p "$OUT"

echo "==> Packaging Windows (x64)"
npx @electron/packager "$STAGE" "BusAcTaOne" \
  --platform=win32 --arch=x64 \
  --out="$OUT" --overwrite

echo "==> Packaging macOS (x64)"
npx @electron/packager "$STAGE" "BusAcTaOne" \
  --platform=darwin --arch=x64 \
  --out="$OUT" --overwrite

mkdir -p "$DOCS"
( cd "$OUT" && nix run nixpkgs#zip -- -qr "$DOCS/BusAcTaOne-win32-x64.zip"  BusAcTaOne-win32-x64 )
( cd "$OUT" && nix run nixpkgs#zip -- -qr "$DOCS/BusAcTaOne-darwin-x64.zip" BusAcTaOne-darwin-x64 )

rm -rf "$STAGE"

echo "Done:"
ls -lh "$DOCS"/BusAcTaOne-*.zip
