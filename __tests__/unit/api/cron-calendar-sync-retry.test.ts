import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
const mockRetryFailedSyncs = mock<
  () => Promise<{ total: number; succeeded: number; failed: number }>
>(() => Promise.resolve({ total: 0, succeeded: 0, failed: 0 }));

const mockIsGoogleCalendarEnabled = mock<() => Promise<boolean>>(() =>
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

mock.module("@/shared/lib/google-calendar", () => ({
  isGoogleCalendarEnabled: (
    ...args: Parameters<typeof mockIsGoogleCalendarEnabled>
  ) => mockIsGoogleCalendarEnabled(...args),
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
    mockIsGoogleCalendarEnabled.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsGoogleCalendarEnabled.mockResolvedValue(true);
    mockRetryFailedSyncs.mockResolvedValue({
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
    expect(mockIsGoogleCalendarEnabled).not.toHaveBeenCalled();
    expect(mockRetryFailedSyncs).not.toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("Google Calendar 無効 → skipped=true を返して retry を呼ばない", async () => {
    mockIsGoogleCalendarEnabled.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      skipped: true,
      reason: "Google Calendar is disabled",
    });
    expect(mockRetryFailedSyncs).not.toHaveBeenCalled();
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
    // 0 件でもキャッシュ無効化は呼ぶ (calendar-sync 側と同型の無害呼出)。
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
  });

  test("失敗予約 3 件 → 2 件成功 / 1 件失敗 → サマリを返す + cache 無効化", async () => {
    mockRetryFailedSyncs.mockResolvedValue({
      total: 3,
      succeeded: 2,
      failed: 1,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ total: 3, succeeded: 2, failed: 1 });
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

  test("認可 → GCal 有効判定 → retry の呼び出し順序を守る", async () => {
    const callOrder: string[] = [];
    mockConnection.mockImplementation(async () => {
      callOrder.push("connection");
    });
    mockAuthorizeCronRequest.mockImplementation(async () => {
      callOrder.push("authorize");
      return null;
    });
    mockIsGoogleCalendarEnabled.mockImplementation(async () => {
      callOrder.push("isEnabled");
      return true;
    });
    mockRetryFailedSyncs.mockImplementation(async () => {
      callOrder.push("retry");
      return { total: 0, succeeded: 0, failed: 0 };
    });

    await GET(makeSchedulerRequest());

    expect(callOrder).toEqual([
      "connection",
      "authorize",
      "isEnabled",
      "retry",
    ]);
  });
});
