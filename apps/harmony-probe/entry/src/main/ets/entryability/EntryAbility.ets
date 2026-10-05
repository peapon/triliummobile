import { AbilityConstant, UIAbility, Want } from "@kit.AbilityKit";
import { hilog } from "@kit.PerformanceAnalysisKit";
import { window } from "@kit.ArkUI";

import { ShellState } from "../services/ShellState";

const DOMAIN = 0x0000;
const TAG = "TriliumProbe";

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, "onCreate");
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, "onDestroy");
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent("pages/Index", (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, "loadContent failed: %{public}s", JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, "loadContent ok");
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, "onWindowStageDestroy");
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, "onForeground");
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, "onBackground");
  }

  /**
   * Route the back gesture into the page's history.
   *
   * The app is a single page, so the WebView's own history is the back stack: opening a note or the
   * settings screen pushes a step, and going backward fires `popstate` there. Consuming the press
   * only while there is history to walk means the gesture still exits the app from the top level,
   * which is what a user expects.
   */
  onBackPressed(): boolean {
    // Kept for the system back button, which does arrive at the ability. The edge swipe does not —
    // it is handled by the page's `onBackPress`. Both ask the same question.
    return ShellState.handleBack();
  }
}
