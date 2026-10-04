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
}
