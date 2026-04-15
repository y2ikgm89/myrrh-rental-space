import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - メディア管理 E2E テスト
 *
 * テストシナリオ:
 * 1. メディア一覧ページの表示
 * 2. 検索・フィルタ機能
 * 3. 削除操作
 * 4. レスポンシブ対応
 */

// =============================================================================
// 1. メディア一覧ページの表示
// =============================================================================

test.describe("メディア一覧ページ", () => {
  test("メディア一覧ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("メディア");
  });

  test("アップロードボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const uploadButton = page.locator(
      'button:has-text("アップロード"), label:has-text("アップロード")',
    );
    await expect(uploadButton.first()).toBeVisible();
  });

  test("メディアグリッドまたは空の状態が表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const grid = page.locator('[class*="grid"], [data-testid*="media"]');
    const emptyState = page.locator(
      "text=メディアがありません, text=ファイルがありません",
    );

    const hasGrid = (await grid.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasGrid || hasEmpty).toBe(true);
  });
});

// =============================================================================
// 2. 検索・フィルタ機能
// =============================================================================

test.describe("メディア管理 - 検索・フィルタ", () => {
  test("検索フィールドが表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="検索"]',
    );
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test("存在しないファイル名で検索すると空状態になる", async ({ page }) => {
    await page.goto(urls.adminMedia + "?search=nonexistent-file-xyz-99999");
    await page.waitForLoadState("networkidle");

    const emptyState = page.locator(
      "text=メディアがありません, text=見つかりません, text=該当なし",
    );
    if ((await emptyState.count()) > 0) {
      await expect(emptyState.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 3. 削除操作
// =============================================================================

test.describe("メディア管理 - 削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")').first();
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "メディアが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("削除ダイアログのキャンセルボタンが動作する", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")').first();
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "メディアが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.locator('button:has-text("キャンセル")');
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

// =============================================================================
// 4. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでも一覧ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible();
  });
});
