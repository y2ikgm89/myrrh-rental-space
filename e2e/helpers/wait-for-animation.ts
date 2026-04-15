import type { Page, Locator } from "@playwright/test";

/**
 * E2E アニメーション待機ヘルパー
 *
 * GSAP / Lenis を使う公開ページで、アニメーション完了前に assertion が
 * 走ると flaky になる問題への対処。Playwright 公式の
 * `animations: "disabled"` はスクリーンショット時のみ有効なため、
 * インタラクション前後の待機はこのヘルパーで対応する。
 *
 * 設計原則:
 * - `page.waitForFunction` でブラウザ内の状態を polling
 * - デフォルト timeout 3000ms（E2E の標準値）
 * - `waitForTimeout` の固定 sleep は避け、実際の完了状態を検出
 *
 * 参照:
 * - https://playwright.dev/docs/api/class-page#page-wait-for-function
 * - https://greensock.com/docs/v3/GSAP/gsap.globalTimeline
 * - https://github.com/darkroomengineering/lenis
 */

/**
 * GSAP の global timeline がアイドル状態になるまで待機する。
 *
 * `gsap.globalTimeline.isActive()` が false または
 * `globalThis.gsap === undefined` になった時点で resolve。
 * GSAP が読み込まれていないページ（管理画面等）は即 resolve。
 *
 * @param page - Playwright Page instance
 * @param timeout - 最大待機時間 (ms), デフォルト 3000
 */
export async function waitForGsapComplete(
  page: Page,
  timeout = 3000,
): Promise<void> {
  await page
    .waitForFunction(
      () => {
        // GSAP 未ロードなら即完了扱い
        const gsap = (
          globalThis as unknown as {
            gsap?: { globalTimeline?: { isActive?: () => boolean } };
          }
        ).gsap;
        if (!gsap?.globalTimeline?.isActive) return true;
        return !gsap.globalTimeline.isActive();
      },
      { timeout },
    )
    .catch(() => {
      // timeout でも妥協して続行（E2E は assertion 側でリトライされる）
    });
}

/**
 * Lenis の慣性スクロールが停止するまで待機する。
 *
 * `lenis.isScrolling === false` になった時点で resolve。
 * Lenis が読み込まれていないページは即 resolve。
 *
 * @param page - Playwright Page instance
 * @param timeout - 最大待機時間 (ms), デフォルト 2000
 */
export async function waitForLenisStop(
  page: Page,
  timeout = 2000,
): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const lenis = (
          globalThis as unknown as {
            lenis?: { isScrolling?: boolean };
          }
        ).lenis;
        if (!lenis) return true;
        return lenis.isScrolling === false;
      },
      { timeout },
    )
    .catch(() => {
      // noop
    });
}

/**
 * 要素までスクロールした後、GSAP / Lenis の完了を待機する複合ヘルパー。
 *
 * ScrollTrigger で発火するアニメーションを全て終了させたい場合に使用。
 *
 * @param page - Playwright Page instance
 * @param locator - スクロール先要素の locator
 */
export async function stabilizeScroll(
  page: Page,
  locator: Locator,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await waitForLenisStop(page);
  await waitForGsapComplete(page);
}

/**
 * ページ初回レンダリング後のアニメーション完了を待機する。
 *
 * Hero アニメーション・ScrollReveal 入場アニメ等が全て終わるまで待つ。
 * `page.goto` + `waitForLoadState("networkidle")` の直後に呼び出す。
 *
 * @param page - Playwright Page instance
 */
export async function waitForInitialAnimations(page: Page): Promise<void> {
  await waitForGsapComplete(page, 5000);
  await waitForLenisStop(page, 2000);
}
