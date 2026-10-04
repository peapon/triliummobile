# HarmonyOS 可行性验证 — 实测结果

最后更新：2026-10-05
环境：DevEco Studio 26.0.0 + HarmonyOS SDK 26.0.0.105（API 26）+ `Mate 90 Pro` 模拟器（`phone_all_arm`, HarmonyOS 7.0.0）

---

## 结论速览

| 问题 | 结果 | 证据 |
|---|---|---|
| 鸿蒙上能不能构建 `.hap`？ | ✅ **能，且不需要华为账号** | `BUILD SUCCESSFUL`，见下方命令 |
| 能不能在**模拟器**上跑？ | ✅ **能，未签名直接安装** | `hdc install` → `install bundle successfully` |
| **IndexedDB 真实配额** | ✅ **3.42 GB** | `navigator.storage.estimate()` |
| **局域网明文 HTTP 能通吗？** | ✅ **能** | `http://192.168.3.213:18899/` → **200, 6ms** |
| 需要 cleartext 配置吗？ | ❌ **不需要** | 明文 HTTP 直接通，无需任何安全配置 |
| `enablePrivateNetworkAccess(false)` 有效吗？ | ✅ **有效** | 私有网段地址可达（否则会 `ERR_ACCESS_DENIED`） |
| WebAssembly / Service Worker / OPFS | ✅ **全部支持** | 逐项探测通过 |
| **`pointerType === "pen"`** | ⚠️ **仍无法证明** | 见下 |
| 能直连自建 Trilium 服务端吗？ | ❌ **不能，因为 CORS** | 见「最重要的发现」 |

**一句话：鸿蒙的技术能力比调研估计的强得多（Chromium 144、明文可用、WASM/OPFS 齐全），真正的障碍不是平台，而是 Trilium 服务端不发 CORS 头。**

---

## 最重要的发现：真正的障碍是 CORS，不是鸿蒙

实测四组对照：

```
https://api.github.com/            -> 200, 808ms   （HTTPS + 有 CORS 头）
http://10.0.2.2:18899/             -> 200,   6ms   （明文 HTTP + 有 CORS 头）
http://192.168.3.213:18899/        -> 200,   6ms   （局域网明文 + 有 CORS 头）
http://10.0.2.2:18740/api/...      -> TypeError: Failed to fetch   （真的 Trilium 服务端）
```

前三组证明：**网络通、明文 HTTP 通、局域网通**。第四组失败的唯一差别是
**Trilium 不发 `Access-Control-Allow-Origin`**（且发 `Cross-Origin-Resource-Policy: same-origin`）。

WebView 页面来源是 `resource://rawfile`，所以每个请求都是跨源的，由普通 CORS 规则裁决——
**这与 ADR D9 在桌面浏览器里得到的结论完全一致**。

因此：`enablePrivateNetworkAccess(false)` 是**必要但远不充分**的。要连自建服务端，必须二选一：

1. **原生壳代为转发**：ArkTS 用 `@ohos.net.http` 发请求，经 `javaScriptProxy` 供网页调用。网页只跟自己的 origin 说话，永远不碰 CORS。
2. **同源部署**：把 Web 核心由服务端自己托管，或在原生侧起一个本地 HTTP 服务做反代。

> 这也解释了为什么官方 `apps/mobile` 把整个服务端塞进 WebView 里跑 WASM——那样根本不存在跨源问题。

---

## 对调研结论的修正

| 调研（`docs/research/02-harmonyos-toolchain.md`） | 实测 |
|---|---|
| ArkWeb = Chromium **M132** | ❌ **Chromium 144**.0.0.0（UA: `ArkWeb/7.0.0.105`） |
| File System Access API 应「假设不支持」 | ❌ **支持**（`showSaveFilePicker` 存在） |
| 明文 HTTP 默认被拦，需要配置 | ❌ **不成立**——明文直接可通 |
| 局域网请求需 API 20+ 的 PNA 开关 | ✅ **成立**，且该 API 调用成功 |
| WASM / Service Worker / OPFS | ✅ 均支持（与调研一致） |

未支持的：`navigator.share`、`Notification`。`Web Share` 缺失对"分享进 Trilium"这个捕获路径有影响，得走别的方式。

**坚盾守护模式未测试**——它是用户手动开启的模式，模拟器上没有开关。它会关闭 WASM 与 Service Worker，
所以 `sqlite-wasm` 方案在该模式下会失效；存储层的接口抽象（ADR D5）正是为此留的后路。

---

## 手写笔：仍然无法证明，但基础设施齐全

模拟器没有手写笔，`pointerType === "pen"` **无法实测**。能证明的是 ArkWeb 的 Pointer Events 面**完整**：

```
hasPointerEvent        : true
getCoalescedEvents     : true
getPredictedEvents     : true
onpointerrawupdate     : true
maxTouchPoints         : 10
```

`getPredictedEvents` 和 `pointerrawupdate` 是低延迟墨迹的关键，两者都在。ArkWeb 是 Chromium 144，
`pointerType === "pen"` 是 Chromium 的标准行为，**极可能成立**，但在拿到真机手写笔之前不能算已验证。

**风险仍然真实**：如果它不成立，墨迹批注与自由手绘需要每个平台写原生覆盖层。

---

## 复现步骤

### 构建（不需要任何账号）

```bash
cd apps/harmony-probe
export DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk
/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw assembleHap --no-daemon
# -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

> ⚠️ `apps/harmony-probe/node_modules` 里如果装了 OpenHarmony 版 hvigor，会与 DevEco 自带的那份冲突，
> 报 `The root node is not yet available for build`。用 DevEco 构建前先移走它。

### 模拟器

```bash
E=/Applications/DevEco-Studio.app/Contents/tools/emulator
HDC=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc

"$E" -license accept
"$E" -list                                   # Mate 90 Pro / Mate X7 / MateBook Pro / MatePad Pro 13
"$E" -start "Mate 90 Pro" -noWindow &        # 启动约 90s
# 等待 hdc 看到设备：
"$HDC" list targets                          # -> 127.0.0.1:5555

"$HDC" install -r entry/build/default/outputs/default/entry-default-unsigned.hap
"$HDC" shell aa start -a EntryAbility -b org.triliumnotes.mobile.probe
```

**未签名的 HAP 可以直接装到模拟器上** —— 真机才需要设备绑定的调试证书。

### 读取探针结果

探针把结果作为一行 JSON 打到网页 console，ArkTS 侧经 `onConsole` 转发到 hilog：

```bash
"$HDC" shell hilog -x | grep -a PROBE_JSON | tail -1 | sed 's/.*PROBE_JSON //'
```

这样结果是**机器可读**的，不需要截图看屏幕——本模型看不了图片，这一条很关键。

模拟器还提供 `-instance <name> -click/-slide/-fill/-screenshot` 做 UI 自动化，
可以驱动触摸输入来观察 `pointerType` 的实际取值。

---

## 尚未做

- **真机**：需要华为账号实名认证 + 设备绑定证书。模拟器覆盖了绝大部分运行时问题，但
  `pointerType === "pen"` 与坚盾守护模式只能真机验证。
- **把 Web 核心打包进 HAP**：目前 HAP 里只有一个探针页。下一步是把 `apps/web` 的产物放进
  `rawfile`，并写 ArkTS 的 API 转发桥（上面的方案 1）。
