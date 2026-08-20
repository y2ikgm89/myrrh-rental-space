import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  ADMIN_USER,
  SUPER_ADMIN_USER,
  VIEWER_USER,
} from "../../../fixtures/users";

/**
 * `page-auth.ts` の各 guard が要求する resource:action を、実 `hasPermission`
 * （`ROLE_PERMISSIONS` の実データ）を通して固定する。
 *
 * ページ側には権限リテラルが無いので、降格変異は必ずこのファイルの実装に現れる。
 * ここが唯一の記述であり、この test が唯一の照合先。
 */
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
const mockRecordPermissionDenied = mock(() => {});
const mockHeaders = mock(async () => new Headers());
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

mock.module("next/headers", () => ({
  headers: () => mockHeaders(),
}));

const actualNextServer = await import("next/server");
mock.module("next/server", () => ({
  ...actualNextServer,
  connection: async () => undefined,
}));

// `mock.module` は完全置換。session module は実モジュールを spread し、認証境界の
// `verifyAdminSession` だけ差し替える (.claude/rules/testing.md)。
const actualSession = await import("@/shared/domain/admin-auth/session");

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  verifyAdminSession: () => mockVerifyAdminSession(),
}));

const actualResourceAccess =
  await import("@/shared/domain/admin-auth/resource-access");
const actualUserHasResourceAccess = actualResourceAccess.userHasResourceAccess;
const mockUserHasResourceAccess = mock(
  (...args: Parameters<typeof actualUserHasResourceAccess>) =>
    actualUserHasResourceAccess(...args),
);
mock.module("@/shared/domain/admin-auth/resource-access", () => ({
  ...actualResourceAccess,
  userHasResourceAccess: mockUserHasResourceAccess,
}));

// `@/shared/lib/admin-permissions` は mock しない。mock すると各 guard が
// どの resource:action を渡しているかが観測できなくなり、このファイルの目的が消える。
mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));

mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

const {
  requireAuditLogListPage,
  requireCouponCreatePage,
  requireSettingsManagePage,
  requireSettingsPage,
  requireStaffDetailPage,
  requireStaffListPage,
} = await import("@/admin/helpers/page-auth");

describe("page-auth の guard が要求する権限", () => {
  beforeEach(() => {
    mockVerifyAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
    mockGetAssignedPageIdsForUser.mockReset();
    mockUserHasResourceAccess.mockClear();
    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    mockGetAssignedPageIdsForUser.mockResolvedValue([]);
  });

  // VIEWER は auditLog を 1 つも持たない（admin-permissions.ts:258-277）。
  // `"page"` へ降格すると VIEWER は `page:read` を持つので通ってしまう。
  // allow 側は SUPER_ADMIN_USER を使う — `auditLog:*` は SUPER_ADMIN 専用で
  // ADMIN も持たない（admin-permissions.ts:101-102）。
  test("requireAuditLogListPage は auditLog:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireAuditLogListPage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "auditLog",
      "read",
      // authorizeAdmin（RBAC 判定の単一サイト）は resourceId 無しでも
      // 4 引数で記録する。第 4 引数は undefined で、監査内容は 3 引数と同じ。
      undefined,
    );

    mockVerifyAdminSession.mockResolvedValue(SUPER_ADMIN_USER);
    await expect(requireAuditLogListPage()).resolves.toMatchObject({
      id: SUPER_ADMIN_USER.id,
    });
  });

  // VIEWER は user 系を持たない。
  test("requireStaffListPage は user:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireStaffListPage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "user",
      "read",
      undefined,
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireStaffListPage()).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });

  test("requireStaffDetailPage は user:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireStaffDetailPage("staff-1")).rejects.toThrow(
      "NOT_FOUND",
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireStaffDetailPage("staff-1")).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });

  test("requireStaffDetailPage は userId を resource scope 検査へ渡す", async () => {
    await requireStaffDetailPage("staff-1");
    expect(mockUserHasResourceAccess).toHaveBeenCalledWith(
      ADMIN_USER,
      "user",
      "read",
      "staff-1",
    );
  });

  // 作成フォームなので read ではなく create。VIEWER は coupon を 1 つも持たない
  // ため、read / create のどちらでも拒否される。ADMIN は両方を持つ。
  // よってこの test は「coupon を要求している」ことまでを固定し、
  // create か read かは Step 4 の変異検査で確かめる。
  test("requireCouponCreatePage は coupon 権限を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireCouponCreatePage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "coupon",
      "create",
      undefined,
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireCouponCreatePage()).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });

  // VIEWER は settings:read を持ち settings:manage を持たない
  // （admin-permissions.ts:271）。この 2 本が read / manage を割る唯一の観測点。
  test("requireSettingsPage は settings:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireSettingsPage()).resolves.toMatchObject({
      id: VIEWER_USER.id,
    });
  });

  test("requireSettingsManagePage は settings:manage を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireSettingsManagePage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "settings",
      "manage",
      undefined,
    );

    // allow 側は SUPER_ADMIN_USER を使う — `settings:manage` は SUPER_ADMIN
    // 専用で ADMIN は `settings:read` / `settings:update` まで
    // （admin-permissions.ts:96, 203-204）。
    mockVerifyAdminSession.mockResolvedValue(SUPER_ADMIN_USER);
    await expect(requireSettingsManagePage()).resolves.toMatchObject({
      id: SUPER_ADMIN_USER.id,
    });
  });
});
