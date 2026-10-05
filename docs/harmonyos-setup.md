# HarmonyOS feasibility check

Last updated: 2026-10-04

---

## Summary

| Question | Status | Evidence |
|---|---|---|
| Can the Huawei SDK / DevEco be obtained without an account? | ❌ **No** | The download API chain involves `signAgreement` / `querySign`; every unauthenticated request returns 403/404; the page HTML has no direct links |
| Can a working toolchain be assembled from **public** components? | ✅ **Yes** | OpenHarmony SDK 7.0-Release (API 26, 1.34 GB, `repo.huaweicloud.com`, SHA-256 verified) |
| Can ArkTS be compiled? | ✅ **Yes** | `CompileArkTS` passes and produces `ets/modules.abc` (ark24.0.0.0 VM) |
| Can a `.hap` be packaged? | ✅ **Yes** | `BUILD SUCCESSFUL`, 88,875 bytes, containing our `probe.html` |
| Can it be signed and installed on a device? | ❌ **No** | The debug certificate is bound to a specific device, the signing step is GUI-only, and it requires a Huawei account with 实名认证 (real-name verification) |
| Does ArkWeb have an API for calling a LAN-hosted server? | ✅ **Yes** | The SDK declarations contain `WebviewController.enablePrivateNetworkAccess(enable: boolean)`, `@since 20` |
| Does a WebView ↔ ArkTS bridge exist? | ✅ **Yes** | The `Web` component has `javaScriptProxy`, `onControllerAttached`, `mixedMode`, `domStorageAccess`, `databaseAccess` |
| **Does `pointerType === "pen"` hold in ArkWeb?** | ❓ **Unknown** | No Huawei documentation guarantees it; **it has to be measured on a real device** |
| **Does cleartext HTTP over the LAN actually work?** | ❓ **Unknown** | As above |
| **What is the real IndexedDB quota?** | ❓ **Unknown** | As above |

**In one line: the build chain is completely open and needs no account; the three remaining runtime questions can only be answered on a real device.**

---

## Verified: the public toolchain

`apps/harmony-probe/setup-toolchain.sh` sets all of this up in one step, with no login anywhere:

```
OpenHarmony SDK 7.0-Release (API 26)
  https://repo.huaweicloud.com/openharmony/os/7.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz
  SHA-256 verified

@ohos/hvigor 6.26.8 + @ohos/hvigor-ohos-plugin 6.26.8
  https://repo.harmonyos.com/npm   (standard npm registry; just configure @ohos:registry)
```

```bash
cd apps/harmony-probe
./setup-toolchain.sh    # download + verify + rearrange layout + install hvigor
./build.sh              # -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

### Four traps hit while setting this up (all solved, all baked into the script)

1. **The SDK layout is not what the tarball looks like.** hvigor looks for components at
   `<sdkRoot>/<platformVersion>/<component>`, i.e. `ohos-sdk/26.0.0/ets`. The tarball instead holds a
   flat `sdk/packages/ohos-sdk/darwin/*.zip`. Put it in the wrong place and you get
   `The SDK management mode has changed`, which is a highly misleading message.
2. **On API 26+ the SDK version numbers must be strings.** `compileSdkVersion` /
   `compatibleSdkVersion` / `targetSdkVersion` have to be written as `"26.0.0"`; writing the number
   `26` raises `Specification Limit Violation`.
3. **The same set of fields also requires `modelVersion` ≥ 6.0.0**, otherwise you get
   `The current modelVersion does not support setting ... as strings`. Both `hvigor-config.json5`
   and the root `oh-package.json5` need the change.
4. **The OpenHarmony SDK has no `phone` device type.** The available ones are
   `2in1 / default / tablet / tv / wearable / liteWearable`; "phone" maps to `default`.
   Writing `"deviceTypes": ["phone"]` fails with an empty syscap intersection. `phone` exists only
   in the **HarmonyOS SDK**.

> ⚠️ Point 4 means the **public SDK can verify whether it builds, but not how it behaves on a
> HarmonyOS phone.** To genuinely target HarmonyOS phones, the HarmonyOS SDK behind a Huawei
> account is still needed in the end.

---

## What you have to do

### Step 1 — Huawei developer account + 实名认证 (real-name verification)

Register at the [Huawei Developer Alliance](https://developer.huawei.com/consumer/cn/) and complete
**实名认证 (real-name verification)**.

⚠️ This is the hard gate on the whole HarmonyOS path: without it you cannot sign for a real device,
and you cannot publish to AppGallery. **Whether a non-Chinese developer can complete 实名认证 could
not be confirmed from official documentation during the research phase** — if you are not a Chinese
national, settle that point before investing further.

### Step 2 — Install DevEco Studio

Get the **macOS (Apple Silicon)** build from the
[download page](https://developer.huawei.com/consumer/cn/deveco-studio/).
This machine: macOS 26.7.1 / Apple M4 / about 84 GiB free.

Once it is installed, **deal with the JDK conflict first**: the only JDK on this machine's `PATH` is
Temurin **25**, while DevEco bundles **JBR (OpenJDK 17)**, and a foreign JDK is a documented
community cause of `Java command failed`.

Start DevEco and let it pull the **HarmonyOS SDK** (Settings → SDK), then note the path down.

### Step 3 — Can the emulator run (answer unknown, and risky)

Community reports contradict each other (there are records of arm64 Macs being unable to create an
emulator). Open Device Manager and try creating a Phone emulator.
On Apple Silicon, macOS has to grant DevEco the **Hypervisor** permission.

### Step 4 — Real device (if the emulator is unusable)

Under `File → Project Structure → Signing Configs`, tick **Automatically generate signature**
(requires signing in through the GUI). Connect a HarmonyOS phone; `hdc list targets` should show the
device.

---

## What to run once you have a device

The probe app is written and **builds**: `apps/harmony-probe`.

It answers all three questions on a single page:

| Probe section | What it answers |
|---|---|
| Engine identity | userAgent + the **real Chromium version** (the earlier claim of ArkWeb M132 could not be verified) |
| Stylus | `pointerType` counts; draw on the canvas with a stylus and a `pen: n` reading means ink works; also reports pressure/tiltX/tiltY |
| Storage | the real quota from `navigator.storage.estimate()` + a 32 MiB IndexedDB write stress test |
| Runtime features | item-by-item probes for WebAssembly, Service Worker, OPFS, CompressionStream and so on (**坚盾守护模式 (Secure Shield mode)** makes WASM/SW disappear) |
| Cleartext HTTP | enter your server address and fetch it directly; reports the real outcome |

`onControllerAttached` in `Index.ets` also calls `enablePrivateNetworkAccess(false)` and shows the
result in a status bar at the top.

Once installed, one run is all it takes:

```bash
export DEVECO_SDK_HOME=<HarmonyOS SDK path>
hdc install entry/build/default/outputs/default/entry-default-signed.hap
hdc shell aa start -a EntryAbility -b org.triliumnotes.mobile
```

(That `.hap` has to be signed with your certificate first — `build.sh` currently produces only an
unsigned package.)

---

## Impact on the architecture

- **No risk on the build side**: the ArkTS + ArkWeb compile-and-package chain is fully verified, and
  it can run in CI without an account.
- **Three runtime unknowns remain**, and `pointerType === "pen"` is the one that matters most: it
  decides whether ink annotation and freehand drawing are "one set of web code across platforms" or
  "a native overlay written once per platform".
- Given the settled scope (v1 is ink annotation + freehand drawing only, handwriting-to-text comes
  later), **if the probe passes, the HarmonyOS-side native work is almost zero** — one `Web`
  component plus one `javaScriptProxy` bridge.
