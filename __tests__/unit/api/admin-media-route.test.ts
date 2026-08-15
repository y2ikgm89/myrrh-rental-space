import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetMediaListQuery = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
  logAction: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/media/queries", () => ({
  getMediaListQuery: (...args: Parameters<typeof mockGetMediaListQuery>) =>
    mockGetMediaListQuery(...args),
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    ADMIN_APP_URL: "http://localhost:3000",
    BETTER_AUTH_URL: undefined,
  },
}));

mock.module("@/shared/lib/constants/urls", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

const mediaRoute = await import("@/app/(admin)/admin/api/media/route");
const { GET } = mediaRoute;

describe("admin media route", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetMediaListQuery.mockReset();
  });

  test("GET のバリデーションエラーは最初の error だけを返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });

    const response = await GET(
      new Request("http://localhost/admin/api/media?page=0"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(mockCheckPermission).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ error: "ページ番号は1以上で入力してください" });
  });

  test("GET の権限エラーは { error } で返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "mediaのread権限がありません" },
    });

    const response = await GET(
      new Request("http://localhost/admin/api/media?page=1&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "mediaのread権限がありません" });
  });

  test("アップロード POST は export しない（Server Action に一本化）", () => {
    expect("POST" in mediaRoute).toBe(false);
  });
});
