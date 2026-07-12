/**
 * `expireStalePendingSmartLockPasscodes` の contract test。
 *
 * `issue-passcode.ts` の poll timeout が status=PENDING を残す新契約と対で動く
 * cleanup 関数。WHERE の cutoff / status filter と、閾値定数が「意図せず短くなる」
 * regression (poll timeout 45s と race を起こす) を防ぐ。
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";

type UpdateManyResult = { count: number };
type MockArgs = Record<string, unknown> | undefined;

const mockUpdateMany = mock<(args?: MockArgs) => Promise<UpdateManyResult>>(
  () => Promise.resolve({ count: 0 }),
);
// PR#11: 実装が updateMany 前に findMany で対象 reservationId を取得して
// dedupe 通知するようになった。デフォルトは 0 件を返す stub。
const mockFindMany = mock<
  (args?: MockArgs) => Promise<Array<{ id: string; reservationId: string }>>
>(() => Promise.resolve([]));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockPasscode: {
      findMany: (args?: MockArgs) => mockFindMany(args),
      updateMany: (args?: MockArgs) => mockUpdateMany(args),
    },
  },
}));

// getDecryptedSwitchBotCredentials は本関数の実行に不要だが、revoke-passcode.ts の
// 他 export と一緒に import module すると解決を要求される。空 stub を返す。
mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () => Promise.resolve(null),
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  deletePasscode: () => Promise.resolve({ ok: true }),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: () => undefined,
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

// PR#11 で expireStalePendingSmartLockPasscodes が stale reservation ごとに
// createNotificationCommand を fireAndForget で発火するようになった。
// 実装は prisma.adminNotification.create を呼ぶが、この test file は
// smartLockPasscode 系しか mock していないため、素通しだと fireAndForget が
// catch → logError の予期せぬ呼出になる。
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: () => Promise.resolve(),
}));

const {
  expireStalePendingSmartLockPasscodes,
  STALE_PENDING_THRESHOLD_MINUTES,
} = await import("@/shared/domain/smart-lock/revoke-passcode");

describe("STALE_PENDING_THRESHOLD_MINUTES", () => {
  test("poll timeout (45s) より十分に長い閾値である (race 防止の下限)", () => {
    // poll timeout との race で誤って FAILED に倒す事故を防ぐため、
    // 閾値は poll 上限 45s より十分に長くする。10 分未満は運用上危険域。
    expect(STALE_PENDING_THRESHOLD_MINUTES).toBeGreaterThanOrEqual(10);
  });

  test("SwitchBot webhook の実運用遅延を許容する現行値: 30 分", () => {
    // 定数の値を pin してレビュー時の意図を明示 (現行運用値)。
    expect(STALE_PENDING_THRESHOLD_MINUTES).toBe(30);
  });
});

describe("expireStalePendingSmartLockPasscodes", () => {
  beforeEach(() => {
    mockUpdateMany.mockClear();
    mockFindMany.mockClear();
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    // PR#11: findMany が空の場合は updateMany を呼ばず早期 return する。
    // 個別 test で「呼ばれる」ケースを検証したい時はここを上書きする。
    mockFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "pcode-1", reservationId: "res-1" },
        { id: "pcode-2", reservationId: "res-2" },
      ]),
    );
  });

  test("cutoff = now - STALE_PENDING_THRESHOLD_MINUTES で PENDING のみを FAILED に倒す", async () => {
    const now = new Date("2027-06-15T12:00:00Z");
    await expireStalePendingSmartLockPasscodes(now);

    const call = mockUpdateMany.mock.calls[0];
    if (!call) throw new Error("updateMany was not called");
    const args = call[0] as {
      where: { status: string; createdAt: { lt: Date } };
      data: { status: string; failureReason: string };
    };

    expect(args.where.status).toBe("PENDING");
    expect(args.where.createdAt.lt).toBeInstanceOf(Date);

    // cutoff は now から exactly threshold 分だけ遡った時刻
    const expectedCutoffMs =
      now.getTime() - STALE_PENDING_THRESHOLD_MINUTES * 60 * 1000;
    expect(args.where.createdAt.lt.getTime()).toBe(expectedCutoffMs);

    expect(args.data.status).toBe("FAILED");
    expect(args.data.failureReason).toContain(
      String(STALE_PENDING_THRESHOLD_MINUTES),
    );
  });

  test("対象 0 件でも 0 を返す (Prisma updateMany の count contract)", async () => {
    // findMany 0 件で早期 return → updateMany 未呼出でも 0 を返す
    mockFindMany.mockImplementation(() => Promise.resolve([]));
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    const result = await expireStalePendingSmartLockPasscodes(new Date());
    expect(result).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("複数件マッチ時は Prisma の count をそのまま返す", async () => {
    mockFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "p1", reservationId: "r1" },
        { id: "p2", reservationId: "r2" },
      ]),
    );
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 7 }));
    const result = await expireStalePendingSmartLockPasscodes(new Date());
    expect(result).toBe(7);
  });
});
