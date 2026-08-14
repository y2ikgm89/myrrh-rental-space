import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CUSTOMER_EDITABLE_PAYMENT_STATUSES } from "@/shared/domain/reservations/edit-eligibility";

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

const mockSpaceFindUniqueOuter = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    locationId: "loc-1",
  }),
);
const mockSpaceFindUniqueTx = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "space-1",
    locationId: "loc-1",
    hourlyPrice: 1000,
    discountType: "NONE",
    discountValue: null,
    durationDiscountOverride: "use_global",
    taxRateType: "STANDARD",
  }),
);
const mockBlockedDateFindFirst = mock<
  () => Promise<{ reason: string | null } | null>
>(() => Promise.resolve(null));
const mockTxReservationFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "res-1",
    status: ReservationStatus.CONFIRMED,
    // 30 日以上先の startTime。isWithinDeadline (24h) を通過するため
    // beforeEach で `future` を代入する。ここは placeholder。
    startTime: new Date("2099-01-01T00:00:00Z"),
    taxRateType: "STANDARD",
    // % 単位 (10 = 10%)。tax.ts の calculateTaxAmount / Settings.taxStandardRate と
    // 同じ単位契約 (Task 8: 旧 0.1 は Math.floor(x*taxRate) の /100 抜けバグを
    // 偶然相殺していた表記だったため是正)。
    taxRate: 10,
    couponId: null,
    googleCalendarEventId: null,
    coupon: null,
  }),
);
const mockReservationUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ id: "res-1" }),
);
const mockReservationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockSettingsFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "BEST",
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "TAX_INCLUDED",
    showOriginalPrice: true,
  }),
);
const mockExecuteRaw = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockReservationRuleSettings = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    minMinutes: 60,
    maxMinutes: 480,
  }),
);

const mockCheckSpaceOverlap = mock<() => Promise<{ hasOverlap: boolean }>>(() =>
  Promise.resolve({ hasOverlap: false }),
);

// getSpaceRatePlans: rate plan 統合 (Task 8)。既定は空配列（rate plan 未設定）で
// 従来通り space.hourlyPrice が使われる。
const mockGetSpaceRatePlans = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("@/shared/domain/spaces/rate-plan-queries", () => ({
  getSpaceRatePlans: mockGetSpaceRatePlans,
}));

const txClient = {
  reservation: {
    findFirst: mockTxReservationFindFirst,
    update: mockReservationUpdate,
    updateMany: mockReservationUpdateMany,
  },
  space: { findUnique: mockSpaceFindUniqueTx },
  settingsCommerce: { findFirst: mockSettingsFindFirst },
  blockedDate: { findFirst: mockBlockedDateFindFirst },
  $executeRaw: mockExecuteRaw,
};

const mockTransaction = mock<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClient));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: { findUnique: mockSpaceFindUniqueOuter },
    blockedDate: { findFirst: mockBlockedDateFindFirst },
    $transaction: mockTransaction,
  },
}));

mock.module("@/shared/domain/spaces/overlap", () => ({
  checkSpaceOverlap: mockCheckSpaceOverlap,
}));

const mockGetBusinessHoursSettingsQuery = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/domain/reservations/availability", () => ({
  ensureDateNotBlocked: mock(
    async (spaceId: string, locationId: string, date: string, tx?: unknown) => {
      // 実装と同じ「blockedDate.findFirst → blocked なら throw」を再現
      const client = (tx ?? {
        blockedDate: { findFirst: mockBlockedDateFindFirst },
      }) as { blockedDate: { findFirst: typeof mockBlockedDateFindFirst } };
      const blocked = await client.blockedDate.findFirst();
      if (blocked) {
        const { DomainError } = await import("@/shared/domain/domain-error");
        throw new DomainError(
          blocked.reason
            ? `選択された日付は休業日です（${blocked.reason}）。別の日付をお選びください。`
            : "選択された日付は休業日です。別の日付をお選びください。",
          "CONFLICT",
        );
      }
    },
  ),
  getBusinessHoursSettingsQuery: mockGetBusinessHoursSettingsQuery,
  getReservationRuleSettings: mockReservationRuleSettings,
}));

// 変更期限 gate (isWithinDeadline) を通すため、reservationDeadlineNow を固定して
// mockTxReservationFindFirst の startTime を十分未来にする
mock.module("@/shared/domain/reservations/server-deadline-instant", () => ({
  reservationDeadlineNow: () => new Date("2026-01-01T00:00:00Z"),
}));

import { updateCustomerReservation } from "@/shared/domain/reservations/customer-commands";

describe("updateCustomerReservation — BlockedDate guard (PR#2)", () => {
  beforeEach(() => {
    mockSpaceFindUniqueOuter.mockClear();
    mockSpaceFindUniqueTx.mockClear();
    mockBlockedDateFindFirst.mockClear();
    mockTxReservationFindFirst.mockClear();
    mockReservationUpdate.mockClear();
    mockReservationUpdateMany.mockClear();
    mockReservationUpdateMany.mockImplementation(() =>
      Promise.resolve({ count: 1 }),
    );
    mockCheckSpaceOverlap.mockClear();
    mockGetSpaceRatePlans.mockClear();
    mockGetSpaceRatePlans.mockResolvedValue([]);

    // reset to default (not blocked)
    mockBlockedDateFindFirst.mockImplementation(() => Promise.resolve(null));

    // reset space mocks to default
    mockSpaceFindUniqueOuter.mockImplementation(() =>
      Promise.resolve({ locationId: "loc-1", capacity: 10 }),
    );
    mockSpaceFindUniqueTx.mockImplementation(() =>
      Promise.resolve({
        id: "space-1",
        locationId: "loc-1",
        capacity: 10,
        hourlyPrice: 1000,
        discountType: "NONE",
        discountValue: null,
        durationDiscountOverride: "use_global",
        taxRateType: "STANDARD",
      }),
    );

    mockGetBusinessHoursSettingsQuery.mockClear();
    mockGetBusinessHoursSettingsQuery.mockResolvedValue(null);

    // 十分未来の予約 (isWithinDeadline を通過)
    mockTxReservationFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.CONFIRMED,
        paymentStatus: "UNPAID",
        startTime: new Date("2026-12-01T02:00:00Z"), // JST 11:00
        taxRateType: "STANDARD",
        taxRate: 10,
        couponId: null,
        couponDiscountAmount: null,
        durationDiscountAmount: null,
        spaceDiscountAmount: null,
        googleCalendarEventId: null,
        coupon: null,
      }),
    );
  });

  const validInput = {
    spaceId: "space-1",
    date: "2026-12-15",
    startTime: "10:00",
    endTime: "12:00",
    numberOfGuests: 1,
    version: 0,
  };

  test("blocked date の場合 tx 外 pre-check で DomainError(CONFLICT) を throw する (reservation.update 未呼出)", async () => {
    mockBlockedDateFindFirst.mockImplementation(() =>
      Promise.resolve({ reason: "年末年始" }),
    );

    await expect(
      updateCustomerReservation("res-1", "cust-1", validInput, 24),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("blocked でなければ通常フロー (reservation.update 呼出) に進む", async () => {
    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect(result).toEqual({
      success: true,
      payload: { reservationId: "res-1", googleCalendarEventId: null },
    });
    // 最終書込は updateMany (atomic compare-and-swap with paymentStatus=UNPAID predicate)
    expect(mockReservationUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockReservationUpdate).not.toHaveBeenCalled();
    // blocked date は tx 外 pre-check と tx 内二重ガードで 2 回呼ばれる
    expect(mockBlockedDateFindFirst).toHaveBeenCalledTimes(2);
  });

  test("TOCTOU race: read から updateMany の間に paymentStatus が変わった場合 rollback (Codex P1 対応) — PR#13", async () => {
    // read 時は UNPAID を観測して gate 通過、update 時には別 tx で PENDING に
    // 遷移していて updateMany.count === 0 で claim 失敗する race を再現する。
    mockReservationUpdateMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    // Task 3 (optimistic concurrency): paymentStatus gate は tx 開始時点でしか検知
    // しないため、findFirst→updateMany 間の TOCTOU race (createCheckoutSessionCommand
    // との別 tx 衝突) は version mismatch と同一 count=0 分岐に落ちる。稀ケースとして
    // UX は後者優先文言に統一し、error code 分岐は将来課題 (spec §3.2)。
    expect(result).toEqual({
      success: false,
      error:
        "予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。",
    });
    expect(mockReservationUpdateMany).toHaveBeenCalledTimes(1);
    // updateMany の WHERE に paymentStatus 述語と version 述語が含まれることを assert。
    //
    // 集合は eligibility の SSoT（監査 F-62）。`UNPAID` 固定に戻すと、Checkout を
    // 開始して離脱し FAILED になった予約が**開けるのに保存だけ失敗する**状態に戻る。
    // PENDING / PAID を弾く TOCTOU 防御という本来の目的は保たれる。
    const call = mockReservationUpdateMany.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      where: expect.objectContaining({
        paymentStatus: { in: [...CUSTOMER_EDITABLE_PAYMENT_STATUSES] },
        version: 0,
      }),
    });
    expect([...CUSTOMER_EDITABLE_PAYMENT_STATUSES]).not.toContain("PENDING");
    expect([...CUSTOMER_EDITABLE_PAYMENT_STATUSES]).not.toContain("PAID");
  });

  test("PAID の予約は変更不可 (キャンセル+再予約に誘導、reservation.update 未呼出) — PR#13", async () => {
    mockTxReservationFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.CONFIRMED,
        paymentStatus: "PAID",
        startTime: new Date("2026-12-01T02:00:00Z"),
        taxRateType: "STANDARD",
        taxRate: 10,
        couponId: null,
        coupon: null,
      }),
    );

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect(result).toEqual({
      success: false,
      error:
        "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。",
    });
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("PENDING 決済中の予約も変更不可 (checkout session 生成中の中断防止) — PR#13", async () => {
    mockTxReservationFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.CONFIRMED,
        paymentStatus: "PENDING",
        startTime: new Date("2026-12-01T02:00:00Z"),
        taxRateType: "STANDARD",
        taxRate: 10,
        couponId: null,
        coupon: null,
      }),
    );

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect((result as { success: false; error: string }).success).toBe(false);
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("過去の日時への変更は advisory lock 取得前に早期 return (MYPAGE-EDIT-01)", async () => {
    // parseDateTimeLocalAsJst は +09:00 固定で JST を Date に変換する。
    // 2020-01-01T10:00+09:00 は Date.now() より遥かに過去のため過去時刻ガードに引っかかる。
    const pastInput = {
      spaceId: "space-1",
      date: "2020-01-01",
      startTime: "10:00",
      endTime: "12:00",
      numberOfGuests: 1,
      version: 0,
    };

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      pastInput,
      24,
    );

    expect(result).toEqual({
      success: false,
      error: "過去の日時には変更できません",
    });
    // 早期 return なので DB /書込は一切走らない (beforeEach でクリアされる mock 群のみ検証)
    expect(mockSpaceFindUniqueOuter).not.toHaveBeenCalled();
    expect(mockBlockedDateFindFirst).not.toHaveBeenCalled();
    expect(mockTxReservationFindFirst).not.toHaveBeenCalled();
    expect(mockReservationUpdate).not.toHaveBeenCalled();
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });

  test("spaceForBlockedCheck が見つからない場合 (削除済み/非公開) は 早期 return", async () => {
    mockSpaceFindUniqueOuter.mockImplementation(() => Promise.resolve(null));

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect(result).toEqual({
      success: false,
      error: "指定されたスペースが見つかりません",
    });
    expect(mockBlockedDateFindFirst).not.toHaveBeenCalled();
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });
});
