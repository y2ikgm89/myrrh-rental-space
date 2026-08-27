/**
 * **一時ファイル。Issue #2733 の原因が特定でき次第 削除する。**
 *
 * `/admin/reservations/new` は CI の広域 E2E で 25 run 中 3 回、エラーバウンダリを
 * 描画して落ちる。原因の切り分けに必要な「落ちた回の trace」を取るための probe。
 *
 * ## なぜ末尾なのか
 *
 * 単体で 25 回反復しても **CI でも 0 回**しか再現しない（run 33036096973）。
 * 実際の失敗はスイートの 272 番目で起きており、サーバーを十分に使い込んだ状態が
 * 前提に見える。`zz-` prefix でファイル順の最後へ回し、その状態で 20 回叩く。
 */
import { test, expect } from "../../fixtures/e2e-test";

const PROBE_ATTEMPTS = 20;

for (let index = 0; index < PROBE_ATTEMPTS; index += 1) {
  test(`#2733 probe ${index}: /admin/reservations/new が描画される`, async ({
    page,
  }) => {
    await page.goto("/admin/reservations/new");

    await expect(
      page.getByRole("link", { name: "繰返し予約を作成する" }),
    ).toBeVisible();
  });
}
