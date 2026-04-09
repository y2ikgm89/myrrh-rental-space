import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../fixtures/users";

const redirectCalls: string[] = [];
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
const mockHasPermission = mock(() => true);
const mockIsEditorRole = mock(() => false);
const mockUserHasResourceAccess = mock(async () => true);
const mockLogPermissionDenied = mock(async () => {});
const mockHeaders = mock(async () => new Headers());

mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    redirectCalls.push(path);
    throw new Error(`REDIRECT:${path}`);
  },
}));

mock.module("next/headers", () => ({
  headers: () => mockHeaders(),
}));

mock.module("@/shared/lib/admin-auth", () => ({
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

mock.module("@/admin/lib/permissions", () => ({
  hasPermission: (...args: Parameters<typeof mockHasPermission>) =>
    mockHasPermission(...args),
  isEditorRole: (...args: Parameters<typeof mockIsEditorRole>) =>
    mockIsEditorRole(...args),
  userHasResourceAccess: (
    ...args: Parameters<typeof mockUserHasResourceAccess>
  ) => mockUserHasResourceAccess(...args),
}));

mock.module("@/admin/lib/audit", () => ({
  logPermissionDenied: (...args: Parameters<typeof mockLogPermissionDenied>) =>
    mockLogPermissionDenied(...args),
}));

const { requireAdminPermission, requireAdminResourcePermission } =
  await import("@/admin/queries/_helpers");

describe("admin query helpers", () => {
  beforeEach(() => {
    redirectCalls.length = 0;
    mockVerifyAdminSession.mockReset();
    mockHasPermission.mockReset();
    mockIsEditorRole.mockReset();
    mockUserHasResourceAccess.mockReset();
    mockLogPermissionDenied.mockReset();
    mockHeaders.mockReset();

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    mockHasPermission.mockReturnValue(true);
    mockIsEditorRole.mockReturnValue(false);
    mockUserHasResourceAccess.mockResolvedValue(true);
    mockLogPermissionDenied.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
  });

  test("権限がある場合は user を返す", async () => {
    const user = await requireAdminPermission("page", "read");
    expect(user.id).toBe(ADMIN_USER.id);
    expect(redirectCalls).toHaveLength(0);
  });

  test("権限がない場合は /admin へ redirect して deny を記録する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    mockHasPermission.mockReturnValue(false);

    await expect(requireAdminPermission("auditLog", "read")).rejects.toThrow(
      "REDIRECT:/admin",
    );

    expect(redirectCalls).toEqual(["/admin"]);
    expect(mockLogPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "auditLog",
      "read",
    );
  });

  test("EDITOR の resource scope が外れている場合は redirect する", async () => {
    mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);
    mockHasPermission.mockReturnValue(true);
    mockIsEditorRole.mockReturnValue(true);
    mockUserHasResourceAccess.mockResolvedValue(false);

    await expect(
      requireAdminResourcePermission("page", "read", "page-3"),
    ).rejects.toThrow("REDIRECT:/admin");

    expect(mockUserHasResourceAccess).toHaveBeenCalledWith(
      EDITOR_USER,
      "page",
      "read",
      "page-3",
    );
    expect(mockLogPermissionDenied).toHaveBeenCalledWith(
      EDITOR_USER.id,
      "page",
      "read",
      "page-3",
    );
  });
});
