import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../fixtures/users";

/** 権限拒否は `notFound()`（その場に 404 境界を描画）で表現される。
 *  旧実装の `redirect("/admin")` は streaming 下で meta タグに劣化するため廃止。 */
let notFoundCalls = 0;
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
const mockHasPermission = mock(() => true);
const mockIsEditorRole = mock(() => false);
const mockUserHasResourceAccess = mock(async () => true);
const mockRecordPermissionDenied = mock(async () => {});
const mockHeaders = mock(async () => new Headers());

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

mock.module("@/shared/lib/admin-role-guards", () => ({
  isEditorRole: (...args: Parameters<typeof mockIsEditorRole>) =>
    mockIsEditorRole(...args),
}));

mock.module("@/shared/domain/admin-auth/resource-access", () => ({
  userHasResourceAccess: (
    ...args: Parameters<typeof mockUserHasResourceAccess>
  ) => mockUserHasResourceAccess(...args),
}));

mock.module("@/shared/lib/admin-permissions", () => ({
  hasPermission: (...args: Parameters<typeof mockHasPermission>) =>
    mockHasPermission(...args),
}));

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
    mockHasPermission.mockReset();
    mockIsEditorRole.mockReset();
    mockUserHasResourceAccess.mockReset();
    mockRecordPermissionDenied.mockReset();
    mockHeaders.mockReset();

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    mockHasPermission.mockReturnValue(true);
    mockIsEditorRole.mockReturnValue(false);
    mockUserHasResourceAccess.mockResolvedValue(true);
    mockRecordPermissionDenied.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
  });

  test("権限がある場合は user を返す", async () => {
    const user = await requireAdminPermission("page", "read");
    expect(user.id).toBe(ADMIN_USER.id);
    expect(notFoundCalls).toBe(0);
  });

  test("権限がない場合は notFound() で拒否して deny を記録する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    mockHasPermission.mockReturnValue(false);

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

  test("EDITOR の resource scope が外れている場合は notFound() で拒否する", async () => {
    mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);
    mockHasPermission.mockReturnValue(true);
    mockIsEditorRole.mockReturnValue(true);
    mockUserHasResourceAccess.mockResolvedValue(false);

    await expect(
      requireAdminResourcePermission("page", "read", "page-3"),
    ).rejects.toThrow("NOT_FOUND");

    expect(mockUserHasResourceAccess).toHaveBeenCalledWith(
      EDITOR_USER,
      "page",
      "read",
      "page-3",
    );
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      EDITOR_USER.id,
      "page",
      "read",
      "page-3",
    );
  });
});
