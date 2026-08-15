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

const {
  claimEventRegistrationAsPaid,
  finalizeSettledEventRegistrationRefund,
  findEventRegistrationByPaymentIntent,
} = await import("@/shared/domain/events/payment-queries");

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

  describe("finalizeSettledEventRegistrationRefund", () => {
    const STRIPE_REFUND_ID = "re_test_event_settled";

    test("この refund の Refund.status claim に失敗 (既に確定済み・二重配信) → false、entity/AuditLog に一切触れない", async () => {
      mockRefundUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(result).toBe(false);
      expect(mockRegFindUnique).not.toHaveBeenCalled();
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    });

    test("claim 済の Refund 行を非終端状態から succeeded へ遷移させる", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 10000 } });

      await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(mockRefundUpdateMany).toHaveBeenCalledWith({
        where: {
          stripeRefundId: STRIPE_REFUND_ID,
          status: { notIn: ["succeeded", "failed", "canceled"] },
        },
        data: { status: "succeeded" },
      });
    });

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

    test("累積額の集計は status=succeeded のみに限定する (pending な別 refund を含めない)", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 6000 } });

      await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(mockRefundAggregate).toHaveBeenCalledWith({
        where: { eventRegistrationId: REGISTRATION_ID, status: "succeeded" },
        _sum: { amount: true },
      });
    });

    test("ADMIN: 累積が paidAmount 未到達 → PARTIALLY_REFUNDED、PAID/PARTIALLY_REFUNDED からのみ claim", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 3000 } });

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

    test("STRIPE_DASHBOARD: ADMIN と同様に部分返金しうるため累積額ベースで判定する (Codex review, PR #1666)", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 4000 } });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.STRIPE_DASHBOARD,
      );

      expect(result).toBe(true);
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
            },
          }),
          data: { paymentStatus: PaymentStatus.PARTIALLY_REFUNDED },
        }),
      );
    });

    test("AUTO_CAPACITY_RACE: 入口は緩いが、金額は累積で判定する", async () => {
      // 監査 F-49。入口の緩さ（UNPAID / PENDING からも入る）は actorType で保つが、
      // REFUNDED / PARTIALLY_REFUNDED の判定は累積額だけで決める。
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 4000 } });

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
          data: { paymentStatus: PaymentStatus.PARTIALLY_REFUNDED },
        }),
      );
    });

    test("entity 側 updateMany が count=0 (他経路で既に REFUNDED 確定済み) でも claim が成功していれば AuditLog は書く", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 10000 } });
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await finalizeSettledEventRegistrationRefund(
        REGISTRATION_ID,
        STRIPE_REFUND_ID,
        REFUNDED_BY_TYPE.ADMIN,
      );

      expect(result).toBe(true);
      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    });

    test("成功時: AuditLog に実際の遷移先 paymentStatus と累積額を記録する", async () => {
      mockRegFindUnique.mockResolvedValueOnce({ paidAmount: 10000 });
      mockRefundAggregate.mockResolvedValueOnce({ _sum: { amount: 10000 } });

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
