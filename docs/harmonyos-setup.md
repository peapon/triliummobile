# HarmonyOS 可行性验证

最后更新：2026-10-04

---

## 结论速览

| 问题 | 状态 | 证据 |
|---|---|---|
| 华为 SDK / DevEco 能否免账号获取？ | ❌ **不能** | 下载 API 链上有 `signAgreement` / `querySign`；未鉴权全部 403/404；页面 HTML 无直链 |
| 能否用**公开**组件搭出可用工具链？ | ✅ **能** | OpenHarmony SDK 7.0-Release（API 26，1.34 GB，`repo.huaweicloud.com`，SHA-256 校验通过） |
| 能否编译 ArkTS？ | ✅ **能** | `CompileArkTS` 通过，产出 `ets/modules.abc`（ark24.0.0.0 VM） |
| 能否打包 `.hap`？ | ✅ **能** | `BUILD SUCCESSFUL`，88,875 字节，含我们的 `probe.html` |
| 能否签名并安装到设备？ | ❌ **不能** | 调试证书绑定具体设备，签名步骤 GUI-only，需华为账号实名认证 |
| ArkWeb 调局域网自建服务端的 API 是否存在？ | ✅ **存在** | SDK 声明中 `WebviewController.enablePrivateNetworkAccess(enable: boolean)`，`@since 20` |
| WebView ↔ ArkTS 桥是否存在？ | ✅ **存在** | `Web` 组件有 `javaScriptProxy`、`onControllerAttached`、`mixedMode`、`domStorageAccess`、`databaseAccess` |
| **ArkWeb 里 `pointerType === "pen"` 成立吗？** | ❓ **未知** | 无任何华为文档保证，**必须真机实测** |
| **局域网明文 HTTP 实测能通吗？** | ❓ **未知** | 同上 |
| **IndexedDB 真实配额是多少？** | ❓ **未知** | 同上 |

**一句话：构建链路已经完全打通且不需要任何账号；剩下三个运行时问题必须真机才能回答。**

---

## 已验证：公开工具链

`apps/harmony-probe/setup-toolchain.sh` 一键搭建，全部免登录：

```
OpenHarmony SDK 7.0-Release (API 26)
  https://repo.huaweicloud.com/openharmony/os/7.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz
  SHA-256 校验通过

@ohos/hvigor 6.26.8 + @ohos/hvigor-ohos-plugin 6.26.8
  https://repo.harmonyos.com/npm   (标准 npm registry，配 @ohos:registry 即可)
```

```bash
cd apps/harmony-probe
./setup-toolchain.sh    # 下载 + 校验 + 重排布局 + 装 hvigor
./build.sh              # -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

### 搭建过程中踩到的四个坑（都已解决，写进脚本里）

1. **SDK 布局不是压缩包里的样子。** hvigor 在 `<sdkRoot>/<platformVersion>/<component>` 找组件，
   即 `ohos-sdk/26.0.0/ets`。而 tarball 里是扁平的 `sdk/packages/ohos-sdk/darwin/*.zip`。
   放错位置会报 `The SDK management mode has changed`，这个提示具有很强的误导性。
2. **API 26+ 的 SDK 版本号必须是字符串。** `compileSdkVersion` / `compatibleSdkVersion` /
   `targetSdkVersion` 要写 `"26.0.0"`；写成数字 `26` 会报 `Specification Limit Violation`。
3. **同一批字段又要求 `modelVersion` ≥ 6.0.0**，否则报 `The current modelVersion does not support
   setting ... as strings`。`hvigor-config.json5` 与根 `oh-package.json5` 都要改。
4. **OpenHarmony SDK 没有 `phone` 设备类型。** 可用的是
   `2in1 / default / tablet / tv / wearable / liteWearable`；"手机"对应 `default`。
   写 `"deviceTypes": ["phone"]` 会报 syscap 交集为空。`phone` 是 **HarmonyOS SDK** 才有的。

> ⚠️ 第 4 点意味着：**公开 SDK 能验证"能不能构建"，不能验证"HarmonyOS 手机上跑成什么样"。**
> 要真正面向鸿蒙手机，最终还是需要华为账号下的 HarmonyOS SDK。

---

## 必须由你完成的部分

### 步骤 1 — 华为开发者账号 + 实名认证

在 [华为开发者联盟](https://developer.huawei.com/consumer/cn/) 注册并完成**实名认证**。

⚠️ 这是整条鸿蒙路线的硬门槛：没有它无法为真机签名，也无法上架 AppGallery。
**非中国籍开发者能否完成实名认证，调研阶段未能从官方文档确认** —— 如果你不是中国籍，
请先确认这一点再追加投入。

### 步骤 2 — 安装 DevEco Studio

从 [下载页](https://developer.huawei.com/consumer/cn/deveco-studio/) 取 **macOS (Apple Silicon)** 版。
本机：macOS 26.7.1 / Apple M4 / 约 84 GiB 可用。

装好后**先处理 JDK 冲突**：本机 `PATH` 上只有 Temurin **25**，而 DevEco 自带 **JBR (OpenJDK 17)**，
外来的 JDK 是社区记录在案的 `Java command failed` 成因。

启动 DevEco，让它拉取 **HarmonyOS SDK**（Settings → SDK），记下路径。

### 步骤 3 — 模拟器能否跑（结论未知，有风险）

社区报告互相矛盾（有 arm64 Mac 无法创建模拟器的记录）。打开 Device Manager 建一个 Phone 模拟器试试。
Apple Silicon 需要 macOS 授予 DevEco **Hypervisor** 权限。

### 步骤 4 — 真机（若模拟器不可用）

`File → Project Structure → Signing Configs` 勾选 **Automatically generate signature**（需 GUI 登录）。
连上鸿蒙手机，`hdc list targets` 应能看到设备。

---

## 拿到设备后要跑什么

探针 App 已经写好并**构建通过**：`apps/harmony-probe`。

它会在一个页面里回答全部三个问题：

| 探针区块 | 回答什么 |
|---|---|
| Engine identity | userAgent + **真实 Chromium 版本**（ArkWeb 的 M132 说法此前无法核实） |
| Stylus | `pointerType` 计数；用笔在画布上划一下，若出现 `pen: n` 则墨迹功能成立；同时报 pressure/tiltX/tiltY |
| Storage | `navigator.storage.estimate()` 真实配额 + 32 MiB IndexedDB 写入压测 |
| Runtime features | WebAssembly、Service Worker、OPFS、CompressionStream 等逐项探测（**坚盾守护模式**会让 WASM/SW 消失） |
| Cleartext HTTP | 填你的服务端地址直接 fetch，报真实成败 |

同时 `Index.ets` 里的 `onControllerAttached` 会调用 `enablePrivateNetworkAccess(false)` 并把结果显示在顶部状态栏。

安装后跑一遍即可：

```bash
export DEVECO_SDK_HOME=<HarmonyOS SDK 路径>
hdc install entry/build/default/outputs/default/entry-default-signed.hap
hdc shell aa start -a EntryAbility -b org.triliumnotes.mobile
```

（该 `.hap` 需要先用你的证书签名 —— `build.sh` 目前只产出 unsigned 包。）

---

## 对架构的影响

- **构建侧无风险**：ArkTS + ArkWeb 的编译打包链路已经完全验证，且可在 CI 中免账号运行。
- **运行时仍有三个未知量**，其中 `pointerType === "pen"` 最要紧：它决定墨迹批注与自由手绘
  是"一套 Web 代码跨平台"，还是"每个平台各写一遍原生覆盖层"。
- 按已确定的范围（v1 只做墨迹批注 + 手绘，手写转文字后置），**如果探针通过，鸿蒙侧的原生工作量
  几乎为零** —— 一个 `Web` 组件加一个 `javaScriptProxy` 桥即可。
