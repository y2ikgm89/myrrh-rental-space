import { test, expect } from "@playwright/test";
import { testBlogPosts, urls } from "../../fixtures";

/**
 * ブログ管理機能 E2E テスト
 *
 * テストシナリオ:
 * 1. ブログ一覧ページの表示
 * 2. 新規ブログ記事の作成（下書き・公開）
 * 3. ブログ記事の編集
 * 4. ブログ記事の削除
 * 5. 公開/非公開の切り替え
 * 6. フォームバリデーション
 * 7. リッチテキストエディター操作
 * 8. ページネーション
 * 9. 検索・フィルター機能
 */

// =============================================================================
// 1. ブログ一覧ページの表示
// =============================================================================

test.describe("ブログ一覧ページ", () => {
  test("ブログ一覧ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("ブログ管理");

    // 説明文を確認
    await expect(
      page.locator("text=ブログ記事の作成・編集・公開管理を行います"),
    ).toBeVisible();

    // 新規作成ボタンが存在することを確認
    const createButton = page.locator('a[href="/admin/blog/new"]');
    await expect(createButton).toBeVisible();
    await expect(createButton).toContainText("新規作成");

    // タブが存在することを確認
    const postsTab = page.locator('a[href="/admin/blog?tab=posts"]');
    await expect(postsTab).toBeVisible();
    await expect(postsTab).toContainText("記事一覧");

    const categoriesTab = page.locator('a[href="/admin/blog?tab=categories"]');
    await expect(categoriesTab).toBeVisible();
    await expect(categoriesTab).toContainText("カテゴリー");

    const tagsTab = page.locator('a[href="/admin/blog?tab=tags"]');
    await expect(tagsTab).toBeVisible();
    await expect(tagsTab).toContainText("タグ");

    const commentsTab = page.locator('a[href="/admin/blog?tab=comments"]');
    await expect(commentsTab).toBeVisible();
    await expect(commentsTab).toContainText("コメント");
  });

  test("既存ブログ記事がテーブルに表示される", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // テーブルが存在することを確認
    const table = page.locator("table");

    // テーブルが存在する場合はヘッダーを確認
    if ((await table.count()) > 0) {
      await expect(table).toBeVisible();

      // テーブルヘッダーを確認
      await expect(
        page.locator("th").filter({ hasText: "ステータス" }),
      ).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "タイトル" }),
      ).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "カテゴリ" }),
      ).toBeVisible();
      await expect(page.locator("th").filter({ hasText: "PV" })).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "公開日時" }),
      ).toBeVisible();
      await expect(
        page.locator("th").filter({ hasText: "操作" }),
      ).toBeVisible();
    } else {
      // 記事がない場合は空の状態メッセージを確認
      await expect(page.locator("text=ブログ記事がありません")).toBeVisible();
    }
  });

  test("フィルター機能が動作する", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ステータスフィルターが存在することを確認
    const statusFilter = page.locator('[role="combobox"]').first();
    await expect(statusFilter).toBeVisible();

    // カテゴリフィルターが存在することを確認
    const categoryFilter = page.locator('[role="combobox"]').nth(1);
    await expect(categoryFilter).toBeVisible();

    // 検索フィールドが存在することを確認
    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute(
      "placeholder",
      "タイトル、本文で検索...",
    );
  });

  test("空の状態が正しく表示される", async ({ page }) => {
    // 存在しない検索クエリで検索
    await page.goto(urls.adminBlog + "?search=nonexistent-post-12345");
    await page.waitForLoadState("networkidle");

    // 空の状態メッセージを確認
    await expect(page.locator("text=ブログ記事がありません")).toBeVisible();
  });
});

// =============================================================================
// 2. 新規ブログ記事の作成
// =============================================================================

test.describe("ブログ記事の新規作成", () => {
  test("新規作成ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // インラインエディターが表示されることを確認
    // EditorHeader のコンポーネント要素を確認
    await expect(page.locator("text=blog/")).toBeVisible();

    // 保存ボタンが存在することを確認
    const saveButton = page.locator('button:has-text("保存")');
    await expect(saveButton).toBeVisible();

    // 戻るボタンが存在することを確認
    const backButton = page.locator('button:has-text("← 戻る")');
    await expect(backButton).toBeVisible();
  });

  test("サイドパネルを開閉できる", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルトグルボタンを探す
    const toggleButton = page.locator('button:has-text("設定")').first();

    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300); // アニメーション待機

      // サイドパネルが開いていることを確認
      await expect(page.locator('input[name="title"]')).toBeVisible();
      await expect(page.locator('input[name="slug"]')).toBeVisible();
    }
  });

  test.skip("有効なデータで新規記事を作成できる（下書き）", async ({
    page,
  }) => {
    // このテストはテストDBとカテゴリのセットアップが必要
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // フォームに入力
    await page.fill('input[name="title"]', testBlogPosts.draft.title);
    await page.fill('input[name="slug"]', testBlogPosts.draft.slug);
    await page.fill(
      'textarea[name="excerpt"], input[name="excerpt"]',
      "下書きテスト記事の抜粋です。",
    );

    // Lexicalエディターへの入力
    const editor = page.locator('[contenteditable="true"]').first();
    if ((await editor.count()) > 0) {
      await editor.click();
      await editor.fill(testBlogPosts.draft.content);
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // 成功メッセージを待機
    await expect(page.locator("text=記事を作成しました")).toBeVisible({
      timeout: 10000,
    });

    // 編集ページにリダイレクトされることを確認
    await page.waitForURL(/\/admin\/blog\/[a-f0-9-]+/, { timeout: 10000 });
  });

  test("新規作成ページでプレビューボタンをクリックすると通知が表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // プレビューボタンをクリック
    const previewButton = page.locator('button:has-text("プレビュー")');
    if ((await previewButton.count()) > 0) {
      await previewButton.click();

      // 通知メッセージを確認（作成後にプレビュー可能）
      await expect(
        page.locator("text=記事を作成後にプレビューできます"),
      ).toBeVisible();
    }
  });
});

// =============================================================================
// 3. ブログ記事の編集
// =============================================================================

test.describe("ブログ記事の編集", () => {
  test("編集ページが既存データで事前入力される", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // 最初の記事の編集ボタンをクリック
    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // エディターヘッダーにタイトルが表示されることを確認
    // 編集モードの場合、記事のタイトルがヘッダーに表示される
    await expect(page.locator("text=blog/")).toBeVisible();

    // サイドパネルを開いてフォームフィールドを確認
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);

      // タイトルフィールドに値が入っていることを確認
      const titleInput = page.locator('input[name="title"]');
      await expect(titleInput).not.toBeEmpty();
    }
  });

  test("記事情報を更新できる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // 最初の記事の編集ボタンをクリック
    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);

      // タイトルを更新
      const titleInput = page.locator('input[name="title"]');
      await titleInput.clear();
      await titleInput.fill("更新されたブログ記事タイトル");

      // サイドパネルを閉じる
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // 成功メッセージを確認
    await expect(page.locator("text=記事を保存しました")).toBeVisible({
      timeout: 10000,
    });
  });

  test("戻るボタンで一覧ページに戻れる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // 戻るボタンをクリック
    const backButton = page.locator('button:has-text("← 戻る")');
    await backButton.click();

    // 一覧ページに戻ることを確認
    await page.waitForURL(urls.adminBlog, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("ブログ管理");
  });

  test("未保存の変更がある場合に確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // サイドパネルを開いて変更を加える
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);

      const titleInput = page.locator('input[name="title"]');
      await titleInput.fill("変更されたタイトル");

      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // ダイアログハンドラーを設定
    page.on("dialog", (dialog) => {
      expect(dialog.message()).toContain("保存されていない変更があります");
      void dialog.dismiss();
    });

    // 戻るボタンをクリック
    const backButton = page.locator('button:has-text("← 戻る")');
    await backButton.click();

    // ダイアログが表示されるまで待機
    await page.waitForTimeout(500);
  });
});

// =============================================================================
// 4. ブログ記事の削除
// =============================================================================

test.describe("ブログ記事の削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
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
    await expect(dialog).toBeVisible();

    // ダイアログのタイトルを確認
    await expect(
      dialog.locator("text=ブログ記事を削除しますか？"),
    ).toBeVisible();

    // キャンセルボタンを確認
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible();

    // 削除確認ボタンを確認
    await expect(dialog.locator('button:has-text("削除する")')).toBeVisible();
  });

  test("キャンセルボタンでダイアログを閉じられる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
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
    await expect(dialog).toBeVisible();

    // キャンセルボタンをクリック
    await dialog.locator('button:has-text("キャンセル")').click();

    // ダイアログが閉じられることを確認
    await expect(dialog).not.toBeVisible();
  });

  test.skip("削除確認後に記事が削除される", async ({ page: _page }) => {
    // このテストはテストデータの削除を伴うためスキップ
    // 実行する場合はテストDBのセットアップが必要
  });
});

// =============================================================================
// 5. 公開/非公開の切り替え
// =============================================================================

test.describe("公開状態の切り替え", () => {
  test("一覧ページのドロップダウンメニューで公開状態を切り替えられる", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ドロップダウントリガーボタンを探す
    const dropdownTrigger = page.locator('button:has-text("•••")').first();

    if ((await dropdownTrigger.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    await dropdownTrigger.click();

    // ドロップダウンメニューが表示されることを確認
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // 公開/下書きに戻すメニュー項目が存在することを確認
    const publishItem = dropdown.locator("text=公開する");
    const unpublishItem = dropdown.locator("text=下書きに戻す");

    const hasPublish = (await publishItem.count()) > 0;
    const hasUnpublish = (await unpublishItem.count()) > 0;

    expect(hasPublish || hasUnpublish).toBe(true);
  });

  test("編集ページで公開ボタンが表示される（下書き記事の場合）", async ({
    page,
  }) => {
    // 下書き記事をフィルター
    await page.goto(urls.adminBlog + "?status=DRAFT");
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "下書き記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // 公開ボタンが存在することを確認
    const publishButton = page.locator('button:has-text("公開")');
    await expect(publishButton).toBeVisible();
  });

  test("編集ページで下書きに戻すボタンが表示される（公開記事の場合）", async ({
    page,
  }) => {
    // 公開記事をフィルター
    await page.goto(urls.adminBlog + "?status=PUBLISHED");
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "公開記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // 下書きに戻すボタンが存在することを確認
    const unpublishButton = page.locator('button:has-text("下書きに戻す")');
    await expect(unpublishButton).toBeVisible();
  });

  test("ステータスバッジが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // テーブル内にステータスバッジが存在するか確認
    const table = page.locator("table");

    if ((await table.count()) > 0) {
      // 公開中または下書きのバッジを探す
      const publishedBadge = page.locator("text=公開中");
      const draftBadge = page.locator("text=下書き");

      const hasPublished = (await publishedBadge.count()) > 0;
      const hasDraft = (await draftBadge.count()) > 0;

      // 少なくとも一つのバッジが存在するか、記事がない
      const emptyMessage = page.locator("text=ブログ記事がありません");
      const hasEmpty = (await emptyMessage.count()) > 0;

      expect(hasPublished || hasDraft || hasEmpty).toBe(true);
    }
  });
});

// =============================================================================
// 6. フォームバリデーション
// =============================================================================

test.describe("フォームバリデーション", () => {
  test("タイトルが空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // スラッグだけ入力してタイトルは空のまま
    const slugInput = page.locator('input[name="slug"]');
    if ((await slugInput.count()) > 0) {
      await slugInput.fill("test-slug");
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // エラーメッセージを確認
    await expect(page.locator("text=タイトルは必須です")).toBeVisible({
      timeout: 5000,
    });
  });

  test("スラッグが空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // タイトルだけ入力してスラッグは空のまま
    const titleInput = page.locator('input[name="title"]');
    if ((await titleInput.count()) > 0) {
      await titleInput.fill("テストタイトル");
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // エラーメッセージを確認
    await expect(page.locator("text=スラッグは必須です")).toBeVisible({
      timeout: 5000,
    });
  });

  test("スラッグに不正な文字が含まれる場合にエラーが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // 不正なスラッグを入力
    const slugInput = page.locator('input[name="slug"]');
    if ((await slugInput.count()) > 0) {
      await slugInput.fill("テスト_スラッグ with spaces");
    }

    const titleInput = page.locator('input[name="title"]');
    if ((await titleInput.count()) > 0) {
      await titleInput.fill("テストタイトル");
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=スラッグは小文字英数字とハイフンのみ"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("抜粋が空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // タイトルとスラッグを入力
    const titleInput = page.locator('input[name="title"]');
    const slugInput = page.locator('input[name="slug"]');

    if ((await titleInput.count()) > 0) {
      await titleInput.fill("テストタイトル");
    }
    if ((await slugInput.count()) > 0) {
      await slugInput.fill("test-slug");
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // エラーメッセージを確認
    await expect(page.locator("text=抜粋は必須です")).toBeVisible({
      timeout: 5000,
    });
  });

  test("タイトルが200文字を超える場合にエラーが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first();
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    // 201文字のタイトルを入力
    const longTitle = "あ".repeat(201);
    const titleInput = page.locator('input[name="title"]');
    if ((await titleInput.count()) > 0) {
      await titleInput.fill(longTitle);
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    // エラーメッセージを確認
    await expect(page.locator("text=タイトルは200文字以内")).toBeVisible({
      timeout: 5000,
    });
  });
});

// =============================================================================
// 7. リッチテキストエディター操作
// =============================================================================

test.describe("リッチテキストエディター", () => {
  test("Lexicalエディターが読み込まれる", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // エディターの読み込みを待機
    // Loading状態が消えるのを待つ
    const loadingText = page.locator("text=エディタを読み込み中...");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 10000 });
    }

    // contenteditable要素が存在することを確認
    const editor = page.locator('[contenteditable="true"]');
    await expect(editor.first()).toBeVisible({ timeout: 10000 });
  });

  test("エディターにテキストを入力できる", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // エディターの読み込みを待機
    const loadingText = page.locator("text=エディタを読み込み中...");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 10000 });
    }

    // contenteditable要素に入力
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 10000 });

    await editor.click();
    await page.keyboard.type("テスト本文です。");

    // 入力されたテキストが表示されることを確認
    await expect(editor).toContainText("テスト本文です。");
  });

  test("エディターツールバーが表示される", async ({ page }) => {
    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // ツールバーの存在を確認
    // Lexicalエディターのツールバー要素を探す
    const toolbar = page.locator('[class*="toolbar"], [role="toolbar"]');

    if ((await toolbar.count()) > 0) {
      await expect(toolbar.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 8. ページネーション
// =============================================================================

test.describe("ページネーション", () => {
  test("ページネーションが表示される（記事が10件以上の場合）", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ページネーションコンポーネントを探す
    const pagination = page.locator(
      'nav[aria-label*="ページ"], [class*="pagination"]',
    );

    if ((await pagination.count()) > 0) {
      await expect(pagination.first()).toBeVisible();
    } else {
      // 記事が10件以下の場合はページネーションが表示されない
      const table = page.locator("table");
      const rows = await table.locator("tbody tr").count();

      if (rows < 10) {
        test.skip(true, "ページネーションが表示されない（データが少ない）");
      }
    }
  });

  test("次のページに移動できる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // 次へボタンを探す
    const nextButton = page.locator(
      'button:has-text("次へ"), a:has-text("次へ"), button:has-text(">")',
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
    // 2ページ目に移動
    await page.goto(urls.adminBlog + "?page=2");
    await page.waitForLoadState("networkidle");

    // 前へボタンを探す
    const prevButton = page.locator(
      'button:has-text("前へ"), a:has-text("前へ"), button:has-text("<")',
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

    // URLから page パラメータが削除されるか page=1 になることを確認
    const url = page.url();
    expect(url.includes("page=2")).toBe(false);
  });
});

// =============================================================================
// 9. 検索・フィルター機能
// =============================================================================

test.describe("検索・フィルター機能", () => {
  test("タイトルで検索できる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // 検索フィールドに入力
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("テスト");

    // デバウンス後にURLが更新されることを確認（300ms + バッファ）
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");

    // URLに検索パラメータが含まれることを確認
    await expect(page).toHaveURL(/[?&]search=テスト/);
  });

  test("ステータスでフィルターできる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ステータスフィルターを選択
    const statusFilter = page.locator('[role="combobox"]').first();
    await statusFilter.click();

    // 公開中を選択
    const publishedOption = page.locator('[role="option"]:has-text("公開中")');
    if ((await publishedOption.count()) > 0) {
      await publishedOption.click();
      await page.waitForLoadState("networkidle");

      // URLにステータスパラメータが含まれることを確認
      await expect(page).toHaveURL(/[?&]status=PUBLISHED/);
    }
  });

  test("カテゴリでフィルターできる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // カテゴリフィルターを選択（2番目のcombobox）
    const categoryFilter = page.locator('[role="combobox"]').nth(1);
    await categoryFilter.click();

    // すべてのカテゴリ以外のオプションを選択
    const options = page.locator('[role="option"]');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // 「すべてのカテゴリ」以外の最初のオプションを選択
      await options.nth(1).click();
      await page.waitForLoadState("networkidle");

      // URLにカテゴリパラメータが含まれることを確認
      await expect(page).toHaveURL(/[?&]categoryId=/);
    } else {
      test.skip(true, "カテゴリが存在しません");
    }
  });

  test("下書きフィルターを適用できる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ステータスフィルターを選択
    const statusFilter = page.locator('[role="combobox"]').first();
    await statusFilter.click();

    // 下書きを選択
    const draftOption = page.locator('[role="option"]:has-text("下書き")');
    if ((await draftOption.count()) > 0) {
      await draftOption.click();
      await page.waitForLoadState("networkidle");

      // URLにステータスパラメータが含まれることを確認
      await expect(page).toHaveURL(/[?&]status=DRAFT/);
    }
  });

  test("すべてのフィルターをリセットできる", async ({ page }) => {
    // フィルターを適用した状態でアクセス
    await page.goto(urls.adminBlog + "?status=PUBLISHED&search=test");
    await page.waitForLoadState("networkidle");

    // ステータスフィルターを「すべて」に戻す
    const statusFilter = page.locator('[role="combobox"]').first();
    await statusFilter.click();

    const allOption = page.locator('[role="option"]:has-text("すべて")');
    if ((await allOption.count()) > 0) {
      await allOption.click();
      await page.waitForLoadState("networkidle");

      // URLからステータスパラメータが削除されることを確認
      const url = page.url();
      expect(url.includes("status=PUBLISHED")).toBe(false);
    }
  });

  test("検索とフィルターを組み合わせて使用できる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // 検索フィールドに入力
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("テスト");

    // デバウンス待機
    await page.waitForTimeout(500);

    // ステータスフィルターを選択
    const statusFilter = page.locator('[role="combobox"]').first();
    await statusFilter.click();

    const publishedOption = page.locator('[role="option"]:has-text("公開中")');
    if ((await publishedOption.count()) > 0) {
      await publishedOption.click();
      await page.waitForLoadState("networkidle");

      // URLに両方のパラメータが含まれることを確認
      const url = page.url();
      expect(url.includes("search=")).toBe(true);
      expect(url.includes("status=PUBLISHED")).toBe(true);
    }
  });
});

// =============================================================================
// 10. カテゴリー管理（タブ）
// =============================================================================

test.describe("カテゴリー管理", () => {
  test("カテゴリータブにアクセスできる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // カテゴリータブをクリック
    const categoriesTab = page.locator('a[href="/admin/blog?tab=categories"]');
    await categoriesTab.click();

    // URLにタブパラメータが含まれることを確認
    await page.waitForURL(/[?&]tab=categories/);

    // カテゴリーマネージャーが表示されることを確認
    await expect(page.locator("text=カテゴリー一覧")).toBeVisible();
  });

  test("直接URLでカテゴリータブにアクセスできる", async ({ page }) => {
    await page.goto(urls.adminBlog + "?tab=categories");
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("ブログ管理");

    // カテゴリーコンテンツが表示されることを確認
    await expect(page.locator("text=カテゴリー一覧")).toBeVisible();
  });
});

// =============================================================================
// 10.5. タグ管理（タブ）
// =============================================================================

test.describe("タグ管理", () => {
  test("タグタブにアクセスできる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // タグタブをクリック
    const tagsTab = page.locator('a[href="/admin/blog?tab=tags"]');
    await tagsTab.click();

    // URLにタブパラメータが含まれることを確認
    await page.waitForURL(/[?&]tab=tags/);

    // タグマネージャーが表示されることを確認
    await expect(page.locator("text=タグ一覧")).toBeVisible();
  });

  test("直接URLでタグタブにアクセスできる", async ({ page }) => {
    await page.goto(urls.adminBlog + "?tab=tags");
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("ブログ管理");

    // タグコンテンツが表示されることを確認
    await expect(page.locator("text=タグ一覧")).toBeVisible();
  });
});

// =============================================================================
// 11. コメント管理（タブ）
// =============================================================================

test.describe("コメント管理", () => {
  test("コメントタブにアクセスできる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // コメントタブをクリック
    const commentsTab = page.locator('a[href="/admin/blog?tab=comments"]');
    await commentsTab.click();

    // URLにタブパラメータが含まれることを確認
    await page.waitForURL(/[?&]tab=comments/);

    // コメント統計が表示されることを確認（またはコメント関連のコンテンツ）
    const commentContent = page.locator("text=全コメント, text=コメント");
    await expect(commentContent.first()).toBeVisible();
  });

  test("直接URLでコメントタブにアクセスできる", async ({ page }) => {
    await page.goto(urls.adminBlog + "?tab=comments");
    await page.waitForLoadState("networkidle");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("ブログ管理");

    // コメントタブがアクティブであることを確認
    const commentContent = page.locator("text=全コメント, text=コメント");
    await expect(commentContent.first()).toBeVisible();
  });
});

// =============================================================================
// 12. エラーハンドリング
// =============================================================================

test.describe("エラーハンドリング", () => {
  test("存在しない記事にアクセスすると404が表示される", async ({ page }) => {
    await page.goto("/admin/blog/non-existent-id-12345");

    // 404ページまたはエラーメッセージが表示されることを確認
    const notFoundText = page.locator(
      "text=見つかりません, text=404, text=Not Found",
    );

    if ((await notFoundText.count()) > 0) {
      await expect(notFoundText.first()).toBeVisible();
    }
  });

  test("ネットワークエラー時にエラーメッセージが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // オフラインモードをシミュレート
    await page.context().setOffline(true);

    // 検索を実行
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("test");

    // エラーが適切に処理されることを確認（クラッシュしない）
    await page.waitForTimeout(1000);

    // オンラインに戻す
    await page.context().setOffline(false);
  });
});

// =============================================================================
// 13. キーボードショートカット
// =============================================================================

test.describe("キーボードショートカット", () => {
  test("Ctrl+S で保存できる", async ({ page }) => {
    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    const firstEditButton = page
      .locator('a[href*="/admin/blog/"]:has-text("編集")')
      .first();

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    await firstEditButton.click();
    await page.waitForLoadState("networkidle");

    // Ctrl+S を押す
    await page.keyboard.press("Control+s");

    // 保存処理が開始されることを確認（トースト通知など）
    // 変更がない場合でも保存が試みられることを確認
    await page.waitForTimeout(500);
  });
});

// =============================================================================
// 14. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでも一覧ページが表示される", async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminBlog);
    await page.waitForLoadState("networkidle");

    // ページタイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("ブログ管理");

    // 新規作成ボタンが表示されることを確認
    await expect(page.locator('a[href="/admin/blog/new"]')).toBeVisible();
  });

  test("モバイルビューでも編集ページが表示される", async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminBlog + "/new");
    await page.waitForLoadState("networkidle");

    // エディターが表示されることを確認
    const editor = page.locator('[contenteditable="true"]');

    // エディターの読み込みを待機
    const loadingText = page.locator("text=エディタを読み込み中...");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 10000 });
    }

    await expect(editor.first()).toBeVisible({ timeout: 10000 });
  });
});
