/**
 * SwitchBot スマートロック パスコード失効クリーンアップ Cron API のテスト
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);
const mockGetSwitchBotEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const mockRevokeExpiredSmartLockPasscodes = mock<
  (now: Date) => Promise<{ revoked: number; failed: number }>
>(() => Promise.resolve({ revoked: 0, failed: 0 }));
const mockFindStuckSmartLockPasscodesWhenIntegrationDisabled = mock<
  (now: Date) => Promise<unknown[]>
>(() => Promise.resolve([]));
const mockExpireStalePendingSmartLockPasscodes = mock<
  (now: Date) => Promise<number>
>(() => Promise.resolve(0));
const mockExpireStaleRevokePendingSmartLockPasscodes = mock<
  (now: Date) => Promise<number>
>(() => Promise.resolve(0));
const mockProcessPendingSmartLockReissues = mock<
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
  getSwitchBotEnabled: () => mockGetSwitchBotEnabled(),
}));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeExpiredSmartLockPasscodes: (now: Date) =>
    mockRevokeExpiredSmartLockPasscodes(now),
  findStuckSmartLockPasscodesWhenIntegrationDisabled: (now: Date) =>
    mockFindStuckSmartLockPasscodesWhenIntegrationDisabled(now),
  expireStalePendingSmartLockPasscodes: (now: Date) =>
    mockExpireStalePendingSmartLockPasscodes(now),
  expireStaleRevokePendingSmartLockPasscodes: (now: Date) =>
    mockExpireStaleRevokePendingSmartLockPasscodes(now),
}));

mock.module("@/shared/domain/smart-lock/reissue-passcode", () => ({
  processPendingSmartLockReissues: (now: Date) =>
    mockProcessPendingSmartLockReissues(now),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    UNKNOWN: "UNKNOWN",
    VALIDATION: "VALIDATION",
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
    mockGetSwitchBotEnabled.mockReset();
    mockRevokeExpiredSmartLockPasscodes.mockReset();
    mockFindStuckSmartLockPasscodesWhenIntegrationDisabled.mockReset();
    mockExpireStalePendingSmartLockPasscodes.mockReset();
    mockExpireStaleRevokePendingSmartLockPasscodes.mockReset();
    mockProcessPendingSmartLockReissues.mockReset();
    mockLogError.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockGetSwitchBotEnabled.mockResolvedValue(true);
    mockRevokeExpiredSmartLockPasscodes.mockResolvedValue({
      revoked: 0,
      failed: 0,
    });
    mockFindStuckSmartLockPasscodesWhenIntegrationDisabled.mockResolvedValue(
      [],
    );
    mockExpireStalePendingSmartLockPasscodes.mockResolvedValue(0);
    mockExpireStaleRevokePendingSmartLockPasscodes.mockResolvedValue(0);
    mockProcessPendingSmartLockReissues.mockResolvedValue(0);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("SwitchBot連携がOFF → stale revoke も含めて早期return", async () => {
    mockGetSwitchBotEnabled.mockResolvedValue(false);
    mockExpireStalePendingSmartLockPasscodes.mockResolvedValue(1);
    mockExpireStaleRevokePendingSmartLockPasscodes.mockResolvedValue(2);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      skipped: true,
      reason: "switchbot_disabled",
      stuckCount: 0,
      stalePendingExpired: 1,
      staleRevokePendingReverted: 2,
    });
    expect(
      mockExpireStaleRevokePendingSmartLockPasscodes,
    ).toHaveBeenCalledTimes(1);
    expect(mockRevokeExpiredSmartLockPasscodes).not.toHaveBeenCalled();
  });

  test("SwitchBot連携がOFFで stuck (CONFIRMED + REVOKE_PENDING) → logError", async () => {
    mockGetSwitchBotEnabled.mockResolvedValue(false);
    mockFindStuckSmartLockPasscodesWhenIntegrationDisabled.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body.stuckCount).toBe(3);
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("失効対象なし → stale revoke 件数も payload に含む", async () => {
    mockExpireStaleRevokePendingSmartLockPasscodes.mockResolvedValue(4);

    const response = await GET(makeSchedulerRequest());

    const body = await response.json();
    expect(body).toEqual({
      revoked: 0,
      failed: 0,
      stalePendingExpired: 0,
      staleRevokePendingReverted: 4,
      pendingReissues: 0,
    });
  });

  test("expireStaleRevokePending が throw → 500", async () => {
    mockExpireStaleRevokePendingSmartLockPasscodes.mockRejectedValue(
      new Error("stale revoke sweep failed"),
    );
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    expect(mockGetSwitchBotEnabled).not.toHaveBeenCalled();
  });

  test("failed > 0 → status 500", async () => {
    mockRevokeExpiredSmartLockPasscodes.mockResolvedValue({
      revoked: 1,
      failed: 2,
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalled();
    expect(mockProcessPendingSmartLockReissues).toHaveBeenCalled();
  });
});
