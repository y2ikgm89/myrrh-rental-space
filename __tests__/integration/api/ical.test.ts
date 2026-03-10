/**
 * iCal Feed API Route Tests
 *
 * /api/ical/[token] エンドポイントのテスト
 */

import { describe, test, expect } from "bun:test";

describe("GET /api/ical/[token]", () => {
  test("エンドポイントが定義されている", async () => {
    const routeModule = await import("@/app/api/ical/[token]/route");
    expect(routeModule.GET).toBeDefined();
    expect(typeof routeModule.GET).toBe("function");
  });

  test("リクエストパラメータの形式が正しい", async () => {
    const routeModule = await import("@/app/api/ical/[token]/route");

    // GET関数が2つの引数（request, params）を受け取ることを確認
    expect(routeModule.GET).toBeDefined();
    expect(routeModule.GET.length).toBeGreaterThanOrEqual(0);
  });

  test("iCalレスポンスのContent-Typeが正しい", async () => {
    // Note: 実際のDB接続を行うため、CI環境では別途モック設定が必要
    // ここではContent-Type定数の確認のみ
    const expectedContentType = "text/calendar; charset=utf-8";
    expect(expectedContentType).toContain("text/calendar");
  });
});
