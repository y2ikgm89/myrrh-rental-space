import { describe, test, expect, mock, beforeEach } from "bun:test";

// prisma.$transaction をモック（コールバックに mockTx を渡して実行）

const mockFindFirst = mock<(args: Record<string, unknown>) => Promise<unknown>>(
  () => Promise.resolve(null),
);
const mockUpdate = mock<(args: Record<string, unknown>) => Promise<unknown>>(
  () => Promise.resolve({ id: "r1" }),
);
const mockCouponUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ count: 0 }));

const mockTx = {
  reservation: { findFirst: mockFindFirst, update: mockUpdate },
  coupon: { updateMany: mockCouponUpdateMany },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) => cb(mockTx),
  },
}));

import { cancelReservationByToken } from "@/shared/domain/reservations/customer-commands";

// 現実時刻基準で必ず期限内になる遠未来
const FAR_FUTURE = new Date("2099-01-01T00:00:00Z");

describe("cancelReservationByToken", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
    mockCouponUpdateMany.mockReset();
    mockUpdate.mockResolvedValue({ id: "r1" });
    mockCouponUpdateMany.mockResolvedValue({ count: 0 });
  });

  test("予約が見つからなければエラーで更新しない", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await cancelReservationByToken("r1", 24);

    expect(result).toEqual({ success: false, error: "予約が見つかりません" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("有効な予約をキャンセルし payload を返す（customerId フィルタなし）", async () => {
    mockFindFirst.mockResolvedValue({
      id: "r1",
      status: "PENDING",
      startTime: FAR_FUTURE,
      couponId: null,
    });

    const result = await cancelReservationByToken("r1", 24, "都合により");

    expect(result).toEqual({ success: true, payload: { reservationId: "r1" } });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1", deletedAt: null } }),
    );
  });
});
