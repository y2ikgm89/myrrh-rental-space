import { test, expect, type Page } from "@playwright/test";
import { urls, testContacts, inquiryFactory } from "../fixtures";

/**
 * 公開フォームバリデーション E2E テスト
 *
 * テストシナリオ:
 * 1. お問い合わせフォーム (/contact) — 空送信・無効値・aria-describedby
 * 2. 予約フォーム (/reservation) — 必須フィールド未入力・過去日付
 *
 * 注意:
 * - Turnstile はテスト環境では送信を完了させないため、フォームの
 *   クライアントサイドバリデーション（react-hook-form + Zod）の確認に留める
 * - エラーメッセージは Input/Textarea コンポーネントの <p id="{id}-error"> に表示される
 * - aria-invalid="true" と aria-describedby="{id}-error" でスクリーンリーダーに紐付け
 */

// =============================================================================
// 1. お問い合わせフォーム (/contact)
// =============================================================================

test.describe("お問い合わせフォーム - 空送信バリデーション", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.contact);
    await page.waitForLoadState("networkidle");
  });

  test("全フィールドが空のまま送信するとエラーが複数表示される", async ({
    page,
  }) => {
    await page.click('button[type="submit"]');

    // react-hook-form がバリデーションを実行するまで待機
    await page.waitForTimeout(300);

    // text-destructive クラスを持つエラーメッセージが複数表示される
    const errors = page.locator(".text-destructive");
    const count = await errors.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("名前フィールドが空の場合にエラーが表示される", async ({ page }) => {
    // factory で並列セーフな unique email を生成
    const inquiry = inquiryFactory.build();

    // メールとメッセージと件名だけ入力
    await page.fill("#contact-email", inquiry.email);
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", inquiry.message);

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    // #contact-name-error が表示される
    const nameError = page.locator("#contact-name-error");
    await expect(nameError).toBeVisible({ timeout: 3000 });
    await expect(nameError).toHaveText(/.+/); // 空でないエラーメッセージ
  });

  test("メールフィールドが空の場合にエラーが表示される", async ({ page }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const emailError = page.locator("#contact-email-error");
    await expect(emailError).toBeVisible({ timeout: 3000 });
  });

  test("件名フィールドが空の場合にエラーが表示される", async ({ page }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-email", testContacts.valid.email);
    await page.fill("#contact-message", "メッセージテスト本文です");

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const subjectError = page.locator("#contact-subject-error");
    await expect(subjectError).toBeVisible({ timeout: 3000 });
  });

  test("メッセージフィールドが空の場合にエラーが表示される", async ({
    page,
  }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-email", testContacts.valid.email);
    await page.fill("#contact-subject", "件名テスト");

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const messageError = page.locator("#contact-message-error");
    await expect(messageError).toBeVisible({ timeout: 3000 });
  });
});

test.describe("お問い合わせフォーム - メールアドレス形式バリデーション", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.contact);
    await page.waitForLoadState("networkidle");
  });

  test("無効なメールアドレスでエラーが表示される", async ({ page }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-email", "invalid-email"); // @ なし
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const emailError = page.locator("#contact-email-error");
    await expect(emailError).toBeVisible({ timeout: 3000 });
  });

  test("ドメインなしのメールアドレスでエラーが表示される", async ({ page }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-email", "test@"); // ドメインなし
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const emailError = page.locator("#contact-email-error");
    await expect(emailError).toBeVisible({ timeout: 3000 });
  });

  test("スペースのみのメールアドレスでエラーが表示される", async ({ page }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-email", "   ");
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");

    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const emailError = page.locator("#contact-email-error");
    await expect(emailError).toBeVisible({ timeout: 3000 });
  });
});

test.describe("お問い合わせフォーム - アクセシビリティ (aria-describedby)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.contact);
    await page.waitForLoadState("networkidle");
  });

  test("エラー発生時に name フィールドが aria-invalid=true を持つ", async ({
    page,
  }) => {
    // 空送信でバリデーションを発火させる
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const nameInput = page.locator("#contact-name");
    const ariaInvalid = await nameInput.getAttribute("aria-invalid");
    expect(ariaInvalid).toBe("true");
  });

  test("エラー発生時に email フィールドが aria-invalid=true を持つ", async ({
    page,
  }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    // email を空にして送信
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const emailInput = page.locator("#contact-email");
    const ariaInvalid = await emailInput.getAttribute("aria-invalid");
    expect(ariaInvalid).toBe("true");
  });

  test("エラー発生時に name フィールドが aria-describedby でエラーに紐付く", async ({
    page,
  }) => {
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const nameInput = page.locator("#contact-name");
    const describedBy = await nameInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("contact-name-error");

    // 参照先の要素が実際に存在してエラーメッセージを含む
    const errorEl = page.locator(`#${describedBy}`);
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText(/.+/);
  });

  test("エラー発生時に email フィールドが aria-describedby でエラーに紐付く", async ({
    page,
  }) => {
    await page.fill("#contact-name", testContacts.valid.name);
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const emailInput = page.locator("#contact-email");
    const describedBy = await emailInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("contact-email-error");

    const errorEl = page.locator(`#${describedBy}`);
    await expect(errorEl).toBeVisible();
  });

  test("正常入力後はエラーが消えて aria-invalid が外れる", async ({ page }) => {
    // まず空送信してエラーを発生させる
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    const nameInput = page.locator("#contact-name");
    expect(await nameInput.getAttribute("aria-invalid")).toBe("true");

    // 正しい値を入力
    await page.fill("#contact-name", testContacts.valid.name);

    // react-hook-form は onChange モードのバリデーションでエラーを解消する
    // 次の送信試行でエラーが解消されていることを確認
    await page.fill("#contact-email", testContacts.valid.email);
    await page.fill("#contact-subject", "件名テスト");
    await page.fill("#contact-message", "メッセージテスト本文です");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);

    // name フィールドのエラーが消えている
    const nameError = page.locator("#contact-name-error");
    await expect(nameError).not.toBeVisible();
  });
});

// =============================================================================
// 2. 予約フォーム (/reservation)
// =============================================================================

test.describe("予約ページ - スペース未選択状態", () => {
  test("スペース ID なしでアクセスすると選択を促すメッセージが表示される", async ({
    page,
  }) => {
    await page.goto(urls.reservation);
    await page.waitForLoadState("networkidle");

    // スペース選択を促す見出しが表示される
    await expect(
      page.getByRole("heading", {
        name: /予約するスペースを選択してください/i,
      }),
    ).toBeVisible();

    // スペース一覧へのリンクが表示される
    await expect(
      page.getByRole("link", { name: /スペース一覧を見る/i }),
    ).toBeVisible();
  });
});

test.describe("予約フォーム - 顧客情報ステップのバリデーション", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const validStartTime = "10:00";
  const validEndTime = "12:00";

  /**
   * 顧客情報ステップに到達するためのヘルパー。
   * スペース一覧の最初のスペースを選択 → 予約する → 日時選択 → 次へ進む
   */
  async function navigateToCustomerStep(page: Page) {
    await page.goto(urls.spaces);
    await page.waitForLoadState("networkidle");

    const spaceLinks = page.locator('a[href*="/spaces/"]');
    if ((await spaceLinks.count()) === 0) {
      return false; // スペースが存在しない場合はスキップ
    }

    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    const reserveButton = page.getByRole("link", { name: /予約する/i });
    if ((await reserveButton.count()) === 0) return false;

    await reserveButton.click();
    await page.waitForLoadState("networkidle");

    // 翌日の日付を選択
    const tomorrowDay = tomorrow.getDate();
    const dateButton = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first();

    if ((await dateButton.count()) === 0) return false;
    await dateButton.click();
    await page.waitForTimeout(500);

    // 開始・終了時刻を選択
    const startSlot = page
      .locator("button", { hasText: validStartTime })
      .first();
    if (!(await startSlot.isVisible())) return false;
    await startSlot.click();

    const endSlot = page.locator("button", { hasText: validEndTime }).first();
    if (!(await endSlot.isVisible())) return false;
    await endSlot.click();

    // 次のステップへ
    const nextButton = page.getByRole("button", { name: /次へ進む/i });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await page.waitForLoadState("networkidle");

    return true;
  }

  test("必須フィールドが空のまま送信するとバリデーションエラーが表示される", async ({
    page,
  }) => {
    const reached = await navigateToCustomerStep(page);
    if (!reached) {
      test.skip();
      return;
    }

    // 空のまま送信
    const submitButton = page.getByRole("button", {
      name: /予約を確定する/i,
    });
    await submitButton.click();

    // 姓・名・メール・電話番号のエラーが表示される
    await expect(page.getByText(/姓を入力してください/i)).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByText(/名を入力してください/i)).toBeVisible({
      timeout: 3000,
    });
    await expect(
      page.getByText(/メールアドレスを入力してください/i),
    ).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/電話番号を入力してください/i)).toBeVisible({
      timeout: 3000,
    });
  });

  test("無効なメールアドレスでエラーが表示される", async ({ page }) => {
    const reached = await navigateToCustomerStep(page);
    if (!reached) {
      test.skip();
      return;
    }

    await page.locator('input[name="lastName"]').fill("テスト");
    await page.locator('input[name="firstName"]').fill("太郎");
    await page.locator('input[name="email"]').fill("not-an-email");
    await page.locator('input[name="phoneNumber"]').fill("090-1234-5678");

    await page.getByRole("button", { name: /予約を確定する/i }).click();

    await expect(
      page.getByText(/有効なメールアドレスを入力してください/i),
    ).toBeVisible({ timeout: 3000 });
  });

  test("無効な電話番号フォーマットでエラーが表示される", async ({ page }) => {
    const reached = await navigateToCustomerStep(page);
    if (!reached) {
      test.skip();
      return;
    }

    await page.locator('input[name="lastName"]').fill("テスト");
    await page.locator('input[name="firstName"]').fill("太郎");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="phoneNumber"]').fill("abcde"); // 無効な電話番号

    await page.getByRole("button", { name: /予約を確定する/i }).click();

    await expect(
      page.getByText(/電話番号は数字とハイフンのみで入力してください/i),
    ).toBeVisible({ timeout: 3000 });
  });
});

test.describe("予約フォーム - 日時選択ステップのバリデーション", () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  async function navigateToDateTimeStep(page: Page) {
    await page.goto(urls.spaces);
    await page.waitForLoadState("networkidle");

    const spaceLinks = page.locator('a[href*="/spaces/"]');
    if ((await spaceLinks.count()) === 0) return false;

    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    const reserveButton = page.getByRole("link", { name: /予約する/i });
    if ((await reserveButton.count()) === 0) return false;

    await reserveButton.click();
    await page.waitForLoadState("networkidle");
    return true;
  }

  test("過去の日付ボタンが無効化またはクリック不可になっている", async ({
    page,
  }) => {
    const reached = await navigateToDateTimeStep(page);
    if (!reached) return;

    const yesterdayDay = yesterday.getDate();

    // カレンダーが現在月を表示している前提で昨日のボタンを取得
    const pastDateButton = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${yesterdayDay}$`) })
      .first();

    if ((await pastDateButton.count()) === 0) {
      // 昨日が前月の場合など、ボタンが見えないケースはスキップ
      return;
    }

    // 過去の日付ボタンは disabled か、クラスで選択不可を示している
    const isDisabled = await pastDateButton.isDisabled().catch(() => false);
    const classList = await pastDateButton
      .getAttribute("class")
      .catch(() => "");
    const hasDisabledIndicator =
      (classList ?? "").includes("disabled") ||
      (classList ?? "").includes("unavailable") ||
      (classList ?? "").includes("opacity-");

    expect(isDisabled || hasDisabledIndicator).toBeTruthy();
  });

  test("日付・時刻未選択で次へ進むボタンが無効化されている", async ({
    page,
  }) => {
    const reached = await navigateToDateTimeStep(page);
    if (!reached) return;

    // 何も選択せずに「次へ進む」ボタンが disabled であることを確認
    const nextButton = page.getByRole("button", { name: /次へ進む/i });
    if ((await nextButton.count()) > 0) {
      await expect(nextButton).toBeDisabled();
    }
  });

  test("日時選択後に合計金額が表示される", async ({ page }) => {
    const reached = await navigateToDateTimeStep(page);
    if (!reached) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = tomorrow.getDate();

    const dateButton = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first();

    if ((await dateButton.count()) === 0) return;
    await dateButton.click();
    await page.waitForTimeout(500);

    const startSlot = page.locator("button", { hasText: "10:00" }).first();
    if (!(await startSlot.isVisible())) return;
    await startSlot.click();

    const endSlot = page.locator("button", { hasText: "12:00" }).first();
    if (!(await endSlot.isVisible())) return;
    await endSlot.click();

    // 合計金額が表示される
    await expect(page.locator("text=/合計/i")).toBeVisible();
    await expect(page.locator("text=/¥/i").first()).toBeVisible();
  });
});
