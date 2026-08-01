import { test, expect } from "../fixtures/e2e-test";
import { urls, eventCategoryFixtures } from "../fixtures";

const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.skip(
  appSurface !== "public",
  "Public /events findability filter spec is served only on public surface.",
);

/**
 * 公開サイト - /events 検索性向上 UI E2E
 *
 * 責務: `eventsListSearchParamsParsers` の URL → UI 双方向反映を pin する。
 * tab/q/categoryId の Prisma 変換ロジックは
 * `__tests__/unit/domain/events/public-queries.test.ts` が担当。
 *
 * 規約 SSoT: `.claude/rules/testing-e2e.md`
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
    await expect(page.getByLabel("イベントを検索")).toBeVisible();
    await expect(page.getByLabel("カテゴリー")).toBeVisible();
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
    await expect(page).toHaveURL(/[?&]tab=past/);
  });

  test("検索欄に入力すると URL の q に反映され値が保持される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    const searchInput = page.getByLabel("イベントを検索");
    await searchInput.fill("ヨガ");
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(searchInput).toHaveValue("ヨガ");
  });

  test(`?categoryId で「${eventCategoryFixtures.workshopName}」が select に反映される`, async ({
    page,
  }) => {
    await page.goto(urls.events);
    const select = page.getByLabel("カテゴリー");
    const optionValue = await select
      .locator("option", { hasText: eventCategoryFixtures.workshopName })
      .getAttribute("value");
    expect(optionValue).toBeTruthy();

    await page.goto(`${urls.events}?categoryId=${optionValue}`);
    await expect(select).toHaveValue(optionValue ?? "");
  });
});
