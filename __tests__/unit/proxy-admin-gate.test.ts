import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    APP_SURFACE: "admin",
    NODE_ENV: "production",
    R2_PUBLIC_URL: undefined,
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { proxy } = await import("@/proxy");

describe("proxy admin surface", () => {
  test("admin surface root は管理トップへ redirect する", async () => {
    const response = await proxy(new NextRequest("https://example.com/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/admin");
  });

  test("/admin/login は管理トップへ redirect する", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/login"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/admin");
  });

  test("旧 token query は consume へ redirect せず管理トップへ redirect する", async () => {
    const response = await proxy(
      new NextRequest(
        "https://example.com/admin/login?token=payload.signature",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/admin");
  });

  test("旧 /admin/login/consume は特例せず通常の admin route として通す", async () => {
    const response = await proxy(
      new NextRequest(
        "https://example.com/admin/login/consume?token=payload.signature",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-pathname")).toBe("/admin/login/consume");
  });

  test("存在しない admin route も proxy では admin route として通す", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/legacy-path"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-pathname")).toBe("/admin/legacy-path");
  });

  test("session cookie がない /admin/* も proxy では redirect しない", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/posts"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-pathname")).toBe("/admin/posts");
  });

  test("公開ページは frame-ancestors 'none' で埋め込み禁止にする", async () => {
    const response = await proxy(new NextRequest("https://example.com/spaces"));
    const csp = response.headers.get("Content-Security-Policy");

    expect(response.status).toBe(200);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("X-Frame-Options")).toBeNull();
  });

  test("ページプレビューは同一オリジン iframe を許可する", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/preview/pages/about"),
    );
    const csp = response.headers.get("Content-Security-Policy");

    expect(response.status).toBe(200);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers.get("X-Frame-Options")).toBeNull();
  });
});
