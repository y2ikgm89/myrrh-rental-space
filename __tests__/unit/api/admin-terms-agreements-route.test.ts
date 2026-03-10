import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetAdminTermsAgreements = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/terms/admin-queries", () => ({
  getAdminTermsAgreements: (
    ...args: Parameters<typeof mockGetAdminTermsAgreements>
  ) => mockGetAdminTermsAgreements(...args),
}));

const { GET } =
  await import("@/app/(admin)/admin/api/terms/[id]/agreements/route");

describe("GET /admin/api/terms/[id]/agreements", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetAdminTermsAgreements.mockReset();
  });

  test("成功時は legacy wrapper なしで payload を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });
    mockGetAdminTermsAgreements.mockResolvedValue({
      agreements: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          agreedAt: "2026-03-09T00:00:00.000Z",
          version: 3,
          guestName: "山田 花子",
          guestEmail: "guest@example.com",
          userName: null,
          userEmail: null,
          reservationId: "22222222-2222-2222-2222-222222222222",
          ipAddress: "127.0.0.***",
        },
      ],
      total: 1,
    });

    const response = await GET(
      new Request(
        "http://localhost/admin/api/terms/33333333-3333-4333-8333-333333333333/agreements?page=2",
      ),
      {
        params: Promise.resolve({
          id: "33333333-3333-4333-8333-333333333333",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "terms",
      "read",
      expect.any(Headers),
    );
    expect(mockGetAdminTermsAgreements).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      2,
    );
    expect(body).toEqual({
      agreements: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          agreedAt: "2026-03-09T00:00:00.000Z",
          version: 3,
          guestName: "山田 花子",
          guestEmail: "guest@example.com",
          userName: null,
          userEmail: null,
          reservationId: "22222222-2222-2222-2222-222222222222",
          ipAddress: "127.0.0.***",
        },
      ],
      total: 1,
    });
  });

  test("バリデーションエラーは 400 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });

    const response = await GET(
      new Request(
        "http://localhost/admin/api/terms/not-a-uuid/agreements?page=0",
      ),
      {
        params: Promise.resolve({ id: "not-a-uuid" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(mockGetAdminTermsAgreements).not.toHaveBeenCalled();
    expect(body).toEqual({ error: "規約IDが不正です" });
  });

  test("権限エラーは 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "termsのread権限がありません" },
    });

    const response = await GET(
      new Request(
        "http://localhost/admin/api/terms/33333333-3333-4333-8333-333333333333/agreements?page=1",
      ),
      {
        params: Promise.resolve({
          id: "33333333-3333-4333-8333-333333333333",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(mockGetAdminTermsAgreements).not.toHaveBeenCalled();
    expect(body).toEqual({ error: "termsのread権限がありません" });
  });
});
