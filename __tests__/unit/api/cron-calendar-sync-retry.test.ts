import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
const mockRetryFailedSyncs = mock<
  () => Promise<{ total: number; succeeded: number; failed: number }>
>(() => Promise.resolve({ total: 0, succeeded: 0, failed: 0 }));

const mockRetryFailedEventCalendarSyncs = mock<
  () => Promise<{ total: number; succeeded: number; failed: number }>
>(() => Promise.resolve({ total: 0, succeeded: 0, failed: 0 }));

const mockIsGoogleCalendarConfigured = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (
    tags: readonly string[] | string,
    options?: { skipCdnPurge?: boolean },
  ) => void
>(() => undefined);

const mockLogError = mock<() => void>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  retryFailedSyncs: (...args: Parameters<typeof mockRetryFailedSyncs>) =>
    mockRetryFailedSyncs(...args),
}));

mock.module("@/shared/domain/events/event-calendar-outbound", () => ({
  retryFailedEventCalendarSyncs: (
    ...args: Parameters<typeof mockRetryFailedEventCalendarSyncs>
  ) => mockRetryFailedEventCalendarSyncs(...args),
}));

mock.module("@/shared/lib/google-calendar", () => ({
  isGoogleCalendarConfigured: (
    ...args: Parameters<typeof mockIsGoogleCalendarConfigured>
  ) => mockIsGoogleCalendarConfigured(...args),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (
    ...args: Parameters<typeof mockInvalidateSiteWideCacheFromRouteHandler>
  ) => mockInvalidateSiteWideCacheFromRouteHandler(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
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

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (
    ...args: Parameters<typeof mockAuthorizeCronRequest>
  ) => mockAuthorizeCronRequest(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/calendar-sync-retry/route");

// --- テスト用ヘルパー ---

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/calendar-sync-retry", {
    headers,
  });
}

function makeSchedulerRequest() {
  return makeRequest("Bearer cloud-scheduler-oidc-token");
}

describe("GET /api/cron/calendar-sync-retry", () => {
  beforeEach(() => {
    mockRetryFailedSyncs.mockReset();
    mockRetryFailedEventCalendarSyncs.mockReset();
    mockIsGoogleCalendarConfigured.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsGoogleCalendarConfigured.mockResolvedValue(true);
    mockRetryFailedSyncs.mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
    });
    mockRetryFailedEventCalendarSyncs.mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
    });
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("Cloud Scheduler OIDC 認証失敗 → authorizeCronRequest の返却値をそのまま返す (401)", async () => {
    const authErrorResponse = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockAuthorizeCronRequest.mockResolvedValue(authErrorResponse);

    const response = await GET(makeRequest("Bearer invalid-oidc-token"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockAuthorizeCronRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "calendarSyncRetryCron",
      }),
    );
    // 認証失敗時は本処理を呼ばない
    expect(mockIsGoogleCalendarConfigured).not.toHaveBeenCalled();
    expect(mockRetryFailedSyncs).not.toHaveBeenCalled();
    expect(mockRetryFailedEventCalendarSyncs).not.toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("Google Calendar 未 configured → skipped=true を返して retry を呼ばない", async () => {
    mockIsGoogleCalendarConfigured.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      skipped: true,
      reason: "Google Calendar is not configured",
    });
    expect(mockRetryFailedSyncs).not.toHaveBeenCalled();
    expect(mockRetryFailedEventCalendarSyncs).not.toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("失敗予約 0 件 → total=0 で success", async () => {
    mockRetryFailedSyncs.mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ total: 0, succeeded: 0, failed: 0 });
    expect(mockRetryFailedSyncs).toHaveBeenCalledTimes(1);
    expect(mockRetryFailedEventCalendarSyncs).toHaveBeenCalledTimes(1);
    // 0 件でもキャッシュ無効化は呼ぶ (calendar-sync 側と同型の無害呼出)。
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
  });

  test("失敗予約 3 件 + 失敗イベント 2 件 → 合算サマリを返す + cache 無効化", async () => {
    mockRetryFailedSyncs.mockResolvedValue({
      total: 3,
      succeeded: 2,
      failed: 1,
    });
    mockRetryFailedEventCalendarSyncs.mockResolvedValue({
      total: 2,
      succeeded: 1,
      failed: 1,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      total: 5,
      succeeded: 3,
      failed: 2,
      reservations: { total: 3, succeeded: 2, failed: 1 },
      events: { total: 2, succeeded: 1, failed: 1 },
    });
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
    // キャッシュ無効化は skipCdnPurge:true で呼ばれる (admin-only tag のため)。
    const [tags, options] =
      mockInvalidateSiteWideCacheFromRouteHandler.mock.calls[0] ?? [];
    expect(Array.isArray(tags)).toBe(true);
    expect(options).toEqual({ skipCdnPurge: true });
  });

  test("retryFailedSyncs が例外をスロー → 500 を返して logError", async () => {
    const dbError = new Error("Prisma connection lost");
    mockRetryFailedSyncs.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Calendar sync retry cron failed" });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        context: expect.objectContaining({
          operation: "calendarSyncRetryCron",
        }),
      }),
    );
  });

  test("認可 → GCal 有効判定 → retry (予約/イベント並列) の呼び出し順序を守る", async () => {
    const callOrder: string[] = [];
    mockConnection.mockImplementation(async () => {
      callOrder.push("connection");
    });
    mockAuthorizeCronRequest.mockImplementation(async () => {
      callOrder.push("authorize");
      return null;
    });
    mockIsGoogleCalendarConfigured.mockImplementation(async () => {
      callOrder.push("isConfigured");
      return true;
    });
    mockRetryFailedSyncs.mockImplementation(async () => {
      callOrder.push("retry-reservations");
      return { total: 0, succeeded: 0, failed: 0 };
    });
    mockRetryFailedEventCalendarSyncs.mockImplementation(async () => {
      callOrder.push("retry-events");
      return { total: 0, succeeded: 0, failed: 0 };
    });

    await GET(makeSchedulerRequest());

    // 予約 / イベントの retry は Promise.all で並列実行されるため、開始 3 ステップ
    // (connection → authorize → isConfigured) の後にどちらも呼ばれていることのみ検証する。
    expect(callOrder.slice(0, 3)).toEqual([
      "connection",
      "authorize",
      "isConfigured",
    ]);
    expect(callOrder.slice(3).sort()).toEqual([
      "retry-events",
      "retry-reservations",
    ]);
  });
});
