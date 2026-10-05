/**
 * The one piece of state the ability and the page both need.
 *
 * `onBackPressed` lives on the UIAbility, but the WebView controller is owned by the page component.
 * A module-level holder is the shortest bridge between them, and it keeps the back handling where the
 * history actually is.
 */

import { webview } from "@kit.ArkWeb";

export class ShellState {
  static controller: webview.WebviewController | null = null;

  /**
   * Whether the page has somewhere to go back to.
   *
   * Pushed by the page after every render. The WebView's own `accessBackward()` is not enough: the
   * app is a single document and navigates with `history.pushState`, and ArkWeb does not count
   * same-document entries — so `accessBackward()` stayed false, the press was not consumed, and the
   * system exited the app instead of stepping back.
   */
  static backEnabled: boolean = false;

  /**
   * Consume a back gesture, or decline it.
   *
   * Shared, because two things can ask: the page's `onBackPress` and the ability's `onBackPressed`.
   * Measured on the device, the edge swipe reaches the **page**, not the ability — the ability's
   * callback never logged once while the page reported `backEnabled=true`.
   */
  static handleBack(): boolean {
    if (!ShellState.backEnabled || !ShellState.controller) {
      return false;
    }

    ShellState.controller.runJavaScript("window.__triliumBack && window.__triliumBack()");
    return true;
  }
}
