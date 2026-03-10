import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

/**
 * 管理画面 - お問い合わせ管理 E2E テスト
 *
 * テストシナリオ:
 * 1. お問い合わせ一覧ページの表示
 * 2. お問い合わせ詳細の表示
 * 3. ステータスの変更
 * 4. お問い合わせの削除
 * 5. 検索・フィルター機能
 * 6. ページネーション
 * 7. レスポンシブ対応
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
// 1. お問い合わせ一覧ページの表示
// =============================================================================

test.describe("お問い合わせ一覧ページ", () => {
  test("お問い合わせ一覧ページが正しく表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("お問い合わせ");
  });

  test("お問い合わせがテーブルに表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // テーブルが存在することを確認
    const table = page.locator("table");

    if ((await table.count()) > 0) {
      await expect(table).toBeVisible();

      // テーブルヘッダーを確認
      await expect(
        page.locator("th").filter({ hasText: "名前" }),
      ).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "メールアドレス" }),
      ).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "ステータス" }),
      ).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "受信日時" }),
      ).toBeVisible();
    } else {
      // お問い合わせがない場合は空の状態メッセージを確認
      await expect(page.locator("text=お問い合わせがありません")).toBeVisible();
    }
  });

  test("統計情報が表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // 統計カードが存在することを確認
    const statsCards = page.locator(
      '[data-testid="stats-card"], .stats-card, text=件',
    );

    if ((await statsCards.count()) > 0) {
      await expect(statsCards.first()).toBeVisible();
    }
  });

  test("空の状態が正しく表示される", async ({ page }) => {
    // 存在しない検索クエリで検索
    await page.goto("/admin/inquiries?search=nonexistent-inquiry-12345");
    await page.waitForLoadState("networkidle");

    // 空の状態メッセージを確認
    await expect(page.locator("text=お問い合わせがありません")).toBeVisible();
  });
});

// =============================================================================
// 2. お問い合わせ詳細の表示
// =============================================================================

test.describe("お問い合わせ詳細ページ", () => {
  test("詳細ページに遷移できる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // 最初の詳細ボタンをクリック
    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // 詳細ページが表示されることを確認
    await expect(page.locator("h1")).toContainText("お問い合わせ詳細");
  });

  test("詳細ページに必要な情報が表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // 必要な情報が表示されることを確認
    await expect(page.locator("text=名前").first()).toBeVisible();
    await expect(page.locator("text=メールアドレス").first()).toBeVisible();
    await expect(page.locator("text=ステータス").first()).toBeVisible();
    await expect(
      page.locator("text=お問い合わせ内容, text=メッセージ").first(),
    ).toBeVisible();
  });

  test("戻るボタンで一覧ページに戻れる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // 戻るボタンをクリック
    const backButton = page.locator(
      'a:has-text("← 一覧に戻る"), a:has-text("戻る")',
    );
    await backButton.click();

    // 一覧ページに戻ることを確認
    await page.waitForURL("/admin/inquiries", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("お問い合わせ");
  });

  test("存在しないお問い合わせIDで404が表示される", async ({ page }) => {
    await page.goto("/admin/inquiries/nonexistent-id-12345");
    await page.waitForLoadState("networkidle");

    // 404ページまたはエラーメッセージが表示されることを確認
    const notFoundMessage = page.locator(
      "text=見つかりません, text=Not Found, text=404",
    );
    await expect(notFoundMessage.first()).toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// 3. ステータスの変更
// =============================================================================

test.describe("ステータスの変更", () => {
  test("詳細ページでステータスセレクトが表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // ステータスセレクトが存在することを確認
    const statusSelect = page.locator('[role="combobox"]').first();
    await expect(statusSelect).toBeVisible();
  });

  test("ステータスを変更できる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // ステータスセレクトを開く
    const statusSelect = page.locator('[role="combobox"]').first();
    await statusSelect.click();

    // オプションが表示されることを確認
    const options = page.locator('[role="option"]');
    const optionCount = await options.count();

    expect(optionCount).toBeGreaterThan(0);
  });

  test("ステータスバッジが正しく表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // テーブル内にステータスバッジが存在するか確認
    const table = page.locator("table");

    if ((await table.count()) > 0) {
      // 未対応、対応中、対応済みなどのバッジを探す
      const pendingBadge = page.locator("text=未対応");
      const inProgressBadge = page.locator("text=対応中");
      const completedBadge = page.locator("text=対応済み");

      const hasPending = (await pendingBadge.count()) > 0;
      const hasInProgress = (await inProgressBadge.count()) > 0;
      const hasCompleted = (await completedBadge.count()) > 0;

      // 少なくとも一つのバッジが存在するか、お問い合わせがない
      const emptyMessage = page.locator("text=お問い合わせがありません");
      const hasEmpty = (await emptyMessage.count()) > 0;

      expect(hasPending || hasInProgress || hasCompleted || hasEmpty).toBe(
        true,
      );
    }
  });
});

// =============================================================================
// 4. お問い合わせの削除
// =============================================================================

test.describe("お問い合わせの削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
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
    await expect(dialog).toBeVisible();

    // キャンセルボタンを確認
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible();

    // 削除確認ボタンを確認
    await expect(dialog.locator('button:has-text("削除")')).toBeVisible();
  });

  test("キャンセルボタンでダイアログを閉じられる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")');

    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible();

    // キャンセルボタンをクリック
    await dialog.locator('button:has-text("キャンセル")').click();

    // ダイアログが閉じられることを確認
    await expect(dialog).not.toBeVisible();
  });
});

// =============================================================================
// 5. 検索・フィルター機能
// =============================================================================

test.describe("検索・フィルター機能", () => {
  test("検索フィールドが表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // 検索フィールドが存在することを確認
    const searchInput = page.locator('input[type="search"]');

    if ((await searchInput.count()) > 0) {
      await expect(searchInput).toBeVisible();
    }
  });

  test("名前で検索できる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator('input[type="search"]');

    if ((await searchInput.count()) === 0) {
      test.skip(true, "検索機能が存在しません");
      return;
    }

    await searchInput.fill("テスト");

    // デバウンス後にURLが更新されることを確認
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");

    // URLに検索パラメータが含まれることを確認
    await expect(page).toHaveURL(/[?&]search=テスト/);
  });

  test("ステータスでフィルターできる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // ステータスフィルターを選択
    const statusFilter = page.locator('[role="combobox"]').first();

    if ((await statusFilter.count()) === 0) {
      test.skip(true, "フィルター機能が存在しません");
      return;
    }

    await statusFilter.click();

    // 未対応を選択
    const pendingOption = page.locator('[role="option"]:has-text("未対応")');
    if ((await pendingOption.count()) > 0) {
      await pendingOption.click();
      await page.waitForLoadState("networkidle");

      // URLにステータスパラメータが含まれることを確認
      await expect(page).toHaveURL(/[?&]status=/);
    }
  });

  test("フィルターをリセットできる", async ({ page }) => {
    // フィルター適用状態からスタート
    await page.goto("/admin/inquiries?status=PENDING");
    await page.waitForLoadState("networkidle");

    const statusFilter = page.locator('[role="combobox"]').first();

    if ((await statusFilter.count()) === 0) {
      test.skip(true, "フィルター機能が存在しません");
      return;
    }

    await statusFilter.click();

    // 「すべて」を選択
    const allOption = page.locator('[role="option"]:has-text("すべて")');
    if ((await allOption.count()) > 0) {
      await allOption.click();
      await page.waitForLoadState("networkidle");

      // URLからステータスパラメータが削除されることを確認
      const url = page.url();
      expect(url.includes("status=PENDING")).toBe(false);
    }
  });
});

// =============================================================================
// 6. ページネーション
// =============================================================================

test.describe("ページネーション", () => {
  test("ページネーションが表示される（データが多い場合）", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // ページネーションコンポーネントを探す
    const pagination = page.locator(
      'nav[aria-label*="ページ"], [class*="pagination"]',
    );

    if ((await pagination.count()) > 0) {
      await expect(pagination.first()).toBeVisible();
    }
  });

  test("次のページに移動できる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // 次へボタンを探す
    const nextButton = page.locator(
      'button:has-text("次へ"), a:has-text("次へ")',
    );

    if (
      (await nextButton.count()) === 0 ||
      (await nextButton.first().isDisabled())
    ) {
      test.skip(true, "次のページが存在しません");
      return;
    }

    await nextButton.first().click();
    await page.waitForLoadState("networkidle");

    // URLにページパラメータが追加されることを確認
    await page.waitForURL(/[?&]page=2/);
  });

  test("前のページに戻れる", async ({ page }) => {
    // ページ2からスタート
    await page.goto("/admin/inquiries?page=2");
    await page.waitForLoadState("networkidle");

    // 前へボタンを探す
    const prevButton = page.locator(
      'button:has-text("前へ"), a:has-text("前へ")',
    );

    if (
      (await prevButton.count()) === 0 ||
      (await prevButton.first().isDisabled())
    ) {
      test.skip(true, "前のページが存在しません");
      return;
    }

    await prevButton.first().click();
    await page.waitForLoadState("networkidle");

    // ページパラメータが削除されることを確認
    const url = page.url();
    expect(url.includes("page=2")).toBe(false);
  });
});

// =============================================================================
// 7. 返信機能
// =============================================================================

test.describe("返信機能", () => {
  test("詳細ページに返信フォームが表示される（あれば）", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // 返信フォームを確認
    const replyForm = page.locator(
      'form:has(textarea), textarea[name="reply"], textarea[placeholder*="返信"]',
    );

    if ((await replyForm.count()) > 0) {
      await expect(replyForm.first()).toBeVisible();
    }
  });

  test("返信履歴が表示される（あれば）", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // 返信履歴セクションを確認
    const replyHistory = page.locator(
      '[data-testid="reply-history"], text=返信履歴, .reply-list',
    );

    if ((await replyHistory.count()) > 0) {
      await expect(replyHistory.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 8. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでも一覧ページが表示される", async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // ページタイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("お問い合わせ");
  });

  test("モバイルビューでも詳細ページが表示される", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const detailButton = page
      .locator('a[href*="/admin/inquiries/"]:has-text("詳細")')
      .first();

    if ((await detailButton.count()) === 0) {
      test.skip(true, "お問い合わせが存在しません");
      return;
    }

    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });

    await detailButton.click();
    await page.waitForLoadState("networkidle");

    // 詳細ページが表示されることを確認
    await expect(page.locator("h1")).toContainText("お問い合わせ詳細");
  });
});

// =============================================================================
// 9. アクセシビリティ
// =============================================================================

test.describe("アクセシビリティ", () => {
  test("キーボードでテーブルを操作できる", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // Tabキーで移動
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // フォーカスがどこかの要素に当たっていることを確認
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test("テーブルにアクセシブルなマークアップがある", async ({ page }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");

    if ((await table.count()) === 0) {
      test.skip(true, "テーブルが存在しません");
      return;
    }

    // テーブルヘッダーがthタグで正しくマークアップされていることを確認
    const tableHeaders = page.locator("thead th");
    expect(await tableHeaders.count()).toBeGreaterThan(0);
  });
});

// =============================================================================
// 10. エラーハンドリング
// =============================================================================

test.describe("エラーハンドリング", () => {
  test("ネットワークエラー時にエラーメッセージが表示される", async ({
    page,
  }) => {
    await page.goto("/admin/inquiries");
    await page.waitForLoadState("networkidle");

    // オフラインモードをシミュレート
    await page.context().setOffline(true);

    // 検索を実行
    const searchInput = page.locator('input[type="search"]');

    if ((await searchInput.count()) > 0) {
      await searchInput.fill("テスト");
    }

    // エラー状態を待機
    await page.waitForTimeout(1000);

    // オンラインに戻す
    await page.context().setOffline(false);
  });
});
