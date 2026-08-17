import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

type SettingsFindUniqueArgs = { select?: Record<string, unknown> };
type SettingsUpsertArgs = { update?: Record<string, unknown> };

const mockSettingsGoogleCalendarFindUnique = mock<
  (args: SettingsFindUniqueArgs) => Promise<{
    googleCalendarId: string | null;
    googleCalendarServiceAccountJson: string | null;
  } | null>
>(() => Promise.resolve(null));
const mockSettingsGoogleCalendarUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));

const mockSafeDecryptToString = mock<
  (ciphertext: string | null | undefined) => string | null
>(() => null);
const mockCreateCalendarClientFromServiceAccountJson = mock<
  (json: string, context?: string) => object | null
>(() => null);
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
    calendarId: null,
    channelId: null,
    resourceId: null,
    token: null,
    expiration: null,
  }),
);
const mockStopWebhookWatch = mock<
  (
    client: object,
    channelId: string,
    resourceId: string,
  ) => Promise<{ success: true } | { success: false; error: string }>
>(() => Promise.resolve({ success: true }));
const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsGoogleCalendar: {
      findUnique: mockSettingsGoogleCalendarFindUnique,
      upsert: mockSettingsGoogleCalendarUpsert,
    },
  },
}));

mock.module("@/shared/lib/google-calendar/service-account", () => ({
  encryptServiceAccountJson: mock<(json: string) => string>(
    (json) => `encrypted:${json}`,
  ),
  createCalendarClientFromServiceAccountJson: (
    json: string,
    context?: string,
  ) => mockCreateCalendarClientFromServiceAccountJson(json, context),
}));

mock.module("@/shared/lib/crypto", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  safeDecryptToString: (ciphertext: string | null | undefined) =>
    mockSafeDecryptToString(ciphertext),
}));

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getGoogleCalendarWebhookState: () => mockGetGoogleCalendarWebhookState(),
}));

mock.module("@/shared/domain/settings/connection-health", () => ({
  clearConnectionHealth: mock(async () => undefined),
}));

mock.module("@/shared/lib/google-calendar", () => ({
  stopWebhookWatch: (client: object, channelId: string, resourceId: string) =>
    mockStopWebhookWatch(client, channelId, resourceId),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));

await installPrismaEnumsMock({
  CalendarSyncMethod: {
    POLLING: "POLLING",
    WEBHOOK: "WEBHOOK",
    BOTH: "BOTH",
  },
});

import {
  updateGoogleCalendarSettings,
  clearGoogleCalendarServiceAccount,
} from "@/shared/domain/settings/google-calendar-commands";
import { DomainError } from "@/shared/domain/domain-error";

const BASE_INPUT = {
  icalAttachmentEnabled: false,
  addToCalendarLinksEnabled: false,
  googleCalendarReminderMinutes: null,
};

function lastGoogleCalendarUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsGoogleCalendarUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

function allGoogleCalendarUpdates(): Record<string, unknown>[] {
  return mockSettingsGoogleCalendarUpsert.mock.calls.map(
    (call) => call[0]?.update ?? {},
  );
}

beforeEach(() => {
  mockSettingsGoogleCalendarFindUnique.mockReset();
  mockSettingsGoogleCalendarFindUnique.mockResolvedValue(null);
  mockSettingsGoogleCalendarUpsert.mockReset();
  mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  mockSafeDecryptToString.mockReset();
  mockSafeDecryptToString.mockReturnValue(null);
  mockCreateCalendarClientFromServiceAccountJson.mockReset();
  mockCreateCalendarClientFromServiceAccountJson.mockReturnValue(null);
  mockGetGoogleCalendarWebhookState.mockReset();
  mockGetGoogleCalendarWebhookState.mockResolvedValue({
    calendarId: null,
    channelId: null,
    resourceId: null,
    token: null,
    expiration: null,
  });
  mockStopWebhookWatch.mockReset();
  mockStopWebhookWatch.mockResolvedValue({ success: true });
  mockLogError.mockReset();
});

describe("updateGoogleCalendarSettings enable gate", () => {
  test("ID もサービスアカウントも無い状態で有効化すると VALIDATION エラー", async () => {
    await expect(
      updateGoogleCalendarSettings({
        ...BASE_INPUT,
        googleCalendarEnabled: true,
        googleCalendarId: null,
        serviceAccountJson: null,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message:
        "Google Calendarを有効にするにはカレンダーIDとサービスアカウントが必要です",
    });
    await expect(
      updateGoogleCalendarSettings({
        ...BASE_INPUT,
        googleCalendarEnabled: true,
        googleCalendarId: null,
        serviceAccountJson: null,
      }),
    ).rejects.toBeInstanceOf(DomainError);

    expect(mockSettingsGoogleCalendarUpsert).not.toHaveBeenCalled();
  });

  test("保存済みのカレンダーIDとサービスアカウントがあれば再貼付なしで有効化できる", async () => {
    mockSettingsGoogleCalendarFindUnique.mockResolvedValue({
      googleCalendarId: "saved@group.calendar.google.com",
      googleCalendarServiceAccountJson: "encrypted-existing-sa",
    });

    await updateGoogleCalendarSettings({
      ...BASE_INPUT,
      googleCalendarEnabled: true,
      googleCalendarId: null,
      serviceAccountJson: null,
    });

    expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
    expect(lastGoogleCalendarUpdate()).toMatchObject({
      googleCalendarEnabled: true,
    });
    expect(Object.keys(lastGoogleCalendarUpdate())).not.toContain(
      "googleCalendarId",
    );
    expect(Object.keys(lastGoogleCalendarUpdate())).not.toContain(
      "googleCalendarServiceAccountJson",
    );
  });
});

describe("clearGoogleCalendarServiceAccount", () => {
  test("有効化・双方向同期・Webhook をリセットし、カレンダーIDは残す", async () => {
    mockGetGoogleCalendarWebhookState.mockResolvedValue({
      calendarId: "keep@group.calendar.google.com",
      channelId: "channel-1",
      resourceId: "resource-1",
      token: "token",
      expiration: new Date("2026-03-01T00:00:00Z"),
    });
    mockSettingsGoogleCalendarFindUnique.mockResolvedValue({
      googleCalendarId: "keep@group.calendar.google.com",
      googleCalendarServiceAccountJson: "encrypted-existing-sa",
    });
    mockSafeDecryptToString.mockReturnValue('{"type":"service_account"}');
    mockCreateCalendarClientFromServiceAccountJson.mockReturnValue({
      kind: "calendar-client",
    });

    await clearGoogleCalendarServiceAccount();

    const updates = allGoogleCalendarUpdates();
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(
      updates.some(
        (update) => update["googleCalendarWebhookChannelId"] === null,
      ),
    ).toBe(true);
    expect(
      updates.some(
        (update) => update["googleCalendarWebhookResourceId"] === null,
      ),
    ).toBe(true);
    expect(
      updates.some((update) => update["googleCalendarWebhookToken"] === null),
    ).toBe(true);
    expect(
      updates.some(
        (update) => update["googleCalendarWebhookExpiration"] === null,
      ),
    ).toBe(true);
    expect(lastGoogleCalendarUpdate()).toMatchObject({
      googleCalendarEnabled: false,
      googleCalendarTwoWaySyncEnabled: false,
      googleCalendarServiceAccountJson: null,
    });
    expect(updates.every((update) => update["googleCalendarId"] !== null)).toBe(
      true,
    );
    expect(Object.keys(lastGoogleCalendarUpdate())).not.toContain(
      "googleCalendarId",
    );
  });

  test("Webhook 停止に失敗してもクリア自体は続行する", async () => {
    mockGetGoogleCalendarWebhookState.mockResolvedValue({
      calendarId: "keep@group.calendar.google.com",
      channelId: "channel-1",
      resourceId: "resource-1",
      token: "token",
      expiration: null,
    });
    mockSettingsGoogleCalendarFindUnique.mockResolvedValue({
      googleCalendarId: "keep@group.calendar.google.com",
      googleCalendarServiceAccountJson: "encrypted-existing-sa",
    });
    mockSafeDecryptToString.mockReturnValue('{"type":"service_account"}');
    mockCreateCalendarClientFromServiceAccountJson.mockReturnValue({
      kind: "calendar-client",
    });
    mockStopWebhookWatch.mockResolvedValue({
      success: false,
      error: "network error",
    });

    await clearGoogleCalendarServiceAccount();

    expect(mockLogError).toHaveBeenCalled();
    expect(lastGoogleCalendarUpdate()).toMatchObject({
      googleCalendarEnabled: false,
      googleCalendarServiceAccountJson: null,
    });
  });
});
