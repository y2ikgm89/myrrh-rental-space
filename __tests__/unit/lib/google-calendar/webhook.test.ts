/**
 * Google Calendar webhook setup ユニットテスト
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetGoogleCalendarWebhookState = mock<
  () => Promise<{
    calendarId: string | null;
    channelId: string | null;
    resourceId: string | null;
    token: string | null;
    expiration: Date | null;
  }>
>(() =>
  Promise.resolve({
    calendarId: "cal@group.calendar.google.com",
    channelId: null,
    resourceId: null,
    token: null,
    expiration: null,
  }),
);

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

const mockGetServiceAccountClient = mock<
  () => Promise<{
    events: { watch: typeof mockEventsWatch };
    channels: { stop: typeof mockChannelsStop };
  } | null>
>(() =>
  Promise.resolve({
    events: { watch: mockEventsWatch },
    channels: { stop: mockChannelsStop },
  }),
);

const mockSaveGoogleCalendarWebhook = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getGoogleCalendarWebhookState: () => mockGetGoogleCalendarWebhookState(),
}));

mock.module("@/shared/domain/settings/integration-commands", () => ({
  saveGoogleCalendarWebhook: (...args: unknown[]) =>
    mockSaveGoogleCalendarWebhook(...args),
  clearGoogleCalendarWebhook: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/google-calendar/service-account", () => ({
  getServiceAccountClient: () => mockGetServiceAccountClient(),
}));

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
    mockGetGoogleCalendarWebhookState.mockReset();
    mockGetGoogleCalendarWebhookState.mockResolvedValue({
      calendarId: "cal@group.calendar.google.com",
      channelId: null,
      resourceId: null,
      token: null,
      expiration: null,
    });
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
    mockGetServiceAccountClient.mockReset();
    mockGetServiceAccountClient.mockResolvedValue({
      events: { watch: mockEventsWatch },
      channels: { stop: mockChannelsStop },
    });
    mockSaveGoogleCalendarWebhook.mockReset();
  });

  test("既存 channel がある場合は stop してから新しい watch を作成する", async () => {
    mockGetGoogleCalendarWebhookState.mockResolvedValue({
      calendarId: "cal@group.calendar.google.com",
      channelId: "old-channel-id",
      resourceId: "old-resource-id",
      token: "old-token",
      expiration: new Date(),
    });

    const result = await setupWebhookWatch(
      "https://example.com/api/webhooks/google-calendar",
    );

    expect(result.success).toBe(true);
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockEventsWatch).toHaveBeenCalledTimes(1);
    expect(result.channelId).toBe("new-channel-id");
    expect(result.resourceId).toBe("new-resource-id");
    expect(result.token).toEqual(expect.any(String));
    expect(mockSaveGoogleCalendarWebhook).not.toHaveBeenCalled();
  });

  test("既存 channel がなくても watch を作成し token を返す", async () => {
    const result = await setupWebhookWatch(
      "https://example.com/api/webhooks/google-calendar",
    );

    expect(result.success).toBe(true);
    expect(mockChannelsStop).not.toHaveBeenCalled();
    expect(result.token).toEqual(expect.any(String));
    expect(mockSaveGoogleCalendarWebhook).not.toHaveBeenCalled();
  });
});
