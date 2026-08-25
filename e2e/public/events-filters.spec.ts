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
 * **URL 反映の待ちは `expectUrlSync` を使う。** facet は
 * `useQueryStates(..., { shallow: false })` なのでサーバー往復を経てから URL が
 * 変わる。Playwright 既定の 5 秒はこの操作向けの値ではない（理由と実測は
 * `e2e/helpers/url-sync.ts`）。
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
