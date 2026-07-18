/**
 * E2E: IAP 模擬管理者 (superadmin@example.com) の role を任意の DashboardRole
 * に切り替える。RBAC 境界テスト (`e2e/authenticated/admin/rbac-viewer-write-blocked.spec.ts`)
 * が VIEWER ↔ SUPER_ADMIN の swap に使う。
 *
 * 使い方:
 *   bun scripts/e2e/set-admin-role.ts VIEWER
 *   bun scripts/e2e/set-admin-role.ts SUPER_ADMIN
 *
 * seed / ensure-admin-user と同じ email (`testUsers.admin.email`) を対象にすることで、
 * IAP 模擬経路 (`ADMIN_TEST_IAP_EMAIL`) から解決される identity の role のみを
 * 差し替える。ensure-admin-user が先に user を upsert している前提。
 */

import { Role } from "../../generated/prisma/enums";
import { testUsers } from "../../e2e/fixtures";
import { withScript } from "../_shared/script-prisma";

const DASHBOARD_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
];

const roleArg = process.argv[2];
if (!roleArg) {
  console.error(
    "❌ role argument is required. Usage: bun scripts/e2e/set-admin-role.ts <SUPER_ADMIN|ADMIN|EDITOR|VIEWER>",
  );
  process.exit(1);
}

if (!DASHBOARD_ROLES.includes(roleArg as Role)) {
  console.error(
    `❌ invalid role: "${roleArg}". Expected one of: ${DASHBOARD_ROLES.join(", ")}`,
  );
  process.exit(1);
}

const targetRole = roleArg as Role;

await withScript("set-admin-role", async (prisma) => {
  await prisma.user.upsert({
    where: { email: testUsers.admin.email },
    update: {
      role: targetRole,
      emailVerified: true,
    },
    create: {
      email: testUsers.admin.email,
      name: testUsers.admin.name,
      role: targetRole,
      emailVerified: true,
    },
    select: { id: true },
  });
});
