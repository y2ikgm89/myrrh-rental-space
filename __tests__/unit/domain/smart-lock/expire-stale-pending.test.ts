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
// Codex P2 #1014 (comment 3566818385) 対応の race 検証のため、tracked mock 化。
const mockCreateNotification = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve(),
);
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (args: unknown) => mockCreateNotification(args),
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
    mockCreateNotification.mockClear();
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

  // Codex P2 #1014 (comment 3566818385): notify only rows actually transitioned to FAILED
  test("count が snapshot と一致すれば post-update findMany は skip する (common path)", async () => {
    mockFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "p1", reservationId: "r1" },
        { id: "p2", reservationId: "r2" },
      ]),
    );
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 2 }));

    await expireStalePendingSmartLockPasscodes(new Date());

    // pre-snapshot の 1 回だけ (post-update 再取得は subset 完全一致で skip)。
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    // dedupe 済み 2 件の reservation それぞれに通知が飛ぶ。
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  test("PENDING → CONFIRMED に webhook で flip した行は通知しない (race 保護)", async () => {
    // pre-snapshot は 2 件 stale。updateMany 直前に webhook が p2 を CONFIRMED に
    // flip → status: PENDING 述語で弾かれて count = 1。post-update findMany は
    // FAILED になった p1 だけを返す。通知は r1 のみに発火し、r2 (実は成功) には出ない。
    mockFindMany
      .mockImplementationOnce(() =>
        Promise.resolve([
          { id: "p1", reservationId: "r1" },
          { id: "p2", reservationId: "r2" },
        ]),
      )
      .mockImplementationOnce(() =>
        Promise.resolve([{ id: "p1", reservationId: "r1" }]),
      );
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 1 }));

    await expireStalePendingSmartLockPasscodes(new Date());

    // 2 回目の findMany は snapshot の id 集合を status: FAILED で絞り込む。
    expect(mockFindMany).toHaveBeenCalledTimes(2);
    const secondCall = mockFindMany.mock.calls[1];
    if (!secondCall) throw new Error("post-update findMany was not called");
    const secondArgs = secondCall[0] as {
      where: { id: { in: string[] }; status: string };
    };
    expect(secondArgs.where.status).toBe("FAILED");
    expect(secondArgs.where.id.in).toEqual(["p1", "p2"]);

    // 通知は r1 のみ。r2 は実は confirmed 済みなので発火しないことを検証。
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const notifyCall = mockCreateNotification.mock.calls[0];
    if (!notifyCall) throw new Error("notification was not fired");
    const notifyArgs = notifyCall[0] as {
      resourceType: string;
      resourceId: string;
    };
    expect(notifyArgs.resourceType).toBe("reservation");
    expect(notifyArgs.resourceId).toBe("r1");
  });
});
