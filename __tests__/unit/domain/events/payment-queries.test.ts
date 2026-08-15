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
const mockRefundUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockExecuteRaw = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve(undefined),
);
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
// 決済確定時に標準税率を刻むための読み取り（`readStandardTaxRateUncached`）。
// 無いと claim 系が TypeError で落ち、消費されなかった mock の戻り値が
// 後続テストへずれ込む（実際にそうなった）。
const mockCommerceFindFirst = mock(() =>
  Promise.resolve({ taxStandardRate: 10 }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsCommerce: { findFirst: mockCommerceFindFirst },
    eventRegistration: {
      findFirst: mockRegFindFirst,
      findUnique: mockRegFindUnique,
      updateMany: mockRegUpdateMany,
    },
    refund: {
      aggregate: mockRefundAggregate,
      updateMany: mockRefundUpdateMany,
    },
    $executeRaw: mockExecuteRaw,
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        eventRegistration: {
          findUnique: mockRegFindUnique,
          updateMany: mockRegUpdateMany,
        },
        refund: {
          aggregate: mockRefundAggregate,
          updateMany: mockRefundUpdateMany,
        },
        $executeRaw: mockExecuteRaw,
      }),
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

const { claimEventRegistrationAsPaid, findEventRegistrationByPaymentIntent } =
  await import("@/shared/domain/events/payment-queries");

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
    mockRefundUpdateMany.mockClear();
    mockExecuteRaw.mockClear();
    mockCreateAuditLogRecord.mockClear();
    mockRegUpdateMany.mockResolvedValue({ count: 0 });
    mockRefundOrphanedStripePaymentForCancelledEventRegistration.mockResolvedValue(
      { outcome: "already_refunded" },
    );
    mockFireAndForget.mockImplementation((promise) => {
      void promise;
    });
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockRefundUpdateMany.mockResolvedValue({ count: 1 });
    mockExecuteRaw.mockResolvedValue(undefined);
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  describe("claimEventRegistrationAsPaid", () => {
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
      ).toHaveBeenCalled();
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

  describe("findEventRegistrationByPaymentIntent", () => {
    test("webhook 同定は親 event の deletedAt で除外しない", async () => {
      mockRegFindFirst.mockResolvedValueOnce({
        id: REGISTRATION_ID,
        paymentStatus: PaymentStatus.PAID,
        paidAmount: 5000,
      });

      await findEventRegistrationByPaymentIntent(PAYMENT_INTENT_ID);

      expect(mockRegFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            stripePaymentIntentId: PAYMENT_INTENT_ID,
          },
          select: { id: true, paymentStatus: true, paidAmount: true },
        }),
      );
      expect(mockRegFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            event: { deletedAt: null },
          }),
        }),
      );
    });
  });
});
