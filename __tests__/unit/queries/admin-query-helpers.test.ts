import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../fixtures/users";

/** 権限拒否は `notFound()`（その場に 404 境界を描画）で表現される。
 *  旧実装の `redirect("/admin")` は streaming 下で meta タグに劣化するため廃止。 */
let notFoundCalls = 0;
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
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

// `mock.module` は完全置換。session module は実モジュールを spread し、
// 認証境界の `verifyAdminSession` だけ差し替える (.claude/rules/testing.md)。
const actualSession = await import("@/shared/domain/admin-auth/session");

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  verifyAdminSession: () => mockVerifyAdminSession(),
}));

// `@/shared/lib/admin-permissions` / `@/shared/lib/admin-role-guards` /
// `@/shared/domain/admin-auth/resource-access` は mock しない。predicate を
// mock すると requireAdmin(Resource)Permission の分岐が観測できない
// （第6次監査の残件: 旧実装は両者を mock しており deny テストが配線テスト化
// していた）。代わりに真の DB 境界である user-page-assignments/queries だけを
// 差し替える（export は getAssignedPageIdsForUser 1 本のみ。prisma が graph
// から落ちる）。
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

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
      // authorizeAdmin（RBAC 判定の単一サイト）は resourceId 無しでも
      // 4 引数で記録する。第 4 引数は undefined で、監査内容は 3 引数と同じ。
      undefined,
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
      undefined,
    );
  });

  test("EDITOR は割当済み page を通り、割当外は notFound() で拒否して deny を記録する", async () => {
    mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);
    mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1"]);

    const user = await requireAdminResourcePermission("page", "read", "page-1");
    expect(user.id).toBe(EDITOR_USER.id);
    expect(notFoundCalls).toBe(0);

    await expect(
      requireAdminResourcePermission("page", "read", "page-2"),
    ).rejects.toThrow("NOT_FOUND");

    expect(notFoundCalls).toBe(1);
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      EDITOR_USER.id,
      "page",
      "read",
      "page-2",
    );
  });

  test("EDITOR は resourceId 無しなら assignment 検査なしで許可される（list page 形）", async () => {
    mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);

    const user = await requireAdminResourcePermission("page", "read");

    expect(user.id).toBe(EDITOR_USER.id);
    expect(notFoundCalls).toBe(0);
    expect(mockGetAssignedPageIdsForUser).not.toHaveBeenCalled();
  });

  test("ADMIN は resourceId 付きでも assignment 検査にかからない", async () => {
    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);

    const user = await requireAdminResourcePermission("page", "read", "page-9");

    expect(user.id).toBe(ADMIN_USER.id);
    expect(notFoundCalls).toBe(0);
    expect(mockGetAssignedPageIdsForUser).not.toHaveBeenCalled();
  });
});
