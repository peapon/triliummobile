#!/usr/bin/env bash
#
# Build the ArkWeb capability probe into a .hap, using only publicly downloadable components.
#
# No Huawei account is needed for any of this. Signing and installing are the only steps that
# require one, and they are deliberately not attempted here.
#
# Prerequisites (run once):
#   ./setup-toolchain.sh
#
set -euo pipefail

PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PROBE_DIR/../.." && pwd)"
export DEVECO_SDK_HOME="$REPO_ROOT/.toolchain/ohos-sdk"

if [ ! -d "$DEVECO_SDK_HOME/26.0.0/ets" ]; then
  echo "error: OpenHarmony SDK not found at $DEVECO_SDK_HOME/26.0.0" >&2
  echo "       run ./setup-toolchain.sh first" >&2
  exit 1
fi

if [ ! -d "$PROBE_DIR/node_modules/@ohos/hvigor" ]; then
  echo "error: hvigor is not installed in $PROBE_DIR" >&2
  echo "       run: (cd $PROBE_DIR && npm install)" >&2
  exit 1
fi

cd "$PROBE_DIR"
rm -rf .hvigor entry/build build

node node_modules/@ohos/hvigor/bin/hvigor.js assembleHap --no-daemon "$@"

HAP="entry/build/default/outputs/default/entry-default-unsigned.hap"

if [ ! -f "$HAP" ]; then
  echo "build reported success but $HAP is missing" >&2
  exit 1
fi

echo
echo "Built $HAP ($(stat -f%z "$HAP") bytes, unsigned)"
echo
echo "Contents:"
unzip -l "$HAP" | sed -n '4,$p' | sed '$d' | sed '$d' | sed '$d'
