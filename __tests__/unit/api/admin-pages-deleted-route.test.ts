import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { Role } from "@/shared/db/enums";

const mockCheckPermission = mock();
const mockGetDeletedPagesListQuery = mock();
const mockGetAssignedPageIdsForUser = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/pages/admin-queries", () => ({
  getDeletedPagesListQuery: (...args: Parameters<typeof mockGetDeletedPagesListQuery>) =>
    mockGetDeletedPagesListQuery(...args),
}));

mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));

const { GET } = await import("@/app/(admin)/admin/api/pages/deleted/route");

describe("GET /admin/api/pages/deleted", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetDeletedPagesListQuery.mockReset();
    mockGetAssignedPageIdsForUser.mockReset();
    mockGetDeletedPagesListQuery.mockResolvedValue([]);
  });

  test("権限エラーは 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "権限がありません" },
    });

    const response = await GET(new Request("http://localhost/admin/api/pages/deleted"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "page",
      "read",
      expect.any(Headers),
    );
    expect(body).toEqual({ error: "権限がありません" });
  });

  test("EDITOR は assigned page ids を使って一覧を絞り込む", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "editor-id", role: Role.EDITOR },
    });
    mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1", "page-2"]);
    mockGetDeletedPagesListQuery.mockResolvedValue([{ id: "page-1", slug: "about" }]);

    const response = await GET(new Request("http://localhost/admin/api/pages/deleted"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetAssignedPageIdsForUser).toHaveBeenCalledWith("editor-id");
    expect(mockGetDeletedPagesListQuery).toHaveBeenCalledWith(["page-1", "page-2"]);
    expect(body).toEqual([{ id: "page-1", slug: "about" }]);
  });
});
