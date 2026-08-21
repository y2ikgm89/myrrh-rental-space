import { test, expect, type Page } from "../fixtures/e2e-test";
import { urls } from "../fixtures";

/**
 * 公開サイト - /spaces facet 検索 UI E2E
 *
 * 責務: `spaceSearchParamsParsers` の URL → UI 双方向反映と、リセット動作を pin。
 * facet の Prisma 変換ロジックは `__tests__/unit/domain/spaces/public-queries.test.ts`
 * が担当。ここでは URL query が FilterBar UI 状態にきちんと写ることだけを検査する。
 *
 * 拠点・カテゴリ・設備・並び順・収容人数・空き時間帯はすべて単一の「検索条件」
 * モーダルの中にあり、自動では開かない。
 */

/**
 * 検索条件 Dialog を開く（hydration race 対策）。
 *
 * トリガーの `onClick` は client-side state のみで、hydration 完了前に click すると
 * ハンドラ未接続で Dialog が開かない（nightly CI で 2 夜連続 flake:
 * run 31963738476 / 32054212560）。開くまで click を retry する。
 * トリガーは toggle ではなく `setIsDialogOpen(true)` のみなので、開いた状態での
 * 再 click は無害（ただし modal 背後は inert なので、開いている間は click 自体を
 * 送らない）。
 */
async function openFilterDialog(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: /検索条件/ });
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await trigger.click();
    }
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

test.describe("/spaces facet filter — URL 双方向反映", () => {
  test("root で FilterBar の検索条件トリガーとリセットが描画される", async ({
    page,
  }) => {
    const res = await page.goto(urls.spaces);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("button", { name: /検索条件/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /リセット/ })).toBeVisible();
  });

  test("?minCapacity=10 で最低収容人数 input が 10 を保持", async ({
    page,
  }) => {
    await page.goto(`${urls.spaces}?minCapacity=10`);
    await openFilterDialog(page);
    const capacityInput = page.getByLabel("最低収容人数");
    await expect(capacityInput).toHaveValue("10");
  });

  test("?date + ?startTime + ?endTime で時間帯 3 input が保持", async ({
    page,
  }) => {
    await page.goto(
      `${urls.spaces}?date=2026-12-01&startTime=10:00&endTime=12:00`,
    );
    await openFilterDialog(page);
    await expect(page.getByLabel("日付")).toHaveValue("2026-12-01");
    await expect(page.getByLabel("開始時刻")).toHaveValue("10:00");
    await expect(page.getByLabel("終了時刻")).toHaveValue("12:00");
  });

  test("?sort=price-asc で並び順 select が『料金（安い順）』", async ({
    page,
  }) => {
    await page.goto(`${urls.spaces}?sort=price-asc`);
    await openFilterDialog(page);
    await expect(page.getByLabel("並び順")).toHaveValue("price-asc");
  });

  test("リセットボタンで URL の facet が消える", async ({ page }) => {
    await page.goto(
      `${urls.spaces}?minCapacity=10&sort=price-asc&date=2026-12-01`,
    );
    await openFilterDialog(page);
    await expect(page.getByLabel("最低収容人数")).toHaveValue("10");

    // モーダルは背後を inert 化するため、閉じてからリセットボタンを操作する
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /リセット/ }).click();

    await expect(page).toHaveURL(new RegExp(`${urls.spaces}(\\?page=1)?$`));

    await openFilterDialog(page);
    await expect(page.getByLabel("最低収容人数")).toHaveValue("");
  });
});
