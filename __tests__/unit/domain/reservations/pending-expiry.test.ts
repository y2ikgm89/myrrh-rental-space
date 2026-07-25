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
const mockAssertStripeCredentialsConfigured = mock<
  () => Promise<{
    stripeSecretKey: string;
  }>
>(() => Promise.resolve({ stripeSecretKey: "sk_test" }));
const mockSessionsExpire = mock<(id: string) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockGetStripeClient = mock<
  () => Promise<{
    client: { checkout: { sessions: { expire: typeof mockSessionsExpire } } };
  }>
>(() =>
  Promise.resolve({
    client: { checkout: { sessions: { expire: mockSessionsExpire } } },
  }),
);
const mockLogError = mock(() => undefined);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findMany: mockReservationFindMany,
      updateMany: mockReservationUpdateMany,
    },
    coupon: {
      updateMany: mockCouponUpdateMany,
    },
  },
}));
mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: mockApplyCancellationSideEffects,
}));
mock.module("@/shared/domain/payment/availability", () => ({
  assertStripeCredentialsConfigured: mockAssertStripeCredentialsConfigured,
}));
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: mockGetStripeClient,
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
    mockAssertStripeCredentialsConfigured.mockReset();
    mockSessionsExpire.mockReset();
    mockGetStripeClient.mockReset();
    mockLogError.mockReset();

    mockReservationFindMany.mockResolvedValue([]);
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });
    mockCouponUpdateMany.mockResolvedValue({ count: 0 });
    mockApplyCancellationSideEffects.mockResolvedValue(undefined);
    mockAssertStripeCredentialsConfigured.mockResolvedValue({
      stripeSecretKey: "sk_test",
    });
    mockSessionsExpire.mockResolvedValue({});
    mockGetStripeClient.mockResolvedValue({
      client: { checkout: { sessions: { expire: mockSessionsExpire } } },
    });
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

  test("空の候補セットなら early return: updateMany / side effects とも未呼出", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(0);
    expect(result.expired).toEqual([]);
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    expect(mockApplyCancellationSideEffects).not.toHaveBeenCalled();
  });

  test("claim data: status=CANCELLED + cancelledByType=SYSTEM + icsSequence increment", async () => {
    mockReservationFindMany
      .mockResolvedValueOnce([
        {
          id: "res-1",
          customerId: "cust-1",
          spaceId: "space-1",
          paymentInitiatedAt: new Date(0),
          couponId: null,
          stripeCheckoutSessionId: null,
        },
      ])
      .mockResolvedValueOnce([]); // settled findMany
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expireStalePendingReservationsCommand();

    expect(mockReservationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
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

  test("claim 成功後: coupon decrement + session expire + system side effects", async () => {
    const now = Date.now();
    const paymentInitiatedAt = new Date(now - 90 * 60 * 1000);
    mockReservationFindMany
      .mockResolvedValueOnce([
        {
          id: "res-1",
          customerId: "cust-1",
          spaceId: "space-1",
          paymentInitiatedAt,
          couponId: "coupon-1",
          stripeCheckoutSessionId: "cs_test_1",
        },
      ])
      .mockResolvedValueOnce([
        { id: "res-1", customerId: "cust-1", spaceId: "space-1" },
      ]);
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(1);
    expect(mockCouponUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "coupon-1", usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      }),
    );
    expect(mockSessionsExpire).toHaveBeenCalledWith("cs_test_1");
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
    mockReservationFindMany
      .mockResolvedValueOnce([
        {
          id: "res-1",
          customerId: "cust-1",
          spaceId: "space-1",
          paymentInitiatedAt,
          couponId: null,
          stripeCheckoutSessionId: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: "res-1", customerId: "cust-1", spaceId: "space-1" },
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
