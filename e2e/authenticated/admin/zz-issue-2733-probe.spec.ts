/**
 * **一時ファイル。Issue #2733 の原因が特定でき次第 削除する。**
 *
 * `/admin/reservations/new` は CI の広域 E2E で 60 run 中 5 回、エラーバウンダリを
 * 描画して落ちる。落ちた回のクライアント例外を取るための probe。
 *
 * ## これまでに外れた再現条件
 *
 * - 対象 spec だけを 25 回反復（CI run 33036096973）→ **全 pass**
 * - スイート末尾で `/admin/reservations/new` を 20 回叩く（CI run 33036609091）
 *   → **全 pass**
 * - ローカル（Windows）で 22 回 → 全 pass
 *
 * ## いま試している条件
 *
 * 実際の失敗は常に `create-recurring-reservation.spec.ts:69`
 * （`/admin/reservations/new-recurring` へ遷移）の**直後**に起きている。
 * その並びを 1 テスト内で再現し、スイート末尾で 20 回繰り返す。
 */
import { test, expect } from "../../fixtures/e2e-test";

const PROBE_ATTEMPTS = 20;

for (let index = 0; index < PROBE_ATTEMPTS; index += 1) {
  test(`#2733 probe ${index}: new-recurring の直後に new が描画される`, async ({
    page,
  }) => {
    await page.goto("/admin/reservations/new-recurring");
    await expect(
      page.getByRole("heading", { name: "繰返し予約作成" }),
    ).toBeVisible();

    await page.goto("/admin/reservations/new");
    await expect(
      page.getByRole("link", { name: "繰返し予約を作成する" }),
    ).toBeVisible();
  });
}
