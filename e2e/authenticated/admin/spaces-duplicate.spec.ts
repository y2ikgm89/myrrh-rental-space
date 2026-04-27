import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面スペース複製 E2E テスト
 *
 * テストシナリオ:
 * 1. スペース一覧の ActionDropdown から「複製」を選択
 * 2. 新規 DRAFT スペースが作成されて編集ページに遷移する
 */

test.describe("admin spaces duplicate", () => {
  test("ActionDropdown の複製で新規 DRAFT スペースが作成され編集ページに遷移", async ({
    page,
  }) => {
    await page.goto(urls.adminSpaces);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("スペース管理");

    // 一番最初の data row が存在する場合のみテスト
    const firstRow = page.locator("tbody tr").first();
    const hasSpaces = (await firstRow.count()) > 0;
    if (!hasSpaces) {
      test.skip(true, "スペースデータが存在しません");
      return;
    }

    // ActionDropdown を開く（sr-only ラベル「操作メニューを開く」で判定）
    const actionButton = firstRow.locator('button:has-text("操作")').first();
    await actionButton.click();

    // 「複製」をクリック
    await page.locator('[role="menuitem"]:has-text("複製")').click();

    // 複製処理完了後、編集ページに遷移することを確認
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/spaces\/[0-9a-f-]{36}\/edit$/);
  });
});
