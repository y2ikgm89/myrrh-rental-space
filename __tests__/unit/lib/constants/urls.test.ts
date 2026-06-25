/**
 * urls.ts — getBaseUrl / getAppUrl の fail-fast 挙動を検証。
 *
 * production で env 未設定なら throw、それ以外は DEV_FALLBACK_URL を返す。
 * silent prod 汚染（localhost を本番 sitemap / OGP / canonical に焼き込む）を runtime 層でも全廃する保険テスト。
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

const originalNodeEnv = process.env.NODE_ENV;

let mockBaseUrl: string | undefined;
let mockAppUrl: string | undefined;

mock.module("@/shared/lib/env/client", () => ({
  clientEnv: new Proxy({} as Record<string, string | undefined>, {
    get(_, key) {
      if (key === "NEXT_PUBLIC_BASE_URL") return mockBaseUrl;
      if (key === "NEXT_PUBLIC_APP_URL") return mockAppUrl;
      return undefined;
    },
  }),
}));

const { getBaseUrl, getAppUrl, getAdminUrl, getPublicUrl, getAppHost } =
  await import("@/shared/lib/constants/urls");

describe("urls.ts", () => {
  beforeEach(() => {
    mockBaseUrl = undefined;
    mockAppUrl = undefined;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>)["NODE_ENV"];
    } else {
      (process.env as Record<string, string>)["NODE_ENV"] = originalNodeEnv;
    }
  });

  describe("getBaseUrl", () => {
    test("env 設定済みなら値を返す", () => {
      mockBaseUrl = "https://example.com";
      expect(getBaseUrl()).toBe("https://example.com");
    });

    test("development で env 未設定なら DEV_FALLBACK_URL", () => {
      (process.env as Record<string, string>)["NODE_ENV"] = "development";
      expect(getBaseUrl()).toBe("http://localhost:3000");
    });

    test("production で env 未設定なら throw（silent SEO 汚染防止）", () => {
      (process.env as Record<string, string>)["NODE_ENV"] = "production";
      expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_BASE_URL/);
    });
  });

  describe("getAppUrl", () => {
    test("APP_URL 優先", () => {
      mockAppUrl = "https://app.example.com";
      mockBaseUrl = "https://example.com";
      expect(getAppUrl()).toBe("https://app.example.com");
    });

    test("APP_URL 未設定なら BASE_URL に fallback", () => {
      mockBaseUrl = "https://example.com";
      expect(getAppUrl()).toBe("https://example.com");
    });

    test("development で両方未設定なら DEV_FALLBACK_URL", () => {
      (process.env as Record<string, string>)["NODE_ENV"] = "development";
      expect(getAppUrl()).toBe("http://localhost:3000");
    });

    test("production で両方未設定なら throw", () => {
      (process.env as Record<string, string>)["NODE_ENV"] = "production";
      expect(() => getAppUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
    });
  });

  describe("getAdminUrl / getPublicUrl / getAppHost", () => {
    test("getAdminUrl は /admin プレフィックスで連結する", () => {
      mockBaseUrl = "https://example.com";
      mockAppUrl = "https://app.example.com";
      expect(getAdminUrl("/dashboard")).toBe(
        "https://app.example.com/admin/dashboard",
      );
    });

    test("getPublicUrl は BASE_URL に連結する", () => {
      mockBaseUrl = "https://example.com";
      expect(getPublicUrl("/blog/post-1")).toBe(
        "https://example.com/blog/post-1",
      );
    });

    test("getAppHost は host 部のみ返す", () => {
      mockBaseUrl = "https://example.com";
      expect(getAppHost()).toBe("example.com");
    });
  });
});
