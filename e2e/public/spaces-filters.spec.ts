import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.skip(
  appSurface !== "public",
  "Public /spaces facet filter spec is served only on public surface.",
);

/**
 * 公開サイト - /spaces facet 検索 UI E2E
 *
 * 責務: `spaceSearchParamsParsers` の URL → UI 双方向反映と、リセット動作を pin。
 * facet の Prisma 変換ロジックは `__tests__/unit/domain/spaces/public-queries.test.ts`
 * が担当。ここでは URL query が FilterBar UI 状態にきちんと写ることだけを検査する。
 *
 * 規約 SSoT: `.claude/rules/testing-e2e.md`
 */

test.describe("/spaces facet filter — URL 双方向反映", () => {
  test("root で FilterBar と 拠点/カテゴリ dropdown が描画される", async ({
    page,
  }) => {
    const res = await page.goto(urls.spaces);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
    // 並び順・設備・リセットは常時表示
    await expect(page.getByRole("button", { name: /並び順/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /リセット/ })).toBeVisible();
  });

  test("?minCapacity=10 で最低収容人数 input が 10 を保持", async ({
    page,
  }) => {
    await page.goto(`${urls.spaces}?minCapacity=10`);
    const capacityInput = page.getByLabel("最低収容人数");
    await expect(capacityInput).toHaveValue("10");
  });

  test("?date + ?startTime + ?endTime で時間帯 3 input が保持", async ({
    page,
  }) => {
    await page.goto(
      `${urls.spaces}?date=2026-12-01&startTime=10:00&endTime=12:00`,
    );
    await expect(page.getByLabel("日付")).toHaveValue("2026-12-01");
    await expect(page.getByLabel("開始時刻")).toHaveValue("10:00");
    await expect(page.getByLabel("終了時刻")).toHaveValue("12:00");
  });

  test("?sort=price-asc で並び順 dropdown が『料金（安い順）』", async ({
    page,
  }) => {
    await page.goto(`${urls.spaces}?sort=price-asc`);
    await expect(
      page.getByRole("button", { name: /料金（安い順）/ }),
    ).toBeVisible();
  });

  test("リセットボタンで URL の facet が消える", async ({ page }) => {
    await page.goto(
      `${urls.spaces}?minCapacity=10&sort=price-asc&date=2026-12-01`,
    );
    await expect(page.getByLabel("最低収容人数")).toHaveValue("10");

    await page.getByRole("button", { name: /リセット/ }).click();

    await expect(page).toHaveURL(new RegExp(`${urls.spaces}(\\?page=1)?$`));
    await expect(page.getByLabel("最低収容人数")).toHaveValue("");
  });
});
