import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetSpacesForSelectQuery = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/spaces/queries", () => ({
  getSpacesForSelectQuery: (
    ...args: Parameters<typeof mockGetSpacesForSelectQuery>
  ) => mockGetSpacesForSelectQuery(...args),
}));

const { GET } = await import("@/app/(admin)/admin/api/spaces/select/route");

describe("GET /admin/api/spaces/select", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetSpacesForSelectQuery.mockReset();
  });

  test("成功時は raw payload を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });
    mockGetSpacesForSelectQuery.mockResolvedValue([
      {
        id: "space-1",
        slug: "main-hall",
        name: "Main Hall",
        mainImageUrl: "/spaces/main-hall.jpg",
        hourlyPrice: "8800",
        capacity: 12,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/admin/api/spaces/select"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "space",
      "read",
      expect.any(Headers),
    );
    expect(body).toEqual([
      {
        id: "space-1",
        slug: "main-hall",
        name: "Main Hall",
        mainImageUrl: "/spaces/main-hall.jpg",
        hourlyPrice: "8800",
        capacity: 12,
      },
    ]);
  });

  test("権限エラーは 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "spaceのread権限がありません" },
    });

    const response = await GET(
      new Request("http://localhost/admin/api/spaces/select"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(mockGetSpacesForSelectQuery).not.toHaveBeenCalled();
    expect(body).toEqual({ error: "spaceのread権限がありません" });
  });
});
