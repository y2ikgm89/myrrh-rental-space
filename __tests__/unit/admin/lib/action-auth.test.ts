import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import type { Action } from "@/shared/lib/admin-resources";
import type { AdminSession } from "@/shared/domain/admin-auth/session";
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../../fixtures/users";

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

const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

// user-page-assignments/queries の export はこの 1 本だけなので完全置換で安全。
// これで `@/shared/db/prisma` が module graph から落ちる。
mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));

const { checkPermission, checkResourceAccess, logAction } =
  await import("@/admin/lib/action-auth");

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

describe("checkResourceAccess", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
    mockGetAssignedPageIdsForUser.mockReset();
  });

  test("EDITOR は割当外の page を拒否され、割当済みの page は通る", async () => {
    mockGetAdminSession.mockResolvedValue({ user: EDITOR_USER });
    mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1"]);

    const denied = await checkResourceAccess("page", "update", "page-2");

    expect(denied).toEqual({
      success: false,
      error: { error: "このリソースへのアクセス権がありません" },
    });
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      EDITOR_USER.id,
      "page",
      "update",
      "page-2",
    );

    const allowed = await checkResourceAccess("page", "update", "page-1");

    expect(allowed.success).toBe(true);
    if (allowed.success) {
      expect(allowed.user.id).toBe(EDITOR_USER.id);
    }
  });
});
