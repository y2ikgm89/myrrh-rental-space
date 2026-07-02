import { test, expect, type Locator, type Page } from "@playwright/test";
import { urls, inquiryFactory } from "../fixtures";

let contact: ReturnType<typeof inquiryFactory.build>;

test.beforeEach(() => {
  contact = inquiryFactory.build();
});

function inquiryForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: /送信|Submit/i }),
  });
}

function inquiryFields(page: Page) {
  const main = page.getByRole("main");
  const form = inquiryForm(page);

  return {
    form,
    lastName: main.getByRole("textbox", { name: /^姓/u }),
    firstName: main.getByRole("textbox", { name: /^名/u }),
    email: main.getByRole("textbox", { name: "メールアドレス" }),
    subject: main.getByRole("textbox", { name: "件名" }),
    message: main.getByRole("textbox", { name: "お問い合わせ内容" }),
    submit: form.getByRole("button", { name: /送信|Submit/i }),
  };
}

async function expectInquiryFieldsReady(page: Page) {
  const fields = inquiryFields(page);

  await expect(fields.form).toBeVisible();
  await expect(fields.lastName).toBeEditable();
  await expect(fields.firstName).toBeEditable();
  await expect(fields.email).toBeEditable();
  await expect(fields.subject).toBeEditable();
  await expect(fields.message).toBeEditable();
  await expect(fields.submit).toBeVisible();

  return fields;
}

async function ensureCheckboxChecked(page: Page, checkbox: Locator) {
  await expect(checkbox).toBeEnabled();
  if (await checkbox.isChecked()) return;

  await checkbox.focus();
  await expect(checkbox).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
}

async function agreeToRequiredTerms(page: Page) {
  const { form } = inquiryFields(page);
  await ensureCheckboxChecked(
    page,
    form.getByRole("checkbox", { name: /利用規約/ }),
  );
  await ensureCheckboxChecked(
    page,
    form.getByRole("checkbox", { name: /プライバシーポリシー/ }),
  );
}

async function expectNativeRequiredValidation(field: Locator) {
  await expect
    .poll(() =>
      field.evaluate((element) => {
        const input = element as HTMLInputElement | HTMLTextAreaElement;
        return input.validity.valueMissing;
      }),
    )
    .toBe(true);
}

async function fillRequiredInquiryFields(
  page: Page,
  overrides: {
    readonly lastName?: string;
    readonly firstName?: string;
    readonly email?: string;
    readonly subject?: string;
    readonly message?: string;
  } = {},
) {
  const fields = await expectInquiryFieldsReady(page);
  const expected = {
    lastName: overrides.lastName ?? "問合せ",
    firstName: overrides.firstName ?? "太郎",
    email: overrides.email ?? contact.email,
    subject: overrides.subject ?? contact.subject,
    message: overrides.message ?? contact.message,
  };

  await fields.lastName.fill(expected.lastName);
  await expect(fields.lastName).toHaveValue(expected.lastName);
  await fields.firstName.fill(expected.firstName);
  await expect(fields.firstName).toHaveValue(expected.firstName);
  await fields.email.fill(expected.email);
  await expect(fields.email).toHaveValue(expected.email);
  await fields.subject.fill(expected.subject);
  await expect(fields.subject).toHaveValue(expected.subject);
  await fields.message.fill(expected.message);
  await expect(fields.message).toHaveValue(expected.message);
}

test.describe("お問い合わせページ - 基本表示", () => {
  test("お問い合わせページが正しく読み込まれる", async ({ page }) => {
    await page.goto(urls.contact);

    await expect(page).toHaveURL(/\/contact/u);
    await expect(
      page.getByRole("heading", { name: "お問い合わせ", level: 1 }),
    ).toBeVisible();
  });

  test("ページタイトルが設定されている", async ({ page }) => {
    await page.goto(urls.contact);

    await expect(page).toHaveTitle(/.+/u);
  });

  test("説明文が表示される", async ({ page }) => {
    await page.goto(urls.contact);

    await expect(
      page
        .locator("#main-content")
        .getByText("ご質問やご要望がございましたら", { exact: false }),
    ).toBeVisible();
  });
});

test.describe("お問い合わせページ - フォーム表示", () => {
  test("お問い合わせフォームが表示される", async ({ page }) => {
    await page.goto(urls.contact);

    await expect(inquiryForm(page)).toBeVisible();
  });

  test("氏名フィールドが姓と名に分かれて表示される", async ({ page }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await expect(fields.lastName).toBeVisible();
    await expect(fields.firstName).toBeVisible();
  });

  test("メール・件名・お問い合わせ内容フィールドが表示される", async ({
    page,
  }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await expect(fields.email).toBeVisible();
    await expect(fields.email).toHaveAttribute("type", "email");
    await expect(fields.subject).toBeVisible();
    await expect(fields.message).toBeVisible();
  });

  test("規約同意前は送信ボタンが無効で、同意後に有効になる", async ({
    page,
  }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await expect(fields.submit).toBeDisabled();
    await agreeToRequiredTerms(page);
    await expect(fields.submit).toBeEnabled();
  });
});

test.describe("お問い合わせページ - バリデーション", () => {
  test("姓が空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);
    await fillRequiredInquiryFields(page, { lastName: "" });

    await inquiryFields(page).submit.click();

    await expectNativeRequiredValidation(inquiryFields(page).lastName);
  });

  test("名が空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);
    await fillRequiredInquiryFields(page, { firstName: "" });

    await inquiryFields(page).submit.click();

    await expectNativeRequiredValidation(inquiryFields(page).firstName);
  });

  test("メールアドレスが空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);
    await fillRequiredInquiryFields(page, { email: "" });

    await inquiryFields(page).submit.click();

    await expectNativeRequiredValidation(inquiryFields(page).email);
  });

  test("不正なメールアドレス形式でエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);
    await fillRequiredInquiryFields(page, { email: "invalid-email" });

    await inquiryFields(page).submit.click();

    await expect(
      page.getByText("有効なメールアドレスを入力してください"),
    ).toBeVisible();
  });

  test("件名が空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);
    await fillRequiredInquiryFields(page, { subject: "" });

    await inquiryFields(page).submit.click();

    await expectNativeRequiredValidation(inquiryFields(page).subject);
  });

  test("お問い合わせ内容が空の場合にエラーが表示される", async ({ page }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);
    await fillRequiredInquiryFields(page, { message: "" });

    await inquiryFields(page).submit.click();

    await expectNativeRequiredValidation(inquiryFields(page).message);
  });

  test("すべてのフィールドが空の場合に複数のエラーが表示される", async ({
    page,
  }) => {
    await page.goto(urls.contact);
    await agreeToRequiredTerms(page);

    await inquiryFields(page).submit.click();

    const fields = inquiryFields(page);
    await expectNativeRequiredValidation(fields.lastName);
    await expectNativeRequiredValidation(fields.firstName);
    await expectNativeRequiredValidation(fields.email);
    await expectNativeRequiredValidation(fields.subject);
    await expectNativeRequiredValidation(fields.message);
  });
});

test.describe("お問い合わせページ - フォーム入力", () => {
  test("フォームに正しく入力できる", async ({ page }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await fillRequiredInquiryFields(page, {
      lastName: "入力",
      firstName: "太郎",
      message: "フォーム入力のテストメッセージです。",
    });

    await expect(fields.lastName).toHaveValue("入力");
    await expect(fields.firstName).toHaveValue("太郎");
    await expect(fields.email).toHaveValue(contact.email);
    await expect(fields.subject).toHaveValue(contact.subject);
    await expect(fields.message).toHaveValue(
      "フォーム入力のテストメッセージです。",
    );
  });

  test("フォームをクリアできる", async ({ page }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await fields.lastName.fill("問合せ");
    await fields.email.fill(contact.email);
    await fields.lastName.clear();
    await fields.email.clear();

    await expect(fields.lastName).toHaveValue("");
    await expect(fields.email).toHaveValue("");
  });

  test("Enterキーでフォームを送信しない（メッセージ入力中）", async ({
    page,
  }) => {
    await page.goto(urls.contact);
    const { message } = inquiryFields(page);

    await message.fill("テスト");
    await message.press("Enter");
    await message.pressSequentially("改行");

    await expect(message).toHaveValue("テスト\n改行");
  });
});

test.describe("お問い合わせページ - 送信準備", () => {
  test("必須項目と規約同意が揃うと送信できる状態になる", async ({ page }) => {
    await page.goto(urls.contact);

    await fillRequiredInquiryFields(page);
    await agreeToRequiredTerms(page);

    await expect(inquiryFields(page).submit).toBeEnabled();
  });
});

test.describe("お問い合わせページ - レスポンシブ", () => {
  test("モバイルビューでフォームが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.contact);

    const fields = inquiryFields(page);
    await expect(fields.form).toBeVisible();
    await expect(fields.lastName).toBeVisible();
    await expect(fields.firstName).toBeVisible();
    await expect(fields.email).toBeVisible();
    await expect(fields.message).toBeVisible();
  });

  test("タブレットビューでフォームが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(urls.contact);

    await expect(inquiryForm(page)).toBeVisible();
  });

  test("モバイルビューでフォーム入力ができる", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.contact);
    const { lastName } = inquiryFields(page);

    await lastName.fill("問合せ");

    await expect(lastName).toHaveValue("問合せ");
  });
});

test.describe("お問い合わせページ - アクセシビリティ", () => {
  test("フォームフィールドにラベルが関連付けられている", async ({ page }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await fields.lastName.fill("問合せ");
    await fields.firstName.fill("太郎");
    await fields.email.fill(contact.email);
    await fields.subject.fill(contact.subject);
    await fields.message.fill(contact.message);

    await expect(fields.lastName).toHaveValue("問合せ");
    await expect(fields.firstName).toHaveValue("太郎");
    await expect(fields.email).toHaveValue(contact.email);
    await expect(fields.subject).toHaveValue(contact.subject);
    await expect(fields.message).toHaveValue(contact.message);
  });

  test("キーボードでフォームを操作できる", async ({ page }) => {
    await page.goto(urls.contact);
    const { lastName } = inquiryFields(page);

    await lastName.focus();

    await expect(lastName).toBeFocused();
  });

  test("必須フィールドに required 属性がある", async ({ page }) => {
    await page.goto(urls.contact);
    const fields = inquiryFields(page);

    await expect(fields.lastName).toHaveAttribute("required", "");
    await expect(fields.firstName).toHaveAttribute("required", "");
    await expect(fields.email).toHaveAttribute("required", "");
    await expect(fields.subject).toHaveAttribute("required", "");
    await expect(fields.message).toHaveAttribute("required", "");
  });
});

test.describe("お問い合わせページ - エラーハンドリング", () => {
  test("ネットワークエラー時もフォームは表示され続ける", async ({ page }) => {
    await page.goto(urls.contact);
    await fillRequiredInquiryFields(page);
    await agreeToRequiredTerms(page);

    try {
      await page.context().setOffline(true);
      await inquiryFields(page).submit.click();

      await expect(inquiryForm(page)).toBeVisible();
      await expect(
        page.getByRole("alert").filter({ hasText: /ネットワーク接続/u }),
      ).toBeVisible();
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("JavaScriptエラーが発生しない", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(urls.contact);
    await inquiryFields(page).lastName.fill("問合せ");

    await expect(inquiryForm(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("お問い合わせページ - セキュリティ", () => {
  test("XSSスクリプトを入力してもページがクラッシュしない", async ({
    page,
  }) => {
    await page.goto(urls.contact);
    const xssPayload = '<script>alert("XSS")</script>';
    const fields = inquiryFields(page);

    await fields.lastName.fill(xssPayload);
    await fields.message.fill(xssPayload);

    await expect(fields.form).toBeVisible();
  });

  test("SQLインジェクション風文字列を入力してもページがクラッシュしない", async ({
    page,
  }) => {
    await page.goto(urls.contact);
    const sqlPayload = "'; DROP TABLE users; --";
    const fields = inquiryFields(page);

    await fields.lastName.fill(sqlPayload);
    await fields.message.fill(sqlPayload);

    await expect(fields.form).toBeVisible();
  });
});
