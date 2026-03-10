import { describe, expect, test } from "bun:test";
import { googleCalendarWebhookHeadersSchema } from "@/shared/lib/validations/google-calendar-webhook";

describe("googleCalendarWebhookHeadersSchema", () => {
  test("必須ヘッダーが揃っていれば通る", () => {
    const result = googleCalendarWebhookHeadersSchema.safeParse({
      channelId: "channel-id",
      resourceId: "resource-id",
      resourceState: "exists",
      channelToken: "token",
      messageNumber: "12",
    });

    expect(result.success).toBe(true);
  });

  test("channelId が無いとエラー", () => {
    const result = googleCalendarWebhookHeadersSchema.safeParse({
      resourceId: "resource-id",
      resourceState: "exists",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Should have failed");
    }
    expect(result.error.issues[0]?.message).toBe(
      "x-goog-channel-id が必要です",
    );
  });

  test("resourceState が不正ならエラー", () => {
    const result = googleCalendarWebhookHeadersSchema.safeParse({
      channelId: "channel-id",
      resourceId: "resource-id",
      resourceState: "invalid",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Should have failed");
    }
    expect(result.error.issues[0]?.message).toBe(
      "x-goog-resource-state が不正です",
    );
  });
});
