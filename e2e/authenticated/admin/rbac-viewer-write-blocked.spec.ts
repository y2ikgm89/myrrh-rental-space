import { test, expect } from "@playwright/test";
import { uniqueEmail, urls } from "../../fixtures";
import { ensureAdminUser } from "../../helpers/ensure-admin-user";
import { setAdminRoleForE2E } from "../../helpers/set-admin-role";

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
 *   ADMIN_TEST_IAP_EMAIL 経由の IAP 模擬管理者
 *   (`testUsers.admin.email` = superadmin@example.com) の DB 上の role を
 *   VIEWER に一時的に downgrade し、テスト完了後に SUPER_ADMIN に復元する。
 *   `test.describe.configure({ mode: "serial" })` で file 内直列化しつつ、
 *   afterAll での確実な復元により他 admin spec への影響を最小化する
 *   (Setting singleton mutate の settings.spec.ts と同型の運用)。
 *
 * 前提:
 *   - chromium-admin project (`e2e/authenticated/admin/*.spec.ts`) で実行される。
 *     admin identity は storageState ではなく webServer env `ADMIN_TEST_IAP_EMAIL`
 *     による IAP 模擬で成立する (`.claude/skills/e2e-authoring` Step 3)。
 *   - VIEWER は DASHBOARD_ROLES に含まれるため `/admin/*` のページ自体には
 *     アクセスできる (`src/shared/lib/admin-roles.ts`)。ページ遷移は成功し、
 *     write server action の呼び出しのみが `checkPermission` で拒否される。
 */

test.describe.configure({ mode: "serial" });

test.describe("管理画面 RBAC — VIEWER role は write action を block される", () => {
  test.beforeAll(async () => {
    // superadmin@example.com を確実に upsert してから role を VIEWER に downgrade する。
    // ensureAdminUser は SUPER_ADMIN で upsert するため、その後の setAdminRoleForE2E で
    // role のみ書き換える。
    await ensureAdminUser();
    await setAdminRoleForE2E("VIEWER");
  });

  test.afterAll(async () => {
    // 他 admin spec の期待 (SUPER_ADMIN) に確実に戻す。beforeAll 途中で失敗した
    // ケースでも上書きするだけで安全に復元できる (upsert)。
    await setAdminRoleForE2E("SUPER_ADMIN");
  });

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
    await page.getByLabel("姓 *", { exact: true }).fill("権限");
    await page.getByLabel("名 *", { exact: true }).fill("テスト");
    await page
      .getByLabel("メールアドレス *", { exact: true })
      .fill(uniqueEmail("rbac-viewer"));

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
