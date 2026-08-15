import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../fixtures/users";

/** 権限拒否は `notFound()`（その場に 404 境界を描画）で表現される。
 *  旧実装の `redirect("/admin")` は streaming 下で meta タグに劣化するため廃止。 */
let notFoundCalls = 0;
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
const mockRecordPermissionDenied = mock(async () => {});
const mockHeaders = mock(async () => new Headers());
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

mock.module("next/navigation", () => ({
  notFound: () => {
    notFoundCalls += 1;
    throw new Error("NOT_FOUND");
  },
}));

mock.module("next/headers", () => ({
  headers: () => mockHeaders(),
}));

mock.module("@/shared/domain/admin-auth/session", () => ({
  verifyAdminSession: () => mockVerifyAdminSession(),
  getCurrentAdminUser: mock(() => Promise.resolve(null)),
  getAdminSession: mock(() => Promise.resolve(null)),
  getAdminSessionUser: () => null,
  isAdmin: mock(() => Promise.resolve(false)),
  isValidRole: () => false,
  adminAuth: {},
  DASHBOARD_ROLES: [],
}));

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mock(() => Promise.resolve(null)),
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
  customerAuth: {},
}));

// `@/shared/lib/admin-role-guards` / `@/shared/domain/admin-auth/resource-access`
// は mock しない。`isEditorRole` / `userHasResourceAccess` を実物で通さないと
// `requireAdminResourcePermission` の resource scope 判定（EDITOR の割当検査）が
// 観測できなくなる。DB 境界の `getAssignedPageIdsForUser` だけを差し替える
// （export はこの 1 本だけなので完全置換で安全）。
mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));

// `@/shared/lib/admin-permissions` は mock しない。`hasPermission` は
// ROLE_PERMISSIONS だけを見る純粋関数で、mock すると
// `requireAdminPermission` が `action` をどう使うかが観測できなくなる。

mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

const { requireAdminPermission, requireAdminResourcePermission } =
  await import("@/admin/queries/_helpers");

describe("admin query helpers", () => {
  beforeEach(() => {
    notFoundCalls = 0;
    mockVerifyAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
    mockHeaders.mockReset();
    mockGetAssignedPageIdsForUser.mockReset();

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    mockRecordPermissionDenied.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
    mockGetAssignedPageIdsForUser.mockResolvedValue([]);
  });

  test("権限がある場合は user を返す", async () => {
    const user = await requireAdminPermission("page", "read");
    expect(user.id).toBe(ADMIN_USER.id);
    expect(notFoundCalls).toBe(0);
  });

  test("action 引数が判定に効く — VIEWER は settings:read を通り settings:manage で拒否される", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);

    const user = await requireAdminPermission("settings", "read");
    expect(user.id).toBe(VIEWER_USER.id);
    expect(notFoundCalls).toBe(0);

    await expect(requireAdminPermission("settings", "manage")).rejects.toThrow(
      "NOT_FOUND",
    );

    expect(notFoundCalls).toBe(1);
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "settings",
      "manage",
    );
  });

  test("権限がない場合は notFound() で拒否して deny を記録する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);

    await expect(requireAdminPermission("auditLog", "read")).rejects.toThrow(
      "NOT_FOUND",
    );

    expect(notFoundCalls).toBe(1);
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "auditLog",
      "read",
    );
  });

  test("EDITOR は割当外の page を notFound() で拒否され、割当済みの page は通る", async () => {
    mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);
    mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1"]);

    await expect(
      requireAdminResourcePermission("page", "read", "page-3"),
    ).rejects.toThrow("NOT_FOUND");

    expect(notFoundCalls).toBe(1);
    expect(mockGetAssignedPageIdsForUser).toHaveBeenCalledWith(EDITOR_USER.id);
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      EDITOR_USER.id,
      "page",
      "read",
      "page-3",
    );

    const user = await requireAdminResourcePermission("page", "read", "page-1");

    expect(user.id).toBe(EDITOR_USER.id);
  });
});
