#!/usr/bin/env bash
#
# Build the Android app.
#
# The web bundle is a build input, not source, so it is rebuilt and staged here every time. Doing it
# by hand is how a package ends up carrying last week's page — the mistake this repository already
# made once, on the HarmonyOS side.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SDK="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

BUILD_ID="$(cd "$ROOT" && git rev-parse --short HEAD)"
[ -n "$(cd "$ROOT" && git status --porcelain)" ] && BUILD_ID="$BUILD_ID+uncommitted"
export BUILD_ID
echo "build $BUILD_ID"

echo "1/3  building the web bundle"
cd "$ROOT/apps/web" && BUILD_ID="$BUILD_ID" pnpm build >/dev/null

echo "2/3  staging it into the APK's assets"
rm -rf "$HERE/app/src/main/assets"
mkdir -p "$HERE/app/src/main/assets"
# Staged at the root, because the HTML refers to `/assets/…` and `/boxicons/…` absolutely.
cp -R "$ROOT/apps/web/dist/." "$HERE/app/src/main/assets/"

echo "3/3  gradle"
cd "$HERE"
./gradlew --no-daemon assembleDebug "$@"

echo
find "$HERE/app/build/outputs/apk" -name "*.apk" 2>/dev/null | while read -r apk; do
  echo "  $(basename "$apk")  $(stat -f%z "$apk") bytes"
done
