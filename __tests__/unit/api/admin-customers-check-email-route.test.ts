import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCheckPermission = mock();
const mockFindCustomerByEmailExcept = mock();
const mockFindGuestCustomerByEmailExcept = mock();

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  findCustomerByEmailExcept: (
    ...args: Parameters<typeof mockFindCustomerByEmailExcept>
  ) => mockFindCustomerByEmailExcept(...args),
  findGuestCustomerByEmailExcept: (
    ...args: Parameters<typeof mockFindGuestCustomerByEmailExcept>
  ) => mockFindGuestCustomerByEmailExcept(...args),
}));

const { GET } = await import("@/app/api/admin/customers/check-email/route");

describe("GET /api/admin/customers/check-email", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockFindCustomerByEmailExcept.mockReset();
    mockFindGuestCustomerByEmailExcept.mockReset();
  });

  test("customer:read 権限を確認してからメール重複候補を検索する", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user", role: "ADMIN" },
    });
    mockFindCustomerByEmailExcept.mockResolvedValue(null);
    mockFindGuestCustomerByEmailExcept.mockResolvedValue(null);

    const request = new Request(
      "http://localhost/api/admin/customers/check-email?email=test@example.com",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      duplicateCandidate: false,
      unlinkedDuplicateCandidate: false,
    });
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "customer",
      "read",
      expect.any(Headers),
    );
    expect(mockFindCustomerByEmailExcept).toHaveBeenCalledWith(
      "test@example.com",
      undefined,
    );
    expect(mockFindGuestCustomerByEmailExcept).toHaveBeenCalledWith(
      "test@example.com",
      undefined,
    );
  });

  test("同じ canonical email の未リンク顧客候補を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user", role: "ADMIN" },
    });
    mockFindCustomerByEmailExcept.mockResolvedValue({
      id: "customer-1",
      userId: null,
    });
    mockFindGuestCustomerByEmailExcept.mockResolvedValue({ id: "customer-1" });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/customers/check-email?email=test@example.com&excludeId=550e8400-e29b-41d4-a716-446655440000",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      duplicateCandidate: true,
      unlinkedDuplicateCandidate: true,
    });
    expect(mockFindCustomerByEmailExcept).toHaveBeenCalledWith(
      "test@example.com",
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(mockFindGuestCustomerByEmailExcept).toHaveBeenCalledWith(
      "test@example.com",
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("customer:read 権限がない場合は検索せず 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { error: "customerのread権限がありません" },
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
    expect(mockFindGuestCustomerByEmailExcept).not.toHaveBeenCalled();
  });
});
