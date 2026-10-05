# HarmonyOS

Toolchain, device results, and packaging for the HarmonyOS target. Merged from the original
setup and measured-results documents.

Environment used for the measurements below: DevEco Studio 26.0.0 + HarmonyOS SDK
26.0.0.105 (API 26), on a `Mate 90 Pro` emulator (`phone_all_arm`, HarmonyOS 7.0.0).

## Status

| Question | Result | Evidence |
|---|---|---|
| Can a `.hap` be built without a Huawei account? | **Yes** | OpenHarmony SDK 7.0-Release (API 26), `BUILD SUCCESSFUL` |
| Does it run on the emulator? | **Yes, installed unsigned** | `hdc install` → `install bundle successfully` |
| Real IndexedDB quota | **3.42 GB** | `navigator.storage.estimate()` |
| Cleartext HTTP over the LAN | **Yes** | `http://192.168.3.213:18899/` → 200 in 6 ms |
| Is a cleartext configuration needed? | **No** | Cleartext works with no security configuration |
| `enablePrivateNetworkAccess(false)` | **Works** | Private-range addresses are reachable; without it, `ERR_ACCESS_DENIED` |
| WebAssembly / Service Worker / OPFS | **All supported** | Probe passed |
| `pointerType === "pen"` | **Unproven** | No stylus on the emulator |
| Reaching a self-hosted Trilium server directly | **No, because of CORS** | See below |

## The public toolchain

`apps/harmony-probe/setup-toolchain.sh` installs the build chain with no login anywhere:

```
OpenHarmony SDK 7.0-Release (API 26)
  https://repo.huaweicloud.com/openharmony/os/7.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz
  SHA-256 verified

@ohos/hvigor 6.26.8 + @ohos/hvigor-ohos-plugin 6.26.8
  https://repo.harmonyos.com/npm   (standard npm registry; configure @ohos:registry)
```

```bash
cd apps/harmony-probe
./setup-toolchain.sh    # download + verify + rearrange layout + install hvigor
./build.sh              # -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

The Huawei SDK and DevEco Studio are account-gated: the download API chain runs through
`signAgreement` / `querySign`, and every unauthenticated request returns 403/404. The
**OpenHarmony** SDK above is public and is what the scripts use.

### Configuration constraints

1. **The SDK layout is not what the tarball looks like.** hvigor looks for components at
   `<sdkRoot>/<platformVersion>/<component>`, e.g. `ohos-sdk/26.0.0/ets`. The tarball holds a
   flat `sdk/packages/ohos-sdk/darwin/*.zip`. In the wrong place the build reports
   `The SDK management mode has changed`.
2. **On API 26+ the SDK version numbers must be strings.** `compileSdkVersion`,
   `compatibleSdkVersion` and `targetSdkVersion` are written as `"26.0.0"`; the number `26`
   raises `Specification Limit Violation`.
3. **The same fields require `modelVersion` ≥ 6.0.0**, otherwise the build reports
   `The current modelVersion does not support setting ... as strings`. Both
   `hvigor-config.json5` and the root `oh-package.json5` need it.
4. **The OpenHarmony SDK has no `phone` device type.** The available types are
   `2in1 / default / tablet / tv / wearable / liteWearable`; "phone" maps to `default`.
   `"deviceTypes": ["phone"]` fails with an empty syscap intersection. `phone` exists only in
   the HarmonyOS SDK.

Point 4 means the public SDK verifies that a package builds, not how it behaves on a HarmonyOS
phone. Targeting HarmonyOS phones needs the account-gated HarmonyOS SDK.

## What needs a Huawei account

**Real-device signing and installation.** A Huawei developer account with 实名认证 (real-name
verification) is required to obtain a device-bound debug certificate, and the automatic
signing step in DevEco Studio is GUI-only. Without it there is no on-device install and no
AppGallery publishing. Whether a non-Chinese developer can complete 实名认证 is not confirmed
by official documentation.

Steps:

1. Register at the [Huawei Developer Alliance](https://developer.huawei.com/consumer/cn/) and
   complete 实名认证.
2. Install [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) for macOS
   (Apple Silicon). The only JDK on this machine's `PATH` is Temurin 25, while DevEco bundles
   JBR (OpenJDK 17); a foreign JDK is a documented cause of `Java command failed`. Let DevEco
   pull the HarmonyOS SDK under Settings → SDK.
3. Emulator: community reports conflict about arm64 Macs. On Apple Silicon, macOS must grant
   DevEco the **Hypervisor** permission.
4. Real device: under `File → Project Structure → Signing Configs`, enable **Automatically
   generate signature** (requires a GUI sign-in), then connect the device; `hdc list targets`
   should show it.

An unsigned `.hap` installs straight onto the emulator; only a real device needs a
device-bound certificate.

## Building with DevEco

```bash
cd apps/harmony-probe
export DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk
/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw assembleHap --no-daemon
# -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

If `apps/harmony-probe/node_modules` has the OpenHarmony build of hvigor installed, it
conflicts with the copy bundled with DevEco and the build reports
`The root node is not yet available for build`. Move it aside first.

## Emulator

```bash
E=/Applications/DevEco-Studio.app/Contents/tools/emulator
HDC=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc

"$E" -license accept
"$E" -list                                   # Mate 90 Pro / Mate X7 / MateBook Pro / MatePad Pro 13
"$E" -start "Mate 90 Pro" -noWindow &        # takes about 90s to start
"$HDC" list targets                          # -> 127.0.0.1:5555

"$HDC" install -r entry/build/default/outputs/default/entry-default-unsigned.hap
"$HDC" shell aa start -a EntryAbility -b org.triliumnotes.mobile
```

The emulator also offers `-instance <name> -click/-slide/-fill/-screenshot` for UI automation,
which can drive touch input to observe what value `pointerType` takes.

## The CORS obstacle

The WebView cannot reach a self-hosted Trilium server directly, and the reason is CORS rather
than HarmonyOS. Four measured comparisons:

```
https://api.github.com/            -> 200, 808ms   (HTTPS + CORS headers)
http://10.0.2.2:18899/             -> 200,   6ms   (cleartext HTTP + CORS headers)
http://192.168.3.213:18899/        -> 200,   6ms   (LAN cleartext + CORS headers)
http://10.0.2.2:18740/api/...      -> TypeError: Failed to fetch   (the Trilium server)
```

The first three show the network, cleartext HTTP and the LAN all work. The fourth differs only
in that Trilium sends no `Access-Control-Allow-Origin` and does send
`Cross-Origin-Resource-Policy: same-origin`. A WebView page on `resource://rawfile` is
cross-origin to everything, so ordinary CORS rules apply.
`enablePrivateNetworkAccess(false)` is necessary but not sufficient.

Two remedies, both described in [architecture.md](architecture.md):

1. The native shell relays API calls (`@ohos.net.http` exposed through `javaScriptProxy`).
2. Same-origin deployment (host the web core from the server, or reverse-proxy locally).

This is also why upstream's `apps/mobile` runs the whole server as WASM inside the WebView:
that removes the cross-origin problem entirely.

## Corrections to the research

| Research (`research/02-harmonyos-toolchain.md`) | Measured |
|---|---|
| ArkWeb = Chromium M132 | **Chromium 144**.0.0.0 (UA: `ArkWeb/7.0.0.105`) |
| File System Access API "assumed unsupported" | **Supported** (`showSaveFilePicker` exists) |
| Cleartext HTTP is blocked by default and needs configuration | **Does not hold** — cleartext works as-is |
| LAN requests need the API 20+ PNA switch | **Holds**; the API call succeeds |
| WASM / Service Worker / OPFS | All supported (consistent with the research) |

Not supported: `navigator.share`, `Notification`. The missing Web Share affects the
share-into-Trilium capture path, which needs another route.

**坚盾守护模式 (Secure Shield mode) was not tested** — it is enabled by hand and the emulator
has no switch for it. It disables WebAssembly and Service Worker, so the `sqlite-wasm` approach
would fail under it; the `SqlDatabase` abstraction (ADR D5) is the fallback.

## Stylus

The emulator has no stylus, so `pointerType === "pen"` cannot be measured. ArkWeb's
Pointer Events surface is complete:

```
hasPointerEvent        : true
getCoalescedEvents     : true
getPredictedEvents     : true
onpointerrawupdate     : true
maxTouchPoints         : 10
```

`getPredictedEvents` and `pointerrawupdate` are the keys to low-latency ink, and both are
present. ArkWeb is Chromium 144, and `pointerType === "pen"` is standard Chromium behaviour, so
it is likely to hold — but it is not verified until there is a real device with a stylus. If
it does not hold, ink annotation and freehand drawing need a native overlay per platform.

## The client on the device

`apps/harmony-probe` packages the real client, not a probe page. The artifact is 1.47 MB and
contains the full web core plus the ArkTS shell.

```bash
cd apps/harmony-probe
./package-app.sh                       # production build
./package-app.sh --e2e http://10.0.2.2:18740 <password> "标题"   # on-device self-test build
```

`--e2e` bakes the server address and password into the package so the app configures itself and
syncs on launch; the emulator can drive touch but cannot drive the WebView DOM. Production
builds contain none of these values.

The full protocol round trip, read out of hilog:

```
-> GET  /api/setup/status                              body=0    cookie=no
-> POST /api/login/sync                                body=148  contentType=application/json
-> GET  /api/sync/changed?...lastEntityChangeId=0                 cookie=yes
-> GET  /api/sync/changed?...lastEntityChangeId=3915              cookie=yes
-> POST /api/sync/finished
-> GET  /api/sync/check
shell: boot sync finished ok=true  "同步完成：拉取 2909 项，用时 0.7s"
```

The write direction was verified by reading the server's own database after capturing a note
offline on the emulator:

```
FOUND nphsq9BOXYyg  鸿蒙设备速记 013516
content: <p>由鸿蒙设备离线创建：鸿蒙设备速记 013516</p>
```

Notes created on the device and confirmed in the server database:

```
FOUND nphsq9BOXYyg  鸿蒙设备速记 013516      (Mate 90 Pro)
FOUND zV9FheB6b9jG  鸿蒙平板速记 014726      (from the clock-skew window, back-filled later)
FOUND keQyuGvjOUuq  鸿蒙平板速记 014726
FOUND vicvRiJItfj1  鸿蒙折叠屏速记 014946    (after the fix)
```

### Probe results

The probe prints its result to the web console as one line of JSON, and the ArkTS side forwards
it to hilog through `onConsole`:

```bash
"$HDC" shell hilog -x | grep -a PROBE_JSON | tail -1 | sed 's/.*PROBE_JSON //'
```

The probe page answers, item by item:

| Probe section | What it answers |
|---|---|
| Engine identity | userAgent and the real Chromium version |
| Stylus | `pointerType` counts, plus pressure/tiltX/tiltY |
| Storage | the real quota from `navigator.storage.estimate()`, plus a 32 MiB IndexedDB write test |
| Runtime features | WebAssembly, Service Worker, OPFS, CompressionStream, and so on |
| Cleartext HTTP | fetches a server address entered on the page and reports the outcome |

`onControllerAttached` in `Index.ets` calls `enablePrivateNetworkAccess(false)` and shows the
result in a status bar.

## Clock skew

Every response carries a `Date` header, so the offset between client and server is measurable.
The transport records `serverTime - localTime` on every response and, when a login fails with
the server's clock-tolerance error, recomputes the timestamp from the measured offset and
retries once:

```
POST /api/login/sync failed (HTTP 401): {"message":"Auth request time is out of sync,
please check that both client and server have correct time. The difference between
clocks has to be smaller than 5 minutes"}
```

Notes created during a clock-skew window stay in the local queue and are pushed automatically
once the clock is corrected. `tools/probe.ts` and `SyncTransport` expose the measured skew.

## Packaging the web core

The page must be served from `https://localhost`, not `resource://rawfile`. The rawfile origin
is `null`, and both of these fail there:

```
new Worker("probe.worker.js")
  -> SecurityError: Script at 'resource://rawfile/probe.worker.js'
     cannot be accessed from origin 'null'
navigator.storage.getDirectory()
  -> SecurityError: ... files are unsafe for access within a Web application
```

No Worker and no OPFS, and the client needs both. `onInterceptRequest` serves the static assets
from the package, which yields a real origin with no server running inside the app. Because the
interceptor is synchronous it cannot proxy the API; that goes through the `javaScriptProxy`
bridge, and the Worker relays each request through the main thread.

## Not done

- **A real device.** Needs a Huawei account with 实名认证 and a device-bound certificate.
  `pointerType === "pen"` and Secure Shield mode can only be verified there.
- **A stated minimum WebView version for the HarmonyOS-4.x tablet.** See
  [known-issues.md](known-issues.md).
