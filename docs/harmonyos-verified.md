# HarmonyOS feasibility check — measured results

Last updated: 2026-10-05
Environment: DevEco Studio 26.0.0 + HarmonyOS SDK 26.0.0.105 (API 26) + a `Mate 90 Pro` emulator (`phone_all_arm`, HarmonyOS 7.0.0)

---

## Summary

| Question | Result | Evidence |
|---|---|---|
| Can a `.hap` be built for HarmonyOS? | ✅ **Yes, and no Huawei account is needed** | `BUILD SUCCESSFUL`, see the commands below |
| Does it run on the **emulator**? | ✅ **Yes, installed unsigned** | `hdc install` → `install bundle successfully` |
| **Real IndexedDB quota** | ✅ **3.42 GB** | `navigator.storage.estimate()` |
| **Does cleartext HTTP over the LAN work?** | ✅ **Yes** | `http://192.168.3.213:18899/` → **200, 6ms** |
| Is a cleartext configuration needed? | ❌ **No** | Cleartext HTTP just works, with no security configuration of any kind |
| Does `enablePrivateNetworkAccess(false)` work? | ✅ **Yes** | Private-range addresses are reachable (without it you get `ERR_ACCESS_DENIED`) |
| WebAssembly / Service Worker / OPFS | ✅ **All supported** | Every probe passed |
| **`pointerType === "pen"`** | ⚠️ **Still unproven** | See below |
| Can it talk to a self-hosted Trilium server directly? | ❌ **No, because of CORS** | See "The most important finding" |

**In one line: HarmonyOS is technically far more capable than the research estimated (Chromium 144, cleartext usable, WASM/OPFS complete); the real obstacle is not the platform, it is that the Trilium server sends no CORS headers.**

---

## The most important finding: the real obstacle is CORS, not HarmonyOS

Four measured comparisons:

```
https://api.github.com/            -> 200, 808ms   (HTTPS + CORS headers)
http://10.0.2.2:18899/             -> 200,   6ms   (cleartext HTTP + CORS headers)
http://192.168.3.213:18899/        -> 200,   6ms   (LAN cleartext + CORS headers)
http://10.0.2.2:18740/api/...      -> TypeError: Failed to fetch   (the actual Trilium server)
```

The first three prove that **the network works, cleartext HTTP works, and the LAN works**. The only
difference in the fourth is that **Trilium sends no `Access-Control-Allow-Origin`** (and does send
`Cross-Origin-Resource-Policy: same-origin`).

The WebView page's origin is `resource://rawfile`, so every request is cross-origin and is decided by
ordinary CORS rules — **exactly the conclusion ADR D9 reached in a desktop browser**.

Therefore `enablePrivateNetworkAccess(false)` is **necessary but nowhere near sufficient**. To reach
a self-hosted server, one of the two following has to happen:

1. **The native shell relays on its behalf**: ArkTS sends the request with `@ohos.net.http` and
   exposes it to the page through `javaScriptProxy`. The page only talks to its own origin and never
   touches CORS.
2. **Same-origin deployment**: host the web core from the server itself, or start a local HTTP
   service on the native side to reverse-proxy it.

> This also explains why the official `apps/mobile` stuffs the whole server into the WebView to run
> as WASM — that way there is no cross-origin problem at all.

---

## Corrections to the research conclusions

| Research (`docs/research/02-harmonyos-toolchain.md`) | Measured |
|---|---|
| ArkWeb = Chromium **M132** | ❌ **Chromium 144**.0.0.0 (UA: `ArkWeb/7.0.0.105`) |
| File System Access API should be "assumed unsupported" | ❌ **Supported** (`showSaveFilePicker` exists) |
| Cleartext HTTP is blocked by default and needs configuration | ❌ **Does not hold** — cleartext works as-is |
| LAN requests need the API 20+ PNA switch | ✅ **Holds**, and that API call succeeds |
| WASM / Service Worker / OPFS | ✅ All supported (consistent with the research) |

Not supported: `navigator.share`, `Notification`. The missing `Web Share` affects the "share into
Trilium" capture path, so that has to go another way.

**坚盾守护模式 (Secure Shield mode) was not tested** — it is a mode the user turns on by hand, and
there is no switch for it on the emulator. It disables WASM and Service Worker, so the `sqlite-wasm`
approach would fail under it; the storage-layer interface abstraction (ADR D5) is exactly the
fallback left for that.

---

## Stylus: still unprovable, but the whole infrastructure is there

The emulator has no stylus, so `pointerType === "pen"` **cannot be measured**. What can be shown is
that ArkWeb's Pointer Events surface is **complete**:

```
hasPointerEvent        : true
getCoalescedEvents     : true
getPredictedEvents     : true
onpointerrawupdate     : true
maxTouchPoints         : 10
```

`getPredictedEvents` and `pointerrawupdate` are the keys to low-latency ink, and both are present.
ArkWeb is Chromium 144 and `pointerType === "pen"` is standard Chromium behaviour, so it **very
likely holds** — but it does not count as verified until there is a real device with a stylus.

**The risk is real**: if it does not hold, ink annotation and freehand drawing need a native overlay
written for each platform.

---

## Reproduction steps

### Build (no account needed)

```bash
cd apps/harmony-probe
export DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk
/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw assembleHap --no-daemon
# -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

> ⚠️ If `apps/harmony-probe/node_modules` has the OpenHarmony build of hvigor installed, it conflicts
> with the copy bundled with DevEco and you get `The root node is not yet available for build`.
> Move it aside before building with DevEco.

### Emulator

```bash
E=/Applications/DevEco-Studio.app/Contents/tools/emulator
HDC=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc

"$E" -license accept
"$E" -list                                   # Mate 90 Pro / Mate X7 / MateBook Pro / MatePad Pro 13
"$E" -start "Mate 90 Pro" -noWindow &        # takes about 90s to start
# wait for hdc to see the device:
"$HDC" list targets                          # -> 127.0.0.1:5555

"$HDC" install -r entry/build/default/outputs/default/entry-default-unsigned.hap
"$HDC" shell aa start -a EntryAbility -b org.triliumnotes.mobile
```

**An unsigned HAP installs straight onto the emulator** — only a real device needs a device-bound
debug certificate.

### Reading the probe results

The probe prints its result to the web console as one line of JSON, and the ArkTS side forwards it to
hilog through `onConsole`:

```bash
"$HDC" shell hilog -x | grep -a PROBE_JSON | tail -1 | sed 's/.*PROBE_JSON //'
```

That makes the result **machine-readable** with no need to screenshot the screen — this model cannot
read images, so that point is critical.

The emulator also offers `-instance <name> -click/-slide/-fill/-screenshot` for UI automation, which
can drive touch input to observe what value `pointerType` actually takes.

---

## The app is now running: the end-to-end loop closes here

`apps/harmony-probe` no longer installs the probe but **the real client**. Packaged with
`./package-app.sh`, the artifact is 1.47 MB and contains the full web core plus the ArkTS shell.

The full protocol round trip measured on the device (read out of hilog):

```
-> GET  /api/setup/status                              body=0    cookie=no
-> POST /api/login/sync                                body=148  contentType=application/json
-> GET  /api/sync/changed?...lastEntityChangeId=0                 cookie=yes
-> GET  /api/sync/changed?...lastEntityChangeId=3915              cookie=yes
-> POST /api/sync/finished
-> GET  /api/sync/check
shell: boot sync finished ok=true  "同步完成：拉取 2909 项，用时 0.7s"
```

(In that last line, `同步完成：拉取 2909 项，用时 0.7s` reads "sync complete: pulled 2,909 items in
0.7s".)

The **write direction** was verified the same way. One note was captured offline on the emulator and
then confirmed by **reading the server's own database**:

```
FOUND nphsq9BOXYyg  鸿蒙设备速记 013516
content: <p>由鸿蒙设备离线创建：鸿蒙设备速记 013516</p>
```

(The stored note title reads "HarmonyOS device quick note 013516", and its body "created offline from
a HarmonyOS device: HarmonyOS device quick note 013516".)

### Three required mechanisms, each one forced by a measurement

**1. The page must have a real origin.** The origin of `resource://rawfile` is `null`, and the
measured result is:

```
new Worker("probe.worker.js")
  -> SecurityError: Script at 'resource://rawfile/probe.worker.js'
     cannot be accessed from origin 'null'
navigator.storage.getDirectory()
  -> SecurityError: ... files are unsafe for access within a Web application
```

In other words **no Worker and no OPFS** — and the client needs both (the OPFS SAH-Pool VFS can only
run inside a Worker because of `createSyncAccessHandle`, and the replica lives in OPFS).

The fix: **serve the static assets out of the package with `onInterceptRequest`, and load the page
from `https://localhost/`**. The origin then becomes real, Worker and OPFS are both available, and
**no server has to run inside the app**.

**2. `onInterceptRequest` is synchronous, so it cannot proxy the API.** Its signature returns
`WebResourceResponse`, which cannot wait for a network round trip. So `https://localhost/api/...` can
only return `null`.

The fix: static assets go through the interceptor, the API goes through `triliumNative.request(...)`
injected by `javaScriptProxy` — an async method the page can await.

**3. The bridge is on the main thread, but the engine is in a Worker.** The sync engine has to be in
the Worker (that is where the database is), while the injected object exists only in the main frame.
So the Worker hands every request to the main thread to relay, the main thread calls the bridge, and
the result is sent back. `SyncTransport` already accepted a `fetchImpl`, so the protocol code **did
not change by a single line**.

### Packaging

```bash
cd apps/harmony-probe
./package-app.sh                       # production build
./package-app.sh --e2e http://10.0.2.2:18740 <password> "标题"   # on-device self-test build
```

`--e2e` bakes the server address and password into the package so the app configures itself and syncs
on launch — because the emulator can drive touch but cannot drive the WebView DOM, so there is no
other way to script the verification. Production builds contain none of these variables and the
function is inert.

## A real bug found and fixed on the device: clock skew

On the foldable emulator, every sync failed:

```
POST /api/login/sync failed (HTTP 401): {"message":"Auth request time is out of sync,
please check that both client and server have correct time. The difference between
clocks has to be smaller than 5 minutes"}
```

The emulator's clock was an hour behind the host. This is exactly the item ADR §5 lists as a "design
risk", and it **was hit on a real device for the first time**.

The fix is not to make the user set their own clock: **every response carries a `Date` header**, so
the offset is measurable. The transport layer now:

1. records `serverTime - localTime` on every response
2. when a login fails because of the clock, recomputes the timestamp from the measured offset and
   **retries once**

After the fix, on the same device:

```
shell: post-capture sync ok=true message="同步完成：拉取 0 项，用时 0.1s"
```

And the consequences of the **error** were absorbed by the offline-first design: the notes created
on the device during the clock-skew window stayed in the local queue and were pushed automatically
once the clock was corrected — the server's database shows every one of them arriving.

## Notes created on the device (confirmed by reading the server database)

```
FOUND nphsq9BOXYyg  鸿蒙设备速记 013516      (Mate 90 Pro)
FOUND zV9FheB6b9jG  鸿蒙平板速记 014726      (from the clock-skew window, back-filled later)
FOUND keQyuGvjOUuq  鸿蒙平板速记 014726
FOUND vicvRiJItfj1  鸿蒙折叠屏速记 014946    (after the fix)
```

## Not done yet

- **Real device**: needs a Huawei account with 实名认证 (real-name verification) plus a device-bound
  certificate. The emulator covered the vast majority of the runtime questions, but
  `pointerType === "pen"` and Secure Shield mode (坚盾守护模式) can only be verified on a real device.
- **Packaging the web core into the HAP**: right now the HAP holds only a probe page. The next step
  is to put the `apps/web` build output into `rawfile` and write the ArkTS API relay bridge (option 1
  above).
