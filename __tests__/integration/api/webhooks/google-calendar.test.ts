/**
 * Google Calendar Webhook API Route Tests
 *
 * /api/webhooks/google-calendar エンドポイントのテスト
 */

import { describe, test, expect } from "bun:test";

describe("POST /api/webhooks/google-calendar", () => {
  test("必須ヘッダーがない場合は400を返す", async () => {
    const routeModule =
      await import("@/app/api/webhooks/google-calendar/route");

    const request = new Request(
      "http://localhost/api/webhooks/google-calendar",
      {
        method: "POST",
        headers: {},
      },
    );

    const response = await routeModule.POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("x-goog-channel-id が必要です");
  });
});
