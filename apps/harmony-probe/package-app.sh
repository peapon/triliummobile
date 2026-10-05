#!/usr/bin/env bash
#
# Package the web client into the HarmonyOS app and build a .hap.
#
# This is the whole application: the same TypeScript core the browser and the Node integration tests
# run, plus a small ArkTS shell that gives it a real origin and a way onto the network.
#
# Needs no Huawei account. DevEco Studio supplies the SDK, hvigor and the emulator.
#
# Usage:
#   ./package-app.sh                 # production build
#   ./package-app.sh --e2e <server> <password> [capture-title]
#                                    # test build that configures itself and syncs on boot
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
RAW_WEB="$APP_DIR/entry/src/main/resources/rawfile/web"

DEVECO_SDK="${DEVECO_SDK_HOME:-/Applications/DevEco-Studio.app/Contents/sdk}"
HVIGOR="/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw"

if [ ! -d "$DEVECO_SDK" ]; then
  echo "error: HarmonyOS SDK not found at $DEVECO_SDK" >&2
  echo "       install DevEco Studio, or set DEVECO_SDK_HOME" >&2
  exit 1
fi

# DevEco ships its own hvigor; a locally installed OpenHarmony hvigor in node_modules shadows it and
# fails with "The root node is not yet available for build".
if [ -d "$APP_DIR/node_modules/@ohos/hvigor" ]; then
  echo "error: $APP_DIR/node_modules contains a conflicting hvigor install." >&2
  echo "       move it aside; DevEco's bundled hvigor must be the one that runs." >&2
  exit 1
fi

export DEVECO_SDK_HOME="$DEVECO_SDK"

# ------------------------------------------------------------------ web build

# A build is made from the working tree, which is usually ahead of HEAD — the commit that captures
# it does not exist yet. Naming the build after HEAD alone therefore names the *previous* commit,
# and reading that off a device says the deploy failed when it did not. Say so instead.
if [ -n "${BUILD_ID:-}" ]; then
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]; then
    export BUILD_ID="${BUILD_ID}+uncommitted"
  fi
fi

if [ "${1:-}" = "--e2e" ]; then
  SERVER="${2:?usage: package-app.sh --e2e <server> <password> [capture-title]}"
  PASSWORD="${3:?password required}"
  CAPTURE="${4:-}"

  echo "==> building the web client (test build: auto-configure, boot sync, capture)"
  ( cd "$WEB_DIR" && \
    VITE_E2E_SERVER="$SERVER" \
    VITE_E2E_PASSWORD="$PASSWORD" \
    VITE_E2E_CAPTURE="$CAPTURE" \
    pnpm exec vite build )
else
  echo "==> building the web client (production)"
  ( cd "$WEB_DIR" && pnpm exec vite build )
fi

# ------------------------------------------------------------------ packaging

echo "==> staging the web assets into the package"
rm -rf "$RAW_WEB"
mkdir -p "$RAW_WEB"
cp -R "$WEB_DIR/dist/." "$RAW_WEB/"

echo "==> building the .hap"
cd "$APP_DIR"
rm -rf .hvigor entry/build build
"$HVIGOR" assembleHap --no-daemon "$@"

HAP="entry/build/default/outputs/default/entry-default-unsigned.hap"
[ -f "$HAP" ] || { echo "build reported success but $HAP is missing" >&2; exit 1; }

echo
echo "Built $HAP ($(stat -f%z "$HAP") bytes, unsigned)"
unzip -l "$HAP" | grep -E "rawfile/web|modules.abc" | head -12
