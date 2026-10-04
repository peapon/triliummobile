#!/usr/bin/env bash
#
# Install the fully public OpenHarmony toolchain used to build the ArkWeb probe.
#
# Everything here is downloadable without a Huawei account:
#
#   - OpenHarmony SDK 7.0-Release (API 26)   from repo.huaweicloud.com
#   - @ohos/hvigor + @ohos/hvigor-ohos-plugin from repo.harmonyos.com
#
# What this does NOT give you, and why:
#
#   - The **HarmonyOS** SDK. Huawei's SDK is account-gated (its download API sits behind
#     getToolVersionDownloadUrl + signAgreement + querySign), and it is the one that carries the
#     `phone` device type and the newest ArkWeb build. The OpenHarmony SDK is a sibling, not a
#     substitute: this repo's probe module therefore declares deviceTypes
#     ["default","tablet"], because OpenHarmony has no `phone` definition.
#   - Signing or installing on a device. A debug certificate is bound to a registered device and
#     the signing step is GUI-only.
#
# The SDK layout matters and is not the one inside the tarball: hvigor resolves components at
# <sdkRoot>/<platformVersion>/<component>, i.e. .../ohos-sdk/26.0.0/ets. The tarball ships them
# flat under sdk/packages/ohos-sdk/darwin/*.zip, so this script rearranges them.
#
set -euo pipefail

PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PROBE_DIR/../.." && pwd)"
TOOLCHAIN="$REPO_ROOT/.toolchain"

SDK_URL="https://repo.huaweicloud.com/openharmony/os/7.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz"
SDK_SHA_URL="$SDK_URL.sha256"
PLATFORM_VERSION="26.0.0"

mkdir -p "$TOOLCHAIN"
cd "$TOOLCHAIN"

# ---------------------------------------------------------------- 1. OpenHarmony SDK

if [ ! -d "$TOOLCHAIN/ohos-sdk/$PLATFORM_VERSION/ets" ]; then
  if [ ! -f L2-SDK-MAC-M1-PUBLIC.tar.gz ]; then
    echo "==> downloading OpenHarmony SDK 7.0-Release (API 26), ~1.3 GB"
    curl -L --retry 3 -o L2-SDK-MAC-M1-PUBLIC.tar.gz "$SDK_URL"
    curl -sL -o L2-SDK-MAC-M1-PUBLIC.tar.gz.sha256 "$SDK_SHA_URL"
  fi

  echo "==> verifying checksum"
  expected="$(tr -d '[:space:]' < L2-SDK-MAC-M1-PUBLIC.tar.gz.sha256)"
  actual="$(shasum -a 256 L2-SDK-MAC-M1-PUBLIC.tar.gz | cut -d' ' -f1)"
  if [ "$expected" != "$actual" ]; then
    echo "checksum mismatch: expected $expected, got $actual" >&2
    exit 1
  fi
  echo "    ok"

  echo "==> extracting"
  rm -rf sdk-tmp
  mkdir -p sdk-tmp
  tar xzf L2-SDK-MAC-M1-PUBLIC.tar.gz -C sdk-tmp
  for zip in sdk-tmp/sdk/packages/ohos-sdk/darwin/*.zip; do
    unzip -q -o "$zip" -d "sdk-tmp/unpacked"
  done

  # hvigor wants <sdkRoot>/<platformVersion>/<component>
  echo "==> arranging into hvigor's expected layout: ohos-sdk/$PLATFORM_VERSION/<component>"
  rm -rf "ohos-sdk"
  mkdir -p "ohos-sdk/$PLATFORM_VERSION"
  for component in ets js native previewer toolchains; do
    mv "sdk-tmp/unpacked/$component" "ohos-sdk/$PLATFORM_VERSION/$component"
  done
  rm -rf sdk-tmp
fi

echo "==> SDK ready at $TOOLCHAIN/ohos-sdk/$PLATFORM_VERSION"
cat "ohos-sdk/$PLATFORM_VERSION/ets/oh-uni-package.json" | grep -E '"apiVersion"|"platformVersion"|"version"' || true

# ---------------------------------------------------------------- 2. hvigor

cd "$PROBE_DIR"
if [ ! -d node_modules/@ohos/hvigor ]; then
  echo "==> installing hvigor from repo.harmonyos.com"
  npm install --no-audit --no-fund
fi

cat > local.properties <<EOF
sdk.dir=$TOOLCHAIN/ohos-sdk
hwsdk.dir=$TOOLCHAIN/ohos-sdk
EOF

echo
echo "Done. Build with: $PROBE_DIR/build.sh"
