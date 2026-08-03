import { Role } from "../../generated/prisma/enums";
import { testUsers } from "../../e2e/fixtures";
import { withScript } from "../_shared/script-prisma";

/**
 * IAP 模擬経路が解決する admin identity を upsert する。
 *
 * 既定 identity（`ADMIN_TEST_IAP_EMAIL`）は SUPER_ADMIN、`x-e2e-admin-identity`
 * ヘッダーで選択される追加 identity は固定 role で作る。**role は実行時に
 * 書き換えない**（旧 `set-admin-role.ts` は共有 User 行を mutate して
 * fullyParallel な spec 間に漏れていたため廃止した）。
 *
 * ラベル → email の SSoT は `src/shared/domain/admin-auth/e2e-identity.ts`。
 * ここは server-only を跨がずに済むよう email を直接持つ。両者がずれたら
 * `__tests__/unit/architecture/e2e-admin-identity-sync.test.ts` が fail する。
 */
const E2E_ADMIN_USERS = [
  {
    email: testUsers.admin.email,
    name: testUsers.admin.name,
    role: Role.SUPER_ADMIN,
  },
  {
    email: "e2e-viewer@example.com",
    name: "E2E Viewer",
    role: Role.VIEWER,
  },
] as const;

await withScript("ensure-admin-user", async (prisma) => {
  await prisma.$transaction(async (tx) => {
    for (const adminUser of E2E_ADMIN_USERS) {
      const user = await tx.user.upsert({
        where: { email: adminUser.email },
        update: {
          name: adminUser.name,
          role: adminUser.role,
          emailVerified: true,
        },
        create: {
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          emailVerified: true,
        },
        select: { id: true },
      });

      await tx.account.deleteMany({
        where: {
          userId: user.id,
          providerId: "credential",
        },
      });
    }
  });
});
