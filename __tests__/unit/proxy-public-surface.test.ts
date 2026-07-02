import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    APP_SURFACE: "public",
    NODE_ENV: "production",
    R2_PUBLIC_URL: undefined,
  },
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
