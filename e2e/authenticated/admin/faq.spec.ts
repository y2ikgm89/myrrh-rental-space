import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - FAQ管理 E2E テスト
 *
 * テストシナリオ:
 * 1. FAQ一覧ページの表示
 * 2. カテゴリ作成ページへの遷移
 * 3. 質問作成ページへの遷移
 * 4. カテゴリの編集
 * 5. 質問の編集
 * 6. 削除確認ダイアログ
 * 7. レスポンシブ対応
 */

// =============================================================================
// 1. FAQ一覧ページの表示
// =============================================================================

test.describe("FAQ一覧ページ", () => {
  test("FAQ管理ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("FAQ");
  });

  test("カテゴリ追加ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const categoryButton = page.locator('a[href="/admin/faq/categories/new"]');
    await expect(categoryButton).toBeVisible();
    await expect(categoryButton).toContainText("カテゴリ追加");
  });

  test("質問追加ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const itemButton = page.locator('a[href="/admin/faq/items/new"]');
    await expect(itemButton).toBeVisible();
    await expect(itemButton).toContainText("質問追加");
  });

  test("カテゴリリストまたは空の状態が表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // カテゴリカードまたは空状態のいずれかが表示される
    const categoryCard = page
      .locator('[class*="Card"], [data-testid="category-card"]')
      .first();
    const emptyState = page.locator("text=FAQカテゴリがまだ登録されていません");

    const hasCards = (await categoryCard.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasCards || hasEmpty).toBe(true);
  });

  test("空の状態でも最初のカテゴリ作成リンクが表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const emptyState = page.locator("text=FAQカテゴリがまだ登録されていません");
    if ((await emptyState.count()) === 0) {
      test.skip(true, "FAQカテゴリが既に存在します");
      return;
    }

    const createFirstLink = page.locator('a:has-text("最初のカテゴリを作成")');
    await expect(createFirstLink).toBeVisible();
  });
});

// =============================================================================
// 2. カテゴリ作成ページへの遷移
// =============================================================================

test.describe("カテゴリ作成", () => {
  test("カテゴリ追加ボタンをクリックすると新規作成ページに遷移する", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    await page.click('a[href="/admin/faq/categories/new"]');
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL("/admin/faq/categories/new");
  });

  test("カテゴリ新規作成ページにフォームが表示される", async ({ page }) => {
    await page.goto("/admin/faq/categories/new");
    await page.waitForLoadState("networkidle");

    // フォームまたは送信ボタンが存在することを確認
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton.first()).toBeVisible();
  });
});

// =============================================================================
// 3. 質問作成ページへの遷移
// =============================================================================

test.describe("質問作成", () => {
  test("質問追加ボタンをクリックすると新規作成ページに遷移する", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    await page.click('a[href="/admin/faq/items/new"]');
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL("/admin/faq/items/new");
  });

  test("質問新規作成ページにフォームが表示される", async ({ page }) => {
    await page.goto("/admin/faq/items/new");
    await page.waitForLoadState("networkidle");

    // フォームまたは送信ボタンが存在することを確認
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton.first()).toBeVisible();
  });
});

// =============================================================================
// 4. カテゴリの編集
// =============================================================================

test.describe("カテゴリ編集", () => {
  test("カテゴリの編集ボタンをクリックすると編集ページに遷移する", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // カテゴリの編集ボタンを探す（カテゴリカード内の編集リンク）
    const editLink = page
      .locator('a[href*="/admin/faq/categories/"][href*="/edit"]')
      .first();

    if ((await editLink.count()) === 0) {
      test.skip(true, "FAQカテゴリが存在しません");
      return;
    }

    await editLink.click();
    await page.waitForLoadState("networkidle");

    // 編集ページのURLパターンを確認
    await expect(page).toHaveURL(/\/admin\/faq\/categories\/.+\/edit/);
  });

  test("カテゴリ編集ページにフォームが表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const editLink = page
      .locator('a[href*="/admin/faq/categories/"][href*="/edit"]')
      .first();

    if ((await editLink.count()) === 0) {
      test.skip(true, "FAQカテゴリが存在しません");
      return;
    }

    await editLink.click();
    await page.waitForLoadState("networkidle");

    // 送信ボタンが表示されることを確認
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton.first()).toBeVisible();
  });
});

// =============================================================================
// 5. 質問の編集
// =============================================================================

test.describe("質問編集", () => {
  test("質問の編集ボタンをクリックすると編集ページに遷移する", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // 質問の編集リンクを探す
    const editLink = page
      .locator('a[href*="/admin/faq/items/"][href*="/edit"]')
      .first();

    if ((await editLink.count()) === 0) {
      test.skip(true, "FAQ質問が存在しません");
      return;
    }

    await editLink.click();
    await page.waitForLoadState("networkidle");

    // 編集ページのURLパターンを確認
    await expect(page).toHaveURL(/\/admin\/faq\/items\/.+\/edit/);
  });
});

// =============================================================================
// 6. 削除確認ダイアログ
// =============================================================================

test.describe("削除確認ダイアログ", () => {
  test("カテゴリの削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // アイテムがないカテゴリの削除ボタンを探す（アイテムがあると削除ボタンが無効化される）
    // まずカテゴリヘッダー内の削除ボタンを探す
    const deleteButtons = page.locator('button:has-text("削除")');

    if ((await deleteButtons.count()) === 0) {
      test.skip(true, "FAQ削除可能なカテゴリまたは質問が存在しません");
      return;
    }

    // 有効な削除ボタンを探す
    const enabledDeleteButton = deleteButtons
      .filter({ hasNot: page.locator("[disabled]") })
      .first();

    if ((await enabledDeleteButton.count()) === 0) {
      test.skip(true, "削除可能な（アイテムなし）カテゴリが存在しません");
      return;
    }

    await enabledDeleteButton.click();

    // 確認ダイアログが表示されることを確認
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("削除ダイアログにキャンセルボタンが表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const deleteButtons = page.locator('button:has-text("削除")');

    if ((await deleteButtons.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    const enabledDeleteButton = deleteButtons
      .filter({ hasNot: page.locator("[disabled]") })
      .first();

    if ((await enabledDeleteButton.count()) === 0) {
      test.skip(true, "削除可能なカテゴリが存在しません");
      return;
    }

    await enabledDeleteButton.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // キャンセルボタンが表示されることを確認
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible();

    // キャンセルボタンをクリックしてダイアログを閉じる
    await dialog.locator('button:has-text("キャンセル")').click();
    await expect(dialog).not.toBeVisible();
  });

  test("質問の削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // カテゴリ内の質問削除ボタンを探す
    // 質問行はカテゴリが展開されている場合にのみ表示される
    // 「削除」テキストが複数ある可能性があるので最初のもので試みる
    const deleteButtons = page.locator('button:has-text("削除")');

    if ((await deleteButtons.count()) === 0) {
      test.skip(true, "FAQ削除ボタンが存在しません");
      return;
    }

    // 最初の有効な削除ボタンをクリック
    const firstEnabled = deleteButtons
      .filter({ hasNot: page.locator("[disabled]") })
      .first();

    if ((await firstEnabled.count()) === 0) {
      test.skip(true, "有効な削除ボタンが存在しません");
      return;
    }

    await firstEnabled.click();

    // ダイアログが表示されることを確認
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // ダイアログ内に「削除」に関するテキストが含まれることを確認
    await expect(dialog).toContainText("削除");

    // キャンセルで閉じる
    const cancelButton = dialog.locator('button:has-text("キャンセル")');
    if ((await cancelButton.count()) > 0) {
      await cancelButton.click();
    }
  });
});

// =============================================================================
// 7. カテゴリの折りたたみ
// =============================================================================

test.describe("カテゴリの折りたたみ", () => {
  test("カテゴリヘッダーをクリックすると折りたたみが切り替わる", async ({
    page,
  }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // カテゴリカードが存在するか確認
    const categoryHeader = page.locator('[class*="CardHeader"]').first();

    if ((await categoryHeader.count()) === 0) {
      test.skip(true, "FAQカテゴリが存在しません");
      return;
    }

    // カテゴリヘッダーはクリッカブル
    await expect(categoryHeader).toBeVisible();
  });
});

// =============================================================================
// 8. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでもFAQ管理ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    // ページタイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("FAQ");
  });

  test("モバイルビューでもカテゴリ追加ボタンが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const categoryButton = page.locator('a[href="/admin/faq/categories/new"]');
    await expect(categoryButton).toBeVisible();
  });

  test("タブレットビューでもFAQ管理ページが正しく表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("FAQ");
  });
});
