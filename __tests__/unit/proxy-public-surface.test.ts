import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    APP_SURFACE: "public",
    NODE_ENV: "production",
    R2_PUBLIC_URL: undefined,
  },
  // isLocalhostUrl は e2e-runtime.ts が env/server から import する transitive dep。
  // rate-limit.ts → e2e-runtime.ts → env/server の chain で必要になる。
  // このテスト環境では E2E bypass を発動させないため常に false を返す。
  isLocalhostUrl: () => false,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { proxy } = await import("@/proxy");

describe("proxy public surface routing", () => {
  test.each([
    "/admin",
    "/admin/login",
    "/preview/pages/about",
    "/api/admin/export/customers",
    "/api/instagram/oauth/authorize",
    "/api/google-business-profile/oauth/callback",
  ])("public service returns 404 for admin-only path %s", async (pathname) => {
    const response = await proxy(
      new NextRequest(`https://example.com${pathname}`),
    );

    expect(response.status).toBe(404);
  });

  test.each([
    "/",
    "/spaces",
    "/api/auth/sign-in/email",
    "/api/customer-auth/get-session",
    "/api/live",
    "/api/health",
  ])("public service allows public path %s", async (pathname) => {
    const response = await proxy(
      new NextRequest(`https://example.com${pathname}`),
    );

    expect(response.status).not.toBe(404);
  });
});
