import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { createAdminGateToken } from "@/shared/lib/admin-login-gate";

const mockConsumeAdminLoginToken = mock<
  (token: string, usedAt?: Date) => Promise<boolean>
>();

mock.module("@/shared/domain/admin-login-tokens/commands", () => ({
  consumeAdminLoginToken: (token: string, usedAt?: Date) =>
    mockConsumeAdminLoginToken(token, usedAt),
}));

const { GET } = await import("@/app/api/admin/login-tokens/authorize/route");

describe("GET /api/admin/login-tokens/authorize", () => {
  beforeEach(() => {
    mockConsumeAdminLoginToken.mockReset();
  });

  test("有効な署名付き未使用 token を消費して gate cookie を発行する", async () => {
    const nowMs = Date.now();
    const { token } = await createAdminGateToken({
      nowMs,
      nonce: "authorize-route",
    });
    mockConsumeAdminLoginToken.mockResolvedValue(true);

    const response = await GET(
      new NextRequest(
        `https://example.com/api/admin/login-tokens/authorize?token=${token}`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/admin/login",
    );
    expect(response.headers.get("set-cookie")).toContain("admin-gate=1");
    expect(mockConsumeAdminLoginToken).toHaveBeenCalledTimes(1);
    expect(mockConsumeAdminLoginToken.mock.calls[0]?.[0]).toBe(token);
  });

  test("署名形式でない token は 404 にする", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/api/admin/login-tokens/authorize?token=plain-token",
      ),
    );

    expect(response.status).toBe(404);
    expect(mockConsumeAdminLoginToken).not.toHaveBeenCalled();
  });

  test("署名は正しくても未使用トークンとして消費できなければ 404 にする", async () => {
    const nowMs = Date.now();
    const { token } = await createAdminGateToken({
      nowMs,
      nonce: "already-used-token",
    });
    mockConsumeAdminLoginToken.mockResolvedValue(false);

    const response = await GET(
      new NextRequest(
        `https://example.com/api/admin/login-tokens/authorize?token=${token}`,
      ),
    );

    expect(response.status).toBe(404);
    expect(mockConsumeAdminLoginToken).toHaveBeenCalledTimes(1);
  });
});
