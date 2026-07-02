import { test, expect, type Page } from "@playwright/test";

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
 *   2. dev-customer 行を ClickableTableRow 経由で詳細ページへ遷移
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
 *   - seed で dev-customer が作成済み
 */

const ADMIN_CUSTOMERS_PATH = "/admin/customers";
const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";
const DEV_CUSTOMER_NAME = "開発 テスト";
const DEV_CUSTOMER_SEARCH_PATH = `${ADMIN_CUSTOMERS_PATH}?search=${encodeURIComponent(
  DEV_CUSTOMER_EMAIL,
)}`;

const DETAIL_FIELD_LABEL_SELECTOR = "dt";

const CUSTOMER_DETAIL_URL_PATTERN = /\/admin\/customers\/[0-9a-f-]+(?:\?|$)/;

async function gotoListAndRequireDevCustomer(page: Page) {
  await page.goto(DEV_CUSTOMER_SEARCH_PATH);
  await expect(page.getByRole("heading", { name: "顧客管理" })).toBeVisible({
    timeout: 15000,
  });
  const customerRow = page.getByRole("row", {
    name: `${DEV_CUSTOMER_NAME} の顧客情報を表示`,
  });
  await expect(customerRow).toBeVisible({ timeout: 15000 });
  return customerRow;
}

/** 行クリック → 詳細ページ遷移を URL pattern で確実に待機する canonical pattern。
 *
 *  - `row.click()` の center 位置は CheckboxCell / Email / ActionDropdown 等の
 *    `stopRowClick` cell に落ちうるため、ClickableTableRow の keyboard contract
 *    を使って遷移する。
 *  - Next.js App Router の soft navigation は load event を発火しないため
 *    web-first assertion の `toHaveURL` で URL 変化を待つ。
 */
async function clickRowAndWaitForDetail(
  page: Page,
  row: ReturnType<Page["locator"]>,
) {
  await row.focus();
  await row.press("Enter");
  await expect(page).toHaveURL(CUSTOMER_DETAIL_URL_PATTERN, { timeout: 10000 });
}

function detailFieldLabel(page: Page, label: string) {
  return page.locator(DETAIL_FIELD_LABEL_SELECTOR).filter({
    hasText: new RegExp(`^${label}$`, "u"),
  });
}

test.describe("admin 顧客詳細 - reflection smoke", () => {
  test("/admin/customers がリスト or 空状態を表示する", async ({ page }) => {
    await page.goto(ADMIN_CUSTOMERS_PATH);

    // 認証済み（/admin/access-denied にリダイレクトされていない）
    expect(page.url()).not.toMatch(/\/admin\/login/);

    // 顧客一覧 page heading
    await expect(page.getByRole("heading", { name: "顧客管理" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("顧客行をクリックすると詳細ページに遷移する", async ({ page }) => {
    const customerRow = await gotoListAndRequireDevCustomer(page);
    await clickRowAndWaitForDetail(page, customerRow);
    expect(page.url()).toMatch(CUSTOMER_DETAIL_URL_PATTERN);
  });

  test("詳細ページで基本情報セクションが表示される", async ({ page }) => {
    const customerRow = await gotoListAndRequireDevCustomer(page);
    await clickRowAndWaitForDetail(page, customerRow);

    // AdminDetailLayout: title (h1) + DetailSection「基本情報」
    await expect(
      page.getByRole("heading", { name: DEV_CUSTOMER_NAME, level: 1 }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("基本情報", { exact: true })).toBeVisible();

    // DetailField のラベル群
    await expect(detailFieldLabel(page, "お名前")).toBeVisible();
    await expect(detailFieldLabel(page, "区分")).toBeVisible();
    await expect(detailFieldLabel(page, "メールアドレス")).toBeVisible();
  });

  test("詳細ページに編集ボタン（リンク）が存在する", async ({ page }) => {
    const customerRow = await gotoListAndRequireDevCustomer(page);
    await clickRowAndWaitForDetail(page, customerRow);

    // AdminDetailLayout actions に「編集」リンク（href が /edit を含む）
    await expect(page.getByRole("link", { name: "編集" })).toBeVisible({
      timeout: 5000,
    });
  });
});
