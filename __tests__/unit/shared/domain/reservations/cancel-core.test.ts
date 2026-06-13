import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ReservationStatus } from "@generated/prisma/enums";
import { applyCancellation } from "@/shared/domain/reservations/cancel-core";

const mockReservationUpdate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "r1" }));
const mockCouponUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));

const mockTx = {
  reservation: { update: mockReservationUpdate },
  coupon: { updateMany: mockCouponUpdateMany },
};

const NOW = new Date("2026-04-01T00:00:00Z");
const FUTURE_START = new Date("2026-04-10T00:00:00Z"); // 期限内（9日後）

describe("applyCancellation", () => {
  beforeEach(() => {
    mockReservationUpdate.mockReset();
    mockCouponUpdateMany.mockReset();
    mockReservationUpdate.mockResolvedValue({ id: "r1" });
    mockCouponUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("PENDING かつ期限内なら CANCELLED に更新して success", async () => {
    const result = await applyCancellation(
      mockTx as never,
      {
        id: "r1",
        status: ReservationStatus.PENDING,
        startTime: FUTURE_START,
        couponId: null,
      },
      { deadlineHours: 24, now: NOW, cancellationReason: null },
    );

    expect(result).toEqual({ success: true });
    expect(mockReservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1", deletedAt: null },
        data: expect.objectContaining({
          status: ReservationStatus.CANCELLED,
          cancelledAt: NOW,
          cancelledByType: "CUSTOMER",
          icsSequence: { increment: 1 },
        }),
      }),
    );
  });

  test("既に CANCELLED ならエラーで更新しない", async () => {
    const result = await applyCancellation(
      mockTx as never,
      {
        id: "r1",
        status: ReservationStatus.CANCELLED,
        startTime: FUTURE_START,
        couponId: null,
      },
      { deadlineHours: 24, now: NOW, cancellationReason: null },
    );

    expect(result).toEqual({
      success: false,
      error: "この予約はキャンセルできません",
    });
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("キャンセル期限を過ぎていればエラーで更新しない", async () => {
    const soonStart = new Date("2026-04-01T12:00:00Z"); // 12時間後 < 24h
    const result = await applyCancellation(
      mockTx as never,
      {
        id: "r1",
        status: ReservationStatus.CONFIRMED,
        startTime: soonStart,
        couponId: null,
      },
      { deadlineHours: 24, now: NOW, cancellationReason: null },
    );

    expect(result.success).toBe(false);
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("クーポン付き予約はクーポン使用回数を戻す", async () => {
    await applyCancellation(
      mockTx as never,
      {
        id: "r1",
        status: ReservationStatus.CONFIRMED,
        startTime: FUTURE_START,
        couponId: "c1",
      },
      { deadlineHours: 24, now: NOW, cancellationReason: null },
    );

    expect(mockCouponUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      }),
    );
  });

  test("クーポンなし予約は coupon.updateMany を呼ばない", async () => {
    await applyCancellation(
      mockTx as never,
      {
        id: "r1",
        status: ReservationStatus.PENDING,
        startTime: FUTURE_START,
        couponId: null,
      },
      { deadlineHours: 24, now: NOW, cancellationReason: null },
    );

    expect(mockCouponUpdateMany).not.toHaveBeenCalled();
  });

  test("理由を渡すと cancellationReason に記録する", async () => {
    await applyCancellation(
      mockTx as never,
      {
        id: "r1",
        status: ReservationStatus.PENDING,
        startTime: FUTURE_START,
        couponId: null,
      },
      { deadlineHours: 24, now: NOW, cancellationReason: "予定変更のため" },
    );

    expect(mockReservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancellationReason: "予定変更のため" }),
      }),
    );
  });
});
