/**
 * 管理画面の一覧ページの検索欄が、**水和前に打たれた文字**も拾うこと。
 *
 * 検索欄の実体は `BaseFilters`（`_shared/components/table/BaseFilters.tsx`）で、
 * 管理画面の一覧ページがほぼ全部これを通る。ここが落ちると全ページで同じ形が
 * 再発するので、代表として `/admin/news` で 1 本だけ張る。
 *
 * 公開面（`e2e/public/events-filters.spec.ts`）と同じ欠陥だが、**admin 側は
 * uncontrolled**（`defaultValue`）である点が違う。React が値を書き戻さないので
 * 文字は残り続け、「打った文字は見えているのに一覧が絞り込まれない」という形に
 * なる。待っても直らない終端状態なのは同じ。
 *
 * chunk を 3 秒遅らせて `waitUntil: "commit"` で戻ることで水和前の窓を作る。
 * 通常実行（遅延なし）では修正前でも通ってしまうため、この形でしか新旧を
 * 判別できない。落ちたら `BaseFilters` から `ref={searchRef}` が外れている。
 * **待ち時間を伸ばして直そうとしない。**
 */

import { test, expect } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";
import { expectUrlSync } from "../../helpers/url-sync";

const SEARCH_PLACEHOLDER = "タイトル、本文で検索...";

test.describe("管理画面一覧の検索欄 — 水和前入力", () => {
  test("水和前に打った文字も URL の search に反映される", async ({ page }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // `waitUntil: "commit"` で HTML が届いた時点で戻る。既定の "load" は
    // 上で遅らせた当の chunk を待つので、水和前の窓を踏めない。
    await page.goto(urls.adminNews, { waitUntil: "commit" });

    const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
    await search.fill("お知らせ");

    await expectUrlSync(page, /[?&]search=/);
    await expect(search).toHaveValue("お知らせ");
  });
});
