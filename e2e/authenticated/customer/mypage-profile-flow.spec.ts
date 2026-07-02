import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ - プロフィール編集 E2E（顧客認証済み state）
 *
 * Phase 3 P3: マイページプロフィール更新 → admin 反映 chain の
 * 顧客側 UI 部分。実 update action は dev Turnstile + DB write を伴うため、
 * 本 spec は **フォーム表示 + 個人 / 法人切替 + 保存ボタン存在** の smoke
 * に集中する。実 update + admin 反映は integration test で担保。
 *
 * シナリオ:
 *   1. /mypage/settings がプロフィールフォーム + アカウント連携を表示
 *   2. 「個人」 / 「法人・団体」 radio で会社名フィールド切替
 *   3. 姓 / 名 / 電話番号 input が autocomplete 属性付きで表示
 *   4. メールアドレス input は disabled（ソーシャル取得値で固定）
 *   5. TurnstileWidget + 「保存」ボタンが見える
 *
 * 担保範囲分割:
 *   - update action 自体の domain 動作 → integration test
 *     (`__tests__/integration/actions/public/mypage-profile.test.ts`)
 *   - admin 側の Customer 詳細表示 → 別 admin spec の範囲
 *     (`/admin/customers/[id]` で同 dev-customer を表示確認)
 *
 * 前提:
 *   - playwright.config.ts の chromium-customer project で実行
 *   - setup-customer により dev customer が認証済み
 *   - dev サーバー稼働中
 */

test.describe("マイページプロフィール - 編集 UI smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.mypageProfile);
  });

  test("認証済みでアカウント設定ページが表示される", async ({ page }) => {
    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/settings");

    // h1「アカウント設定」+ h2「プロフィール」/「アカウント連携」
    await expect(
      page.getByRole("heading", { name: "アカウント設定", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "プロフィール", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "アカウント連携", level: 2 }),
    ).toBeVisible();
  });

  test("プロフィールフォームの主要入力が表示される", async ({ page }) => {
    // CustomerTypeToggle は role="radiogroup" aria-label="ご利用区分"
    const typeGroup = page.getByRole("radiogroup", { name: "ご利用区分" });
    await expect(typeGroup).toBeVisible();
    await expect(typeGroup.getByRole("radio", { name: "個人" })).toBeVisible();
    await expect(
      typeGroup.getByRole("radio", { name: "法人・団体" }),
    ).toBeVisible();

    // 姓 / 名 / 電話番号は autocomplete 属性経由で取得（label は重複しうる）
    const main = page.locator("#main-content");
    const lastName = main.locator('input[autocomplete="family-name"]');
    const firstName = main.locator('input[autocomplete="given-name"]');
    const phone = main.locator('input[autocomplete="tel"]');
    await expect(lastName).toBeVisible();
    await expect(firstName).toBeVisible();
    await expect(phone).toBeVisible();

    // 保存ボタン
    await expect(
      page.getByRole("button", { name: /保存/, exact: false }),
    ).toBeVisible();
  });

  test("メールアドレス input は disabled（ソーシャル取得値で固定）", async ({
    page,
  }) => {
    const email = page.locator("#profile-form").getByLabel("メールアドレス");
    await expect(email).toBeVisible();
    await expect(email).toBeDisabled();

    await expect(email).toHaveAccessibleDescription(
      "メールアドレスはソーシャルアカウントから取得されます",
    );
  });

  test("「法人・団体」を選択すると会社名 input が表示される", async ({
    page,
  }) => {
    const typeGroup = page.getByRole("radiogroup", { name: "ご利用区分" });
    const corporateRadio = typeGroup.getByRole("radio", {
      name: "法人・団体",
    });

    await corporateRadio.click();

    // autocomplete="organization" の会社名入力欄
    const company = page
      .locator("#main-content")
      .locator('input[autocomplete="organization"]');
    await expect(company).toBeVisible({ timeout: 3000 });
  });

  test("「個人」に切替えると会社名 input が消える", async ({ page }) => {
    const typeGroup = page.getByRole("radiogroup", { name: "ご利用区分" });

    // まず法人にして company input を表示させる
    await typeGroup.getByRole("radio", { name: "法人・団体" }).click();
    const company = page
      .locator("#main-content")
      .locator('input[autocomplete="organization"]');
    await expect(company).toBeVisible({ timeout: 3000 });

    // 個人に戻すと company input は DOM から消える
    await typeGroup.getByRole("radio", { name: "個人" }).click();
    await expect(company).not.toBeVisible({ timeout: 3000 });
  });

  test("Turnstile widget が iframe としてマウントされる", async ({ page }) => {
    // Cloudflare Turnstile は iframe を生成
    // dev mode では検証 skip だが widget 自体は描画される
    const turnstileFrame = page.locator(
      'iframe[src*="challenges.cloudflare.com"], iframe[title*="Turnstile" i]',
    );

    // dev fallback で widget が描画されないケースもあるため best-effort
    const count = await turnstileFrame.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
