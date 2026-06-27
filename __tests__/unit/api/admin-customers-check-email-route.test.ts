import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCheckPermission = mock();
const mockCheckAdminAuth = mock();
const mockFindCustomerByEmailExcept = mock();

mock.module("@/admin/lib/action-auth", () => ({
  checkAdminAuth: (...args: Parameters<typeof mockCheckAdminAuth>) =>
    mockCheckAdminAuth(...args),
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  findCustomerByEmailExcept: (
    ...args: Parameters<typeof mockFindCustomerByEmailExcept>
  ) => mockFindCustomerByEmailExcept(...args),
}));

const { GET } = await import("@/app/api/admin/customers/check-email/route");

describe("GET /api/admin/customers/check-email", () => {
  beforeEach(() => {
    mockCheckAdminAuth.mockReset();
    mockCheckPermission.mockReset();
    mockFindCustomerByEmailExcept.mockReset();
  });

  test("customer:read 権限を確認してからメール重複を検索する", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user", role: "ADMIN" },
    });
    mockCheckAdminAuth.mockResolvedValue({
      success: true,
      user: { id: "admin-user", role: "ADMIN" },
    });
    mockFindCustomerByEmailExcept.mockResolvedValue(null);

    const request = new Request(
      "http://localhost/api/admin/customers/check-email?email=test@example.com",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: true });
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "customer",
      "read",
      expect.any(Headers),
    );
    expect(mockFindCustomerByEmailExcept).toHaveBeenCalledWith(
      "test@example.com",
      undefined,
    );
  });

  test("customer:read 権限がない場合は検索せず 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { error: "customerのread権限がありません" },
    });
    mockCheckAdminAuth.mockResolvedValue({
      success: true,
      user: { id: "admin-user", role: "ADMIN" },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/customers/check-email?email=test@example.com",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "customerのread権限がありません" });
    expect(mockFindCustomerByEmailExcept).not.toHaveBeenCalled();
  });
});
