import { test, expect } from "../fixtures/e2e-test";
import { urls, eventCategoryFixtures } from "../fixtures";
import { expectUrlSync } from "../helpers/url-sync";

/**
 * 公開サイト - /events 検索性向上 UI E2E
 *
 * 責務: `eventsListSearchParamsParsers` の URL → UI 双方向反映を pin する。
 * tab/q/categoryId の Prisma 変換ロジックは
 * `__tests__/unit/domain/events/public-queries.test.ts` が担当。
 *
 * **`getByLabel` を使わない。** React streaming の hidden staging container が
 * 同じ input を一時的に 2 つ存在させるため strict-mode violation になる
 * （実測: `getByLabel('イベントを検索') resolved to 2 elements`。a11y ツリーには
 * 1 つしか出ない）。role locator は `includeHidden: false` が既定なので
 * staging copy を構造的に掴まない。理由の全文は
 * `e2e/helpers/streaming-safe-locators.ts`。
 *
 * **URL 反映の待ちは `expectUrlSync` を使う。** 理由と実測は
 * `e2e/helpers/url-sync.ts`。
 *
 * **水和前に打った入力は onChange に届かない。** 本 spec の最後の 1 本が
 * その形を chunk 遅延で再現している。通常実行では修正前でも通るので、
 * あの 1 本だけが新旧を判別できる。
 */

test.describe("/events findability — URL 双方向反映", () => {
  test("root で開催予定タブが選択状態、検索欄とカテゴリー select が描画される", async ({
    page,
  }) => {
    const res = await page.goto(urls.events);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "開催予定" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "終了" })).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "イベントを検索" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "カテゴリー" }),
    ).toBeVisible();
  });

  test("?tab=past で終了タブが選択状態になる", async ({ page }) => {
    await page.goto(`${urls.events}?tab=past`);
    await expect(page.getByRole("button", { name: "終了" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("終了タブをクリックすると URL の tab=past に反映される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    await page.getByRole("button", { name: "終了" }).click();
    await expectUrlSync(page, /[?&]tab=past/);
  });

  test("検索欄に入力すると URL の q に反映され値が保持される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    const searchInput = page.getByRole("searchbox", {
      name: "イベントを検索",
    });
    await searchInput.fill("ヨガ");
    await expectUrlSync(page, /[?&]q=/);
    await expect(searchInput).toHaveValue("ヨガ");
  });

  /**
   * **水和前に打った文字が失われないこと。**
   *
   * SSR された検索欄は client JS が走る前から操作できる。そこへ入った文字は
   * DOM には残るが React の `onChange` には届かず、React は水和時にその
   * 食い違いを直さない（`initInput` の `isHydrating` 短絡）。結果は
   * 「文字は見えているのに絞り込まれない」という**終端状態**で、待っても
   * 直らない。実際に nightly を赤くしていたのはこれで、
   * `URL_SYNC_TIMEOUT_MS` を 5 秒から 20 秒へ伸ばしても直らなかった。
   *
   * chunk を 3 秒遅らせて `waitUntil: "commit"` で戻ることで、**水和前の
   * 窓を強制的に作る**。CI の速さに依存しないので flaky にならない。
   * 通常実行（遅延なし）では修正前でも通ってしまうため、この形でしか
   * 新旧を判別できない。
   *
   * 落ちたら `useAdoptPrehydrationInput` の `ref` が外れている。
   * **待ち時間を伸ばして直そうとしない。**
   */
  test("水和前に打った文字も URL の q に反映される", async ({ page }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // `waitUntil: "commit"` で HTML が届いた時点で戻る。既定の "load" は
    // 上で遅らせた当の chunk を待つので、水和前の窓を踏めない。
    await page.goto(urls.events, { waitUntil: "commit" });

    const searchInput = page.getByRole("searchbox", {
      name: "イベントを検索",
    });
    await searchInput.fill("ヨガ");

    await expectUrlSync(page, /[?&]q=/);
    await expect(searchInput).toHaveValue("ヨガ");
  });

  test(`?categoryId で「${eventCategoryFixtures.workshopName}」が select に反映される`, async ({
    page,
  }) => {
    await page.goto(urls.events);
    const select = page.getByRole("combobox", { name: "カテゴリー" });
    const optionValue = await select
      .locator("option", { hasText: eventCategoryFixtures.workshopName })
      .getAttribute("value");
    expect(optionValue).toBeTruthy();

    await page.goto(`${urls.events}?categoryId=${optionValue}`);
    await expect(select).toHaveValue(optionValue ?? "");
  });
});
