import { test, expect } from "@playwright/test";
import { uniqueEmail, urls } from "../../fixtures";

/**
 * 管理画面 RBAC 境界 — VIEWER role による write server action の block 確認 (E2E-P2-05)
 *
 * 目的:
 *   security-reaudit で修正した `searchCustomersAction` の RBAC bypass
 *   (project_security-reaudit-2026-06-15 memo) の回帰防止を含む、
 *   VIEWER role は「read は通るが write は拒否される」ことの境界確認。
 *   admin mutation は `executeAdminMutationResult` → `checkPermission` を
 *   通り、拒否時は `${resource}の${action}権限がありません` を返す契約
 *   (`src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`)。
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
 *   - VIEWER は DASHBOARD_ROLES に含まれるため `/admin/*` のページ自体には
 *     アクセスできる (`src/shared/lib/admin-roles.ts`)。ページ遷移は成功し、
 *     write server action の呼び出しのみが `checkPermission` で拒否される。
 *   - ユーザーは `scripts/e2e/ensure-admin-user.ts` が upsert する。
 */

test.describe("管理画面 RBAC — VIEWER role は write action を block される", () => {
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
    await expect(page.locator('a[href="/admin/settings/site"]')).toBeVisible();
    await expect(
      page.locator('a[href="/admin/settings/features"]'),
    ).toHaveCount(0);
    await expect(page.locator('a[href="/admin/settings/billing"]')).toHaveCount(
      0,
    );
  });

  test("VIEWER は 顧客新規作成 (customer:create) を submit しても block される", async ({
    page,
  }) => {
    // /admin/customers/new は dashboard 全ロールが到達できるルート
    // (VIEWER は customer:create 権限は無いが page level guard は無い)。
    // フォームは client-side Zod 検証を通過してから server action `createCustomer`
    // を呼び、`executeAdminMutationResult` → `checkPermission("customer", "create")`
    // が false を返して `submission.reply({ formErrors: ["customerのcreate権限がありません"] })`
    // を返す。これが CustomerForm 末尾の `role="alert"` エラー領域に表示される。
    await page.goto(urls.adminCustomers + "/new");

    await expect(
      page.getByRole("heading", { name: "新規顧客", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // 必須項目のみ埋める (lastName / firstName / email)。email は onBlur の
    // duplicate check で警告出るのを避けるため一意生成する。ラベルは
    // `<Label>姓 <span>*</span></Label>` のため accessible name は "姓 *"。
    // hydration 完了前に fill すると conform が入力を拾わず、submit が
    // client-side Zod で弾かれる（"Invalid input: expected string, received undefined"）。
    // その場合 server action まで到達しないので、本題である権限拒否 alert が出ない
    // （run 30595374008 の失敗）。
    //
    // `toHaveValue` は fill が DOM を書き換えた時点で通ってしまい hydration の
    // 証拠にならない。Radix Select は **client 側でしか開かない** ので、
    // 区分 combobox が listbox を開けることをもって React ハンドラの接続を確認する。
    const customerType = page.getByRole("combobox", { name: "区分" });
    await customerType.click();
    await expect(page.getByRole("option", { name: "個人" })).toBeVisible({
      timeout: 15000,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option", { name: "個人" })).toHaveCount(0);

    const emailValue = uniqueEmail("rbac-viewer");
    await page.getByLabel("姓 *", { exact: true }).fill("権限");
    await page.getByLabel("名 *", { exact: true }).fill("テスト");
    await page.getByLabel("メールアドレス *", { exact: true }).fill(emailValue);

    await page.getByRole("button", { name: "顧客を作成" }).click();

    // executeConformMutation は `submission.reply({ formErrors: [error] })` で
    // 返すため、CustomerForm 末尾の `role="alert"` 領域にエラー文言が入る。
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "権限がありません" });
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert).toContainText("customer");
    await expect(alert).toContainText("create");

    // 権限拒否のため /admin/customers への遷移は発生しない (success 時のみ
    // `router.push("/admin/customers")` される)。URL が /new のままであることを確認する。
    await expect(page).toHaveURL(/\/admin\/customers\/new$/u);
  });
});
