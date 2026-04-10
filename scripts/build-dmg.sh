#!/bin/bash
set -e

# Claude Session Manager — Build Script
# Usage: ./scripts/build-dmg.sh [--skip-install]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo ""
echo "  Claude Session Manager — Build"
echo "  ================================"
echo ""

# Parse args
SKIP_INSTALL=false
for arg in "$@"; do
  case $arg in
    --skip-install) SKIP_INSTALL=true ;;
  esac
done

# Step 1: Install dependencies
if [ "$SKIP_INSTALL" = false ]; then
  echo "[1/5] Installing dependencies..."
  npm install --no-audit --no-fund 2>&1 | tail -1
else
  echo "[1/5] Skipping install (--skip-install)"
fi

# Step 2: Rebuild native modules for Electron
echo "[2/5] Rebuilding native modules for Electron..."
npx electron-rebuild 2>&1 | tail -1

# Step 3: Build TypeScript + Webpack
echo "[3/5] Building application..."
npm run build 2>&1 | tail -1

# Step 4: Package as DMG
echo "[4/5] Packaging DMG..."
npx electron-builder --mac dmg 2>&1 | grep -E "dmg|Building|artifact"

# Step 5: Done
echo ""
echo "[5/5] Build complete!"
echo ""

# Find the output DMG
DMG_FILE=$(find "$ROOT_DIR/release" -name "*.dmg" -maxdepth 1 2>/dev/null | head -1)
if [ -n "$DMG_FILE" ]; then
  SIZE=$(du -h "$DMG_FILE" | cut -f1)
  echo "  DMG: $DMG_FILE"
  echo "  Size: $SIZE"
  echo ""
  echo "  To install: open the DMG and drag to Applications"
  echo ""
fi
