import { test, expect } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";
import { visibleBySelector } from "../../helpers/streaming-safe-locators";

/**
 * 管理画面 RBAC 境界 — VIEWER role は read だけ通ることの確認 (E2E-P2-05)
 *
 * 目的:
 *   security-reaudit で修正した `searchCustomersAction` の RBAC bypass
 *   (project_security-reaudit-2026-06-15 memo) の回帰防止を含む、
 *   VIEWER role は「read は通るが write の入口には到達できない」ことの境界確認。
 *
 * ## 2 層あり、ここが見るのは page 層
 *
 * - **page 層** — 新規作成・編集フォームは `require*CreatePage()` /
 *   `require*EditPage()` が `notFound()` を投げる。ストリーミング下では
 *   `redirect()` が meta refresh に劣化するので `notFound()` を使う設計で、
 *   **実ブラウザでしか確かめられない**（`(dashboard)/queries/_helpers.ts`）
 * - **action 層** — `executeAdminMutationResult` → `checkPermission` が
 *   `${resource}の${action}権限がありません` を返す。こちらは
 *   `__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts`
 *   がラッパーを mock せずに role=VIEWER で end-to-end 検証している
 *
 * かつてこの spec は page 層が無かった時代の設計で、`/admin/customers/new` を
 * 開いてフォームを submit し、action 層の拒否 alert を待っていた。page guard が
 * 入った日（#2526）の nightly が即座に赤くなり、その形は成立しなくなった
 * （run 32657146464）。page 層は E2E でしか見られず、action 層は integration が
 * 既に持っているので、**E2E は page 層だけを見る**。
 *
 * 実現方式:
 *   `chromium-admin-viewer` project が `x-e2e-admin-identity: viewer` ヘッダーを
 *   全リクエストに付け、専用の VIEWER ユーザー (`e2e-viewer@example.com`) として
 *   解決される (`src/shared/domain/admin-auth/e2e-identity.ts`)。
 *
 *   **共有 User 行の role を書き換えない**のがこの spec の要点。旧実装は
 *   `setAdminRoleForE2E("VIEWER")` で IAP 模擬 identity を降格し afterAll で戻して
 *   いたが、`fullyParallel: true` + 2 workers の下で他 admin spec に漏れ、
 *   `settings.spec.ts` の `settings:manage` カードが消える / 本 spec の拒否が
 *   出ない、という双方向の偽陽性を出していた (CI run 30577092619)。
 *   role が固定になったため `test.describe.configure({ mode: "serial" })` も不要。
 *
 * 前提:
 *   - VIEWER は DASHBOARD_ROLES に含まれるため `/admin/*` の read ページには
 *     アクセスできる (`src/shared/lib/admin-roles.ts`)。write フォームだけが
 *     `require*CreatePage()` / `require*EditPage()` で弾かれる。
 *   - ユーザーは `scripts/e2e/ensure-admin-user.ts` が upsert する。
 */

test.describe("管理画面 RBAC — VIEWER role は read だけ通る", () => {
  test("VIEWER は /admin/customers の read (一覧ページ) を表示できる", async ({
    page,
  }) => {
    // VIEWER は customer:read 権限を持つ (`src/shared/lib/admin-permissions.ts` の
    // ROLE_PERMISSIONS)。ページ遷移 + 一覧見出しが表示できることを健全性チェックとして確認する。
    await page.goto(urls.adminCustomers);
    await expect(
      page.getByRole("heading", { name: "顧客管理", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("VIEWER は 設定トップで settings:manage カードを見られない", async ({
    page,
  }) => {
    // VIEWER は settings:read のみを持つため、`requiredPermission` 付きカード
    // (機能モジュール / 課金・決済 / 外部連携 / システム管理) は描画されない。
    // SUPER_ADMIN 前提の settings.spec.ts と対になる境界確認。
    await page.goto(urls.adminSettings);

    await expect(
      page.getByRole("heading", { name: "設定", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      visibleBySelector(page, 'a[href="/admin/settings/site"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/admin/settings/features"]'),
    ).toHaveCount(0);
    await expect(page.locator('a[href="/admin/settings/billing"]')).toHaveCount(
      0,
    );
  });

  test("VIEWER は 顧客新規作成ページ (customer:create) に到達できない", async ({
    page,
  }) => {
    // `requireCustomerCreatePage()` が `notFound()` を投げ、`(dashboard)/not-found.tsx`
    // が**その場に**描画される。遷移ではないので URL は /new のまま。
    await page.goto(urls.adminCustomers + "/new");

    await expect(
      page.getByRole("heading", { name: "ページが見つかりません", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    // フォームが 1 度も描かれないこと（streaming で先に出て後から差し替わる、
    // という劣化の形だと input が一瞬掴めてしまう）。
    await expect(
      page.getByRole("heading", { name: "新規顧客", level: 1 }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/customers\/new$/u);
  });
});
