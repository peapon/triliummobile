/**
 * The ArkWeb capability probe.
 *
 * It exists to answer the three questions that decide the client's architecture and that no
 * documentation settles:
 *
 *   1. Does ArkWeb deliver `pointerType === "pen"` for stylus input? Every ink feature depends on it.
 *   2. Can the WebView reach a self-hosted server over cleartext HTTP on the LAN, with
 *      `enablePrivateNetworkAccess(false)`?
 *   3. What is the real IndexedDB quota, and does the ArkWeb build support the storage APIs the
 *      client needs?
 *
 * It also reports the WebView's own Chromium version, which is the fastest way to find out which
 * baseline the engine actually ships.
 */

import { webview } from "@kit.ArkWeb";
import { hilog } from "@kit.PerformanceAnalysisKit";

const DOMAIN = 0x0000;
const TAG = "TriliumProbe";

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();

  @State private status: string = "Waiting for the WebView to attach...";

  build() {
    Column() {
      Text(this.status)
        .fontSize(12)
        .fontColor("#666666")
        .padding(8)
        .width("100%")
        .backgroundColor("#F2F2F2")

      Web({ src: $rawfile("probe.html"), controller: this.controller })
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .mixedMode(MixedMode.All)
        .javaScriptAccess(true)
        // Private Network Access blocks cross-origin requests to LAN/private addresses by default,
        // which is exactly the self-hosted-server case. This is the API under test: it is @since 20,
        // and it must be called after the controller is bound.
        .onControllerAttached(() => {
          try {
            webview.WebviewController.enablePrivateNetworkAccess(false);
            this.status = "enablePrivateNetworkAccess(false) applied — running probe";
            hilog.info(DOMAIN, TAG, "enablePrivateNetworkAccess(false) applied");
          } catch (error) {
            const message = (error as BusinessError).message;
            this.status = "enablePrivateNetworkAccess FAILED: " + message;
            hilog.error(DOMAIN, TAG, "enablePrivateNetworkAccess failed: %{public}s", message);
          }
        })
        .onPageEnd(() => {
          hilog.info(DOMAIN, TAG, "probe page loaded");
        })
        // The probe reports its findings through `console.log`, which is otherwise invisible on a
        // device. Forwarding it to hilog is what makes the results readable over `hdc shell hilog`
        // instead of having to photograph the screen.
        .onConsole((event) => {
          if (event) {
            hilog.info(DOMAIN, TAG, "WEB %{public}s", event.message.getMessage());
          }
          return false;
        })
        .onErrorReceive((event) => {
          if (event) {
            this.status = "load error: " + event.error.getErrorInfo();
            hilog.error(DOMAIN, TAG, "load error: %{public}s", event.error.getErrorInfo());
          }
        })
        .width("100%")
        .layoutWeight(1)
    }
    .width("100%")
    .height("100%")
  }
}
