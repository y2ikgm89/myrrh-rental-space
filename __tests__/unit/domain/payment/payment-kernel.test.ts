import { describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

mock.module("server-only", () => ({}));
await installPrismaEnumsMock({ PaymentStatus });
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: async () => {
      throw new Error(
        "prisma.$transaction should not run in kernel unit tests",
      );
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
