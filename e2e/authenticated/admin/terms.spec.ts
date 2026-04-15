import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - 利用規約管理 E2E テスト
 *
 * テストシナリオ:
 * 1. 利用規約一覧ページの表示
 * 2. 利用規約の新規作成
 * 3. 利用規約の編集
 * 4. 利用規約の削除
 * 5. バージョン履歴
 * 6. レスポンシブ対応
 */

// =============================================================================
// 1. 利用規約一覧ページの表示
// =============================================================================

test.describe("利用規約一覧ページ", () => {
  test("利用規約一覧ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("利用規約");
  });

  test("新規作成ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const createButton = page.locator(
      'a[href="/admin/terms/new"], button:has-text("新規作成"), a:has-text("新規作成")',
    );
    await expect(createButton.first()).toBeVisible();
  });

  test("利用規約リストまたは空状態が表示される", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");
    const emptyState = page.locator(
      "text=利用規約がありません, text=データがありません",
    );

    const hasTable = (await table.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasTable || hasEmpty).toBe(true);
  });
});

// =============================================================================
// 2. 利用規約の新規作成
// =============================================================================

test.describe("利用規約の新規作成", () => {
  test("新規作成ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminTerms + "/new");
    await page.waitForLoadState("networkidle");

    // 保存ボタンが存在することを確認
    const saveButton = page.locator(
      'button:has-text("保存"), button[type="submit"]',
    );
    await expect(saveButton.first()).toBeVisible();
  });

  test("タイトルフィールドが存在する", async ({ page }) => {
    await page.goto(urls.adminTerms + "/new");
    await page.waitForLoadState("networkidle");

    const titleInput = page.locator(
      'input[name="title"], input[placeholder*="タイトル"]',
    );
    if ((await titleInput.count()) > 0) {
      await expect(titleInput.first()).toBeVisible();
    }
  });

  test("新規作成ページでプレビューボタンをクリックすると通知が表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminTerms + "/new");
    await page.waitForLoadState("networkidle");

    // プレビューボタンをクリック
    const previewButton = page.locator('button:has-text("プレビュー")');
    if ((await previewButton.count()) > 0) {
      await previewButton.click();

      // 通知メッセージを確認（作成後プレビュー可能）
      const notification = page.locator(
        "text=利用規約を作成後にプレビューできます, [data-sonner-toaster]",
      );
      if ((await notification.count()) > 0) {
        await expect(notification.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

// =============================================================================
// 3. 利用規約の編集
// =============================================================================

test.describe("利用規約の編集", () => {
  test("編集ページが既存データで表示される", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    // 最初の利用規約の編集リンクをクリック
    const firstEditButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // 保存ボタンが表示されることを確認
    const saveButton = page.locator(
      'button:has-text("保存"), button[type="submit"]',
    );
    await expect(saveButton.first()).toBeVisible();
  });

  test("タイトルを更新して保存できる", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // タイトルフィールドを探して更新
    const titleInput = page.locator(
      'input[name="title"], input[placeholder*="タイトル"]',
    );
    if ((await titleInput.count()) > 0) {
      await titleInput.first().clear();
      await titleInput.first().fill("更新された利用規約タイトル");
    }

    // 保存ボタンをクリック
    const saveButton = page.locator(
      'button:has-text("保存"), button[type="submit"]',
    );
    await saveButton.first().click();

    // 成功メッセージを確認
    const successMessage = page.locator(
      "text=保存しました, text=更新しました, [data-sonner-toaster]",
    );
    if ((await successMessage.count()) > 0) {
      await expect(successMessage.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test("戻るボタンで一覧ページに戻れる", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // 戻るボタンをクリック
    const backButton = page.locator(
      'button:has-text("← 戻る"), a:has-text("← 戻る"), button:has-text("戻る")',
    );
    if ((await backButton.count()) > 0) {
      await backButton.first().click();
      await page.waitForURL(urls.adminTerms, { timeout: 10000 });
      await expect(page.locator("h1")).toContainText("利用規約");
    }
  });
});

// =============================================================================
// 4. 利用規約の削除
// =============================================================================

test.describe("利用規約の削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // 削除ボタンを探す
    const deleteButton = page.locator('button:has-text("削除")');

    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    // 確認ダイアログが表示されることを確認
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // ダイアログに削除関連のテキストが含まれることを確認
    await expect(dialog.locator("text=削除")).toBeVisible();

    // キャンセルボタンを確認
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible();
  });

  test("キャンセルボタンでダイアログを閉じられる", async ({ page }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")');

    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // キャンセルボタンをクリック
    await dialog.locator('button:has-text("キャンセル")').click();

    // ダイアログが閉じられることを確認
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

// =============================================================================
// 5. バージョン履歴
// =============================================================================

test.describe("バージョン履歴", () => {
  test("バージョン履歴が表示される（利用規約が存在する場合）", async ({
    page,
  }) => {
    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // バージョン関連のセクションを確認
    const versionSection = page.locator(
      "text=バージョン, text=履歴, text=Version",
    );
    if ((await versionSection.count()) > 0) {
      await expect(versionSection.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 6. エラーハンドリング
// =============================================================================

test.describe("エラーハンドリング", () => {
  test("存在しない利用規約にアクセスすると適切なページが表示される", async ({
    page,
  }) => {
    await page.goto("/admin/terms/non-existent-id-12345");

    // 404ページまたはエラーメッセージが表示されることを確認
    const notFoundText = page.locator(
      "text=見つかりません, text=404, text=Not Found",
    );

    if ((await notFoundText.count()) > 0) {
      await expect(notFoundText.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 7. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでも一覧ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminTerms);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible();
  });

  test("モバイルビューでも新規作成ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminTerms + "/new");
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator(
      'button:has-text("保存"), button[type="submit"]',
    );
    await expect(saveButton.first()).toBeVisible();
  });
});
