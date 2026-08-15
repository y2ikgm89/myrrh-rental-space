import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";
import { installEmailLibDispatchMock } from "../../../support/email-lib-dispatch-mock";

// PaymentStatus 定数（@generated/prisma/enums から Prisma enum を再現）
const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;
type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// ReservationStatus 定数（@generated/prisma/enums から Prisma enum を再現）
const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
type ReservationStatus =
  (typeof ReservationStatus)[keyof typeof ReservationStatus];

// Prisma モック関数（mock.module より先に定義）
const mockReservationFindFirst = mock<
  () => Promise<{ id: string; paymentStatus: PaymentStatus } | null>
>(() => Promise.resolve(null));

const mockReservationFindUnique = mock<
  () => Promise<
    | {
        status: ReservationStatus;
        paymentStatus: PaymentStatus;
        stripePaymentIntentId: string | null;
      }
    | { totalPriceWithTax: number | null }
    | { paymentStatus: PaymentStatus; deletedAt: Date | null }
    | null
  >
>(() =>
  Promise.resolve({
    status: ReservationStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PAID,
    stripePaymentIntentId: null,
  }),
);

const mockRefundAggregate = mock<
  () => Promise<{ _sum: { amount: number | null } }>
>(() => Promise.resolve({ _sum: { amount: 0 } }));

const mockRefundUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

const mockExecuteRaw = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve(undefined),
);

const mockReservationFindUniqueOrThrow = mock<
  () => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "reservation-1" }));

const mockReservationUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "reservation-1" }),
);

const mockReservationUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findFirst: mockReservationFindFirst,
      findUnique: mockReservationFindUnique,
      findUniqueOrThrow: mockReservationFindUniqueOrThrow,
      update: mockReservationUpdate,
      updateMany: mockReservationUpdateMany,
    },
    refund: {
      aggregate: mockRefundAggregate,
      updateMany: mockRefundUpdateMany,
    },
    $executeRaw: mockExecuteRaw,
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        reservation: {
          findUnique: mockReservationFindUnique,
          updateMany: mockReservationUpdateMany,
        },
        refund: {
          aggregate: mockRefundAggregate,
          updateMany: mockRefundUpdateMany,
        },
        $executeRaw: mockExecuteRaw,
      }),
  },
}));

await installPrismaEnumsMock({
  PaymentStatus,
  ReservationStatus,
});

const mockLogError = mock<
  (
    error: unknown,
    logContext: {
      category: string;
      severity: string;
      context?: Record<string, unknown>;
    },
  ) => void
>(() => undefined);

const mockCreateNotificationCommand = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

const mockRefundOrphanedStripePaymentForCancelledReservation = mock<
  (input: {
    reservationId: string;
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

const mockFetchReservationEmailData = mock<
  (reservationId: string) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockSendReservationRefundEmail = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/reservations/payloads", () => ({
  fetchReservationEmailData: mockFetchReservationEmailData,
}));

installEmailLibDispatchMock({
  sendReservationRefundEmail: mockSendReservationRefundEmail,
});

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotificationCommand,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

mock.module("@/shared/domain/reservations/payment-commands", () => ({
  refundOrphanedStripePaymentForCancelledReservation:
    mockRefundOrphanedStripePaymentForCancelledReservation,
}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  NOTIFICATION_TYPE: {
    RESERVATION_REFUND: "reservation_refund",
    RESERVATION_PAYMENT_FAILED: "reservation_payment_failed",
  },
  NOTIFICATION_TYPE_LABELS: {
    reservation_refund: "予約返金",
    reservation_payment_failed: "予約決済失敗",
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

import {
  claimReservationAsPaid,
  claimReservationAsFailed,
  claimReservationAsRefunded,
  findReservationByPaymentIntent,
  savePaymentIntentId,
} from "@/shared/domain/reservations/payment-queries";

// テストデータ
const RESERVATION_ID = "550e8400-e29b-41d4-a716-446655440001";
const PAYMENT_INTENT_ID = "pi_test_1234567890";
const SESSION_ID = "cs_test_session_9876543210";

const FULFILL_DATA = {
  id: RESERVATION_ID,
  spaceId: "space-550e8400-e29b-41d4-a716-446655440001",
  startTime: new Date("2024-03-01T10:00:00Z"),
  endTime: new Date("2024-03-01T12:00:00Z"),
  totalPrice: 5000,
  // メール本文は税込を出す（監査 F-74）。select にも入っている。
  totalPriceWithTax: 5500,
  notes: null,
  guestEmail: null,
  paymentStatus: PaymentStatus.PAID,
  status: ReservationStatus.CONFIRMED,
  icsSequence: 0,
  userId: null,
  customer: {
    email: "customer@example.com",
    lastName: "田中",
    firstName: "太郎",
  },
  space: { name: "テストスペース", location: { name: "渋谷" } },
};

describe("reservations/payment-queries", () => {
  beforeEach(() => {
    mockReservationFindFirst.mockReset();
    mockReservationFindUnique.mockReset();
    mockReservationFindUniqueOrThrow.mockReset();
    mockReservationUpdate.mockReset();
    mockReservationUpdateMany.mockReset();
    mockLogError.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockRefundOrphanedStripePaymentForCancelledReservation.mockReset();
    mockFireAndForget.mockReset();
    mockRefundAggregate.mockReset();
    mockRefundUpdateMany.mockReset();
    mockExecuteRaw.mockReset();
    mockFetchReservationEmailData.mockReset();
    mockSendReservationRefundEmail.mockReset();
    mockCreateAuditLogRecord.mockReset();

    mockReservationFindFirst.mockResolvedValue(null);
    mockReservationFindUnique.mockResolvedValue({
      status: ReservationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: null,
    });
    mockReservationFindUniqueOrThrow.mockResolvedValue(FULFILL_DATA);
    mockReservationUpdate.mockResolvedValue({ id: RESERVATION_ID });
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });
    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockRefundOrphanedStripePaymentForCancelledReservation.mockResolvedValue({
      outcome: "already_refunded",
    });
    mockFireAndForget.mockImplementation((promise) => {
      void promise;
    });
    mockRefundAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockRefundUpdateMany.mockResolvedValue({ count: 1 });
    mockExecuteRaw.mockResolvedValue(undefined);
    mockFetchReservationEmailData.mockResolvedValue(null);
    mockSendReservationRefundEmail.mockResolvedValue(undefined);
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  // =============================================================================
  // claimReservationAsPaid（atomic claim）
  // =============================================================================

  describe("claimReservationAsPaid", () => {
    describe("正常系", () => {
      test("未払い/決済待ちの予約を atomic に PAID に遷移し、relation 込みで返す", async () => {
        mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });
        mockReservationFindUniqueOrThrow.mockResolvedValueOnce(FULFILL_DATA);

        const result = await claimReservationAsPaid(RESERVATION_ID, {
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        expect(result).toEqual(FULFILL_DATA);
      });
    });

    describe("idempotency", () => {
      test("既に PAID（count === 0）→ null を返し findUniqueOrThrow を呼ばない・CRITICAL ログも出さない", async () => {
        mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
        mockReservationFindUnique.mockResolvedValueOnce({
          status: ReservationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          stripePaymentIntentId: null,
        });

        const result = await claimReservationAsPaid(RESERVATION_ID, {
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        expect(result).toBeNull();
        expect(mockReservationFindUniqueOrThrow).not.toHaveBeenCalled();
        expect(mockLogError).not.toHaveBeenCalled();
      });

      test("count === 0 かつ現在 status=CANCELLED → money-in-flight として CRITICAL ログを記録する", async () => {
        mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
        mockReservationFindUnique.mockResolvedValueOnce({
          status: ReservationStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
          stripePaymentIntentId: null,
        });
        mockRefundOrphanedStripePaymentForCancelledReservation.mockResolvedValueOnce(
          { outcome: "refunded", refundId: "re_auto_1", refundAmount: 5000 },
        );

        const result = await claimReservationAsPaid(RESERVATION_ID, {
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        expect(result).toBeNull();
        expect(
          mockRefundOrphanedStripePaymentForCancelledReservation,
        ).toHaveBeenCalled();
        expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "reservation_refund",
            resourceType: "reservation",
            resourceId: RESERVATION_ID,
          }),
        );
        expect(mockLogError).not.toHaveBeenCalled();
      });

      test("count === 0 かつ現在 status=CANCELLED 以外 → CRITICAL ログを記録しない", async () => {
        mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
        mockReservationFindUnique.mockResolvedValueOnce({
          status: ReservationStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
          stripePaymentIntentId: null,
        });

        await claimReservationAsPaid(RESERVATION_ID, {
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        expect(mockLogError).not.toHaveBeenCalled();
      });

      test("count === 0 かつ status=CANCELLED だが PaymentIntent ID が取れない → 通知 + CRITICAL ログ、返金は呼ばない", async () => {
        mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
        mockReservationFindUnique.mockResolvedValueOnce({
          status: ReservationStatus.CANCELLED,
          paymentStatus: PaymentStatus.UNPAID,
          stripePaymentIntentId: null,
        });

        const result = await claimReservationAsPaid(RESERVATION_ID, {
          stripePaymentIntentId: null,
        });

        expect(result).toBeNull();
        expect(
          mockRefundOrphanedStripePaymentForCancelledReservation,
        ).not.toHaveBeenCalled();
        expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "reservation_refund",
            resourceType: "reservation",
            resourceId: RESERVATION_ID,
          }),
        );
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      test("status=CANCELLED で自動返金が失敗 → 通知 + CRITICAL ログ、例外を throw する", async () => {
        mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
        mockReservationFindUnique.mockResolvedValueOnce({
          status: ReservationStatus.CANCELLED,
          paymentStatus: PaymentStatus.PAID,
          stripePaymentIntentId: null,
        });
        mockRefundOrphanedStripePaymentForCancelledReservation.mockRejectedValueOnce(
          new Error("stripe refunds.create failed"),
        );

        await expect(
          claimReservationAsPaid(RESERVATION_ID, {
            stripePaymentIntentId: PAYMENT_INTENT_ID,
          }),
        ).rejects.toThrow();

        expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "reservation_refund",
            resourceType: "reservation",
            resourceId: RESERVATION_ID,
          }),
        );
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =============================================================================
  // claimReservationAsFailed
  // =============================================================================

  describe("claimReservationAsFailed", () => {
    test("PAID / PARTIALLY_REFUNDED / REFUNDED / FAILED 以外 かつ session id 一致の予約のみ FAILED に遷移", async () => {
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimReservationAsFailed(RESERVATION_ID, SESSION_ID);

      expect(result).toBe(true);
      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
      expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "reservation_payment_failed",
          resourceType: "reservation",
          resourceId: RESERVATION_ID,
        }),
      );
    });

    test("既に PAID / PARTIALLY_REFUNDED / REFUNDED / FAILED → false（no-op）", async () => {
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
      const result = await claimReservationAsFailed(RESERVATION_ID, SESSION_ID);
      expect(result).toBe(false);
      expect(mockFireAndForget).not.toHaveBeenCalled();
      expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
    });

    test("stale webhook (別 session id) → count=0 で false (Codex PR #1043 P1)", async () => {
      // 新 session が PENDING で走っている状態で OLD session の expired webhook が
      // 再配信された想定。WHERE の stripeCheckoutSessionId 述語で一致せず count=0。
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
      const result = await claimReservationAsFailed(
        RESERVATION_ID,
        "cs_test_STALE_session_id",
      );
      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // savePaymentIntentId
  // =============================================================================

  describe("savePaymentIntentId", () => {
    test("未払い/決済待ちかつ session 一致の行のみ更新し、deletedAt は見ない", async () => {
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });
      await savePaymentIntentId(RESERVATION_ID, PAYMENT_INTENT_ID, SESSION_ID);
      expect(mockReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: RESERVATION_ID,
            stripeCheckoutSessionId: SESSION_ID,
            paymentStatus: {
              in: [PaymentStatus.UNPAID, PaymentStatus.PENDING],
            },
          },
          data: { stripePaymentIntentId: PAYMENT_INTENT_ID },
        }),
      );
      expect(mockReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  // =============================================================================
  // claimReservationAsRefunded
  // =============================================================================

  describe("claimReservationAsRefunded", () => {
    test("REFUNDED 以外の予約のみ REFUNDED に遷移", async () => {
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimReservationAsRefunded(RESERVATION_ID);

      expect(result).toBe(true);
      expect(mockReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: RESERVATION_ID,
            deletedAt: null,
            paymentStatus: { not: PaymentStatus.REFUNDED },
          }),
          data: { paymentStatus: PaymentStatus.REFUNDED },
        }),
      );
    });

    test("既に REFUNDED → false（no-op）", async () => {
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });
      const result = await claimReservationAsRefunded(RESERVATION_ID);
      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // findReservationByPaymentIntent
  // =============================================================================

  describe("findReservationByPaymentIntent", () => {
    test("stripePaymentIntentId に一致する予約を返す", async () => {
      mockReservationFindFirst.mockResolvedValueOnce({
        id: RESERVATION_ID,
        paymentStatus: PaymentStatus.PENDING,
      });

      const result = await findReservationByPaymentIntent(PAYMENT_INTENT_ID);

      expect(result).toEqual({
        id: RESERVATION_ID,
        paymentStatus: PaymentStatus.PENDING,
      });
    });

    test("webhook 同定は soft-delete 済み予約も対象にする", async () => {
      mockReservationFindFirst.mockResolvedValueOnce({
        id: RESERVATION_ID,
        paymentStatus: PaymentStatus.PAID,
      });

      await findReservationByPaymentIntent(PAYMENT_INTENT_ID);

      expect(mockReservationFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            stripePaymentIntentId: PAYMENT_INTENT_ID,
          },
          select: { id: true, paymentStatus: true },
        }),
      );
      expect(mockReservationFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("一致なし → null", async () => {
      mockReservationFindFirst.mockResolvedValueOnce(null);
      const result = await findReservationByPaymentIntent("pi_unknown");
      expect(result).toBeNull();
    });
  });
});
