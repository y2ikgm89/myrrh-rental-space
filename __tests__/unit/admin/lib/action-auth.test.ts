import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import type { Action } from "@/shared/lib/admin-resources";
import type { AdminSession } from "@/shared/domain/admin-auth/session";
import { ADMIN_USER, VIEWER_USER } from "../../../fixtures/users";

const mockLogUserAction = mock();
const mockRecordPermissionDenied = mock();

mock.module("@/admin/lib/audit", () => ({
  logUserAction: (...args: Parameters<typeof mockLogUserAction>) =>
    mockLogUserAction(...args),
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

// `mock.module` は完全置換。session module は `getAdminSessionUser` 等も
// graph 内で使われるため実モジュールを spread し、認証境界の `getAdminSession`
// だけ差し替える (.claude/rules/testing.md)。
// `getAdminSessionUser` / `canAccessAdmin` / `hasPermission` は実物を通す —
// checkPermission が ROLE_PERMISSIONS を実際に評価することを固定するため。
const actualSession = await import("@/shared/domain/admin-auth/session");

const mockGetAdminSession = mock(
  async (): Promise<AdminSession | null> => null,
);

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  getAdminSession: (...args: Parameters<typeof mockGetAdminSession>) =>
    mockGetAdminSession(...args),
}));

const { checkPermission, logAction } = await import("@/admin/lib/action-auth");

describe("logAction", () => {
  beforeEach(() => {
    mockLogUserAction.mockReset();
    mockLogUserAction.mockResolvedValue(undefined);
  });

  test.each<[Action, AuditAction]>([
    ["create", AuditAction.CREATE],
    ["read", AuditAction.READ],
    ["update", AuditAction.UPDATE],
    ["delete", AuditAction.DELETE],
    ["publish", AuditAction.PUBLISH],
    ["manage", AuditAction.MANAGE],
  ])(
    "maps %s permission action to AuditAction.%s",
    async (action, auditAction) => {
      await logAction("user-1", action, "auditLog", "resource-1");

      expect(mockLogUserAction).toHaveBeenCalledWith(
        { id: "user-1" },
        auditAction,
        "auditLog",
        "resource-1",
      );
    },
  );
});

describe("checkPermission", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
  });

  test("dashboard role を持っていても ROLE_PERMISSIONS に無い権限は拒否する", async () => {
    mockGetAdminSession.mockResolvedValue({ user: VIEWER_USER });

    const denied = await checkPermission("customer", "manage");

    expect(denied).toEqual({
      success: false,
      error: { error: "customerのmanage権限がありません" },
    });
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "customer",
      "manage",
    );

    mockGetAdminSession.mockResolvedValue({ user: ADMIN_USER });

    const allowed = await checkPermission("customer", "manage");

    expect(allowed.success).toBe(true);
    if (allowed.success) {
      expect(allowed.user.id).toBe(ADMIN_USER.id);
    }
  });
});
