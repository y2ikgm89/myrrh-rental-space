import { beforeEach, describe, expect, mock, test } from "bun:test";

let mockAdminAppUrl: string | undefined;
let mockBetterAuthUrl: string | undefined;
let mockFallbackAppUrl = "http://localhost:3000";

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: new Proxy<Record<string, string | undefined>>(
    {},
    {
      get(_, key) {
        if (key === "ADMIN_APP_URL") return mockAdminAppUrl;
        if (key === "BETTER_AUTH_URL") return mockBetterAuthUrl;
        return undefined;
      },
    },
  ),
}));

mock.module("@/shared/lib/constants/urls", () => ({
  getAppUrl: () => mockFallbackAppUrl,
}));

const { getExpectedAdminOrigin, isSameAdminOrigin, resolveRequestOrigin } =
  await import("@/shared/lib/http/assert-same-origin");

describe("assert-same-origin (admin)", () => {
  beforeEach(() => {
    mockAdminAppUrl = "https://admin.example.com";
    mockBetterAuthUrl = undefined;
    mockFallbackAppUrl = "http://localhost:3000";
  });

  test("getExpectedAdminOrigin は ADMIN_APP_URL の origin を返す", () => {
    expect(getExpectedAdminOrigin()).toBe("https://admin.example.com");
  });

  test("Origin が一致すれば true", () => {
    const headers = new Headers({
      origin: "https://admin.example.com",
    });
    expect(isSameAdminOrigin(headers)).toBe(true);
  });

  test("Origin 欠落時は Referer の origin を fallback する", () => {
    const headers = new Headers({
      referer: "https://admin.example.com/admin/pages/new",
    });
    expect(resolveRequestOrigin(headers)).toBe("https://admin.example.com");
    expect(isSameAdminOrigin(headers)).toBe(true);
  });

  test("Origin / Referer 両方欠落は fail-closed", () => {
    expect(isSameAdminOrigin(new Headers())).toBe(false);
  });

  test("不一致 origin は拒否する", () => {
    const headers = new Headers({
      origin: "https://evil.example.com",
    });
    expect(isSameAdminOrigin(headers)).toBe(false);
  });

  test("不正な Origin / Referer は fail-closed", () => {
    expect(
      isSameAdminOrigin(
        new Headers({
          origin: "not-a-url",
        }),
      ),
    ).toBe(false);
    expect(
      isSameAdminOrigin(
        new Headers({
          referer: "not-a-url",
        }),
      ),
    ).toBe(false);
  });
});
