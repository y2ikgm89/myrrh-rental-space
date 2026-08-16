import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";

const mockExecuteRaw = mock<
  (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
>(() => Promise.resolve(undefined));
const mockExecuteRawUnsafe = mock<(query: string) => Promise<unknown>>(() =>
  Promise.resolve(undefined),
);
const mockRefundCreate = mock<(args: { data: unknown }) => Promise<unknown>>(
  () => Promise.resolve({ id: "refund-row-1" }),
);
const mockRefundUpdateMany = mock<
  (args: { where: unknown; data: unknown }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockRefundsCreate = mock<
  (
    params: Record<string, unknown>,
    options: { idempotencyKey: string },
  ) => Promise<{ id: string; status: string | null }>
>(() => Promise.resolve({ id: "re_test_1", status: "succeeded" }));

mock.module("server-only", () => ({}));
mock.module("@/shared/lib/stripe-shared", () => ({
  toStripeUnitAmount: (amount: number) => amount,
}));
mock.module("@/shared/lib/prisma-errors", () => ({
  isPrismaUniqueConstraintError: (error: unknown, field: string) =>
    error instanceof Error &&
    error.message.includes("P2002") &&
    (error.message.includes(field) ||
      error.message.includes(field.split(".").at(-1) ?? field)),
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH", CRITICAL: "CRITICAL" },
}));

const {
  PAYMENT_REFUND_LOCK_NAMESPACE,
  REFUND_AGGREGATE_EXCLUDED_STATUSES,
  TERMINAL_REFUND_STATUSES,
  acquirePaymentRefundAdvisoryLock,
  claimRefundSettlement,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  resolveRefundAmount,
} = await import("@/shared/domain/payment/stripe-refund-orchestration");

const tx = {
  $executeRaw: mockExecuteRaw,
  $executeRawUnsafe: mockExecuteRawUnsafe,
  refund: { create: mockRefundCreate, updateMany: mockRefundUpdateMany },
};

describe("stripe-refund-orchestration kernel", () => {
  beforeEach(() => {
    mockExecuteRaw.mockClear();
    mockExecuteRawUnsafe.mockClear();
    mockRefundCreate.mockClear();
    mockRefundUpdateMany.mockClear();
    mockRefundsCreate.mockClear();
  });

  test("PAYMENT_REFUND_LOCK_NAMESPACE matches db-domain registry", () => {
    expect(PAYMENT_REFUND_LOCK_NAMESPACE.reservation).toBe(728355);
    expect(PAYMENT_REFUND_LOCK_NAMESPACE["event-registration"]).toBe(728356);
  });

  test("TERMINAL_REFUND_STATUSES is the Stripe terminal set", () => {
    expect([...TERMINAL_REFUND_STATUSES]).toEqual([
      "succeeded",
      "failed",
      "canceled",
    ]);
  });

  test("REFUND_AGGREGATE_EXCLUDED_STATUSES excludes only non-movement statuses", () => {
    expect([...REFUND_AGGREGATE_EXCLUDED_STATUSES]).toEqual([
      "failed",
      "canceled",
    ]);
  });

  test("acquirePaymentRefundAdvisoryLock uses entity-specific namespace", async () => {
    await acquirePaymentRefundAdvisoryLock(tx, "reservation", "res-1");
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  test("createStripeRefundOrThrow returns Stripe refund id", async () => {
    const client = {
      refunds: { create: mockRefundsCreate },
    } as unknown as AsyncOnlyStripe;

    await expect(
      createStripeRefundOrThrow({
        client,
        paymentIntentId: "pi_test",
        amount: 1000,
        stripeCurrency: "jpy",
        metadata: { initiator: "ADMIN" },
        idempotencyKey: "reservation-refund-res-1-1000",
        operation: "refundReservationPayment",
        logContext: { reservationId: "res-1" },
        userMessage: "返金処理に失敗しました",
      }),
    ).resolves.toEqual({ id: "re_test_1", status: "succeeded" });
  });

  test("createStripeRefundOrThrow refuses a missing Stripe refund status", async () => {
    mockRefundsCreate.mockResolvedValueOnce({
      id: "re_no_status",
      status: null,
    });
    const client = {
      refunds: { create: mockRefundsCreate },
    } as unknown as AsyncOnlyStripe;

    await expect(
      createStripeRefundOrThrow({
        client,
        paymentIntentId: "pi_test",
        amount: 1000,
        stripeCurrency: "jpy",
        metadata: { initiator: "ADMIN" },
        idempotencyKey: "reservation-refund-res-1-null",
        operation: "refundReservationPayment",
        logContext: { reservationId: "res-1" },
        userMessage: "返金処理に失敗しました",
      }),
    ).rejects.toMatchObject({
      name: "DomainError",
      message: "返金処理に失敗しました",
    });
  });

  test("createStripeRefundOrThrow refuses an unknown Stripe refund status", async () => {
    mockRefundsCreate.mockResolvedValueOnce({
      id: "re_bad_status",
      status: "not-a-stripe-status",
    });
    const client = {
      refunds: { create: mockRefundsCreate },
    } as unknown as AsyncOnlyStripe;

    await expect(
      createStripeRefundOrThrow({
        client,
        paymentIntentId: "pi_test",
        amount: 1000,
        stripeCurrency: "jpy",
        metadata: { initiator: "ADMIN" },
        idempotencyKey: "reservation-refund-res-1-unknown",
        operation: "refundReservationPayment",
        logContext: { reservationId: "res-1" },
        userMessage: "返金処理に失敗しました",
      }),
    ).rejects.toMatchObject({
      name: "DomainError",
      message: "返金処理に失敗しました",
    });
  });

  test("createRefundRecordIdempotent rolls back savepoint on stripeRefundId race", async () => {
    mockRefundCreate.mockRejectedValueOnce(
      new Error("P2002 stripeRefundId unique"),
    );

    await createRefundRecordIdempotent(tx, "refund_create_reservation", {
      reservationId: "res-1",
      amount: 1000,
      stripeRefundId: "re_test_1",
      refundedByType: "ADMIN",
      status: "succeeded",
    });

    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SAVEPOINT refund_create_reservation",
    );
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "ROLLBACK TO SAVEPOINT refund_create_reservation",
    );
  });

  test("claimRefundSettlement excludes terminal refund statuses from the claim WHERE", async () => {
    await claimRefundSettlement(tx, "re_1");

    expect(mockRefundUpdateMany).toHaveBeenCalledTimes(1);
    const args = mockRefundUpdateMany.mock.calls[0]?.[0] as {
      where: { stripeRefundId: string; status: { notIn: string[] } };
    };
    expect(args.where.stripeRefundId).toBe("re_1");
    const notIn = args.where.status.notIn;
    expect(notIn).toContain("succeeded");
    expect(notIn).toContain("failed");
    expect(notIn).toContain("canceled");
  });

  test("createRefundRecordIdempotent rethrows non-unique errors without savepoint rollback", async () => {
    mockRefundCreate.mockRejectedValueOnce(new Error("boom"));

    await expect(
      createRefundRecordIdempotent(tx, "refund_create_reservation", {
        reservationId: "res-1",
        amount: 1000,
        stripeRefundId: "re_test_1",
        refundedByType: "ADMIN",
        status: "succeeded",
      }),
    ).rejects.toThrow("boom");

    expect(mockExecuteRawUnsafe).not.toHaveBeenCalledWith(
      "ROLLBACK TO SAVEPOINT refund_create_reservation",
    );
  });

  test("resolveRefundAmount uses remaining when amount omitted", () => {
    expect(
      resolveRefundAmount({
        chargeTotal: 5000,
        cumulativeSoFar: 2000,
        fullyRefundedMessage: "全額返金済み",
      }),
    ).toEqual({
      amount: 3000,
      cumulativeSoFar: 2000,
      newCumulative: 5000,
      willBeFullyRefunded: true,
    });
  });

  test("resolveRefundAmount rejects over-refund and fully refunded", () => {
    expect(() =>
      resolveRefundAmount({
        chargeTotal: 1000,
        cumulativeSoFar: 1000,
        fullyRefundedMessage: "全額返金済み",
      }),
    ).toThrow("全額返金済み");

    expect(() =>
      resolveRefundAmount({
        chargeTotal: 5000,
        cumulativeSoFar: 0,
        requestedAmount: 6000,
        fullyRefundedMessage: "全額返金済み",
      }),
    ).toThrow("残額を超えています");
  });
});
