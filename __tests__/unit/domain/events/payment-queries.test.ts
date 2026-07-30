import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const RegistrationStatus = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

const mockRegFindFirst = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegFindUnique = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockRefundAggregate = mock<
  (
    args: Record<string, unknown>,
  ) => Promise<{ _sum: { amount: number | null } }>
>(() => Promise.resolve({ _sum: { amount: 0 } }));
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

const mockLogError = mock(() => undefined);
const mockCreateNotificationCommand = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockRefundOrphanedStripePaymentForCancelledEventRegistration = mock<
  (input: {
    registrationId: string;
    stripePaymentIntentId: string;
    reason?: string;
  }) => Promise<{
    outcome: "refunded" | "already_refunded" | "not_applicable";
    refundId?: string;
    refundAmount?: number;
  }>
>(() => Promise.resolve({ outcome: "already_refunded" }));
const mockFireAndForget = mock<
  (promise: Promise<unknown>, context: Record<string, unknown>) => void
>((promise) => {
  void promise;
});

mock.module("server-only", () => ({}));

await installPrismaEnumsMock({ PaymentStatus, RegistrationStatus });
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findFirst: mockRegFindFirst,
      findUnique: mockRegFindUnique,
      updateMany: mockRegUpdateMany,
    },
    refund: {
      aggregate: mockRefundAggregate,
    },
  },
}));
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotificationCommand,
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));
mock.module("@/shared/domain/events/payment-commands", () => ({
  refundOrphanedStripePaymentForCancelledEventRegistration:
    mockRefundOrphanedStripePaymentForCancelledEventRegistration,
}));
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  NOTIFICATION_TYPE: {
    EVENT_REGISTRATION_REFUND: "event_registration_refund",
  },
  NOTIFICATION_TYPE_LABELS: {
    event_registration_refund: "イベント申込返金",
  },
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    VALIDATION: "VALIDATION",
    EXTERNAL_API: "EXTERNAL_API",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  claimEventRegistrationAsPaid,
  claimEventRegistrationAsFailed,
  finalizeSettledEventRegistrationRefund,
} = await import("@/shared/domain/events/payment-queries");
// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { REFUNDED_BY_TYPE } =
  await import("@/shared/lib/validations/enums/refund-attribution");

const REGISTRATION_ID = "550e8400-e29b-41d4-a716-446655440101";
const EVENT_ID = "550e8400-e29b-41d4-a716-446655440201";
const PAYMENT_INTENT_ID = "pi_test_event_123";

describe("events/payment-queries", () => {
  beforeEach(() => {
    mockRegFindFirst.mockClear();
    mockRegFindUnique.mockClear();
    mockRegUpdateMany.mockClear();
    mockLogError.mockClear();
    mockCreateNotificationCommand.mockClear();
    mockRefundOrphanedStripePaymentForCancelledEventRegistration.mockClear();
    mockFireAndForget.mockClear();
    mockRefundAggregate.mockClear();
    mockCreateAuditLogRecord.mockClear();
    mockRegUpdateMany.mockResolvedValue({ count: 0 });
    mockRefundOrphanedStripePaymentForCancelledEventRegistration.mockResolvedValue(
      { outcome: "already_refunded" },
    );
    mockFireAndForget.mockImplementation((promise) => {
      void promise;
    });
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  describe("claimEventRegistrationAsPaid", () => {
    test("CONFIRMED + UNPAID/PENDING を atomic に PAID に遷移する", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimEventRegistrationAsPaid(REGISTRATION_ID, {
        stripePaymentIntentId: PAYMENT_INTENT_ID,
      });

      expect(result).toBe(true);
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: REGISTRATION_ID,
            status: RegistrationStatus.CONFIRMED,
            paymentStatus: {
              in: [PaymentStatus.UNPAID, PaymentStatus.PENDING],
            },
          }),
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.PAID,
            stripePaymentIntentId: PAYMENT_INTENT_ID,
          }),
        }),
      );
      expect(mockRegFindUnique).not.toHaveBeenCalled();
    });

    test("既に PAID（count === 0）→ false を返し orphan 返金は呼ばない", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockRegFindUnique.mockResolvedValueOnce({
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        stripePaymentIntentId: PAYMENT_INTENT_ID,
      });

      const result = await claimEventRegistrationAsPaid(REGISTRATION_ID, {
        stripePaymentIntentId: PAYMENT_INTENT_ID,
      });

      expect(result).toBe(false);
      expect(
        mockRefundOrphanedStripePaymentForCancelledEventRegistration,
      ).not.toHaveBeenCalled();
      expect(mockLogError).not.toHaveBeenCalled();
    });

    test("count === 0 かつ status=CANCELLED → orphan 返金 + 通知", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockRegFindUnique.mockResolvedValueOnce({
        status: RegistrationStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        stripePaymentIntentId: null,
        eventId: EVENT_ID,
      });
      mockRefundOrphanedStripePaymentForCancelledEventRegistration.mockResolvedValueOnce(
        { outcome: "refunded", refundId: "re_auto_1", refundAmount: 5000 },
      );

      const result = await claimEventRegistrationAsPaid(REGISTRATION_ID, {
        stripePaymentIntentId: PAYMENT_INTENT_ID,
      });

      expect(result).toBe(false);
      expect(
        mockRefundOrphanedStripePaymentForCancelledEventRegistration,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: REGISTRATION_ID,
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        }),
      );
      expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event_registration_refund",
          resourceType: "event",
          resourceId: EVENT_ID,
        }),
      );
      expect(mockLogError).not.toHaveBeenCalled();
    });

    test("count === 0 かつ status=CANCELLED だが PaymentIntent ID が取れない → 通知 + CRITICAL ログ、返金は呼ばない", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockRegFindUnique.mockResolvedValueOnce({
        status: RegistrationStatus.CANCELLED,
        paymentStatus: PaymentStatus.UNPAID,
        stripePaymentIntentId: null,
        eventId: EVENT_ID,
      });

      const result = await claimEventRegistrationAsPaid(REGISTRATION_ID, {
        stripePaymentIntentId: null,
      });

      expect(result).toBe(false);
      expect(
        mockRefundOrphanedStripePaymentForCancelledEventRegistration,
      ).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalled();
      expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event_registration_refund",
          resourceType: "event",
          resourceId: EVENT_ID,
        }),
      );
    });
  });

  describe("claimEventRegistrationAsFailed", () => {
    test("WHERE に stripeCheckoutSessionId 一致必須 + paymentStatus notIn [PAID, REFUNDED, FAILED]、data は FAILED", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_matching_session",
      );

      expect(result).toBe(true);
      expect(mockRegUpdateMany).toHaveBeenCalledWith({
        where: {
          id: REGISTRATION_ID,
          stripeCheckoutSessionId: "cs_matching_session",
          paymentStatus: {
            notIn: [
              PaymentStatus.PAID,
              PaymentStatus.REFUNDED,
              PaymentStatus.FAILED,
            ],
          },
        },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
    });

    test("sessionId 不一致 (stale webhook) → count=0 で false を返す", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_stale_session",
      );

      expect(result).toBe(false);
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stripeCheckoutSessionId: "cs_stale_session",
          }),
        }),
      );
    });

    test("sessionId 一致 + eligible paymentStatus → count=1 で true", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_matching_session",
      );

      expect(result).toBe(true);
    });
  });

  describe("finalizeSettledEventRegistrationRefund", () => {
    const STRIPE_REFUND_ID = "re_test_event_settled";

    test("申込が見つからない → false（updateMany を呼ばない）", async () => {
      mockRegFindUnique.mockResolvedValueOnce(null);

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(result).toBe(false);
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
    });

    test("paidAmount が null → false", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: null });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(result).toBe(false);
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
    });

    test("ADMIN: 累積が paidAmount 未到達 → PARTIALLY_REFUNDED、PAID/PARTIALLY_REFUNDED からのみ claim", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 3000 } });
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(result).toBe(true);
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: REGISTRATION_ID,
            paymentStatus: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
            },
          }),
          data: { paymentStatus: PaymentStatus.PARTIALLY_REFUNDED },
        }),
      );
    });

    test("AUTO_CAPACITY_RACE: 入口 paymentStatus を問わず (REFUNDED 以外なら) 無条件 REFUNDED に遷移する", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 4000 } });
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
      );

      expect(result).toBe(true);
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: { not: PaymentStatus.REFUNDED },
          }),
          data: { paymentStatus: PaymentStatus.REFUNDED },
        }),
      );
    });

    test("updateMany count=0（既に確定済み）→ false、AuditLog を書かない", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 10000 } });
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(result).toBe(false);
      expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    });

    test("成功時: AuditLog に実際の遷移先 paymentStatus と累積額を記録する", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 10000 } });
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "event-registration",
          resourceId: REGISTRATION_ID,
          newValue: {
            paymentStatus: PaymentStatus.REFUNDED,
            refundedAmount: 10000,
          },
          metadata: expect.objectContaining({
            stripeRefundId: STRIPE_REFUND_ID,
          }),
        }),
      );
    });
  });
});
