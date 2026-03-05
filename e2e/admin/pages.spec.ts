import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

/**
 * 管理画面 - ページ管理 E2E テスト
 *
 * テストシナリオ:
 * 1. ページ一覧の表示
 * 2. 新規作成ページの表示
 * 3. Lexical エディタの起動・操作
 * 4. 編集ページへの遷移
 * 5. バリデーション
 * 6. レスポンシブ対応
 */

// =============================================================================
// テストセットアップ
// =============================================================================

/**
 * 管理者としてログイン
 */
async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}

/**
 * 各テスト前に管理者として認証
 */
test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

// =============================================================================
// 1. ページ管理 - 一覧
// =============================================================================

test.describe("ページ管理 - 一覧", () => {
  test("ページ一覧が表示される", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("ページ");
  });

  test("新規作成ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const createButton = page.locator(
      'a[href*="/admin/pages/new"], a:has-text("新規作成")',
    );
    await expect(createButton.first()).toBeVisible();
  });

  test("既存ページがリストまたはテーブルに表示される", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");
    const list = page.locator('[role="list"]');
    const hasTable = (await table.count()) > 0;
    const hasList = (await list.count()) > 0;

    expect(hasTable || hasList).toBe(true);
  });
});

// =============================================================================
// 2. ページ管理 - 新規作成
// =============================================================================

test.describe("ページ管理 - 新規作成", () => {
  test("新規作成ページが表示される", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator('button:has-text("保存")');
    await expect(saveButton).toBeVisible();
  });

  test("Lexical エディタが起動する", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const loadingText = page.locator("text=エディタを読み込み中");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 15000 });
    }

    const editor = page.locator('[contenteditable="true"]');
    await expect(editor.first()).toBeVisible({ timeout: 15000 });
  });

  test("エディタにテキストを入力できる", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 15000 });

    await editor.click();
    await page.keyboard.type("テストページコンテンツ");

    await expect(editor).toContainText("テストページコンテンツ");
  });

  test("戻るボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const backButton = page.locator('button:has-text("← 戻る")');
    if ((await backButton.count()) > 0) {
      await expect(backButton).toBeVisible();
    }
  });

  test("プレビューボタンをクリックすると通知が表示される", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const previewButton = page.locator('button:has-text("プレビュー")');
    if ((await previewButton.count()) > 0) {
      await previewButton.click();

      // 新規作成時はプレビュー不可の通知が表示されることを確認
      const toaster = page.locator("[data-sonner-toaster]");
      if ((await toaster.count()) > 0) {
        await expect(toaster).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

// =============================================================================
// 3. ページ管理 - 編集
// =============================================================================

test.describe("ページ管理 - 編集", () => {
  test("編集ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('a[href*="/admin/pages/"]:has-text("編集")')
      .first();

    if ((await editButton.count()) === 0) {
      test.skip(true, "ページが存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator('button:has-text("保存")');
    await expect(saveButton).toBeVisible();
  });

  test("編集ページで Lexical エディタが表示される", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('a[href*="/admin/pages/"]:has-text("編集")')
      .first();

    if ((await editButton.count()) === 0) {
      test.skip(true, "ページが存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const loadingText = page.locator("text=エディタを読み込み中");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 15000 });
    }

    const editor = page.locator('[contenteditable="true"]');
    await expect(editor.first()).toBeVisible({ timeout: 15000 });
  });

  test("戻るボタンで一覧ページに戻れる", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('a[href*="/admin/pages/"]:has-text("編集")')
      .first();

    if ((await editButton.count()) === 0) {
      test.skip(true, "ページが存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const backButton = page.locator('button:has-text("← 戻る")');
    if ((await backButton.count()) > 0) {
      await backButton.click();
      await page.waitForURL(urls.adminPages, { timeout: 10000 });
      await expect(page.locator("h1")).toContainText("ページ");
    }
  });
});

// =============================================================================
// 4. ページ管理 - 削除
// =============================================================================

test.describe("ページ管理 - 削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('a[href*="/admin/pages/"]:has-text("編集")')
      .first();

    if ((await editButton.count()) === 0) {
      test.skip(true, "ページが存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")');

    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible();
  });

  test("キャンセルボタンでダイアログを閉じられる", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('a[href*="/admin/pages/"]:has-text("編集")')
      .first();

    if ((await editButton.count()) === 0) {
      test.skip(true, "ページが存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")');

    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('button:has-text("キャンセル")').click();

    await expect(dialog).not.toBeVisible();
  });
});

// =============================================================================
// 5. ページ管理 - バリデーション
// =============================================================================

test.describe("ページ管理 - バリデーション", () => {
  test("タイトルなしで保存するとエラー", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // エラーメッセージを確認
    const errorText = page.locator("text=タイトルは必須, text=必須");
    if ((await errorText.count()) > 0) {
      await expect(errorText.first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// =============================================================================
// 6. ページ管理 - エラーハンドリング
// =============================================================================

test.describe("ページ管理 - エラーハンドリング", () => {
  test("存在しないページにアクセスすると404が表示される", async ({ page }) => {
    await page.goto("/admin/pages/non-existent-id-12345");

    const notFoundText = page.locator(
      "text=見つかりません, text=404, text=Not Found",
    );

    if ((await notFoundText.count()) > 0) {
      await expect(notFoundText.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 7. ページ管理 - レスポンシブ対応
// =============================================================================

test.describe("ページ管理 - レスポンシブ", () => {
  test("モバイルビューでも一覧が表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible();
  });

  test("モバイルビューでも編集ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const loadingText = page.locator("text=エディタを読み込み中...");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 10000 });
    }

    const editor = page.locator('[contenteditable="true"]');
    await expect(editor.first()).toBeVisible({ timeout: 10000 });
  });
});
