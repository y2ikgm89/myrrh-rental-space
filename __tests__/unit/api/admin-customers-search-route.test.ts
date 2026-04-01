import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockSearchCustomers = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  searchCustomers: (...args: Parameters<typeof mockSearchCustomers>) =>
    mockSearchCustomers(...args),
}));

// @/shared/lib/route-responses はモック不要（server-only 依存なし）

const { GET } = await import("@/app/(admin)/admin/api/customers/search/route");

describe("GET /admin/api/customers/search", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockSearchCustomers.mockReset();
  });

  describe("正常系", () => {
    test("2文字以上のクエリで顧客を返す", async () => {
      const mockCustomers = [
        {
          id: "cust-1",
          lastName: "田中",
          firstName: "太郎",
          email: "tanaka@example.com",
        },
      ];
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });
      mockSearchCustomers.mockResolvedValue(mockCustomers);

      const response = await GET(
        new Request("http://localhost/admin/api/customers/search?q=田中"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(mockCustomers);
      expect(mockSearchCustomers).toHaveBeenCalledWith("田中");
    });

    test("クエリが1文字以下の場合は空配列を返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });

      const response = await GET(
        new Request("http://localhost/admin/api/customers/search?q=田"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual([]);
      expect(mockSearchCustomers).not.toHaveBeenCalled();
    });

    test("クエリパラメータがない場合は空配列を返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });

      const response = await GET(
        new Request("http://localhost/admin/api/customers/search"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual([]);
      expect(mockSearchCustomers).not.toHaveBeenCalled();
    });

    test("空のクエリ文字列の場合は空配列を返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });

      const response = await GET(
        new Request("http://localhost/admin/api/customers/search?q="),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual([]);
      expect(mockSearchCustomers).not.toHaveBeenCalled();
    });

    test("checkPermission に customer:read を渡す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });
      mockSearchCustomers.mockResolvedValue([]);

      const request = new Request(
        "http://localhost/admin/api/customers/search?q=テスト",
      );
      await GET(request);

      expect(mockCheckPermission).toHaveBeenCalledWith(
        "customer",
        "read",
        expect.any(Headers),
      );
    });

    test("クエリの前後スペースをトリムして検索する", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });
      mockSearchCustomers.mockResolvedValue([]);

      const response = await GET(
        new Request(
          "http://localhost/admin/api/customers/search?q=%20%E7%94%B0%E4%B8%AD%20",
        ),
      );

      expect(response.status).toBe(200);
      expect(mockSearchCustomers).toHaveBeenCalledWith("田中");
    });
  });

  describe("異常系", () => {
    test("権限エラーは 403 を返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: false,
        error: { success: false, error: "customerのread権限がありません" },
      });

      const response = await GET(
        new Request("http://localhost/admin/api/customers/search?q=田中"),
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({ error: "customerのread権限がありません" });
      expect(mockSearchCustomers).not.toHaveBeenCalled();
    });

    test("255文字を超えるクエリはバリデーションエラーを返す", async () => {
      mockCheckPermission.mockResolvedValue({
        success: true,
        user: { id: "admin-user", role: "ADMIN" },
      });

      const longQuery = "a".repeat(256);
      const response = await GET(
        new Request(
          `http://localhost/admin/api/customers/search?q=${longQuery}`,
        ),
      );

      expect(response.status).toBe(400);
      expect(mockSearchCustomers).not.toHaveBeenCalled();
    });
  });
});
