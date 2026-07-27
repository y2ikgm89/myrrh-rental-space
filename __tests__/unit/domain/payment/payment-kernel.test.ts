import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const stripeCallState = {
  inTx: false,
  callCount: 0,
  calledDuringTx: 0,
};

let transactionCallCount = 0;

const mockAcquirePaymentRefundAdvisoryLock = mock(async () => undefined);
const mockCreateRefundRecordIdempotent = mock(async () => undefined);
const mockCreateStripeRefundOrThrow = mock(async () => {
  stripeCallState.callCount += 1;
  if (stripeCallState.inTx) {
    stripeCallState.calledDuringTx += 1;
  }
  return { id: "re_test_1", status: "succeeded" };
});

mock.module("server-only", () => ({}));
await installPrismaEnumsMock({ PaymentStatus });
mock.module("@/shared/domain/payment/stripe-refund-orchestration", () => ({
  acquirePaymentRefundAdvisoryLock: mockAcquirePaymentRefundAdvisoryLock,
  createRefundRecordIdempotent: mockCreateRefundRecordIdempotent,
  createStripeRefundOrThrow: mockCreateStripeRefundOrThrow,
  PAYMENT_REFUND_TRANSACTION_OPTIONS: { timeout: 30_000, maxWait: 30_000 },
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: async <T>(fn: (tx: object) => Promise<T>): Promise<T> => {
      transactionCallCount += 1;
      stripeCallState.inTx = true;
      try {
        return await fn({});
      } finally {
        stripeCallState.inTx = false;
      }
    },
  },
}));

const {
  buildCheckoutSettleUpdateData,
  buildFailedClaimUpdateData,
  buildPaidClaimUpdateData,
  PAYMENT_STATUSES_CLAIMABLE_FOR_PAID,
  PAYMENT_STATUSES_TERMINAL_FOR_CHECKOUT_SETTLE,
  resolveRefundStatusFromChargeAmounts,
} = await import("@/shared/domain/payment/payment-status-guards");
const { buildChargeRefundPaymentStatusWhere } =
  await import("@/shared/domain/payment/payment-claim-orchestration");
const {
  computeAdminRefundAmount,
  buildAdminRefundPaymentStatusWhere,
  resolveAdminRefundPaymentStatus,
} = await import("@/shared/domain/payment/refund-command-orchestration");
const { orchestrateAutoRefundCommand } =
  await import("@/shared/domain/payment/orphan-refund-orchestration");

describe("payment/payment-status-guards", () => {
  test("buildPaidClaimUpdateData sets PAID and paidAt", () => {
    const paidAt = new Date("2026-01-01T00:00:00Z");
    expect(
      buildPaidClaimUpdateData({
        stripePaymentIntentId: "pi_1",
        paidAt,
      }),
    ).toEqual({
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: "pi_1",
      paidAt,
    });
  });

  test("buildFailedClaimUpdateData sets FAILED", () => {
    expect(buildFailedClaimUpdateData()).toEqual({
      paymentStatus: PaymentStatus.FAILED,
    });
  });

  test("buildCheckoutSettleUpdateData merges session id and extra fields", () => {
    expect(
      buildCheckoutSettleUpdateData({
        sessionId: "cs_test",
        extra: { paidAmount: 3000 },
      }),
    ).toEqual({
      paymentStatus: PaymentStatus.PENDING,
      stripeCheckoutSessionId: "cs_test",
      paidAmount: 3000,
    });
  });

  test("resolveRefundStatusFromChargeAmounts distinguishes partial and full", () => {
    expect(
      resolveRefundStatusFromChargeAmounts({
        chargeAmount: 1000,
        amountRefunded: 500,
      }),
    ).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(
      resolveRefundStatusFromChargeAmounts({
        chargeAmount: 1000,
        amountRefunded: 1000,
      }),
    ).toBe(PaymentStatus.REFUNDED);
  });

  test("status guard arrays stay aligned with webhook contracts", () => {
    expect(PAYMENT_STATUSES_CLAIMABLE_FOR_PAID).toEqual([
      PaymentStatus.UNPAID,
      PaymentStatus.PENDING,
    ]);
    expect(PAYMENT_STATUSES_TERMINAL_FOR_CHECKOUT_SETTLE).toEqual([
      PaymentStatus.PAID,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.REFUNDED,
    ]);
    expect(buildChargeRefundPaymentStatusWhere()).toEqual({
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      },
    });
  });
});

describe("payment/refund-command-orchestration", () => {
  test("computeAdminRefundAmount defaults to remaining balance", () => {
    expect(
      computeAdminRefundAmount({
        requestedAmount: undefined,
        chargeTotal: 5000,
        cumulativeSoFar: 2000,
        fullyRefundedMessage: "done",
      }),
    ).toEqual({
      amount: 3000,
      cumulativeSoFar: 2000,
      newCumulative: 5000,
      willBeFullyRefunded: true,
    });
  });

  test("computeAdminRefundAmount rejects over-refund", () => {
    expect(() =>
      computeAdminRefundAmount({
        requestedAmount: 4000,
        chargeTotal: 5000,
        cumulativeSoFar: 2000,
        fullyRefundedMessage: "done",
      }),
    ).toThrow("返金額が残額を超えています");
  });

  test("admin refund status helpers align with charge webhook guards", () => {
    expect(buildAdminRefundPaymentStatusWhere()).toEqual(
      buildChargeRefundPaymentStatusWhere(),
    );
    expect(resolveAdminRefundPaymentStatus(true)).toBe(PaymentStatus.REFUNDED);
    expect(resolveAdminRefundPaymentStatus(false)).toBe(
      PaymentStatus.PARTIALLY_REFUNDED,
    );
  });
});

describe("payment/orphan-refund-orchestration", () => {
  beforeEach(() => {
    stripeCallState.callCount = 0;
    stripeCallState.calledDuringTx = 0;
    stripeCallState.inTx = false;
    transactionCallCount = 0;
    mockAcquirePaymentRefundAdvisoryLock.mockClear();
    mockCreateRefundRecordIdempotent.mockClear();
    mockCreateStripeRefundOrThrow.mockClear();
  });

  test("createStripeRefundOrThrow runs outside advisory-lock transaction callbacks", async () => {
    const result = await orchestrateAutoRefundCommand({
      entityKind: "reservation",
      entityId: "res-1",
      stripeContext: {
        client: {} as AsyncOnlyStripe,
        stripeCurrency: "jpy",
      },
      actorType: "AUTO_ON_CANCEL",
      reason: "test orphan refund",
      operation: "refundOrphanedStripePaymentForCancelledReservation",
      savepointName: "refund_create_auto_on_cancel",
      userMessage: "キャンセル後の自動返金に失敗しました",
      stripeLogContext: { reservationId: "res-1" },
      planInTx: async () => ({
        kind: "refund",
        amount: 1500,
        paymentIntentId: "pi_1",
        idempotencyKey: "reservation-refund-res-1-1500",
      }),
      buildRefundRecord: ({ amount, stripeRefundId }) => ({
        reservationId: "res-1",
        amount,
        stripeRefundId,
        refundedByType: "AUTO_ON_CANCEL",
      }),
      finalizeInTx: async () => undefined,
    });

    expect(result).toEqual({
      outcome: "refunded",
      refundId: "re_test_1",
      refundAmount: 1500,
    });
    expect(transactionCallCount).toBe(2);
    expect(mockAcquirePaymentRefundAdvisoryLock).toHaveBeenCalledTimes(2);
    expect(mockCreateStripeRefundOrThrow).toHaveBeenCalledTimes(1);
    expect(stripeCallState.callCount).toBe(1);
    expect(stripeCallState.calledDuringTx).toBe(0);
    expect(mockCreateRefundRecordIdempotent).toHaveBeenCalledTimes(1);
  });

  test("terminal plan skips Stripe and phase-C transaction", async () => {
    const result = await orchestrateAutoRefundCommand({
      entityKind: "event-registration",
      entityId: "reg-1",
      stripeContext: {
        client: {} as AsyncOnlyStripe,
        stripeCurrency: "jpy",
      },
      actorType: "AUTO_CAPACITY_RACE",
      reason: "already closed",
      operation: "refundExpiredWaitlistOfferPayment",
      savepointName: "refund_create_capacity_race",
      userMessage: "容量レース後の自動返金に失敗しました",
      stripeLogContext: { registrationId: "reg-1" },
      planInTx: async () => ({
        kind: "terminal",
        result: { outcome: "already_refunded" },
      }),
      buildRefundRecord: ({ amount, stripeRefundId }) => ({
        eventRegistrationId: "reg-1",
        amount,
        stripeRefundId,
        refundedByType: "AUTO_CAPACITY_RACE",
      }),
      finalizeInTx: async () => undefined,
    });

    expect(result).toEqual({ outcome: "already_refunded" });
    expect(transactionCallCount).toBe(1);
    expect(mockCreateStripeRefundOrThrow).not.toHaveBeenCalled();
    expect(mockCreateRefundRecordIdempotent).not.toHaveBeenCalled();
  });
});
