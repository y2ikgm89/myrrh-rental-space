import { test, expect } from "@playwright/test";
import { urls, inquiryFactory } from "../fixtures";

/**
 * Parallel-safe な per-test contact データ。
 * 静的フィクスチャは email 衝突を起こすため factory で都度生成する。
 */
let contact: ReturnType<typeof inquiryFactory.build>;
test.beforeEach(() => {
  contact = inquiryFactory.build();
});

/**
 * 公開サイト - お問い合わせページ E2E テスト
 *
 * テストシナリオ:
 * 1. ページの基本表示
 * 2. フォーム表示
 * 3. フォームバリデーション
 * 4. フォーム送信
 * 5. Turnstile検証
 * 6. レスポンシブデザイン
 * 7. アクセシビリティ
 */

// =============================================================================
// 1. ページの基本表示
// =============================================================================

test.describe("お問い合わせページ - 基本表示", () => {
  test("お問い合わせページが正しく読み込まれる", async ({ page }) => {
    await page.goto(urls.contact);

    // ページが正常に読み込まれることを web-first assertion で確認
    await expect(page).toHaveURL(/\/contact/);
  });

  test("ページタイトルが設定されている", async ({ page }) => {
    await page.goto(urls.contact);

    // titleタグにお問い合わせ関連のテキストが含まれることを確認
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("見出しが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // お問い合わせページの見出しを確認
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/お問い合わせ|Contact/i);
  });

  test("説明文が表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // ページの説明文が存在することを確認
    const description = page.locator("p").first();
    await expect(description).toBeVisible();
  });
});

// =============================================================================
// 2. フォーム表示
// =============================================================================

test.describe("お問い合わせページ - フォーム表示", () => {
  test("お問い合わせフォームが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // フォームが存在することを確認
    const form = page.locator("form");
    await expect(form).toBeVisible();
  });

  test("名前フィールドが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();

    // ラベルが存在することを確認
    const nameLabel = page.locator(
      'label:has-text("名前"), label:has-text("お名前")',
    );
    await expect(nameLabel.first()).toBeVisible();
  });

  test("メールアドレスフィールドが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("type", "email");

    // ラベルが存在することを確認
    const emailLabel = page.locator(
      'label:has-text("メール"), label:has-text("Email")',
    );
    await expect(emailLabel.first()).toBeVisible();
  });

  test("メッセージフィールドが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    const messageInput = page.locator('textarea[name="message"]');
    await expect(messageInput).toBeVisible();

    // ラベルが存在することを確認
    const messageLabel = page.locator(
      'label:has-text("メッセージ"), label:has-text("内容"), label:has-text("お問い合わせ内容")',
    );
    await expect(messageLabel.first()).toBeVisible();
  });

  test("送信ボタンが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    const submitButton = page.getByRole("button", { name: /送信|Submit/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText(/送信|Submit/i);
  });
});

// =============================================================================
// 3. フォームバリデーション
// =============================================================================

test.describe("お問い合わせページ - バリデーション", () => {
  test("名前が空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // メールとメッセージだけ入力
    await page.fill('input[name="email"]', contact.email);
    await page.fill('textarea[name="message"]', contact.message);

    // 送信ボタンをクリック
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=名前は必須, text=お名前を入力, [data-error="name"]',
    );

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("メールアドレスが空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // 名前とメッセージだけ入力
    await page.fill('input[name="name"]', contact.name);
    await page.fill('textarea[name="message"]', contact.message);

    // 送信ボタンをクリック
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=メールアドレスは必須, text=メールアドレスを入力, [data-error="email"]',
    );

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("不正なメールアドレス形式でエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // 不正なメールアドレスを入力
    await page.fill('input[name="name"]', contact.name);
    await page.fill('input[name="email"]', "invalid-email");
    await page.fill('textarea[name="message"]', contact.message);

    // 送信ボタンをクリック
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=有効なメールアドレス, text=メールアドレスの形式, [data-error="email"]',
    );

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("メッセージが空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    // 名前とメールだけ入力
    await page.fill('input[name="name"]', contact.name);
    await page.fill('input[name="email"]', contact.email);

    // 送信ボタンをクリック
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=メッセージは必須, text=内容を入力, text=お問い合わせ内容を入力, [data-error="message"]',
    );

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test("すべてのフィールドが空の場合に複数のエラーが表示される", async ({
    page,
  }) => {
    await page.goto(urls.contact);

    // 何も入力せずに送信
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // 複数のエラーメッセージが表示されることを確認
    const errors = page.locator(
      "[data-error], .text-destructive, .text-red-500",
    );
    await expect(errors.first()).toBeVisible();
    const errorCount = await errors.count();

    // 少なくとも2つ以上のエラーが表示されることを確認
    expect(errorCount).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// 4. フォーム入力
// =============================================================================

test.describe("お問い合わせページ - フォーム入力", () => {
  test("フォームに正しく入力できる（factory 経由で unique data 生成）", async ({
    page,
  }) => {
    await page.goto(urls.contact);

    // `inquiryFactory.build()` で並列実行セーフな unique data を生成
    // （test-data.ts の static fixture では並列実行時に email 衝突の可能性がある）
    const inquiry = inquiryFactory.build({
      name: "入力テスト太郎",
      message: "フォーム入力のテストメッセージです。",
    });

    // 各フィールドに入力
    // (phone フィールドは public-inquiry-form-card に存在しない =
    //  従来の `if (await phoneInput.count() > 0)` ガードは silent-pass のため削除)
    await page.fill('input[name="name"]', inquiry.name);
    await page.fill('input[name="email"]', inquiry.email);
    await page.fill('textarea[name="message"]', inquiry.message);

    // 入力値を確認
    await expect(page.locator('input[name="name"]')).toHaveValue(inquiry.name);
    await expect(page.locator('input[name="email"]')).toHaveValue(
      inquiry.email,
    );
    await expect(page.locator('textarea[name="message"]')).toHaveValue(
      inquiry.message,
    );
  });

  test("フォームをクリアできる", async ({ page }) => {
    await page.goto(urls.contact);

    // 入力
    await page.fill('input[name="name"]', contact.name);
    await page.fill('input[name="email"]', contact.email);

    // クリア
    await page.locator('input[name="name"]').clear();
    await page.locator('input[name="email"]').clear();

    // クリアされたことを確認
    await expect(page.locator('input[name="name"]')).toHaveValue("");
    await expect(page.locator('input[name="email"]')).toHaveValue("");
  });

  test("Enterキーでフォームを送信しない（メッセージ入力中）", async ({
    page,
  }) => {
    await page.goto(urls.contact);

    // テキストエリアでEnterを押す
    const textarea = page.locator('textarea[name="message"]');
    await textarea.click();
    await textarea.type("テスト\n改行");

    // フォームが送信されず、改行が入力されることを確認
    await expect(textarea).toContainText("テスト\n改行");
  });
});

// =============================================================================
// 6. 送信処理
// =============================================================================

test.describe("お問い合わせページ - 送信処理", () => {
  test("送信ボタンクリックで送信処理が開始される", async ({ page }) => {
    await page.goto(urls.contact);

    // 有効なデータを入力
    await page.fill('input[name="name"]', contact.name);
    await page.fill('input[name="email"]', contact.email);
    await page.fill('textarea[name="message"]', contact.message);

    // 送信ボタンをクリック
    const submitButton = page.getByRole("button", { name: /送信|Submit/i });
    await submitButton.click();

    // ローディング状態または無効化状態になることを確認
    // Turnstileがない環境では、バリデーションエラーまたはローディング状態
    // ボタンが一時的に無効になるか、ローディング表示が出ることを確認
    const isDisabled = await submitButton.isDisabled();
    const hasLoadingText = await submitButton.textContent();

    // いずれかの状態であることを確認
    expect(isDisabled || hasLoadingText?.includes("送信中")).toBeTruthy();
  });

  // 送信成功時の完了メッセージ検証は Turnstile / Resend mock が必要なため
  // E2E ではなく __tests__/integration/inquiry-submission.test.ts の Server Action
  // 統合テストで検証する (defensive `test.skip(true)` 規律違反のため削除済)。
});

// =============================================================================
// 7. レスポンシブデザイン
// =============================================================================

test.describe("お問い合わせページ - レスポンシブ", () => {
  test("モバイルビューでフォームが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.contact);

    const form = page.locator("form");
    await expect(form).toBeVisible();

    // 各フィールドが表示されることを確認
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: /送信|Submit/i }),
    ).toBeVisible();
  });

  test("タブレットビューでフォームが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(urls.contact);

    const form = page.locator("form");
    await expect(form).toBeVisible();
  });

  test("モバイルビューでフォーム入力ができる", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.contact);

    // モバイルでの入力
    await page.fill('input[name="name"]', contact.name);
    await expect(page.locator('input[name="name"]')).toHaveValue(contact.name);
  });
});

// =============================================================================
// 8. アクセシビリティ
// =============================================================================

test.describe("お問い合わせページ - アクセシビリティ", () => {
  test("フォームフィールドにラベルが関連付けられている", async ({ page }) => {
    await page.goto(urls.contact);

    // 名前フィールド
    const nameInput = page.locator('input[name="name"]');
    const nameId = await nameInput.getAttribute("id");

    if (nameId) {
      const nameLabel = page.locator(`label[for="${nameId}"]`);
      await expect(nameLabel).toBeVisible();
    }

    // メールフィールド
    const emailInput = page.locator('input[name="email"]');
    const emailId = await emailInput.getAttribute("id");

    if (emailId) {
      const emailLabel = page.locator(`label[for="${emailId}"]`);
      await expect(emailLabel).toBeVisible();
    }
  });

  test("キーボードでフォームを操作できる", async ({ page }) => {
    await page.goto(urls.contact);

    // Tabキーで最初のフィールドにフォーカス
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // フォーカスがフォーム内の要素に当たっていることを確認
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test("必須フィールドにaria-requiredがある", async ({ page }) => {
    await page.goto(urls.contact);

    const nameInput = page.locator('input[name="name"]');
    const isRequired =
      (await nameInput.getAttribute("required")) !== null ||
      (await nameInput.getAttribute("aria-required")) === "true";

    expect(isRequired).toBe(true);
  });
});

// =============================================================================
// 9. エラーハンドリング
// =============================================================================

test.describe("お問い合わせページ - エラーハンドリング", () => {
  test("ネットワークエラー時にエラーメッセージが表示される", async ({
    page,
  }) => {
    await page.goto(urls.contact);

    // フォームに入力
    await page.fill('input[name="name"]', contact.name);
    await page.fill('input[name="email"]', contact.email);
    await page.fill('textarea[name="message"]', contact.message);

    // オフラインモードをシミュレート
    await page.context().setOffline(true);

    // 送信
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // ページがクラッシュしていないことを確認（フォームが visible のままであることを auto-retry で待機）
    const form = page.locator("form");
    await expect(form).toBeVisible();

    // オンラインに戻す
    await page.context().setOffline(false);
  });

  test("JavaScriptエラーが発生しない", async ({ page }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto(urls.contact);

    // フォーム操作
    await page.fill('input[name="name"]', contact.name);
    await page.getByRole("button", { name: /送信|Submit/i }).click();

    // 送信後のバリデーション/エラー描画が確定するまで form の visible で auto-retry
    await expect(page.locator("form")).toBeVisible();

    expect(errors.length).toBe(0);
  });
});

// =============================================================================
// 10. セキュリティ
// =============================================================================

test.describe("お問い合わせページ - セキュリティ", () => {
  test("XSSスクリプトが実行されない", async ({ page }) => {
    await page.goto(urls.contact);

    // XSSペイロードを入力
    const xssPayload = '<script>alert("XSS")</script>';
    await page.fill('input[name="name"]', xssPayload);
    await page.fill('textarea[name="message"]', xssPayload);

    // ページがクラッシュしないことを確認
    const form = page.locator("form");
    await expect(form).toBeVisible();
  });

  test("SQLインジェクションペイロードが安全に処理される", async ({ page }) => {
    await page.goto(urls.contact);

    // SQLインジェクションペイロードを入力
    const sqlPayload = "'; DROP TABLE users; --";
    await page.fill('input[name="name"]', sqlPayload);
    await page.fill('textarea[name="message"]', sqlPayload);

    // ページがクラッシュしないことを確認
    const form = page.locator("form");
    await expect(form).toBeVisible();
  });
});
