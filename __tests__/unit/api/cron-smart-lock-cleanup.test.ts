/**
 * SwitchBot スマートロック パスコード失効クリーンアップ Cron API のテスト
 *
 * __tests__/unit/api/cron-event-reminder.test.ts と同じ流儀（cron-auth /
 * feature-check 系のモック、connection() / unstable_rethrow のモック）に従う。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);
const mockGetSwitchBotConfig = mock<() => Promise<{ enabled: boolean }>>(() =>
  Promise.resolve({ enabled: true }),
);
const mockRevokeExpiredSmartLockPasscodes = mock<
  (now: Date) => Promise<{ revoked: number; failed: number }>
>(() => Promise.resolve({ revoked: 0, failed: 0 }));
const mockFindRevocableSmartLockPasscodes = mock<
  (now: Date) => Promise<unknown[]>
>(() => Promise.resolve([]));
const mockExpireStalePendingSmartLockPasscodes = mock<
  (now: Date) => Promise<number>
>(() => Promise.resolve(0));
const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);
const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());
const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (...args: unknown[]) =>
    mockAuthorizeCronRequest(...(args as [])),
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getSwitchBotConfig: () => mockGetSwitchBotConfig(),
}));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeExpiredSmartLockPasscodes: (now: Date) =>
    mockRevokeExpiredSmartLockPasscodes(now),
  findRevocableSmartLockPasscodes: (now: Date) =>
    mockFindRevocableSmartLockPasscodes(now),
  expireStalePendingSmartLockPasscodes: (now: Date) =>
    mockExpireStalePendingSmartLockPasscodes(now),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
  },
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/smart-lock-cleanup/route");

function makeSchedulerRequest(): Request {
  const headers = new Headers();
  headers.set("authorization", "Bearer cloud-scheduler-oidc-token");
  return new Request("http://localhost/api/cron/smart-lock-cleanup", {
    headers,
  });
}

describe("GET /api/cron/smart-lock-cleanup", () => {
  beforeEach(() => {
    mockAuthorizeCronRequest.mockReset();
    mockGetSwitchBotConfig.mockReset();
    mockRevokeExpiredSmartLockPasscodes.mockReset();
    mockFindRevocableSmartLockPasscodes.mockReset();
    mockExpireStalePendingSmartLockPasscodes.mockReset();
    mockLogError.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockGetSwitchBotConfig.mockResolvedValue({ enabled: true });
    mockRevokeExpiredSmartLockPasscodes.mockResolvedValue({
      revoked: 0,
      failed: 0,
    });
    mockFindRevocableSmartLockPasscodes.mockResolvedValue([]);
    mockExpireStalePendingSmartLockPasscodes.mockResolvedValue(0);
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

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(401);
    expect(mockGetSwitchBotConfig).not.toHaveBeenCalled();
    expect(mockRevokeExpiredSmartLockPasscodes).not.toHaveBeenCalled();
    // stale PENDING の救済経路も認可失敗時は呼ばれない (auth より後段)
    expect(mockExpireStalePendingSmartLockPasscodes).not.toHaveBeenCalled();
  });

  test("SwitchBot連携がOFF(enabled:false) → skipped:switchbot_disabled で早期return (stale PENDING 救済は先に走る)", async () => {
    mockGetSwitchBotConfig.mockResolvedValue({ enabled: false });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      skipped: true,
      reason: "switchbot_disabled",
      stuckCount: 0,
      stalePendingExpired: 0,
    });
    // stale PENDING 救済は SwitchBot config check より前に一度走る (DB-only)
    expect(mockExpireStalePendingSmartLockPasscodes).toHaveBeenCalledTimes(1);
    expect(mockRevokeExpiredSmartLockPasscodes).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("SwitchBot連携がOFFで失効待ちが蓄積している → stuckCountを返しHIGHでlogErrorする", async () => {
    mockGetSwitchBotConfig.mockResolvedValue({ enabled: false });
    mockFindRevocableSmartLockPasscodes.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ]);
    mockExpireStalePendingSmartLockPasscodes.mockResolvedValue(3);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      skipped: true,
      reason: "switchbot_disabled",
      stuckCount: 2,
      stalePendingExpired: 3,
    });
    expect(mockRevokeExpiredSmartLockPasscodes).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("失効対象なし → revoked:0, failed:0, stalePendingExpired:0 を返す", async () => {
    mockRevokeExpiredSmartLockPasscodes.mockResolvedValue({
      revoked: 0,
      failed: 0,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ revoked: 0, failed: 0, stalePendingExpired: 0 });
    expect(mockExpireStalePendingSmartLockPasscodes).toHaveBeenCalledTimes(1);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("失効成功 + stale PENDING 救済が発火 → revoked件数 + stalePendingExpired 件数を返す", async () => {
    mockRevokeExpiredSmartLockPasscodes.mockResolvedValue({
      revoked: 2,
      failed: 0,
    });
    mockExpireStalePendingSmartLockPasscodes.mockResolvedValue(5);

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({ revoked: 2, failed: 0, stalePendingExpired: 5 });
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("一部失効に失敗(failed>0) → 200のままlogErrorが呼ばれる (stalePendingExpired も payload に含む)", async () => {
    mockRevokeExpiredSmartLockPasscodes.mockResolvedValue({
      revoked: 1,
      failed: 1,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ revoked: 1, failed: 1, stalePendingExpired: 0 });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("revokeExpiredSmartLockPasscodesが例外をスロー → 500を返す (stale PENDING 救済は既に走ってから throw)", async () => {
    const dbError = new Error("Database connection failed");
    mockRevokeExpiredSmartLockPasscodes.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal error" });
    expect(mockLogError).toHaveBeenCalledTimes(1);
    // route の順序: expireStalePending → getSwitchBotConfig → revokeExpired
    // なので revoke が throw する時点で expire は必ず 1 回実行されている。
    expect(mockExpireStalePendingSmartLockPasscodes).toHaveBeenCalledTimes(1);
  });

  test("expireStalePendingSmartLockPasscodes 自体が throw → 500を返す (auth 直後に throw)", async () => {
    const dbError = new Error("Stale PENDING sweep failed");
    mockExpireStalePendingSmartLockPasscodes.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    // expire で throw した時点で SwitchBot config 分岐にも入らず、revoke も呼ばれない
    expect(mockGetSwitchBotConfig).not.toHaveBeenCalled();
    expect(mockRevokeExpiredSmartLockPasscodes).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("connection()が呼ばれる(完全動的化)", async () => {
    await GET(makeSchedulerRequest());

    expect(mockConnection).toHaveBeenCalledTimes(1);
  });
});
