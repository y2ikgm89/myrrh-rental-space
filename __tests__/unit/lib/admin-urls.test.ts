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

const { getAdminAppUrl, getAdminUrl } = await import("@/shared/lib/admin-urls");

describe("admin-urls", () => {
  beforeEach(() => {
    mockAdminAppUrl = undefined;
    mockBetterAuthUrl = undefined;
    mockFallbackAppUrl = "http://localhost:3000";
  });

  test("ADMIN_APP_URL を管理 URL の正本にする", () => {
    mockAdminAppUrl = "https://admin.example.com";
    mockBetterAuthUrl = "https://auth.example.com";

    expect(getAdminAppUrl()).toBe("https://admin.example.com");
    expect(getAdminUrl("/reservations/123")).toBe(
      "https://admin.example.com/admin/reservations/123",
    );
  });

  test("development fallback は BETTER_AUTH_URL、最後に getAppUrl の順に使う", () => {
    mockBetterAuthUrl = "https://auth.example.com";

    expect(getAdminAppUrl()).toBe("https://auth.example.com");

    mockBetterAuthUrl = undefined;
    expect(getAdminUrl("settings")).toBe(
      "http://localhost:3000/admin/settings",
    );
  });
});
