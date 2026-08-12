// `@playwright/test` を直接 import してよいのは共有 test 定義だけ
// （`__tests__/unit/architecture/e2e-client-ip-allocation.test.ts`）。型も例外にしない。
import type { Page } from "../fixtures/e2e-test";

/**
 * 時刻を固定し、**同時に rAF 駆動のスムーススクロールを無効化する**。
 *
 * ## なぜ 2 つを必ずセットにするのか
 *
 * 公開面は `LenisProvider` が GSAP ticker（= `requestAnimationFrame` /
 * `performance.now`）で Lenis を回している。`page.clock.install` はその時間源ごと
 * 止めるため、一度始まったスクロールの easing が**永久に完了しない** —
 * `<html>` に `lenis-scrolling` が張り付いたまま、スクロール位置が中途半端な値で
 * 漂い続ける。
 *
 * その状態で Playwright の座標クリック（`scrollIntoViewIfNeeded` → 座標算出 →
 * dispatch）を撃つと、算出と dispatch の間にページが動いて対象を外し、
 * **エラーも出ないままクリックだけが無効になる**。
 *
 * 実測（CI run 31578113849、`rate-plan-preview.smoke.spec.ts`）:
 * 「Reserve this space」を押しても遷移せず、`toHaveURL` が 15 秒 33 回とも
 * `class="lenis lenis-scrolling"` のまま失敗した。同じリンクを押す他 2 spec
 * （`reservation-submit.smoke` / `reservation-flow`）は時計を固定しないので
 * 一度も落ちていない。
 *
 * ローカル A/B（`window.scrollTo` のあと 5 秒観測）:
 *
 * | 条件 | `<html>` の class | 停止したか | scrollY |
 * | --- | --- | --- | --- |
 * | 時計固定のみ | `lenis lenis-scrolling` | **しない** | 1201（漂う） |
 * | 時計固定 + reduced motion | （なし） | する | 1200（固定） |
 *
 * ## なぜ `reducedMotion` なのか
 *
 * テスト専用の逃げ道を作らずに済むから。`LenisProvider` は
 * `prefersReducedMotion()` で初期化を見送る**既存の分岐**を持っており、これは
 * 実在するユーザー設定（OS のモーション低減）での経路そのもの。アプリ側に
 * E2E 用の条件分岐を足す必要がない。
 *
 * ## 呼ぶ位置
 *
 * **`page.goto` より前。** `LenisProvider` は mount 時に 1 度だけ
 * `prefersReducedMotion()` を読むので、ページを開いた後に変えても初期化は
 * 止められない。
 *
 * 直接 `page.clock.install` を呼ぶことは
 * `__tests__/unit/architecture/e2e-clock-requires-reduced-motion.test.ts` が禁止する。
 *
 * @module e2e/helpers/frozen-clock
 */
export async function installFrozenClock(
  page: Page,
  time: Date,
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time });
}
