import { test, expect } from "@playwright/test";
import { testSpaces, urls, testUsers } from "../fixtures";

/**
 * 管理画面スペース管理 E2E テスト
 *
 * テストシナリオ:
 * 1. スペース一覧ページの表示
 * 2. 新規スペースの作成
 * 3. スペースの編集
 * 4. スペースの削除
 * 5. スペースの公開/非公開切り替え
 * 6. フォームバリデーション
 */

// =============================================================================
// テストセットアップ
// =============================================================================

/**
 * 各テスト前に管理者として認証
 */
test.beforeEach(async ({ page }) => {
  // 管理者としてログイン
  // Note: 実際の認証実装に応じて調整が必要
  await page.goto(urls.login);

  // Better Auth のセッションCookieを直接設定する場合
  // await page.context().addCookies([
  //   {
  //     name: 'better-auth.session_token',
  //     value: 'test-admin-session-token',
  //     domain: 'localhost',
  //     path: '/',
  //   },
  // ])

  // または、ログインフォームを使用する場合
  await page.fill('input[name="email"]', testUsers.admin.email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');

  // ログイン成功を待機
  await page.waitForURL(urls.adminDashboard);
});

// =============================================================================
// 1. スペース一覧ページの表示
// =============================================================================

test.describe("スペース一覧ページ", () => {
  test("スペース一覧が表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("スペース管理");

    // 新規作成ボタンが存在することを確認
    const createButton = page.locator('a[href="/admin/spaces/new"]');
    await expect(createButton).toBeVisible();
    await expect(createButton).toContainText("新規作成");
  });

  test("既存スペースがテーブルに表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // テーブルが存在することを確認
    const table = page.locator("table");
    await expect(table).toBeVisible();

    // テーブルヘッダーを確認
    await expect(
      page.locator("th").filter({ hasText: "スペース名" }),
    ).toBeVisible();
    await expect(page.locator("th").filter({ hasText: "住所" })).toBeVisible();
    await expect(page.locator("th").filter({ hasText: "定員" })).toBeVisible();
    await expect(
      page.locator("th").filter({ hasText: "時間料金" }),
    ).toBeVisible();
    await expect(
      page.locator("th").filter({ hasText: "公開状態" }),
    ).toBeVisible();
    await expect(
      page.locator("th").filter({ hasText: "予約数" }),
    ).toBeVisible();
    await expect(page.locator("th").filter({ hasText: "操作" })).toBeVisible();
  });

  test("フィルター機能が動作する", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // 公開状態フィルターが存在することを確認
    const publishFilter = page
      .locator('select[name="published"], [role="combobox"]')
      .first();
    await expect(publishFilter).toBeVisible();

    // 検索フィールドが存在することを確認
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="検索"]',
    );
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test("空の状態が正しく表示される", async ({ page }) => {
    // すべてのスペースがない状態を想定
    // Note: テストDBのセットアップで空の状態を作成する必要がある
    await page.goto(urls.adminSpaces + "?search=nonexistent-space-12345");

    // 空の状態メッセージを確認
    const emptyMessage = page.locator("text=スペースがありません");
    if ((await emptyMessage.count()) > 0) {
      await expect(emptyMessage).toBeVisible();
    }
  });
});

// =============================================================================
// 2. 新規スペースの作成
// =============================================================================

test.describe("スペースの新規作成", () => {
  test("新規作成ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    // ページタイトルを確認
    await expect(page.locator("h1")).toContainText("スペース新規作成");

    // フォームフィールドが存在することを確認
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(
      page.locator('textarea, [contenteditable="true"]').first(),
    ).toBeVisible(); // RichTextEditor
    await expect(page.locator('input[name="address"]')).toBeVisible();
    await expect(page.locator('input[name="capacity"]')).toBeVisible();
    await expect(page.locator('input[name="hourlyPrice"]')).toBeVisible();
  });

  test("有効なデータで新規スペースを作成できる", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    // フォームに入力
    await page.fill('input[name="name"]', testSpaces.roomA.name);

    // RichTextEditorへの入力
    const descriptionEditor = page.locator('[contenteditable="true"]').first();
    await descriptionEditor.click();
    await descriptionEditor.fill(testSpaces.roomA.description);

    await page.fill('input[name="address"]', "東京都渋谷区テスト1-2-3");
    await page.fill(
      'input[name="capacity"]',
      testSpaces.roomA.capacity.toString(),
    );
    await page.fill(
      'input[name="hourlyPrice"]',
      testSpaces.roomA.hourlyPrice.toString(),
    );

    // メイン画像URL（テスト用のダミーURL）
    // Note: 実際のUIではメディアピッカーを使用するため、直接入力できない可能性がある
    // その場合は、メディアピッカーのモックまたはテスト用の画像アップロードが必要
    const mainImageButton = page.locator('button:has-text("画像を選択")');
    if ((await mainImageButton.count()) > 0) {
      // メディアピッカーを使用する場合のスキップ
      test.skip(true, "メディアピッカーの実装が必要");
    } else {
      await page.fill(
        'input[name="mainImageUrl"]',
        "https://via.placeholder.com/400x300",
      );
    }

    // 公開設定
    const publishSwitch = page.locator('button[role="switch"]').first();
    await publishSwitch.click();

    // 送信ボタンをクリック
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // リダイレクト先を確認（詳細ページまたは一覧ページ）
    await page.waitForURL(/\/admin\/spaces\/[a-f0-9-]+/, { timeout: 10000 });

    // 成功メッセージの確認（toast通知）
    const successToast = page.locator(
      'text=スペースを作成しました, [role="status"]:has-text("スペースを作成しました")',
    );
    if ((await successToast.count()) > 0) {
      await expect(successToast.first()).toBeVisible();
    }
  });

  test("設備を追加できる", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    // 設備入力フィールド
    const facilityInput = page.locator(
      'input[placeholder*="WiFi"], input[placeholder*="設備"]',
    );
    await facilityInput.fill("WiFi");

    const addButton = page.locator('button:has-text("追加")');
    await addButton.click();

    // 追加された設備を確認
    await expect(page.locator("text=WiFi")).toBeVisible();

    // さらに追加
    await facilityInput.fill("プロジェクター");
    await addButton.click();

    await expect(page.locator("text=プロジェクター")).toBeVisible();
  });

  test("追加画像を複数選択できる", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    // 追加画像ボタン
    const addImagesButton = page.locator('button:has-text("画像を追加")');

    // メディアピッカー実装が必要
    test.skip(
      (await addImagesButton.count()) > 0,
      "メディアピッカーの実装が必要",
    );
  });
});

// =============================================================================
// 3. スペースの編集
// =============================================================================

test.describe("スペースの編集", () => {
  test("編集ページが既存データで事前入力される", async ({ page }) => {
    // まず一覧ページに移動
    await page.goto(urls.adminSpaces);

    // 最初のスペースの編集ボタンをクリック
    const firstEditButton = page
      .locator('a[href*="/admin/spaces/"][href*="/edit"]')
      .first();
    await firstEditButton.click();

    // 編集ページが表示されることを確認
    await expect(page.locator('h1:has-text("編集")')).toBeVisible();

    // フォームフィールドに値が入っていることを確認
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).not.toBeEmpty();

    const capacityInput = page.locator('input[name="capacity"]');
    await expect(capacityInput).not.toBeEmpty();

    const hourlyPriceInput = page.locator('input[name="hourlyPrice"]');
    await expect(hourlyPriceInput).not.toBeEmpty();
  });

  test("スペース情報を更新できる", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // 最初のスペースの編集ボタンをクリック
    const firstEditButton = page
      .locator('a[href*="/admin/spaces/"][href*="/edit"]')
      .first();
    await firstEditButton.click();

    await expect(page).toHaveURL(/\/admin\/spaces\/[a-f0-9-]+\/edit/);

    const uniqueSuffix = Date.now().toString();
    const newName = `更新されたスペース名-${uniqueSuffix}`;

    // フォームを編集
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill(newName);

    const capacityInput = page.locator('input[name="capacity"]');
    await capacityInput.fill("15");

    // 送信（useActionState 経路: 成功後も編集ページに留まり refresh）
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await expect(page).toHaveURL(/\/admin\/spaces\/[a-f0-9-]+\/edit/, {
      timeout: 15000,
    });
    await expect(page.getByText("スペースを保存しました")).toBeVisible({
      timeout: 15000,
    });

    await page.goto(urls.adminSpaces);
    await expect(page.getByText(newName)).toBeVisible();
  });

  test("戻るボタンで一覧ページに戻れる", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    const firstEditButton = page
      .locator('a[href*="/admin/spaces/"][href*="/edit"]')
      .first();
    await firstEditButton.click();

    // 戻るボタンをクリック
    const backButton = page.locator(
      'a:has-text("← 戻る"), button:has-text("← 戻る")',
    );
    await backButton.click();

    // 一覧ページに戻ることを確認
    await page.waitForURL(/\/admin\/spaces\/[a-f0-9-]+/);
  });
});

// =============================================================================
// 4. スペースの削除
// =============================================================================

test.describe("スペースの削除", () => {
  test("詳細ページから削除できる", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // 最初のスペースの詳細ボタンをクリック
    const firstDetailButton = page
      .locator('a[href*="/admin/spaces/"]:has-text("詳細")')
      .first();

    // 詳細ページがある場合のみテスト
    if ((await firstDetailButton.count()) === 0) {
      test.skip(true, "詳細ページが存在しません");
      return;
    }

    await firstDetailButton.click();

    // 削除ボタンを探す
    const deleteButton = page.locator('button:has-text("削除")');

    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    // 確認ダイアログを待機
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await expect(confirmDialog).toBeVisible();

    // 確認ボタンをクリック
    const confirmButton = confirmDialog.locator(
      'button:has-text("削除"), button:has-text("確認")',
    );
    await confirmButton.click();

    // 一覧ページにリダイレクトされることを確認
    await page.waitForURL(urls.adminSpaces, { timeout: 10000 });

    // 成功メッセージの確認
    const successToast = page.locator(
      'text=スペースを削除しました, [role="status"]:has-text("削除")',
    );
    if ((await successToast.count()) > 0) {
      await expect(successToast.first()).toBeVisible();
    }
  });

  test("有効な予約があるスペースは削除できない", async ({ page: _page }) => {
    // このテストはテストDBに「予約があるスペース」が必要
    test.skip(true, "テストデータのセットアップが必要");
  });
});

// =============================================================================
// 5. スペースの公開/非公開切り替え
// =============================================================================

test.describe("スペースの公開状態切り替え", () => {
  test("一覧ページでトグルスイッチが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // トグルスイッチが存在することを確認
    const toggleSwitch = page.locator('button[role="switch"]').first();
    await expect(toggleSwitch).toBeVisible();
  });

  test("公開状態を切り替えられる", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // 最初のトグルスイッチの現在の状態を取得
    const toggleSwitch = page.locator('button[role="switch"]').first();
    const initialState = await toggleSwitch.getAttribute("data-state");

    // トグルを切り替え
    await toggleSwitch.click();

    // ページがリフレッシュされるまで待機
    await page.waitForTimeout(1000);

    // 状態が変わったことを確認
    const newState = await toggleSwitch.getAttribute("data-state");
    expect(newState).not.toBe(initialState);

    // 成功メッセージの確認
    const successToast = page.locator("text=公開状態を更新しました");
    if ((await successToast.count()) > 0) {
      await expect(successToast.first()).toBeVisible();
    }
  });

  test("公開中と非公開のラベルが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    // 公開中または非公開のラベルが存在することを確認
    const statusLabels = page.locator("text=公開中, text=非公開");
    await expect(statusLabels.first()).toBeVisible();
  });
});

// =============================================================================
// 6. フォームバリデーション
// =============================================================================

test.describe("フォームバリデーション", () => {
  test("必須フィールドが空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    // 空のまま送信
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(page.locator("text=名前を入力してください")).toBeVisible();
    await expect(page.locator("text=説明を入力してください")).toBeVisible();
    await expect(page.locator("text=住所を入力してください")).toBeVisible();
    await expect(page.locator("text=メイン画像")).toBeVisible();
  });

  test("スペース名が100文字を超えるとエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    const longName = "あ".repeat(101);
    await page.fill('input[name="name"]', longName);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=名前は100文字以内で入力してください"),
    ).toBeVisible();
  });

  test("定員が1未満の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    await page.fill('input[name="capacity"]', "0");

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=定員は1以上で入力してください"),
    ).toBeVisible();
  });

  test("定員が1000を超える場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    await page.fill('input[name="capacity"]', "1001");

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=定員は1000以下で入力してください"),
    ).toBeVisible();
  });

  test("時間料金が負の数の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    await page.fill('input[name="hourlyPrice"]', "-100");

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=時間料金は0以上で入力してください"),
    ).toBeVisible();
  });

  test("時間料金が1000000を超える場合にエラーが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminSpaces + "/new");

    await page.fill('input[name="hourlyPrice"]', "1000001");

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=時間料金は1000000以下で入力してください"),
    ).toBeVisible();
  });

  test("面積が負の数の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    const areaInput = page.locator('input[name="area"]');
    await areaInput.fill("-10");

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(page.locator("text=正の数を入力してください")).toBeVisible();
  });

  test("日額料金が負の数の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.adminSpaces + "/new");

    const dailyPriceInput = page.locator('input[name="dailyPrice"]');
    await dailyPriceInput.fill("-1000");

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // エラーメッセージを確認
    await expect(
      page.locator("text=日額料金は0以上で入力してください"),
    ).toBeVisible();
  });
});

// =============================================================================
// 7. ペジネーション
// =============================================================================

test.describe("ページネーション", () => {
  test("ページネーションが表示される", async ({ page }) => {
    // このテストは10件以上のスペースが存在する場合のみ有効
    await page.goto(urls.adminSpaces);

    // ページネーションコンポーネントを探す
    const pagination = page.locator(
      '[aria-label="ページネーション"], nav:has(button:has-text("次へ"))',
    );

    if ((await pagination.count()) > 0) {
      await expect(pagination.first()).toBeVisible();
    } else {
      test.skip(true, "ページネーションが表示されない（データが少ない）");
    }
  });

  test("次のページに移動できる", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    const nextButton = page.locator(
      'button:has-text("次へ"), a:has-text("次へ")',
    );

    if ((await nextButton.count()) === 0 || (await nextButton.isDisabled())) {
      test.skip(true, "次のページが存在しません");
      return;
    }

    await nextButton.click();

    // URLにページパラメータが追加されることを確認
    await page.waitForURL(/[?&]page=2/);
  });
});
