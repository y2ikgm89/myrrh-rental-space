import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

process.env["ADMIN_LOGIN_TOKEN"] = "test-admin-login-token-secret-32";

const consumeAdminLoginTokenMock = mock(async (_token: string) => true);

mock.module("server-only", () => ({}));
mock.module("@/shared/domain/admin-login-tokens/commands", () => ({
  consumeAdminLoginToken: consumeAdminLoginTokenMock,
}));

const { GET } = await import("@/app/(admin)/admin/(auth)/login/consume/route");
const { ADMIN_GATE_COOKIE_NAME, createAdminGateToken } =
  await import("@/shared/lib/admin-login-gate");

describe("admin login gate consume route", () => {
  beforeEach(() => {
    consumeAdminLoginTokenMock.mockClear();
  });

  test("token がない場合は 404 を返す", async () => {
    const response = await GET(
      new NextRequest("https://example.com/admin/login/consume"),
    );

    expect(response.status).toBe(404);
    expect(consumeAdminLoginTokenMock).not.toHaveBeenCalled();
  });

  test("署名検証と DB 消費に成功した token は gate cookie を設定して login に戻す", async () => {
    const { token } = await createAdminGateToken();

    const response = await GET(
      new NextRequest(`https://example.com/admin/login/consume?token=${token}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/admin/login",
    );
    expect(response.cookies.get(ADMIN_GATE_COOKIE_NAME)?.value).toBe("1");
    expect(consumeAdminLoginTokenMock).toHaveBeenCalledWith(token);
  });

  test("DB 消費に失敗した token は 404 を返す", async () => {
    consumeAdminLoginTokenMock.mockImplementationOnce(async () => false);
    const { token } = await createAdminGateToken();

    const response = await GET(
      new NextRequest(`https://example.com/admin/login/consume?token=${token}`),
    );

    expect(response.status).toBe(404);
    expect(consumeAdminLoginTokenMock).toHaveBeenCalledWith(token);
  });
});
