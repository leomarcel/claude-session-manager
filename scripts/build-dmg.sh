#!/bin/bash
set -e

# Claude Session Manager — Build Script
# Usage:
#   ./scripts/build-dmg.sh                 # signed + notarized build (requires .env)
#   ./scripts/build-dmg.sh --unsigned      # unsigned build (no Apple account needed)
#   ./scripts/build-dmg.sh --publish       # signed + notarized + publish to GitHub Releases
#   ./scripts/build-dmg.sh --skip-install  # skip npm install

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Hard-coded non-secret Apple Developer info
export APPLE_ID="leo.marcel.pro@icloud.com"
export APPLE_TEAM_ID="39U4H5QT58"
# Force the correct signing identity (in case multiple Developer ID certs exist)
export CSC_NAME="Leo Marcel ($APPLE_TEAM_ID)"

# Load secrets from .env if present (APPLE_APP_SPECIFIC_PASSWORD, GH_TOKEN)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

echo ""
echo "  Claude Session Manager — Build"
echo "  ================================"
echo ""

# Parse args
SKIP_INSTALL=false
UNSIGNED=false
PUBLISH=false
for arg in "$@"; do
  case $arg in
    --skip-install) SKIP_INSTALL=true ;;
    --unsigned) UNSIGNED=true ;;
    --publish) PUBLISH=true ;;
  esac
done

# Check signing prerequisites if not unsigned
if [ "$UNSIGNED" = false ]; then
  if [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
    echo "  ERROR: APPLE_APP_SPECIFIC_PASSWORD not set."
    echo ""
    echo "  To generate one:"
    echo "    1. Go to https://appleid.apple.com"
    echo "    2. Sign in > Sign-In and Security > App-Specific Passwords"
    echo "    3. Click + and name it 'Claude Session Manager'"
    echo "    4. Copy the password (format: xxxx-xxxx-xxxx-xxxx)"
    echo ""
    echo "  Then create a .env file at the root with:"
    echo "    APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx"
    if [ "$PUBLISH" = true ]; then
      echo "    GH_TOKEN=ghp_your_github_token"
    fi
    echo ""
    echo "  Or run with --unsigned to skip signing."
    exit 1
  fi
  if [ "$PUBLISH" = true ] && [ -z "$GH_TOKEN" ]; then
    # Try to get token from gh CLI
    if command -v gh &> /dev/null; then
      GH_TOKEN="$(gh auth token 2>/dev/null || echo '')"
      export GH_TOKEN
    fi
    if [ -z "$GH_TOKEN" ]; then
      echo "  ERROR: GH_TOKEN not set and gh CLI not logged in."
      echo "  Add GH_TOKEN=ghp_... to .env or run 'gh auth login'."
      exit 1
    fi
  fi
fi

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

# Step 4: Package
if [ "$UNSIGNED" = true ]; then
  echo "[4/5] Packaging DMG (unsigned)..."
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac \
    --config.mac.identity=null --config.afterSign=null
elif [ "$PUBLISH" = true ]; then
  echo "[4/5] Packaging + signing + notarizing + publishing to GitHub..."
  echo "  (this can take 5-10 minutes for Apple notarization)"
  npx electron-builder --mac --publish always
else
  echo "[4/5] Packaging + signing + notarizing..."
  echo "  (this can take 5-10 minutes for Apple notarization)"
  npx electron-builder --mac
fi

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
  if [ "$UNSIGNED" = false ]; then
    echo "  Verify signature:"
    echo "    codesign -dv --verbose=4 \"release/mac-universal/Claude Session Manager.app\""
    echo "    stapler validate \"$DMG_FILE\""
  fi
  echo ""
fi
