/**
 * `createReservationSeriesCommand` / `cancelReservationSeriesCommand` の単体テスト（mock）。
 *
 * Phase B.2 task 13: series 作成（RRULE 展開 → advisory lock → overlap 事前 check →
 * TermsAgreement → coupon → series/instance 一括 insert）と series キャンセル
 * （this-only / this-and-following / series-all の 3 scope 分岐）を、直接の
 * 協調モジュール（overlap query / terms / cancel-core / side-effects）を mock して検証する。
 *
 * `validateRruleForSeries`（series-rrule.ts）と advisory lock wrapper
 * （series-advisory-lock.ts / space-locks.ts）は純粋関数 / `tx.$executeRaw` のみに
 * 依存する薄い wrapper なので実装をそのまま使い、`tx.$executeRaw` の呼び出し内容
 * （728357 → 728351 の順序）を検証する。
 *
 * mock パターンは `bulk-side-effects.test.ts`（Task 12）と同型:
 * mock.module を import 前に登録 → 動的 import は不要（`@/shared/db/prisma` 経由の
 * 静的 import で SUT を読み込む、preload の DATABASE_URL ダミー固定と無関係な
 * 純粋 mock テストのため動的 import 手順は不要）。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks（モジュール解決の都合上、import より前に登録する）
// ---------------------------------------------------------------------------

const mockSettingsFindUniqueOrThrow = mock<
  (args: Record<string, unknown>) => Promise<{ maxRecurrenceInstances: number }>
>(() => Promise.resolve({ maxRecurrenceInstances: 26 }));

const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
>(() => Promise.resolve(undefined));

const mockSeriesCreate = mock<
  (
    args: Record<string, unknown>,
  ) => Promise<{ id: string; instanceCount: number }>
>(() => Promise.resolve({ id: "series-1", instanceCount: 0 }));
const mockSeriesUpdate = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({}));
const mockSeriesFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));

const mockReservationCreateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockReservationFindMany = mock<
  (args: Record<string, unknown>) => Promise<{ id: string }[]>
>(() => Promise.resolve([]));
const mockReservationFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));

const mockCouponUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));

const mockTx = {
  $executeRaw: mockExecuteRaw,
  reservationSeries: {
    create: mockSeriesCreate,
    update: mockSeriesUpdate,
    findUnique: mockSeriesFindUnique,
  },
  reservation: {
    createMany: mockReservationCreateMany,
    findMany: mockReservationFindMany,
    findUnique: mockReservationFindUnique,
  },
  coupon: { updateMany: mockCouponUpdateMany },
};

const mockTransaction = mock<
  (cb: (tx: typeof mockTx) => Promise<unknown>) => Promise<unknown>
>((cb) => cb(mockTx));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: { findUniqueOrThrow: mockSettingsFindUniqueOrThrow },
    $transaction: mockTransaction,
  },
}));

const mockCheckOverlap = mock<
  (args: Record<string, unknown>) => Promise<{ hasOverlap: boolean }>
>(() => Promise.resolve({ hasOverlap: false }));
mock.module("@/shared/domain/reservations/availability", () => ({
  checkReservationOverlapQuery: mockCheckOverlap,
}));

const mockAssertTermsAgreed = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/terms/queries", () => ({
  assertAllRequiredTermsAgreed: mockAssertTermsAgreed,
}));

const mockRecordTermsAgreements = mock<
  (
    args: Record<string, unknown>,
  ) => Promise<{ termsId: string; contentHash: string; agreedAt: Date }[]>
>(() => Promise.resolve([]));
mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreements: mockRecordTermsAgreements,
}));

const mockApplyBulkCancellation = mock<
  (
    tx: unknown,
    ids: string[],
    options: Record<string, unknown>,
  ) => Promise<{ cancelledIds: string[] }>
>((_tx, ids) => Promise.resolve({ cancelledIds: ids }));
mock.module("@/shared/domain/reservations/cancel-core", () => ({
  applyBulkCancellation: mockApplyBulkCancellation,
  CANCELLABLE_STATUSES: ["PENDING", "CONFIRMED"],
}));

const mockApplyCancellationSideEffects = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockApplyBulkCancellationSideEffects = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: mockApplyCancellationSideEffects,
  applyBulkCancellationSideEffects: mockApplyBulkCancellationSideEffects,
}));

// ---------------------------------------------------------------------------
// SUT を mock 登録後に import
// ---------------------------------------------------------------------------

import {
  cancelReservationSeriesCommand,
  createReservationSeriesCommand,
  type CreateReservationSeriesInput,
  type ReservationSeriesTemplateData,
} from "@/shared/domain/reservations/series-commands";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const SERIES_ID = "33333333-3333-4333-8333-333333333333";
const DTSTART = new Date("2026-07-21T10:00:00Z"); // 火曜日
const NOW = new Date("2026-07-17T00:00:00Z");

const templateData: ReservationSeriesTemplateData = {
  totalPrice: 5000,
  basePrice: 5000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 2,
    totalBasePrice: 5000,
    holidayFlags: {},
    legacy: true,
  },
  taxRateType: "standard" as ReservationSeriesTemplateData["taxRateType"],
  taxRate: 10,
  taxAmount: 500,
  totalPriceWithTax: 5500,
};

function baseCreateInput(
  overrides?: Partial<CreateReservationSeriesInput>,
): CreateReservationSeriesInput {
  return {
    spaceId: SPACE_ID,
    customerId: CUSTOMER_ID,
    rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
    dtstart: DTSTART,
    duration: 120,
    templateData,
    agreements: [],
    now: NOW,
    ...overrides,
  };
}

function resetAllMocks(): void {
  mockSettingsFindUniqueOrThrow.mockReset();
  mockExecuteRaw.mockReset();
  mockSeriesCreate.mockReset();
  mockSeriesUpdate.mockReset();
  mockSeriesFindUnique.mockReset();
  mockReservationCreateMany.mockReset();
  mockReservationFindMany.mockReset();
  mockReservationFindUnique.mockReset();
  mockCouponUpdateMany.mockReset();
  mockTransaction.mockReset();
  mockCheckOverlap.mockReset();
  mockAssertTermsAgreed.mockReset();
  mockRecordTermsAgreements.mockReset();
  mockApplyBulkCancellation.mockReset();
  mockApplyCancellationSideEffects.mockReset();
  mockApplyBulkCancellationSideEffects.mockReset();

  mockSettingsFindUniqueOrThrow.mockResolvedValue({
    maxRecurrenceInstances: 26,
  });
  mockExecuteRaw.mockResolvedValue(undefined);
  mockSeriesCreate.mockResolvedValue({ id: SERIES_ID, instanceCount: 3 });
  mockSeriesUpdate.mockResolvedValue({});
  mockSeriesFindUnique.mockResolvedValue({
    id: SERIES_ID,
    deletedAt: null,
    couponId: null,
  });
  mockReservationCreateMany.mockResolvedValue({ count: 3 });
  mockReservationFindMany.mockResolvedValue([
    { id: "r1" },
    { id: "r2" },
    { id: "r3" },
  ]);
  mockReservationFindUnique.mockResolvedValue(null);
  mockCouponUpdateMany.mockResolvedValue({ count: 1 });
  mockTransaction.mockImplementation((cb) => cb(mockTx));
  mockCheckOverlap.mockResolvedValue({ hasOverlap: false });
  mockAssertTermsAgreed.mockResolvedValue(undefined);
  mockRecordTermsAgreements.mockResolvedValue([]);
  mockApplyBulkCancellation.mockImplementation((_tx, ids) =>
    Promise.resolve({ cancelledIds: ids as string[] }),
  );
  mockApplyCancellationSideEffects.mockResolvedValue(undefined);
  mockApplyBulkCancellationSideEffects.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// createReservationSeriesCommand
// ---------------------------------------------------------------------------

describe("createReservationSeriesCommand (Phase B.2 task 13)", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  test("正常系: 3 instance を作成し series + instanceIds を返す", async () => {
    const result = await createReservationSeriesCommand(baseCreateInput());

    expect(result).toEqual({
      series: { id: SERIES_ID, instanceCount: 3 },
      instanceIds: ["r1", "r2", "r3"],
    });

    // advisory lock: 728357 (series) → 728351 (space) の順で取得
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    const firstCallSql = mockExecuteRaw.mock.calls[0]?.[0]?.join("");
    const secondCallSql = mockExecuteRaw.mock.calls[1]?.[0]?.join("");
    expect(firstCallSql).toContain("728357");
    expect(secondCallSql).toContain("728351");

    // overlap 事前 check は 3 instance 分
    expect(mockCheckOverlap).toHaveBeenCalledTimes(3);

    // createMany は 1 回・3 行
    expect(mockReservationCreateMany).toHaveBeenCalledTimes(1);
    const createManyArgs = mockReservationCreateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>[];
    };
    expect(createManyArgs.data).toHaveLength(3);
  });

  test("instance は couponId=null が強制される（series 側に couponId があっても）", async () => {
    await createReservationSeriesCommand(
      baseCreateInput({ couponId: "coupon-1" }),
    );

    const createManyArgs = mockReservationCreateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>[];
    };
    for (const row of createManyArgs.data) {
      expect(row["couponId"]).toBeNull();
    }
    // series row 自体には couponId が渡る
    const seriesCreateArgs = mockSeriesCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(seriesCreateArgs.data["couponId"]).toBe("coupon-1");
  });

  test("coupon usage 加算: couponId 指定時のみ usageCount increment", async () => {
    await createReservationSeriesCommand(
      baseCreateInput({ couponId: "coupon-1" }),
    );
    expect(mockCouponUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockCouponUpdateMany).toHaveBeenCalledWith({
      where: { id: "coupon-1" },
      data: { usageCount: { increment: 1 } },
    });
  });

  test("coupon usage 加算: couponId 未指定なら usageCount 加算しない", async () => {
    await createReservationSeriesCommand(baseCreateInput());
    expect(mockCouponUpdateMany).not.toHaveBeenCalled();
  });

  test("termsAgreement N 行: recordTermsAgreements の返り値から agreementSnapshot を N 件構築する", async () => {
    const agreedAt = new Date("2026-07-17T01:00:00Z");
    mockRecordTermsAgreements.mockResolvedValue([
      { termsId: "terms-1", contentHash: "hash1", agreedAt },
      { termsId: "terms-2", contentHash: "hash2", agreedAt },
    ]);

    await createReservationSeriesCommand(
      baseCreateInput({
        agreements: [{ termsId: "terms-1" }, { termsId: "terms-2" }],
      }),
    );

    expect(mockAssertTermsAgreed).toHaveBeenCalledTimes(1);
    expect(mockAssertTermsAgreed.mock.calls[0]?.[0]).toMatchObject({
      scope: "RESERVATION_SERIES",
      agreements: [{ termsId: "terms-1" }, { termsId: "terms-2" }],
    });

    expect(mockRecordTermsAgreements).toHaveBeenCalledTimes(1);
    expect(mockRecordTermsAgreements.mock.calls[0]?.[0]).toMatchObject({
      scope: "RESERVATION_SERIES",
      customerId: CUSTOMER_ID,
      agreements: [{ termsId: "terms-1" }, { termsId: "terms-2" }],
    });

    const seriesCreateArgs = mockSeriesCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    const snapshot = seriesCreateArgs.data["agreementSnapshot"] as unknown[];
    expect(snapshot).toHaveLength(2);
    expect(snapshot).toEqual([
      {
        termsId: "terms-1",
        contentHash: "hash1",
        agreedAt: agreedAt.toISOString(),
      },
      {
        termsId: "terms-2",
        contentHash: "hash2",
        agreedAt: agreedAt.toISOString(),
      },
    ]);
  });

  test("overlap detection: N 回目の instance が重複していれば「N 回目 (日付)」の CONFLICT を投げ createMany しない", async () => {
    // 3 instance 中 2 番目 (index=1) で衝突させる
    mockCheckOverlap
      .mockResolvedValueOnce({ hasOverlap: false })
      .mockResolvedValueOnce({ hasOverlap: true });

    await expect(
      createReservationSeriesCommand(baseCreateInput()),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("2 回目"),
    });

    expect(mockReservationCreateMany).not.toHaveBeenCalled();
    expect(mockSeriesCreate).not.toHaveBeenCalled();
  });

  test("maxInstances 超過: tx に入る前に VALIDATION error（advisory lock 未取得）", async () => {
    mockSettingsFindUniqueOrThrow.mockResolvedValue({
      maxRecurrenceInstances: 1,
    });

    await expect(
      createReservationSeriesCommand(baseCreateInput()),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancelReservationSeriesCommand
// ---------------------------------------------------------------------------

function baseCancelRequest(): {
  ip: string | null;
  userAgent: string | null;
} {
  return { ip: "203.0.113.10", userAgent: "Mozilla/5.0 (Test)" };
}

describe("cancelReservationSeriesCommand (Phase B.2 task 13)", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  test("this-only: fromInstanceId 1 件を単発経路 (applyCancellationSideEffects) でキャンセル", async () => {
    mockReservationFindUnique.mockResolvedValue({
      seriesId: SERIES_ID,
      startTime: new Date("2026-07-21T10:00:00Z"),
    });
    mockApplyBulkCancellation.mockResolvedValue({ cancelledIds: ["r1"] });

    const result = await cancelReservationSeriesCommand({
      seriesId: SERIES_ID,
      scope: "this-only",
      fromInstanceId: "r1",
      cancelledByType: "ADMIN",
      channel: "admin",
      request: baseCancelRequest(),
      now: NOW,
    });

    expect(result).toEqual({
      cancelledCount: 1,
      cancelledReservationIds: ["r1"],
    });
    expect(mockApplyBulkCancellation).toHaveBeenCalledWith(
      mockTx,
      ["r1"],
      expect.objectContaining({ cancelledByType: "ADMIN", now: NOW }),
    );
    expect(mockApplyCancellationSideEffects).toHaveBeenCalledTimes(1);
    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "r1",
        channel: "admin",
      }),
    );
    expect(mockApplyBulkCancellationSideEffects).not.toHaveBeenCalled();
    // this-only は series row を更新しない
    expect(mockSeriesUpdate).not.toHaveBeenCalled();
  });

  test("this-only: fromInstanceId がこの series に属さない場合は VALIDATION", async () => {
    mockReservationFindUnique.mockResolvedValue({
      seriesId: "different-series",
      startTime: new Date("2026-07-21T10:00:00Z"),
    });

    await expect(
      cancelReservationSeriesCommand({
        seriesId: SERIES_ID,
        scope: "this-only",
        fromInstanceId: "r1",
        cancelledByType: "ADMIN",
        channel: "admin",
        request: baseCancelRequest(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(mockApplyBulkCancellation).not.toHaveBeenCalled();
  });

  test("this-only: fromInstanceId 未指定は VALIDATION", async () => {
    await expect(
      cancelReservationSeriesCommand({
        seriesId: SERIES_ID,
        scope: "this-only",
        cancelledByType: "ADMIN",
        channel: "admin",
        request: baseCancelRequest(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  test("this-and-following: fromInstance.startTime 以降を bulk 経路でキャンセル", async () => {
    mockReservationFindUnique.mockResolvedValue({
      seriesId: SERIES_ID,
      startTime: new Date("2026-08-04T10:00:00Z"),
    });
    mockReservationFindMany.mockResolvedValue([{ id: "r2" }, { id: "r3" }]);
    mockApplyBulkCancellation.mockResolvedValue({
      cancelledIds: ["r2", "r3"],
    });

    const result = await cancelReservationSeriesCommand({
      seriesId: SERIES_ID,
      scope: "this-and-following",
      fromInstanceId: "r2",
      cancelledByType: "ADMIN",
      channel: "admin",
      request: baseCancelRequest(),
      now: NOW,
    });

    expect(result.cancelledCount).toBe(2);
    expect(mockApplyBulkCancellationSideEffects).toHaveBeenCalledTimes(1);
    expect(mockApplyBulkCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationIds: ["r2", "r3"],
        scope: "this-and-following",
        seriesId: SERIES_ID,
      }),
    );
    expect(mockApplyCancellationSideEffects).not.toHaveBeenCalled();
    expect(mockSeriesUpdate).not.toHaveBeenCalled();
  });

  test("series-all: 全 instance をキャンセルし series を soft-delete + coupon decrement", async () => {
    mockSeriesFindUnique.mockResolvedValue({
      id: SERIES_ID,
      deletedAt: null,
      couponId: "coupon-1",
    });
    mockReservationFindMany.mockResolvedValue([
      { id: "r1" },
      { id: "r2" },
      { id: "r3" },
    ]);
    mockApplyBulkCancellation.mockResolvedValue({
      cancelledIds: ["r1", "r2", "r3"],
    });

    const result = await cancelReservationSeriesCommand({
      seriesId: SERIES_ID,
      scope: "series-all",
      cancellationReason: "都合により",
      cancelledByType: "ADMIN",
      channel: "admin",
      actorUserId: "admin-1",
      request: baseCancelRequest(),
      now: NOW,
    });

    expect(result.cancelledCount).toBe(3);
    expect(mockSeriesUpdate).toHaveBeenCalledTimes(1);
    expect(mockSeriesUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: SERIES_ID },
      data: {
        cancelledAt: NOW,
        cancelledByType: "ADMIN",
        cancellationReason: "都合により",
        deletedAt: NOW,
        deletedById: "admin-1",
      },
    });
    expect(mockCouponUpdateMany).toHaveBeenCalledWith({
      where: { id: "coupon-1", usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
    expect(mockApplyBulkCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "series-all", seriesId: SERIES_ID }),
    );
  });

  test("series-all: series.couponId が null なら coupon decrement しない", async () => {
    mockSeriesFindUnique.mockResolvedValue({
      id: SERIES_ID,
      deletedAt: null,
      couponId: null,
    });
    mockApplyBulkCancellation.mockResolvedValue({ cancelledIds: ["r1"] });

    await cancelReservationSeriesCommand({
      seriesId: SERIES_ID,
      scope: "series-all",
      cancelledByType: "ADMIN",
      channel: "admin",
      request: baseCancelRequest(),
      now: NOW,
    });

    expect(mockCouponUpdateMany).not.toHaveBeenCalled();
  });

  test("既にキャンセル済 (deletedAt !== null) の series は CONFLICT", async () => {
    mockSeriesFindUnique.mockResolvedValue({
      id: SERIES_ID,
      deletedAt: new Date("2026-07-01T00:00:00Z"),
      couponId: null,
    });

    await expect(
      cancelReservationSeriesCommand({
        seriesId: SERIES_ID,
        scope: "series-all",
        cancelledByType: "ADMIN",
        channel: "admin",
        request: baseCancelRequest(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockApplyBulkCancellation).not.toHaveBeenCalled();
  });

  test("存在しない series は NOT_FOUND", async () => {
    mockSeriesFindUnique.mockResolvedValue(null);

    await expect(
      cancelReservationSeriesCommand({
        seriesId: SERIES_ID,
        scope: "series-all",
        cancelledByType: "ADMIN",
        channel: "admin",
        request: baseCancelRequest(),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("cancelledIds が空 (claim 失敗) なら副作用関数を一切呼ばない", async () => {
    mockSeriesFindUnique.mockResolvedValue({
      id: SERIES_ID,
      deletedAt: null,
      couponId: null,
    });
    mockApplyBulkCancellation.mockResolvedValue({ cancelledIds: [] });

    const result = await cancelReservationSeriesCommand({
      seriesId: SERIES_ID,
      scope: "series-all",
      cancelledByType: "ADMIN",
      channel: "admin",
      request: baseCancelRequest(),
      now: NOW,
    });

    expect(result).toEqual({ cancelledCount: 0, cancelledReservationIds: [] });
    expect(mockApplyCancellationSideEffects).not.toHaveBeenCalled();
    expect(mockApplyBulkCancellationSideEffects).not.toHaveBeenCalled();
    // series soft-delete 自体は claim 数に関わらず実行される
    expect(mockSeriesUpdate).toHaveBeenCalledTimes(1);
  });
});
