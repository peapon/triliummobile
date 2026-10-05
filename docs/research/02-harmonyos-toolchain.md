# 02 — Shipping a HarmonyOS (鸿蒙) app in 2026: toolchain, frameworks, ArkWeb, distribution

Research date: **2026-10-04** (Asia/Shanghai). Author: research subagent.
Scope: a note-taking app needing (1) offline storage, (2) a WebView-based rich-text editor,
(3) background sync, (4) local HTTP access to a self-hosted server — shipped on HarmonyOS
phone + tablet, cross-platform with Android/iOS.

> **Confidence convention.** `[verified]` = primary/official source fetched or directly quoted.
> `[reported]` = credible secondary source (maintainer blog, vendor article). `[UNCERTAIN]` = could not
> confirm from a primary source; treat as a hypothesis to test, not a fact.
> Many `developer.huawei.com` doc pages are JavaScript-rendered and return only a page title to a
> plain HTTP fetch, so several official pages below are cited by URL but were verified only via
> search-index snippets or mirrors. Those are marked.

---

## 1. Local toolchain audit — actual output from this Mac

Commands were run verbatim; output is real.

```
$ which ohpm hvigorw hvigor node java
/Users/penn/.local/bin/node
/usr/bin/java
exit=1                                  # ohpm, hvigorw, hvigor: NOT FOUND

$ ls -d /Applications/DevEco-Studio.app 2>/dev/null
NOT FOUND
$ ls ~/Library/Huawei 2>/dev/null
NOT FOUND
$ ls ~/Library/OpenHarmony 2>/dev/null
NOT FOUND
$ echo "[$DEVECO_SDK_HOME]"
[]                                      # unset / empty

$ sw_vers
ProductName:    macOS
ProductVersion: 26.7.1
BuildVersion:   25G313
$ uname -m
arm64                                   # Apple M4 (sysctl: Apple M4)
```

```
$ ls ~/Library/Android/sdk | head      # (no output — directory absent)
$ echo "[$ANDROID_HOME] [${ANDROID_SDK_ROOT}]"
[] []                                   # both unset
$ java -version
openjdk version "25.0.1" 2025-10-21 LTS
OpenJDK Runtime Environment Temurin-25.0.1+8 (build 25.0.1+8-LTS)
$ /usr/libexec/java_home -V
    25.0.1 (arm64) "Eclipse Adoptium" - "OpenJDK 25.0.1"  # ONLY JDK installed
$ xcode-select -p
/Library/Developer/CommandLineTools    # CommandLineTools only, NO full Xcode
$ ls -d /Applications/Xcode*.app
NO FULL XCODE
$ ls -d /Applications/Android\ Studio.app
NO ANDROID STUDIO
```

Additional facts: Node **v22.23.1**, npm **10.9.8**, 16 GB RAM, **87 GiB free** on `/`.
Repo state: `docs/research/` was **empty** before this file.

### 1.1 What is present vs missing

| Component | State | Consequence |
|---|---|---|
| DevEco Studio IDE | **MISSING** | Cannot build, sign or run a `.hap` at all |
| HarmonyOS SDK (`$DEVECO_SDK_HOME`, `~/Library/Huawei`) | **MISSING** | No `hdc`, no API stubs, no previewer |
| `ohpm` (package manager) | **MISSING** | Cannot resolve `oh-package.json5` deps |
| `hvigor` / `hvigorw` (build tool) | **MISSING** | No CLI build path |
| JDK | Temurin **25** only, at `/usr/bin/java` | DevEco bundles its own **JBR (OpenJDK 17)**; a stray system JDK on `PATH`/`JAVA_HOME` is a known cause of `Java command failed` ([community Mac setup guide](https://github.com/Octo-o-o-o/harmonyos-ai-workspace/blob/main/00-getting-started/01-environment-setup-mac.md)) `[reported]` |
| Android SDK | **MISSING** | Cannot produce an Android build for comparison |
| Android Studio | **MISSING** | Required only by the KMP/CMP flow (see §3.1) |
| Full Xcode | **MISSING** (CLT only) | Cannot produce an iOS build |
| Node.js 22.23.1 / npm 10.9.8 | **PRESENT** | Meets RNOH's Node ≥ 20 and the >= 22.11 template hint ([RNOH env](https://harmonyosdev.csdn.net/6a9fcdd5790f037e6e39a176.html)) |
| Disk / RAM / CPU | 87 GiB free, 16 GB, M4 arm64 | Sufficient: DevEco+SDK ≈ 3–6 GB download, and the community guide asks for ≥ 30 GB free `[reported]` |

**Bottom line: this machine has no HarmonyOS toolchain whatsoever.** Every `.hap`-producing option in
§3 starts with a multi-GB GUI install that has not happened yet.

---

## 2. HarmonyOS NEXT vs HarmonyOS 4 — the APK compatibility story (2026)

**The short answer: HarmonyOS NEXT / HarmonyOS 5+ cannot run Android APKs. HarmonyOS 4 and earlier
could — they carried an AOSP-based compatibility layer. As of 2026 that layer is gone at the
framework level, and the split is now permanent.**

- OpenHarmony **7.0 Beta1** (landed on GitCode 2026-05, API level **26**) is reported to have
  **removed the Android APK compatibility layer** on standard phone-class devices and to run pure
  ArkTS applications — the "纯血鸿蒙 / pure-blood HarmonyOS" milestone
  ([analysis](https://blog.csdn.net/qq8864/article/details/161335409) `[reported]`;
  [Huawei forum thread on the same topic](https://developer.huawei.com.cn/consumer/cn/forum/topic/0202220025642165354) `[reported]`).
- **HarmonyOS 7** shipped commercially on **2026-10-01** with the Mate 90 series; Huawei states
  HarmonyOS 6 + HarmonyOS 7 device count has passed **90 million** and AppGallery offers
  **>450,000** apps/services ([Xinhua, 2026-10-02](https://www.news.cn/tech/20261002/518302b4f9234a73a2bf167b50a62ec3/c.html)) `[verified]`.
- HarmonyOS **2/3/4** phones can install APKs; HarmonyOS **5+ / NEXT** cannot and require a
  third-party compatibility tool to run Android apps
  ([Huawei forum Q&A](https://developer.huawei.com/consumer/cn/forum/topic/0203224422054114010),
  [summary](https://blog.csdn.net/2503_93347234/article/details/159973185)) `[reported]`.
- Note the widely-reported **卓易通 (Zhuoyitong)** third-party app, which is *the* reason some users
  see APKs "just work" on a NEXT device — it is an external compatibility shim, not OS support
  ([Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0202200215473501107),
  [forum](https://developer.huawei.com/consumer/cn/forum/topic/0202202686633827516)) `[reported]`.

**Implication for us: there is no "ship the Android APK to HarmonyOS" shortcut.** Any HarmonyOS
presence requires a HarmonyOS build target. (`[UNCERTAIN]`: the precise per-version cut-off line
between "has APK layer" and "does not" for every HarmonyOS 4.x/5.x minor release was not verified
from a Huawei changelog, because the relevant release-note pages are JS-rendered. The direction of
travel is unambiguous and the practical conclusion does not depend on the exact line.)

---

## 3. Capability matrix — candidate stacks

"Builds on this Mac?" answers the question **as of today, with the toolchain in §1** (i.e. nothing
installed). "Builds `.hap`?" is about the tool's capability once installed.

| Candidate stack | Builds on this Mac **today**? | Builds a `.hap`? | Shares code with Android/iOS? | Offline storage | Rich-text editor viability | Maintenance risk | Effort |
|---|---|---|---|---|---|---|---|
| **ArkTS native (ArkUI)** | ❌ — needs DevEco Studio (missing) | ✅ Yes — first-class, `hvigor` → `.hap` | ❌ None. ArkTS/ArkUI is HarmonyOS-only | ✅ `relationalStore` (SQLite-like), `preferences`, `file.fs` ([ArkUI-X 6.0.0 lists `ohos.data.relationalStore`/`preferences`/`ohos.file.fs`](https://cloud.tencent.cn/developer/article/2610877)) | ⚠️ Would require a *native* ArkUI editor (RichEditor), not the planned WebView editor | 🟢 Lowest — Huawei's own stack, the only one with a guaranteed roadmap | 🔴 Highest — a whole second app |
| **ArkUI-X 6.0.0** | ❌ — needs DevEco Studio | ✅ Yes (HarmonyOS/OpenHarmony; Android 8+/iOS 10+ also targeted) | ✅ *But inverted*: shared code is ArkTS, so you'd rewrite Android/iOS in ArkTS | ✅ via cross-platform `ohos.file.fs`, `ohos.data.relationalStore`, `ohos.net.http` | ⚠️ Web component cross-platform support was only "补齐" (filled in) in 6.0.0 | 🟡 Version cadence is slow ("好久不见" = long time no release); 6.0.0 shipped ~2025-12-25 | 🟠 High — if Android/iOS already exist in Kotlin/Swift |
| **Flutter-ohos (`flutter_flutter` fork)** | ❌ — needs DevEco Studio **+** the fork toolchain | ✅ Yes — `flutter build hap`, output `ohos/entry/build/default/outputs/default/entry-default-signed.hap` ([guide](https://cloud.tencent.cn/developer/article/2615318)) | ✅ Dart/Flutter, incl. Android/iOS/web | ✅ via adapted plugins (sqflite/drift-class packages among 300+ adapted) | ✅ WebView plugin exists in the adapted set — but it *is* ArkWeb underneath, so all §4 caveats apply | 🟡 Maintaining team exists (Flutter SIG), but **official Flutter has no HarmonyOS support**; the fork lags upstream by ~4 months by design | 🟠 Medium–high |
| **RNOH (`@react-native-oh/react-native-harmony`)** | ❌ — needs DevEco Studio + Android Studio for the KMP-style flow* | ✅ Yes (RN JS bundle + ArkTS/C++ shell) | ✅ React Native — largest code-share with an existing RN app | ✅ `@react-native-ohos/*` adaptations incl. async-storage | ✅ `react-native-webview` is in the adapted set (still ArkWeb) | 🟡 Actively resourced (254 adaptation repos, 442 library entries, 4 maintained version lines) but **public npm lag** is real | 🟠 Medium–high |
| **Capacitor on HarmonyOS** | ❌ | ⚠️ Only via a **0.1.x solo project** | ✅ Best-in-class if Android/iOS already use Capacitor | ✅ same web storage as browser (IndexedDB) | ✅ Your existing web editor, unchanged | 🔴 **High**: `capacitor-harmony@0.1.2`, published **2026-09-13**, single maintainer, self-described as "not a full replication of Capacitor capabilities" | 🟢 Low **if** it works — but unproven |
| **PWA in the HarmonyOS browser** | ✅ N/A (no build needed) | ❌ No `.hap`, no AppGallery listing | ✅ The web app itself | ✅ IndexedDB/WASM in browser | ✅ Full web editor | 🟢 None (no code) | 🟢 Near-zero — but it is not an app you can ship in AppGallery, and background sync is browser-mediated |
| ***(reference)* Capacitor-web in your own ArkTS shell** | ❌ — needs DevEco Studio | ✅ Yes — one `Web` component + `javaScriptProxy`, ~a few hundred lines of ArkTS | ✅ **Maximal** — the same `webDir` bundle runs in Capacitor on Android/iOS | ✅ IndexedDB inside ArkWeb (§4) | ✅ Your existing web editor, unchanged | 🟢 Low — you own ~200 lines of ArkTS; no third-party framework to go stale | 🟢 Low–medium (see §6 recommendation) |

\* The RNOH/KMP-style flows need **two IDEs** (DevEco Studio for the HarmonyOS module, Android Studio for daily
KMP/RN coding) per the [KMP&CMP release](https://m.ithome.com/html/1002445.htm) and the
[RNOH walkthrough](https://harmonyosdev.csdn.net/6a9fcdd5790f037e6e39a176.html). Neither is on this Mac.

### 3.1 Framework-specific notes and versions

**Flutter for OpenHarmony** — maintained by the OpenHarmony **Flutter SIG** (not by Google).
Repo: [gitcode.com/openharmony-tpc/flutter_flutter](https://gitcode.com/openharmony-tpc/flutter_flutter).
Third-party plugins: [gitcode.com/openharmony-tpc/flutter_packages](https://gitcode.com/openharmony-tpc/flutter_packages).
The 2026 roadmap commits to **quarterly** HarmonyOS releases and to cutting the upstream lag from ~7
months to **~4 months**: Flutter 3.35→2026/03, 3.41→2026/06, 3.44→2026/09, 3.47→2026/12
([official roadmap post](https://openharmonycrossplatform.csdn.net/69bcbcfc0a2f6a37c598c646.html)) `[reported]`.
"Flutter 3.41 OpenHarmony Release" is announced as released
([Huawei forum](https://developer.huawei.com.cn/consumer/cn/forum/topic/0201223234884554700)) `[reported]`.
**300+ third-party libraries** are already adapted, with ≥200 more planned for 2026. Crucially, the
roadmap **admits memory and CPU-load gaps vs other platforms** and makes them the 2026 focus — so
performance on low-end HarmonyOS hardware is a known, unfinished area.

**RNOH (React Native for OpenHarmony)** — Huawei-led, now hosted on **AtomGit** under the `CPF-RN`
org ([ohos_react_native](https://atomgit.com/CPF-RN/ohos_react_native),
[usage-docs library matrix](https://atomgit.com/CPF-RN/usage-docs)). As of 2026-09: **286 repos,
1,947 stars, 254 adaptation repos, 442 catalogued library entries**. Version lines:
`v0.72.143`, `v0.77.74`, `v0.82.33` (long-term stable) and **`v0.84.3` (2026-08-11, recommended
production line)**; `v0.86.3` (2026-08-26) is a beta aligned to upstream RN 0.86.3. Public npm is
behind: the walkthrough author found **no 0.86.x on public npm**, `latest` pointing at 0.72.143, and
the newest *installable* public combination being **RNOH 0.82.30 ↔ react-native 0.82.1**.
Environment: OpenHarmony SDK **API 17–26**, Node ≥ 20, DevEco Studio **26.0.0 Beta1** baseline.
Note: the `BACKGROUND` task thread is explicitly marked "do not enable in shipping builds", and
MAIN+JS carry all business work ([deep dive](https://harmonyosdev.csdn.net/6a9fcdd5790f037e6e39a176.html)) `[reported]`.
The npm front-end package uses dist-tags (`0.XX-stable`) while the ohpm native package
`@rnoh/react-native-openharmony` **must be pinned to an exact version** — a documented footgun.

**Architecture note:** RNOH renders through ArkUI **C-API**, not the declarative ArkUI path
(`ContentSlot` + `MountingManagerCAPI`). That is good for performance but means RNOH is coupled to
ArkUI internals.

**Capacitor / Cordova** — **there is no maintained first-party or vendor Capacitor port for
HarmonyOS.**
- [`capacitor-harmony`](https://registry.npmjs.org/capacitor-harmony) — v**0.1.2**, published
  **2026-09-13**, by a **single individual** (ZHAO Xudong), MIT. Its own README says: *"这不是对
  Capacitor 各平台特性的完整复刻，只实现最基础的 Capacitor 契约"* ("not a full replication … only the
  most basic Capacitor contract"). It ships 15 core plugins and — notably for us — **embeds a Node.js
  runtime** (`libnode.so` v24.2.0 via [`ohos-node-shared`](https://github.com/electerm/ohos-node-shared)),
  serving `webDir` over `http://localhost/` and exposing `http://127.0.0.1:<port>` to the WebView
  ([repo](https://github.com/zxdong262/capacitor-harmony)) `[verified]`.
- `@capacitor-ohos/ohos` exists on npm but its page carries a warning/deprecation marker and **could
  not be fetched** (HTTP 403); maintainer, date and viability are `[UNCERTAIN]`.
- Apache Cordova: no maintained HarmonyOS platform was found. `[UNCERTAIN]` only in the sense that
  absence of evidence is not proof; nothing authoritative surfaced either way.

**Taro** supports HarmonyOS/OpenHarmony from **Taro v4.1.0+**, compiling React/Vue to ArkTS and
deploying as a HarmonyOS app; it has a dedicated [Harmony & OpenHarmony guide](https://docs.taro.zone/docs/harmony/)
with a Harmony-CPP plugin chapter. Caveat: Taro's docs say the DevEco **previewer does not work** for
Taro-built HarmonyOS apps — you must use the emulator or a real device.

**uni-app x** supports "纯血鸿蒙 / HarmonyOS NEXT" from **4.61+**, requiring HBuilderX 4.61+,
**DevEco Studio BuildVersion 5.0.7.210+** and phone **API 14+**; it compiles to ArkTS and runs on the
ArkTS engine ([official doc](https://doc.dcloud.net.cn/uni-app-x/app-harmony/)) `[verified]`.
Two points matter for us: (a) there is **no cloud build** for HarmonyOS — you must build locally with
DevEco installed; (b) DCloud's own honest maturity note: *"鸿蒙整体处于发展初期，能用，有坑，大部分坑有规避
方案。但开发者应建议其领导、客户、质量部门降低期望，不能严格比照 Android 和 iOS 的验收标准要求鸿蒙"*
("HarmonyOS is still early: usable, has pitfalls, most avoidable — but lower expectations; do not
hold it to Android/iOS acceptance standards"). That is a vendor telling you to discount the platform's
maturity, and it should carry weight in planning.

**Kuikly** (Tencent, Kotlin Multiplatform UI) is listed as a platform/product on Huawei's own developer
market ([Huawei market entry](https://developer.huawei.com/consumer/cn/market/prod-detail/7bb3e09fd7094ae0bdf4225f4443de1e/PLATFORM))
and publishes a [roadmap](https://kuikly.tds.qq.com/Blog/roadmap2025.html). `[UNCERTAIN]`: the
roadmap page I could reach is the **2025** roadmap; I could not verify a 2026 HarmonyOS release,
version number, or `.hap`-build capability from a primary source.

**.NET MAUI** — **no official HarmonyOS support** found. `[UNCERTAIN]` (absence of evidence).
**Kotlin Multiplatform / Compose Multiplatform** — this one **changed in 2026 and is now real**:
the **CPF-KMP-CMP SIG** shipped the **first HarmonyOS release on 2026-09-15**, based on
**KMP 2.2.21 / CMP 1.9.2**, published to Maven, with an Android Studio plugin "KMP OHOS Support".
It requires **DevEco Studio 6.0.0+ with HarmonyOS SDK API 17+**, provides `compose.ui`,
`compose.foundation`, `compose.material`, `compose.material3` platform implementations, a
Kotlin↔ArkTS interop layer (`akinterop`), and unified rendering via Render Service/RenderNode
(**API 19+ only**) ([release note](https://m.ithome.com/html/1002445.htm) `[verified]`,
[Huawei forum](https://developer.huawei.com.cn/consumer/cn/forum/topic/0208225020573231164) `[reported]`).
It is three weeks old as of this writing. `[UNCERTAIN]` how it behaves in production.

---

## 4. ArkWeb capability matrix (this is the decision-critical section)

ArkWeb is HarmonyOS's WebView (kernel: Chromium in the OpenHarmony `chromium_arkweb` tree). It is the
same engine underneath Flutter's WebView plugin and `react-native-webview` on HarmonyOS, so **this
table applies to every "wrap the web app" option, not just the ArkTS one.**

| Capability | Status | Evidence / notes |
|---|---|---|
| **ArkWeb version / kernel** | HarmonyOS **6.0 (API 20)** moved ArkWeb to **Chromium M132**. HarmonyOS 7.0 = **API 26**, with dedicated ArkWeb API additions | [ArkWeb PNA write-up](https://ai6s.net/69e026890a2f6a37c5a0402c.html) `[reported]`; [ArkWeb API diff 26.0.0 Beta1](https://developer.huawei.com/consumer/en/doc/harmonyos-releases/js-apidiff-arkweb-7001) `[reported, JS-rendered]` |
| **WebAssembly** | ✅ Supported by default | WASM is listed among the features that **坚盾守护模式 (Secure Shield mode) disables** — it can only be "disabled" if it is normally enabled ([ArkWeb-restricted HTML5 features](https://github.com/JiZhi-Error/harmonyos-references/blob/master/articles/web-secure-shield-mode.md)) `[verified]` |
| **Service Worker** | ✅ Supported by default — but **hard-disabled in Secure Shield mode**, and **not usable as a background-sync engine** | Shorts: (a) Secure Shield explicitly *forbids* Service Worker, implying default availability ([same doc](https://github.com/JiZhi-Error/harmonyos-references/blob/master/articles/web-secure-shield-mode.md)) `[verified]`; (b) ArkWeb's SDK exposes a `warmupServiceWorker` API — "Warmup the registered service worker associated the url" ([`@ohos.web.webview.static.d.ets`](https://gitcode.com/openharmony/interface_sdk-js/blob/450052968e976d87c9c42ca7fbc37dacf03eb8e5/api/%40ohos.web.webview.static.d.ets)) `[reported]`. `[UNCERTAIN]`: I could not load Huawei's Service Worker guide page itself; the exact API/behaviour set (Push, Background Sync, Periodic Sync) is unverified |
| **IndexedDB** | ✅ Supported; quota-managed per origin | ArkWeb exposes origin storage-quota introspection (`getOriginQuota` / `getOriginUsage` appear in the Web component reference and in `chromium_arkweb`'s `quota_table` code), which means the platform enforces a real per-origin quota ([Web component doc mirror](https://gitee.com/lyaoxuan/docs/blob/master/zh-cn/application-dev/reference/arkui-ts/ts-basic-components-web.md), [`quota_table_unittest.cc`](https://gitcode.com/openharmony-tpc/chromium_arkweb/blob/trunk/webkit/database/quota_table_unittest.cc)) `[reported]`. **`[UNCERTAIN]` the default quota value** — I could not verify a numeric default; treat "how many MB of notes fit in IndexedDB" as a must-measure |
| **File System Access API** (`showOpenFilePicker`, `FileSystemDirectoryHandle`) | ❌ / `[UNCERTAIN]` — **assume unsupported** | Not confirmed in any ArkWeb capability list. ArkWeb's native-side file interaction is the `FileSelectorResult` / `FileSelectorParam` bridge ([Huawei API ref](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/arkts-basic-components-web-fileselectorresult)) `[reported]`, i.e. a native file-picker bridge, not the web FSA API. **Plan your storage around IndexedDB + a native bridge, not FSA** |
| **`fetch` to localhost / LAN (self-hosted server)** | ⚠️ **Works only after explicit opt-in — and only on API 20+ for the clean path.** This is the biggest gotcha | Three separate gates: (1) `ohos.permission.INTERNET` is mandatory; (2) **cleartext HTTP is blocked by default** — there is a documented *"Cleartext HTTP traffic not permitted"* failure ([Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0201224774132846105)) `[reported]`; (3) **Private Network Access (PNA)** blocks cross-origin requests to `localhost` / `192.168.x.x` private IPs, which is exactly the self-hosted-server case — the reported symptom is `-10 ERR_ACCESS_DENIED` loading a LAN `http://IP:port` ([Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0208224712849516091) `[reported]`, [community thread](https://bbs.itying.com/topic/6843ca704715aa008847b710) `[reported]`). The fix is `WebviewController.enablePrivateNetworkAccess(false)`, **new in API 20 / HarmonyOS 6.0**, callable only after the controller is bound (e.g. in `onControllerAttached`); plus `mixedMode` for HTTPS-page→HTTP-subresource ([write-up](https://ai6s.net/69e026890a2f6a37c5a0402c.html)) `[reported]` |
| **Loading your own web assets** | ⚠️ Needs care | Two working patterns: (a) ship assets in `rawfile` and load via the resource manager; (b) run a **local HTTP server inside the app** and point the WebView at `http://localhost/` — which also gives you a proper origin for IndexedDB/CORS. `capacitor-harmony` does exactly (b) ([README](https://registry.npmjs.org/capacitor-harmony)) `[verified]`. `[UNCERTAIN]` origin/quota semantics of the `rawfile`/`file://`-style paths — test both |
| **Native↔JS bridge** | ✅ Supported | `javaScriptProxy` / `runJavaScript` are the standard ArkWeb bridge; a community ArkWeb JSBridge framework published to both npm and OHPM ([juejin post](https://juejin.cn/post/7666718553657819170)) `[reported]` |
| **Background execution / background sync** | ⚠️ Not a WebView capability. Requires native Background Tasks Kit | JS timers and Service Worker stop when the app is backgrounded. HarmonyOS provides **long-running tasks** (长时任务, with declared task type + user-visible notification) and **`workScheduler` deferred tasks** (condition-based: charging/Wi-Fi/battery, explicitly subject to system throttling) ([Background Tasks Kit spec](https://developer.huawei.com/consumer/cn/doc/harmonyOS-guides/bgtask-design-formula), [`workScheduler` guide](https://developer.huawei.com/consumer/cn/doc/harmonyOS-guides/work-scheduler), [throttling discussion](https://developer.huawei.com/consumer/cn/forum/topic/0201225141636700225)) `[reported]`. **Design sync as: native scheduled task → wakes → drives the WebView/JS sync logic.** Do not rely on Service Worker background sync |
| **Secure Shield mode (坚盾守护模式)** | ⚠️ An **opt-in** high-security user mode that breaks web apps | It disables **WebAssembly, WebGL/WebGL2, PDF viewer, MathML, Web Speech, RTCDataChannel, getUserMedia, Service Worker, non-proxied UDP, and JIT**. If a user enables it, a WASM- or SW-dependent editor may fail. Detectable via Device Security Kit ([doc](https://github.com/JiZhi-Error/harmonyos-references/blob/master/articles/web-secure-shield-mode.md)) `[verified]` |

---

## 5. Distribution: AppGallery, review, sideloading

**Publishing.** HarmonyOS apps are published through **AppGallery / AppGallery Connect (AGC)**. The
governing documents are the [应用审核指南 (review guidelines)](https://developer.huawei.com/consumer/cn/doc/50104),
the [应用审核Checklist (app review checklist)](https://developer.huawei.com/consumer/cn/doc/app/50170) and the
[应用审核FAQ (app review FAQ)](https://developer.huawei.com/consumer/cn/doc/app/50106) `[reported — these are
JS-rendered; cited by URL from search index]`. Huawei's developer community publishes annual
"avoid-the-pitfalls" and "top rejection reasons" round-ups for 2026
([2026 上架避坑指南 (2026 publishing pitfalls guide)](https://developer.huawei.com/consumer/cn/forum/topic/0201221147113494505),
[2026 高频驳回问题 (2026 most frequent rejection issues)](https://developer.huawei.com/consumer/cn/forum/topic/0201218124295377819),
[application-info 违规 TOP9 (top 9 application-info violations)](https://developer.huawei.com/consumer/cn/forum/topic/0208214242209847008)) `[reported]`.

**Requirements flagged in those sources:** a Huawei developer account with **实名认证 (real-name
verification)** ([overview](https://developer.huawei.com/consumer/cn/doc/start/itrna-0000001076878172),
[FAQ](https://developer.huawei.com/consumer/cn/doc/start/identityverfication-0000001953723286)) `[reported]`,
a privacy policy, and a **软件著作权 (software copyright) certificate** — the recurring community answer
on whether 软著 (software copyright) / 备案 (filing) is required is *"yes for a commercial listing"* ([forum thread](https://developer.huawei.com/consumer/cn/forum/topic/0204224186632495393),
[copyright question](https://developer.huawei.com/consumer/cn/forum/topic/0203220036052953397)) `[reported]`.
`[UNCERTAIN]`: whether a **non-Chinese** developer can complete 实名认证, the exact document list for a
foreign individual vs. company, current review SLA in working days, and whether 软著/ICP备案 is
strictly mandatory for every app category — all of these need checking against the current AGC console.
The removal/timing of a rejected listing and the cost of re-submission are also unverified.

**Updates.** Updates go through AppGallery review; the review round-ups describe resubmission cycles
rather than instant rollout `[reported]`. `[UNCERTAIN]`: whether staged rollout percentages and
forced-update prompts exist for HarmonyOS apps the way they do on Google Play — AGC has such features
in general but I could not verify them for HarmonyOS specifically.

**Sideloading.** Partially possible, heavily restricted:
- **Emulator: no certificate needed.** uni-app x states plainly that running on the **模拟器 (emulator) requires no
  certificate**, while a **real device requires a debug certificate signed and bound to that specific
  device** ([doc](https://doc.dcloud.net.cn/uni-app-x/app-harmony/)) `[verified]`.
- **Real device: debug certificate bound to registered devices.** Permissions are baked into the
  certificate, so changing permissions means re-issuing the certificate.
- **Self-signed / non-store HAPs are refused by released devices.** A reported HarmonyOS 6.1 error when
  installing one's own APK/HAP is *"应用是非正式发布版本，当前设备不支持安装"* ("not an officially released
  version; this device does not support installation")
  ([forum](https://developer.huawei.com/consumer/cn/forum/topic/0201217160307066552)) `[reported]`;
  and depending on the device/ROM, only AppGallery-signed apps run without developer mode
  ([forum](https://developer.huawei.com/consumer/cn/forum/topic/0203212101206724872)) `[reported]`.
- **There is a legitimate internal-distribution channel.** AGC issues **内部测试 (internal testing)**
  certificates, letting you hand a `.hap` to specific devices via a distribution profile hosted on
  your own server, bypassing AppGallery — documented for uni-app x
  ([doc §企业应用的内部分发 (internal distribution of enterprise apps)](https://doc.dcloud.net.cn/uni-app-x/app-harmony/#internal-test),
  [community tutorial](https://ask.dcloud.net.cn/article/42052)) `[reported]`. This is the closest
  HarmonyOS equivalent to TestFlight / Enterprise distribution and is the right channel for beta users
  of a self-hosted-server app.
- **Automation blocker:** the community RNOH walkthrough is explicit that **"登录华为账号这一步无法纯 CLI
  完成"** ("the Huawei-account login step cannot be done purely from the CLI") — automatic signing
  requires a GUI login in DevEco Studio ([walkthrough](https://harmonyosdev.csdn.net/6a9fcdd5790f037e6e39a176.html)) `[reported]`.

---

## 6. Recommendation

**Ship a web-first core inside a thin, hand-written ArkTS shell on HarmonyOS — do not adopt a
cross-platform framework for the HarmonyOS target.**

Concretely:

1. **Keep the rich-text editor and the sync client as plain web assets** (`webDir`: HTML/CSS/JS),
   storing notes in **IndexedDB** and syncing over `fetch` to the self-hosted server. This is what you
   already need for Android/iOS via Capacitor, and it is the only artifact that is 100% portable.
2. **On Android/iOS, keep Capacitor.** It is mature there.
3. **On HarmonyOS, write your own ArkTS shell** — an ArkUI page hosting one `Web` component, a
   `javaScriptProxy` bridge, and (optionally) an in-app local HTTP server so the WebView has a real
   `http://localhost` origin. Budget a few hundred lines, not a rewrite. This is the row marked
   *"Capacitor-web in your own ArkTS shell"* in §3, and it is a deliberate choice **not** to depend on
   `capacitor-harmony@0.1.2`.
4. **Implement background sync natively** with `workScheduler` (condition-based deferred task) plus a
   long-running task where justified, waking the JS layer rather than expecting Service Worker
   background sync.
5. **Verify the three ArkWeb gates in week 1, before committing**: `enablePrivateNetworkAccess(false)`
   on API 20+, cleartext-HTTP opt-in, and the actual IndexedDB quota. If any of the three fails on the
   target device, the whole web-in-shell plan changes and you need to know that in days, not months.

**Why this over the alternatives**

- **vs. Flutter-ohos:** it is genuinely maintained and has the best plugin breadth (300+ adapted
  libraries), but the fork **lags upstream ~4 months by design**, Google has no HarmonyOS support, and
  the SIG itself reports unresolved **memory and CPU-load gaps**. Your editor is a WebView anyway, so
  Flutter buys you a Dart UI layer you do not need, at the cost of a second build system and a
  fork dependency.
- **vs. RNOH:** the strongest resourced option (254 adaptation repos, 4 maintained version lines) and
  the best choice **if you already have a React Native app**. But public npm lags the announced lines
  (no 0.86.x public; `latest` → 0.72.143), the framework couples to ArkUI C-API internals, and its
  background thread is explicitly not production-safe. For a WebView-hosted editor it is a large
  dependency for little gain.
- **vs. ArkUI-X:** aesthetically the "Huawei-blessed" answer, and 6.0.0 is a real step up (cross-platform
  `file.fs`/`relationalStore`/`net.http`/Web). But it inverts the sharing direction — you would write
  **ArkTS** for all platforms, so any existing Kotlin/Swift/Dart/TS investment is stranded, and its
  release cadence is visibly slow.
- **vs. KMP/CMP:** the most interesting 2026 development, but the HarmonyOS release is **three weeks
  old**, needs **two IDEs**, needs **API 19+** for unified rendering, and is irrelevant if your UI is a
  WebView.
- **vs. ArkTS native:** the lowest-risk *platform* and the only guaranteed-roadmap stack — but it means
  building a second, native editor. Correct only if the WebView editor proves unviable.

**Decision rule:** if you cannot make IndexedDB + LAN `fetch` + a WASM-based editor work inside ArkWeb
within a short spike, fall back to **ArkTS native with ArkUI's `RichEditor`** and accept two codebases —
because at that point no cross-platform framework helps either (they all end at ArkWeb for the editor).

---

## 7. Explicit blockers on *this* machine (cannot be done right now)

1. **Cannot produce a `.hap` at all.** No DevEco Studio, no `ohpm`, no `hvigor`, no
   `$DEVECO_SDK_HOME`, no `~/Library/Huawei`, no `~/Library/OpenHarmony`. Every `.hap`-capable option in
   §3 is blocked behind this single install.
2. **Cannot build or test Android.** No Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT` unset,
   `~/Library/Android/sdk` absent) and no Android Studio — so the "shares code with Android" column is
   currently unverifiable here, and the KMP/CMP and RNOH two-IDE flows cannot even be started.
3. **Cannot build iOS.** `xcode-select -p` returns `/Library/Developer/CommandLineTools`; no full Xcode
   is installed.
4. **JDK mismatch risk.** The only JDK is **Temurin 25** at `/usr/bin/java`. DevEco bundles its own
   **JBR (OpenJDK 17)**; a foreign JDK on `PATH`/`JAVA_HOME` is a documented cause of
   `Java command failed` ([Mac setup guide](https://github.com/Octo-o-o-o/harmonyos-ai-workspace/blob/main/00-getting-started/01-environment-setup-mac.md)) `[reported]`.
   Expect to have to shield DevEco/hvigor from the system JDK.
5. **No HarmonyOS device attached**, and **no account.** Real-device install requires a debug
   certificate bound to a registered device, and 实名认证 (real-name verification) is required for the
   account; the automatic-signing step is **GUI-only** and cannot be completed from the CLI. `[UNCERTAIN]`
   whether a non-Chinese developer can complete 实名认证 at all — **verify this before committing to a
   HarmonyOS roadmap**, because if it fails, device testing requires a China-based collaborator or an
   emulator-only workflow.
6. **Emulator status is unverified for this configuration.** The community Mac guide says Apple Silicon
   is supported and that macOS must grant DevEco **Hypervisor** permission, and that Intel Macs are
   excluded from emulator use ([guide](https://github.com/Octo-o-o-o/harmonyos-ai-workspace/blob/main/00-getting-started/01-environment-setup-mac.md),
   [Intel-Mac emulator thread](https://developer.huawei.com/consumer/cn/forum/topic/0202170099085388857)) `[reported]`,
   but there are also reports of `DevEco Studio 无法创建模拟器，提示下载失败` ("DevEco Studio cannot create an emulator; the download fails") on **arm64 Macs**
   ([forum](https://developer.huawei.com/consumer/cn/forum/topic/0204166373844850544)) `[reported]`.
   Official emulator requirements page: [ide-emulator-requirements](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-emulator-requirements)
   `[UNCERTAIN — JS-rendered, not fetched]`. **Treat "will the emulator work on an M4?" as an open
   question with real risk**, and note that emulator images may themselves require an account.
7. **Disk/RAM are adequate but not generous.** 87 GiB free vs. a documented ≥30 GB ask for IDE + SDK +
   emulator image; 16 GB RAM is the recommended floor when running IDE and emulator together.

**Unblock sequence:** download DevEco Studio (macOS **arm64**) from
[developer.huawei.com/consumer/cn/deveco-studio](https://developer.huawei.com/consumer/cn/deveco-studio/) →
create + verify a Huawei developer account → let the IDE pull the SDK and toolchain → add
`ohpm`/`hvigor`/`hdc` to `PATH` while keeping the system JDK 25 out of the way → create an Empty Ability
project → confirm the emulator boots (or borrow a device) → **then** run the ArkWeb spike from §6.

---

## 8. Open questions to resolve before a go/no-go

| # | Question | Why it decides something |
|---|---|---|
| 1 | Can a non-Chinese developer complete 实名认证 and register a debug device? | If no, no real-device testing and no AppGallery publishing |
| 2 | Does the DevEco emulator actually work on this M4 / macOS 26.7.1? | If no, hardware must be procured |
| 3 | What is ArkWeb's **default IndexedDB quota**? | Determines whether offline notes fit in the WebView at all |
| 4 | Does `enablePrivateNetworkAccess(false)` fully fix LAN `fetch` on target devices/ROMs? | Core feature: talking to the self-hosted server |
| 5 | Is Service Worker *fully* supported (Push / Background Sync / Periodic Sync)? | Determines whether any sync can live in JS |
| 6 | Current AppGallery document list + review SLA + update cadence | Determines release planning and cost |
| 7 | Is 软著/ICP备案 mandatory for our app category, and for an overseas developer? | Hard gate on publishing |

Marked `[UNCERTAIN]` throughout: exact HarmonyOS-4→5 APK cut-off, `@capacitor-ohos/ohos` viability,
File System Access API support in ArkWeb, Kuikly's 2026 HarmonyOS status, .NET MAUI HarmonyOS support,
ArkWeb Service Worker sub-feature coverage, numeric IndexedDB default quota, non-Chinese 实名认证,
and AppGallery review timing.
