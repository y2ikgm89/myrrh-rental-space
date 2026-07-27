/**
 * Google Calendar webhook setup ユニットテスト
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockEventsWatch = mock<
  () => Promise<{
    data: {
      id: string;
      resourceId: string;
      expiration: string;
    };
  }>
>(() =>
  Promise.resolve({
    data: {
      id: "new-channel-id",
      resourceId: "new-resource-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  }),
);

const mockChannelsStop = mock<() => Promise<{ data: Record<string, never> }>>(
  () => Promise.resolve({ data: {} }),
);

const mockClient = {
  events: { watch: mockEventsWatch },
  channels: { stop: mockChannelsStop },
};

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/google-api/retry", () => ({
  withGoogleApiRetry: <T>(fn: () => Promise<T>) => fn(),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", HIGH: "HIGH", MEDIUM: "MEDIUM" },
}));

import { setupWebhookWatch } from "@/shared/lib/google-calendar/webhook";

describe("setupWebhookWatch", () => {
  beforeEach(() => {
    mockEventsWatch.mockReset();
    mockEventsWatch.mockResolvedValue({
      data: {
        id: "new-channel-id",
        resourceId: "new-resource-id",
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    mockChannelsStop.mockReset();
    mockChannelsStop.mockResolvedValue({ data: {} });
  });

  test("既存 channel がある場合は stop してから新しい watch を作成する", async () => {
    const result = await setupWebhookWatch(
      mockClient as never,
      {
        calendarId: "cal@group.calendar.google.com",
        channelId: "old-channel-id",
        resourceId: "old-resource-id",
      },
      "https://example.com/api/webhooks/google-calendar",
    );

    expect(result.success).toBe(true);
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockEventsWatch).toHaveBeenCalledTimes(1);
    expect(result.channelId).toBe("new-channel-id");
    expect(result.resourceId).toBe("new-resource-id");
    expect(result.token).toEqual(expect.any(String));
  });

  test("既存 channel がなくても watch を作成し token を返す", async () => {
    const result = await setupWebhookWatch(
      mockClient as never,
      {
        calendarId: "cal@group.calendar.google.com",
        channelId: null,
        resourceId: null,
      },
      "https://example.com/api/webhooks/google-calendar",
    );

    expect(result.success).toBe(true);
    expect(mockChannelsStop).not.toHaveBeenCalled();
    expect(result.token).toEqual(expect.any(String));
  });
});
