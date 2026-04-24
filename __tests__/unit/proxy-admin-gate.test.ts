import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy admin gate", () => {
  test("token も gate cookie もない /admin/login は 404 にする", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/login"),
    );

    expect(response.status).toBe(404);
  });

  test("token 形式が無効な /admin/login は 404 にする", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/login?token=invalid"),
    );

    expect(response.status).toBe(404);
  });

  test("session cookie がなくても /admin/setup/[token] は通す", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/setup/invitation-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-pathname")).toBe(
      "/admin/setup/invitation-token",
    );
  });

  test("session cookie がない /admin/* は login に redirect する", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/admin/posts"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/admin/login",
    );
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
