import { test, expect } from "@playwright/test";

/**
 * 管理画面 - 顧客詳細表示 reflection E2E（管理者認証済み state）
 *
 * Phase 3 P3 admin 側補完: マイページプロフィール spec
 * (`mypage-profile-flow.spec.ts`) に対応する admin 側の表示確認 smoke。
 * customer-side で更新したプロフィールが admin の `/admin/customers/[id]`
 * 詳細ページに反映される導線を検証する。
 *
 * シナリオ:
 *   1. /admin/customers が DataTable を表示する
 *   2. dev-customer (or 既存顧客) 行を ClickableTableRow 経由で詳細ページへ遷移
 *   3. 詳細ページで AdminDetailLayout（title = lastName + firstName, subtitle = email）
 *   4. DetailSection「基本情報」+ DetailField「お名前」「区分」「メールアドレス」
 *   5. 編集ボタン（`/admin/customers/[id]/edit`）が存在
 *
 * 担保範囲分割:
 *   - profile update domain 動作 → integration test
 *     (`__tests__/integration/actions/public/mypage-profile.test.ts`)
 *   - customer-side UI → mypage-profile-flow.spec.ts（chromium-customer）
 *   - admin-side reflection → 本 spec（chromium-admin）
 *
 * 前提:
 *   - playwright.config.ts の chromium-admin project で実行
 *   - setup-admin により admin user が認証済み
 *   - dev サーバー稼働中
 *   - 顧客が 1 名以上存在する（seed の dev-customer 等、または手動作成）
 */

const ADMIN_CUSTOMERS_PATH = "/admin/customers";

test.describe("admin 顧客詳細 - reflection smoke", () => {
  test("/admin/customers がリスト or 空状態を表示する", async ({ page }) => {
    await page.goto(ADMIN_CUSTOMERS_PATH);
    await page.waitForLoadState("networkidle");

    // 認証済み（/admin/login にリダイレクトされていない）
    expect(page.url()).not.toMatch(/\/admin\/login/);

    // 顧客一覧 page heading
    await expect(
      page.getByRole("heading", { name: /顧客|Customer/ }).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("顧客行をクリックすると詳細ページに遷移する", async ({ page }) => {
    await page.goto(ADMIN_CUSTOMERS_PATH);
    await page.waitForLoadState("networkidle");

    // ClickableTableRow は href を持つ。tbody 内の行を取得
    const customerRow = page
      .locator('tr[role="link"], tr[tabindex="0"]')
      .first();
    if (!(await customerRow.isVisible().catch(() => false))) {
      test.skip(true, "顧客が登録されていません");
      return;
    }

    await customerRow.click();
    await page.waitForLoadState("networkidle");

    // /admin/customers/<uuid> パターンに遷移
    expect(page.url()).toMatch(/\/admin\/customers\/[0-9a-f-]+(\?|$)/);
  });

  test("詳細ページで基本情報セクションが表示される", async ({ page }) => {
    await page.goto(ADMIN_CUSTOMERS_PATH);
    await page.waitForLoadState("networkidle");

    const customerRow = page
      .locator('tr[role="link"], tr[tabindex="0"]')
      .first();
    if (!(await customerRow.isVisible().catch(() => false))) {
      test.skip(true, "顧客が登録されていません");
      return;
    }

    await customerRow.click();
    await page.waitForLoadState("networkidle");

    // AdminDetailLayout: title (h1) + DetailSection「基本情報」
    await expect(page.getByText("基本情報").first()).toBeVisible({
      timeout: 10000,
    });

    // DetailField のラベル群
    await expect(page.getByText("お名前").first()).toBeVisible();
    await expect(page.getByText("区分").first()).toBeVisible();
    await expect(page.getByText("メールアドレス").first()).toBeVisible();
  });

  test("詳細ページに編集ボタン（リンク）が存在する", async ({ page }) => {
    await page.goto(ADMIN_CUSTOMERS_PATH);
    await page.waitForLoadState("networkidle");

    const customerRow = page
      .locator('tr[role="link"], tr[tabindex="0"]')
      .first();
    if (!(await customerRow.isVisible().catch(() => false))) {
      test.skip(true, "顧客が登録されていません");
      return;
    }

    await customerRow.click();
    await page.waitForLoadState("networkidle");

    // AdminDetailLayout actions に「編集」リンク（href が /edit を含む）
    const editLink = page.locator(
      'a[href*="/admin/customers/"][href$="/edit"]',
    );
    await expect(editLink.first()).toBeVisible({ timeout: 5000 });
  });
});
