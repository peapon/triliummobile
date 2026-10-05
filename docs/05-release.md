# 5. Release

## 5.1 Web

The bundle is the application. Everything else is a shell around it.

```bash
cd apps/web && pnpm build     # → apps/web/dist
```

## 5.2 HarmonyOS

```bash
cd apps/harmony-probe
BUILD_ID=$(git rev-parse --short HEAD) ./package-app.sh
```

Builds the web bundle, stages it into the package, and assembles a signed `.hap`. A dirty
tree appends `+uncommitted` to the build id, so a package can say what it was built from.

```bash
hdc list targets
hdc -t <device> install -r entry/build/default/outputs/default/entry-default-signed.hap
hdc -t <device> shell aa start -b org.triliumnotes.mobile -a EntryAbility
```

Notes learned by doing it:

- **The signed HAP is what installs.** Real devices reject an unsigned one; emulators accept
  it but refuse a change of signing information — uninstall first.
- **`BUILD_ID` must be exported for the web build to carry it.** Without it the stamp is
  absent and a device cannot be asked which build it runs.
- **DevEco's build does not rebuild the web bundle.** Building from the IDE recompiles the
  ArkTS and packages whatever page was staged last. `package-app.sh` does both; the IDE does
  not.
- **Do not package in the background from an agent shell.** Each shell invocation is fresh,
  and a background build dies with it — which produces an incomplete `outputs/` directory
  and an install that fails with "no such file".

## 5.3 Android

```bash
cd apps/android && ./build-apk.sh
# → app/build/outputs/apk/debug/app-debug.apk
```

The script rebuilds the web bundle and stages it into `app/src/main/assets/` every time.
Staging by hand is how a package ends up carrying a stale page — a mistake this repository
has already made once, on the HarmonyOS side.

Installing, with no adb and no cable:

```
Settings → Security → Allow installation from unknown sources
then open the APK from a file manager
```

Toolchain, and why no JDK was installed:

| | |
|---|---|
| SDK | `/opt/homebrew/share/android-commandlinetools`, `android-36`, `build-tools 36.0.0` |
| JDK | **25 only** — Gradle 8.11 refuses it: `Unsupported class file major version 69` |
| Working pair | **Gradle 9.5.1 + AGP 9.1.1** (what upstream uses) |

`usesCleartextTraffic` is enabled on purpose: a self-hosted Trilium is commonly served over
plain HTTP on a home network, and without it the app cannot reach one at all.

## 5.4 iOS / iPadOS

**Not built.** The requirements are known and are recorded in
[06-known-issues.md](06-known-issues.md#iosipados), because they are not small:

- Xcode is required and is not installed (the machine has only Command Line Tools, and 44 GB
  free against roughly 40 GB needed).
- A free Apple ID works for a development build, but **the app expires after 7 days**.
- `WKWebView` has **no equivalent of Android's `WebViewAssetLoader`**, and custom schemes
  registered through `WKURLSchemeHandler` are **not secure contexts**, so OPFS — which this
  client's database is built on — is unavailable. `file://` fails the same way.
- The workable approach is a small HTTP server inside the app on `http://localhost:<port>`,
  which *is* a secure context.

## 5.5 Checking a build actually contains what you think

Three separate times, a package was built that did not contain the change under test. The
check is cheap and is now routine:

```bash
# the web bundle the package carries, against the one just built
ls apps/harmony-probe/entry/src/main/resources/rawfile/web/assets/index-*.js
ls apps/web/dist/assets/index-*.js

# and for Android, from inside the APK
unzip -p app/build/outputs/apk/debug/app-debug.apk assets/assets/index-*.js | grep -c "white-space"
```

Then confirm the running build id on the device itself:

```bash
hdc -t <device> shell hilog -x | grep -a "shell: build"
```
