/**
 * POST /api/webhooks/google-calendar の排他ロック契約テスト (GCAL-AUDIT-08)。
 *
 * 検証観点:
 * 1. 検証済み通知は `tryAcquireCalendarSyncLock` を取得してから `syncFromCalendar` を呼ぶ
 * 2. lock 取得失敗時は `syncFromCalendar` を呼ばず ack (`skipped: "lock_unavailable"`) する
 *    （Google への配信は失敗させない）
 * 3. 成功・失敗いずれの経路でも `finally` で `releaseCalendarSyncLock` を呼ぶ
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const CHANNEL_TOKEN = "webhook-secret-token";
const CHANNEL_ID = "channel-001";
const RESOURCE_ID = "resource-001";
const CALENDAR_ID = "primary";

// --- モック関数の定義（mock.module() より前）---
const mockGetGoogleCalendarWebhookState = mock<
  () => Promise<{
    token: string | null;
    channelId: string | null;
    resourceId: string | null;
    calendarId: string | null;
  }>
>(() =>
  Promise.resolve({
    token: CHANNEL_TOKEN,
    channelId: CHANNEL_ID,
    resourceId: RESOURCE_ID,
    calendarId: CALENDAR_ID,
  }),
);
const mockGetTwoWaySyncSettings = mock<() => Promise<{ syncMethod: string }>>(
  () => Promise.resolve({ syncMethod: "both" }),
);
const mockIsTwoWaySyncEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const mockSyncFromCalendar = mock<
  () => Promise<{
    success: boolean;
    processed: number;
    deleted: number;
    updated: number;
    errors: string[];
  }>
>(() =>
  Promise.resolve({
    success: true,
    processed: 0,
    deleted: 0,
    updated: 0,
    errors: [],
  }),
);
const mockTryAcquireCalendarSyncLock = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const mockReleaseCalendarSyncLock = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (...args: unknown[]) => void
>(() => undefined);
const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);
const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getGoogleCalendarWebhookState: () => mockGetGoogleCalendarWebhookState(),
  getTwoWaySyncSettings: () => mockGetTwoWaySyncSettings(),
}));

mock.module("@/shared/lib/calendar-sync/inbound", () => ({
  syncFromCalendar: () => mockSyncFromCalendar(),
}));

mock.module("@/shared/lib/google-calendar", () => ({
  isTwoWaySyncEnabled: () => mockIsTwoWaySyncEnabled(),
}));

mock.module("@/shared/domain/calendar-sync/locks", () => ({
  tryAcquireCalendarSyncLock: () => mockTryAcquireCalendarSyncLock(),
  releaseCalendarSyncLock: () => mockReleaseCalendarSyncLock(),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (...args: unknown[]) =>
    mockInvalidateSiteWideCacheFromRouteHandler(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
  jsonValidationError: (error: unknown, message: string) =>
    NextResponse.json({ error: message, issues: error }, { status: 400 }),
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  CalendarSyncMethod: { polling: "polling", webhook: "webhook", both: "both" },
}));

const { POST } = await import("@/app/api/webhooks/google-calendar/route");

function makeValidRequest(): Request {
  return new Request("http://localhost/api/webhooks/google-calendar", {
    method: "POST",
    headers: {
      "x-goog-channel-id": CHANNEL_ID,
      "x-goog-resource-id": RESOURCE_ID,
      "x-goog-resource-state": "exists",
      "x-goog-channel-token": CHANNEL_TOKEN,
      "x-goog-message-number": "1",
    },
  });
}

describe("POST /api/webhooks/google-calendar — 排他ロック契約 (GCAL-AUDIT-08)", () => {
  beforeEach(() => {
    mockGetGoogleCalendarWebhookState.mockReset();
    mockGetTwoWaySyncSettings.mockReset();
    mockIsTwoWaySyncEnabled.mockReset();
    mockSyncFromCalendar.mockReset();
    mockTryAcquireCalendarSyncLock.mockReset();
    mockReleaseCalendarSyncLock.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockUnstableRethrow.mockReset();

    mockGetGoogleCalendarWebhookState.mockResolvedValue({
      token: CHANNEL_TOKEN,
      channelId: CHANNEL_ID,
      resourceId: RESOURCE_ID,
      calendarId: CALENDAR_ID,
    });
    mockGetTwoWaySyncSettings.mockResolvedValue({ syncMethod: "both" });
    mockIsTwoWaySyncEnabled.mockResolvedValue(true);
    mockSyncFromCalendar.mockResolvedValue({
      success: true,
      processed: 1,
      deleted: 0,
      updated: 1,
      errors: [],
    });
    mockTryAcquireCalendarSyncLock.mockResolvedValue(true);
    mockReleaseCalendarSyncLock.mockResolvedValue(undefined);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("lock 取得成功 → syncFromCalendar を呼び、finally で release する", async () => {
    const response = await POST(makeValidRequest());

    expect(response.status).toBe(200);
    expect(mockTryAcquireCalendarSyncLock).toHaveBeenCalledTimes(1);
    expect(mockSyncFromCalendar).toHaveBeenCalledTimes(1);
    expect(mockReleaseCalendarSyncLock).toHaveBeenCalledTimes(1);
  });

  test("lock 取得失敗 → syncFromCalendar を呼ばず ack (skipped: lock_unavailable) する", async () => {
    mockTryAcquireCalendarSyncLock.mockResolvedValue(false);

    const response = await POST(makeValidRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      acknowledged: true,
      skipped: "lock_unavailable",
    });
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
    // 取得できていないので release も呼ばない
    expect(mockReleaseCalendarSyncLock).not.toHaveBeenCalled();
  });

  test("syncFromCalendar が例外を投げても lock は release される", async () => {
    mockSyncFromCalendar.mockRejectedValue(new Error("boom"));
    mockUnstableRethrow.mockImplementation(() => {
      // rethrow しない（本番同等の catch-all 経路を通す）
    });

    const response = await POST(makeValidRequest());

    expect(response.status).toBe(200);
    expect(mockReleaseCalendarSyncLock).toHaveBeenCalledTimes(1);
  });

  test("syncMethod=polling → lock を取得せず pollingOnly を ack する", async () => {
    mockGetTwoWaySyncSettings.mockResolvedValue({ syncMethod: "polling" });

    const response = await POST(makeValidRequest());

    const body = await response.json();
    expect(body).toMatchObject({ acknowledged: true, pollingOnly: true });
    expect(mockTryAcquireCalendarSyncLock).not.toHaveBeenCalled();
  });
});
