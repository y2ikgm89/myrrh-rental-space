/**
 * GET /api/cron/calendar-sync の syncMethod 別実行計画テスト (GCAL-AUDIT-02)。
 *
 * 検証観点:
 * 1. `resolveSyncPlan` が syncMethod ごとに正しい { renewWebhook, poll } を返す
 *    （`webhook` でも renewWebhook: true — 旧実装はここが早期 skip されていた）。
 * 2. syncMethod=webhook の GET リクエストは renewWebhookIfNeeded を呼んだ上で
 *    「Polling is disabled」を返す（旧実装は renew 自体に到達しなかった）。
 * 3. syncMethod=polling は renewWebhookIfNeeded を呼ばず syncFromCalendar のみ実行する。
 * 4. syncMethod=both は両方実行する。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
const mockIsTwoWaySyncEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const mockRenewWebhookIfNeeded = mock<
  () => Promise<{
    success: boolean;
    renewed: boolean;
    newExpiration?: Date;
    error?: string;
  }>
>(() => Promise.resolve({ success: true, renewed: false }));
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
const mockGetTwoWaySyncSettings = mock<() => Promise<{ syncMethod: string }>>(
  () => Promise.resolve({ syncMethod: "both" }),
);
const mockTryAcquireCalendarSyncLock = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const mockReleaseCalendarSyncLock = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockSendWebhookRenewalNotification = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());
const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (...args: unknown[]) => void
>(() => undefined);
const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);
const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);
const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());
const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});
const mockFireAndForget = mock<(...args: unknown[]) => void>(() => undefined);

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/calendar-sync/locks", () => ({
  tryAcquireCalendarSyncLock: () => mockTryAcquireCalendarSyncLock(),
  releaseCalendarSyncLock: () => mockReleaseCalendarSyncLock(),
}));

mock.module("@/shared/lib/calendar-sync/inbound", () => ({
  syncFromCalendar: () => mockSyncFromCalendar(),
}));

mock.module("@/shared/domain/settings/google-calendar", () => ({
  isTwoWaySyncEnabled: () => mockIsTwoWaySyncEnabled(),
  renewWebhookIfNeeded: () => mockRenewWebhookIfNeeded(),
}));

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getTwoWaySyncSettings: () => mockGetTwoWaySyncSettings(),
}));

mock.module("@/shared/lib/email/system-emails", () => ({
  sendWebhookRenewalNotification: (...args: unknown[]) =>
    mockSendWebhookRenewalNotification(...args),
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
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (...args: unknown[]) => mockFireAndForget(...args),
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: () => mockAuthorizeCronRequest(),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  CalendarSyncMethod: {
    polling: "polling",
    webhook: "webhook",
    both: "both",
  },
}));

const { GET, resolveSyncPlan } =
  await import("@/app/api/cron/calendar-sync/route");

function makeRequest(authHeader = "Bearer cloud-scheduler-oidc-token") {
  const headers = new Headers({ authorization: authHeader });
  return new Request("http://localhost/api/cron/calendar-sync", { headers });
}

describe("resolveSyncPlan (GCAL-AUDIT-02)", () => {
  test("polling → { renewWebhook: false, poll: true }", () => {
    expect(resolveSyncPlan("polling")).toEqual({
      renewWebhook: false,
      poll: true,
    });
  });

  test("webhook → { renewWebhook: true, poll: false }（旧実装は renew に到達しなかった）", () => {
    expect(resolveSyncPlan("webhook")).toEqual({
      renewWebhook: true,
      poll: false,
    });
  });

  test("both → { renewWebhook: true, poll: true }", () => {
    expect(resolveSyncPlan("both")).toEqual({
      renewWebhook: true,
      poll: true,
    });
  });
});

describe("GET /api/cron/calendar-sync — syncMethod 別実行 (GCAL-AUDIT-02)", () => {
  beforeEach(() => {
    mockIsTwoWaySyncEnabled.mockReset();
    mockRenewWebhookIfNeeded.mockReset();
    mockSyncFromCalendar.mockReset();
    mockGetTwoWaySyncSettings.mockReset();
    mockTryAcquireCalendarSyncLock.mockReset();
    mockReleaseCalendarSyncLock.mockReset();
    mockSendWebhookRenewalNotification.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();
    mockFireAndForget.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsTwoWaySyncEnabled.mockResolvedValue(true);
    mockTryAcquireCalendarSyncLock.mockResolvedValue(true);
    mockReleaseCalendarSyncLock.mockResolvedValue(undefined);
    mockRenewWebhookIfNeeded.mockResolvedValue({
      success: true,
      renewed: false,
    });
    mockSyncFromCalendar.mockResolvedValue({
      success: true,
      processed: 0,
      deleted: 0,
      updated: 0,
      errors: [],
    });
    mockSendWebhookRenewalNotification.mockResolvedValue();
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("syncMethod=webhook → renewWebhookIfNeeded を呼び、Polling is disabled を返す（回帰: 旧実装は renew に到達しなかった）", async () => {
    mockGetTwoWaySyncSettings.mockResolvedValue({ syncMethod: "webhook" });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      skipped: true,
      reason: "Polling is disabled (webhook only)",
    });
    expect(mockRenewWebhookIfNeeded).toHaveBeenCalledTimes(1);
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
    // lock は取得・解放されている
    expect(mockTryAcquireCalendarSyncLock).toHaveBeenCalledTimes(1);
    expect(mockReleaseCalendarSyncLock).toHaveBeenCalledTimes(1);
  });

  test("syncMethod=polling → renewWebhookIfNeeded を呼ばず syncFromCalendar のみ実行する", async () => {
    mockGetTwoWaySyncSettings.mockResolvedValue({ syncMethod: "polling" });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(mockRenewWebhookIfNeeded).not.toHaveBeenCalled();
    expect(mockSyncFromCalendar).toHaveBeenCalledTimes(1);
  });

  test("syncMethod=both → renewWebhookIfNeeded と syncFromCalendar の両方を実行する", async () => {
    mockGetTwoWaySyncSettings.mockResolvedValue({ syncMethod: "both" });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(mockRenewWebhookIfNeeded).toHaveBeenCalledTimes(1);
    expect(mockSyncFromCalendar).toHaveBeenCalledTimes(1);
  });

  test("2way sync 無効 → lock を取得せず即座に skip", async () => {
    mockIsTwoWaySyncEnabled.mockResolvedValue(false);

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body).toEqual({
      skipped: true,
      reason: "Two-way sync is disabled",
    });
    expect(mockTryAcquireCalendarSyncLock).not.toHaveBeenCalled();
  });

  test("lock 取得失敗 → skip して syncFromCalendar / renewWebhookIfNeeded を呼ばない", async () => {
    mockGetTwoWaySyncSettings.mockResolvedValue({ syncMethod: "both" });
    mockTryAcquireCalendarSyncLock.mockResolvedValue(false);

    const response = await GET(makeRequest());

    const body = await response.json();
    expect(body).toMatchObject({
      skipped: true,
      reason: "Another sync is already running",
    });
    expect(mockRenewWebhookIfNeeded).not.toHaveBeenCalled();
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
    expect(mockReleaseCalendarSyncLock).not.toHaveBeenCalled();
  });
});
