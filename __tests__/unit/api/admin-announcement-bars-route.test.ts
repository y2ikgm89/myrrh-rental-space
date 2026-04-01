import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetAnnouncementBars = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/settings/announcement-bar", () => ({
  getAnnouncementBars: (...args: Parameters<typeof mockGetAnnouncementBars>) =>
    mockGetAnnouncementBars(...args),
}));

// @/shared/lib/route-responses はモック不要（server-only 依存なし）

const { GET } = await import("@/app/(admin)/admin/api/announcement-bars/route");

describe("GET /admin/api/announcement-bars", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetAnnouncementBars.mockReset();
  });

  describe("正常系", () => {
    test("アナウンスバー一覧を items と total で返す", async () => {
      const mockBars = [
        { id: "bar-1", message: "お知らせ1", isActive: true },
        { id: "bar-2", message: "お知らせ2", isActive: false },
      ];
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });
      mockGetAnnouncementBars.mockResolvedValue(mockBars);

      const response = await GET(
        new Request("http://localhost/admin/api/announcement-bars"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ items: mockBars, total: 2 });
    });

    test("空配列の場合は total が 0 になる", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });
      mockGetAnnouncementBars.mockResolvedValue([]);

      const response = await GET(
        new Request("http://localhost/admin/api/announcement-bars"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ items: [], total: 0 });
    });

    test("checkPermission に announcementBar:read を渡す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });
      mockGetAnnouncementBars.mockResolvedValue([]);

      const request = new Request(
        "http://localhost/admin/api/announcement-bars",
      );
      await GET(request);

      expect(mockCheckPermission).toHaveBeenCalledWith(
        "announcementBar",
        "read",
        expect.any(Headers),
      );
    });
  });

  describe("異常系", () => {
    test("権限エラーは 403 を返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: false,
        error: {
          success: false,
          error: "announcementBarのread権限がありません",
        },
      });

      const response = await GET(
        new Request("http://localhost/admin/api/announcement-bars"),
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({ error: "announcementBarのread権限がありません" });
      expect(mockGetAnnouncementBars).not.toHaveBeenCalled();
    });

    test("権限エラー時は getAnnouncementBars を呼び出さない", async () => {
      mockCheckPermission.mockResolvedValue({
        success: false,
        error: { success: false, error: "権限がありません" },
      });

      await GET(new Request("http://localhost/admin/api/announcement-bars"));

      expect(mockGetAnnouncementBars).not.toHaveBeenCalled();
    });
  });
});
