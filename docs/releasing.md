# Releasing

Packaging, signing and installing per platform.

## Web

The bundle is the application; every other target is a shell around it.

```bash
cd apps/web && pnpm build     # -> apps/web/dist
```

## HarmonyOS

```bash
cd apps/harmony-probe
BUILD_ID=$(git rev-parse --short HEAD) ./package-app.sh
```

Builds the web bundle, stages it into the package, and assembles a `.hap`. A dirty tree
appends `+uncommitted` to the build id. `BUILD_ID` must be exported for the web build to
carry it; without it the stamp is absent and a device cannot be asked which build it runs.

```bash
hdc list targets
hdc -t <device> install -r entry/build/default/outputs/default/entry-default-signed.hap
hdc -t <device> shell aa start -b org.triliumnotes.mobile -a EntryAbility
```

- A real device installs only a **signed** `.hap`. The emulator accepts an unsigned one.
- The emulator refuses a change of signing information; uninstall first.
- DevEco's build does not rebuild the web bundle. Building from the IDE recompiles the ArkTS
  and packages whatever page was staged last; `package-app.sh` does both.
- Do not package in the background from a temporary shell. Each shell invocation is fresh and
  a background build dies with it, which leaves an incomplete `outputs/` directory and an
  install that fails with "no such file".

Toolchain details and what needs a Huawei account are in [harmonyos.md](harmonyos.md).

## Android

```bash
cd apps/android && ./build-apk.sh
# -> app/build/outputs/apk/debug/app-debug.apk
```

The script rebuilds the web bundle and stages it into `app/src/main/assets/` every time.
Staging by hand leaves a package carrying a stale page.

Installing, with no adb and no cable:

```
Settings → Security → Allow installation from unknown sources
then open the APK from a file manager
```

Toolchain:

| | |
|---|---|
| SDK | `/opt/homebrew/share/android-commandlinetools`, `android-36`, `build-tools 36.0.0` |
| JDK | **25 only** — Gradle 8.11 refuses it: `Unsupported class file major version 69` |
| Working pair | **Gradle 9.5.1 + AGP 9.1.1** (what upstream uses) |

`usesCleartextTraffic` is enabled on purpose: a self-hosted Trilium is commonly served over
plain HTTP on a home network. The APK builds and its contents are verified, but it has never
been run on a device — see [known-issues.md](known-issues.md).

## iOS / iPadOS

**Not built.** The requirements are known:

- Xcode is required and is not installed (the machine has Command Line Tools only, and 44 GB
  free against roughly 40 GB needed).
- A free Apple ID works for a development build, but the app expires after 7 days.
- `WKWebView` has no equivalent of Android's `WebViewAssetLoader`, and custom schemes
  registered through `WKURLSchemeHandler` are not secure contexts, so OPFS — which this
  client's database is built on — is unavailable. `file://` fails the same way.
- The workable approach is a small HTTP server inside the app on `http://localhost:<port>`,
  which is a secure context. That is substantially more Swift than the Android shell.

## Checking a build contains what you think

A package can be built that does not contain the change under test. Compare the staged bundle
against the one just built:

```bash
# the web bundle a HarmonyOS package carries
ls apps/harmony-probe/entry/src/main/resources/rawfile/web/assets/index-*.js
ls apps/web/dist/assets/index-*.js

# and for Android, from inside the APK
unzip -p app/build/outputs/apk/debug/app-debug.apk assets/assets/index-*.js | grep -c "white-space"
```

Then confirm the running build id on the device itself:

```bash
hdc -t <device> shell hilog -x | grep -a "shell: build"
```
