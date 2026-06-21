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
 *   - 顧客が 1 名以上存在する場合のみ詳細ページ遷移系を検証（無ければ skip）
 */

const ADMIN_CUSTOMERS_PATH = "/admin/customers";

/** ClickableTableRow は `<tr tabindex="0">` のみ（rules で role="link" 禁止）。
 *  tbody 配下に scope して TableHeader 行を除外。 */
const CUSTOMER_ROW_SELECTOR = 'tbody tr[tabindex="0"]';

const CUSTOMER_DETAIL_URL_PATTERN = /\/admin\/customers\/[0-9a-f-]+(?:\?|$)/;

/** 顧客行が無ければ test.skip するヘルパー（Empty state / 未 seed 環境対応）。 */
async function gotoListAndRequireCustomer(page: Page) {
  await page.goto(ADMIN_CUSTOMERS_PATH);
  // テーブル全体が描画されるまで待機（Suspense / RSC 遅延対策）
  await expect(
    page.getByRole("heading", { name: /顧客|Customer/ }).first(),
  ).toBeVisible({
    timeout: 15000,
  });
  const customerRow = page.locator(CUSTOMER_ROW_SELECTOR).first();
  const count = await page.locator(CUSTOMER_ROW_SELECTOR).count();
  if (count === 0) {
    test.skip(
      true,
      "dev DB に顧客が登録されていません（seed で dev-customer を作成してください）",
    );
  }
  return customerRow;
}

/** 行クリック → 詳細ページ遷移を URL pattern で確実に待機する canonical pattern。
 *
 *  - `row.click()` の center 位置は CheckboxCell / Email / ActionDropdown 等の
 *    `stopRowClick` cell に落ちうるため、name cell（3 番目 = `td:nth(2)`、
 *    `stopRowClick` 非適用）を明示ターゲットして click 伝播を保証する。
 *  - Next.js App Router の soft navigation は load event を発火しないため
 *    `waitForURL` ではなく URL を直接 polling する `toHaveURL` を使う。
 */
async function clickRowAndWaitForDetail(
  page: Page,
  row: ReturnType<Page["locator"]>,
) {
  // 列順: [0] CheckboxCell(stop) [1] StatusBadge [2] 名前 [3] 区分 ...
  await row.locator("td").nth(2).click();
  await expect(page).toHaveURL(CUSTOMER_DETAIL_URL_PATTERN, { timeout: 10000 });
}

test.describe("admin 顧客詳細 - reflection smoke", () => {
  test("/admin/customers がリスト or 空状態を表示する", async ({ page }) => {
    await page.goto(ADMIN_CUSTOMERS_PATH);

    // 認証済み（/admin/login にリダイレクトされていない）
    expect(page.url()).not.toMatch(/\/admin\/login/);

    // 顧客一覧 page heading
    await expect(
      page.getByRole("heading", { name: /顧客|Customer/ }).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("顧客行をクリックすると詳細ページに遷移する", async ({ page }) => {
    const customerRow = await gotoListAndRequireCustomer(page);
    await clickRowAndWaitForDetail(page, customerRow);
    expect(page.url()).toMatch(CUSTOMER_DETAIL_URL_PATTERN);
  });

  test("詳細ページで基本情報セクションが表示される", async ({ page }) => {
    const customerRow = await gotoListAndRequireCustomer(page);
    await clickRowAndWaitForDetail(page, customerRow);

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
    const customerRow = await gotoListAndRequireCustomer(page);
    await clickRowAndWaitForDetail(page, customerRow);

    // AdminDetailLayout actions に「編集」リンク（href が /edit を含む）
    const editLink = page.locator(
      'a[href*="/admin/customers/"][href$="/edit"]',
    );
    await expect(editLink.first()).toBeVisible({ timeout: 5000 });
  });
});
