// `@playwright/test` を直接 import してよいのは共有 test 定義だけ
// （`__tests__/unit/architecture/e2e-client-ip-allocation.test.ts`）。型も例外にしない。
import type { Page } from "../fixtures/e2e-test";

/**
 * 「今日」を固定する。**タイマーは止めない。**
 *
 * ## `page.clock.install` を使ってはいけない
 *
 * `install` は `Date` だけでなく `setTimeout` / `requestAnimationFrame` /
 * `performance.now` まで差し替えて**時間を止める**。止まった時間の上では
 * Next.js App Router の client 遷移が**確定しない** — RSC のリクエストは飛ぶのに
 * `history.pushState` まで到達せず、URL が変わらないまま固まる。
 *
 * 実測（CI run 31581209907 の `rate-plan-preview.smoke.spec.ts`、trace の
 * network を確認）:
 *
 * - `click` は成功（例外なし）
 * - `GET /reservation?spaceId=...&_rsc=...` は**発行されている**
 * - それでも `toHaveURL(/\/reservation\?spaceId=/)` が 15 秒 33 回とも
 *   `http://localhost:3000/spaces/coworking-space` のまま失敗
 *
 * 同じリンクを押す他 2 spec（`reservation-submit.smoke` / `reservation-flow`）は
 * 時計を固定しないので一度も落ちていない。prefetch が間に合った run では確定が
 * 同期的に済むため、遅い CI でだけ表面化する flaky として現れていた。
 *
 * ## `setFixedTime` が正しい API
 *
 * bundled types の記述がそのまま要件に一致する:
 * 「Makes `Date.now` and `new Date()` return fixed fake time at all times,
 * **keeps all the timers running**」。
 *
 * これらの spec が必要としているのは**固定された日付**であって、止まった時計では
 * ない（`clock.fastForward` / `runFor` を呼ぶ spec は 0 件）。カレンダーの
 * 「今日」も送信時の日付 refine も `Date` しか見ないので、`setFixedTime` で足りる。
 *
 * ## 呼ぶ位置
 *
 * `page.goto` より前（SSR の `minDate` 計算と client の「今日」を揃えるため）。
 *
 * 直接 `page.clock.install` を呼ぶことは
 * `__tests__/unit/architecture/e2e-clock-must-not-freeze-timers.test.ts` が禁止する。
 *
 * @module e2e/helpers/fixed-date
 */
export async function installFixedDate(page: Page, time: Date): Promise<void> {
  await page.clock.setFixedTime(time);
}
