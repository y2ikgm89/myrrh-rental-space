import { beforeEach, describe, expect, mock, test } from "bun:test";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

const mockReservationFindMany = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));
const mockReservationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockCouponUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockApplyCancellationSideEffects = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockLogError = mock(() => undefined);

const txClient = {
  reservation: {
    updateMany: mockReservationUpdateMany,
  },
  coupon: {
    updateMany: mockCouponUpdateMany,
  },
};

const mockTransaction = mock<
  (fn: (tx: typeof txClient) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClient));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findMany: mockReservationFindMany,
    },
    $transaction: mockTransaction,
  },
}));
mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: mockApplyCancellationSideEffects,
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH", LOW: "LOW" },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  expireStalePendingReservationsCommand,
  PENDING_RESERVATION_EXPIRY_MINUTES,
} = await import("@/shared/domain/reservations/pending-expiry");

describe("expireStalePendingReservationsCommand (Codex P1: PR#1042 fix)", () => {
  beforeEach(() => {
    mockReservationFindMany.mockReset();
    mockReservationUpdateMany.mockReset();
    mockCouponUpdateMany.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockLogError.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation((fn) => fn(txClient));

    mockReservationFindMany.mockResolvedValue([]);
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });
    mockCouponUpdateMany.mockResolvedValue({ count: 0 });
    mockApplyCancellationSideEffects.mockResolvedValue(undefined);
  });

  test("predicate: paymentStatus=PENDING + status ∈ {PENDING, CONFIRMED} + paymentInitiatedAt < cutoff", async () => {
    await expireStalePendingReservationsCommand();

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: PaymentStatus.PENDING,
          paymentInitiatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
  });

  test("空の候補セットなら early return: transaction / side effects とも未呼出", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(0);
    expect(result.expired).toEqual([]);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockApplyCancellationSideEffects).not.toHaveBeenCalled();
  });

  test("claim tx: status=CANCELLED + cancelledByType=SYSTEM + icsSequence increment", async () => {
    mockReservationFindMany.mockResolvedValueOnce([
      {
        id: "res-1",
        customerId: "cust-1",
        spaceId: "space-1",
        paymentInitiatedAt: new Date(0),
        couponId: null,
        stripeCheckoutSessionId: null,
      },
    ]);
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expireStalePendingReservationsCommand();

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockReservationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "res-1",
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: PaymentStatus.PENDING,
          paymentInitiatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: ReservationStatus.CANCELLED,
          cancelledByType: "SYSTEM",
          icsSequence: { increment: 1 },
        }),
      }),
    );
  });

  test("claim 成功後: coupon decrement は claim と同一 tx、Stripe expire 含む副作用は applyCancellationSideEffects に委譲", async () => {
    const now = Date.now();
    const paymentInitiatedAt = new Date(now - 90 * 60 * 1000);
    mockReservationFindMany.mockResolvedValueOnce([
      {
        id: "res-1",
        customerId: "cust-1",
        spaceId: "space-1",
        paymentInitiatedAt,
        couponId: "coupon-1",
      },
    ]);
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCouponUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "coupon-1", usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      }),
    );
    // Stripe session expire は pending-expiry 直呼びではなく
    // applyCancellationSideEffects → expireOpenCheckoutSessionBestEffort の SSoT。
    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res-1",
        channel: "system",
        actorUserId: null,
        awaitCompletion: true,
      }),
    );
  });

  test("ageMinutes は paymentInitiatedAt から計算される (createdAt ではない)", async () => {
    const now = Date.now();
    const paymentInitiatedAt = new Date(now - 90 * 60 * 1000);
    mockReservationFindMany.mockResolvedValueOnce([
      {
        id: "res-1",
        customerId: "cust-1",
        spaceId: "space-1",
        paymentInitiatedAt,
        couponId: null,
        stripeCheckoutSessionId: null,
      },
    ]);
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(1);
    expect(result.expired[0]?.ageMinutes).toBeGreaterThanOrEqual(89);
    expect(result.expired[0]?.ageMinutes).toBeLessThanOrEqual(91);
  });

  test("PENDING_RESERVATION_EXPIRY_MINUTES は 60 (Stripe session expires_at と同期する SSoT)", () => {
    expect(PENDING_RESERVATION_EXPIRY_MINUTES).toBe(60);
  });
});
