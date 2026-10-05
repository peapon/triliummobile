/**
 * The application shell.
 *
 * Two things happen here, and both exist because of measurements taken on a real device:
 *
 * 1. **The page is served from `https://localhost`, not `resource://rawfile`.** A rawfile page has a
 *    `null` origin, which blocks Web Workers (`SecurityError: ... cannot be accessed from origin
 *    'null'`) and Origin Private File Storage. The client needs both: the OPFS SAH-Pool VFS is
 *    worker-only because `createSyncAccessHandle` is, and OPFS is where the replica lives. Static
 *    requests are intercepted and answered from the package, which gives the page a real origin,
 *    workers and OPFS, while shipping no server at all.
 *
 * 2. **API calls are proxied natively.** `onInterceptRequest` is synchronous, so it cannot perform a
 *    network round trip; the page reaches the network through the `triliumNative` bridge instead,
 *    which also sidesteps the server's same-origin policy (ADR D9).
 */

import { hilog } from "@kit.PerformanceAnalysisKit";
import { webview } from "@kit.ArkWeb";
import { picker } from "@kit.CoreFileKit";

import { ApiProxy } from "../services/ApiProxy";
import { ShellState } from "../services/ShellState";

const DOMAIN = 0x0000;
const TAG = "TriliumShell";

/** A real origin, so workers and OPFS behave. Resolved entirely by the request interceptor. */
const APP_ORIGIN = "https://localhost";
const APP_ROOT = "web";

// A Map rather than an object literal: ArkTS rejects an untyped literal assigned to `Record`.
const MIME_TYPES: Map<string, string> = new Map<string, string>([
  ["html", "text/html"],
  ["js", "text/javascript"],
  ["mjs", "text/javascript"],
  ["css", "text/css"],
  ["json", "application/json"],
  // Without the right type the engine refuses to stream-compile the SQLite binary.
  ["wasm", "application/wasm"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"],
  ["txt", "text/plain"]
]);

function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME_TYPES.get(path.substring(dot + 1).toLowerCase()) ?? "application/octet-stream";
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private api: ApiProxy = new ApiProxy();

  /** Empty once the page is up. A permanent "ready" line costs a row to say nothing is wrong. */
  @State private status: string = "正在启动…";

  build() {
    Column() {
      if (this.status !== "") {
        Text(this.status)
          .fontSize(12)
          .fontColor("#666666")
          .padding(6)
          .width("100%")
          .backgroundColor("#F2F2F2")
      }

      Web({ src: `${APP_ORIGIN}/index.html`, controller: this.controller })
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .javaScriptAccess(true)
        .mixedMode(MixedMode.All)
        .imageAccess(true)
        // Every request the page makes lands here. Anything the package holds is served from it;
        // anything else returns null so the engine handles it normally.
        .onInterceptRequest((event) => {
          if (!event) {
            return null;
          }
          return this.serveFromPackage(event.request.getRequestUrl());
        })
        // Without this the page's `<input type="file">` opens nothing: ArkWeb asks the host to run
        // the picker and waits for the answer, and an unanswered request is an inert button. The
        // web side picks images and attachments through exactly that element.
        .onShowFileSelector((event: OnShowFileSelectorEvent) => {
          this.chooseFiles(event);
          return true;
        })
        .javaScriptProxy({
          object: this.api,
          name: "triliumNative",
          methodList: ["request", "reset", "setBackEnabled"],
          controller: this.controller
        })
        .onControllerAttached(() => {
          ShellState.controller = this.controller;

          try {
            webview.WebviewController.enablePrivateNetworkAccess(false);
            this.status = "";
          } catch (error) {
            this.status = `enablePrivateNetworkAccess 失败：${(error as BusinessError).message}`;
          }
        })
        .onConsole((event) => {
          if (event) {
            // The page's own logging is the only readable channel out of a device.
            hilog.info(DOMAIN, TAG, "WEB %{public}s", event.message.getMessage());
          }
          return false;
        })
        .onErrorReceive((event) => {
          if (event) {
            hilog.error(DOMAIN, TAG, "load error: %{public}s", event.error.getErrorInfo());
          }
        })
        .width("100%")
        .layoutWeight(1)
    }
    .width("100%")
    .height("100%")
  }

  /**
   * Answer a request from the packaged assets.
   *
   * The origin check matters: `onInterceptRequest` fires for every request the WebView makes,
   * including ones aimed at the Trilium server, and answering those from the package would silently
   * replace the network with a 404.
   */
  /**
   * Run the system picker and hand the chosen files back to the page.
   *
   * Without this, the page's `<input type="file">` opens nothing: ArkWeb asks the host to run the
   * picker and waits for the answer, and an unanswered request is an inert button. The web side
   * picks both images and attachments through exactly that element.
   *
   * Answering with an empty list on cancel or failure is required — the page is blocked on this call,
   * and a request that is never answered leaves the control permanently stuck.
   */
  private chooseFiles(event: OnShowFileSelectorEvent): void {
    const documentPicker = new picker.DocumentViewPicker(getContext(this));

    documentPicker
      .select({ maxSelectNumber: 1 })
      .then((uris: Array<string>) => {
        event.result.handleFileList(uris ?? []);
      })
      .catch((error: BusinessError) => {
        hilog.warn(DOMAIN, TAG, "file picker failed: %{public}s", error.message);
        event.result.handleFileList([]);
      });
  }

  private serveFromPackage(url: string): WebResourceResponse | null {
    if (!url.startsWith(APP_ORIGIN)) {
      return null;
    }

    const withoutOrigin = url.substring(APP_ORIGIN.length);
    const withoutQuery = withoutOrigin.split("?")[0];
    const relative = withoutQuery === "" || withoutQuery === "/" ? "index.html" : withoutQuery.replace(/^\/+/, "");

    const path = `${APP_ROOT}/${relative}`;

    try {
      const bytes = getContext().resourceManager.getRawFileContentSync(path);

      const response = new WebResourceResponse();
      response.setResponseCode(200);
      response.setResponseMimeType(mimeFor(path));
      response.setResponseEncoding("utf-8");
      response.setResponseData(bytes.buffer as ArrayBuffer);
      // The bundle is versioned by filename but index.html is not, and a stale index would pin an
      // old build.
      response.setResponseHeader([
        { headerKey: "Cache-Control", headerValue: "no-store" }
      ]);

      return response;
    } catch (error) {
      hilog.warn(DOMAIN, TAG, "no packaged asset for %{public}s", path);
      return null;
    }
  }
}
