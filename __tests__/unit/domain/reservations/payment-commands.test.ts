import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
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

const mockReservationFindUnique = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockReservationUpdate = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "reservation-1" }));
const mockReservationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

type MockCredentials = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string | null;
  stripeAccountId: string | null;
  stripeCurrency: string;
  stripePaymentMethodTypes: readonly string[];
};
const mockAssertStripeCredentialsConfigured = mock<
  () => Promise<MockCredentials>
>(() =>
  Promise.resolve({
    stripeSecretKey: "enc-stripe-secret",
    stripeWebhookSecret: "enc-webhook-secret",
    stripePublishableKey: null,
    stripeAccountId: null,
    stripeCurrency: "jpy",
    stripePaymentMethodTypes: ["card"],
  }),
);
const mockAssertOnlinePaymentAvailable = mock<() => Promise<MockCredentials>>(
  () =>
    Promise.resolve({
      stripeSecretKey: "enc-stripe-secret",
      stripeWebhookSecret: "enc-webhook-secret",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
);
const mockRefundCreate = mock<
  (
    params: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<{ id: string; status: string | null }>
>(() => Promise.resolve({ id: "re_test_123", status: "succeeded" }));
const mockCheckoutSessionCreate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string; url: string }>
>(() =>
  Promise.resolve({
    id: "cs_test_123",
    url: "https://stripe.example/checkout",
  }),
);
const mockCheckoutSessionExpire = mock<
  (sessionId: string) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "cs_test_123" }));
const mockCheckoutSessionRetrieve = mock<
  (sessionId: string) => Promise<{ status: string }>
>(() => Promise.resolve({ status: "expired" }));
const mockExpireOpenCheckoutSessionBestEffort = mock<
  (input: { reservationId: string; sessionId: string }) => Promise<void>
>(() => Promise.resolve());
const mockRetrieveCheckoutSessionStatus = mock<
  (sessionId: string) => Promise<string | null>
>(() => Promise.resolve("expired"));
const mockGetStripeClient = mock(() =>
  Promise.resolve({
    client: {
      checkout: {
        sessions: {
          create: mockCheckoutSessionCreate,
          expire: mockCheckoutSessionExpire,
          retrieve: mockCheckoutSessionRetrieve,
        },
      },
      refunds: { create: mockRefundCreate },
    },
  }),
);
const mockLogError = mock(() => undefined);
const mockIssueReceiptForReservation = mock(
  (_reservationId: string, _options?: { source?: string }) =>
    Promise.resolve({
      id: "receipt-1",
      serialNo: "2026-000001",
    }),
);
const mockNotifyReceiptIssuedForReservation = mock(
  (_input: { receiptId: string; detailUrl: string }) =>
    Promise.resolve({ ok: true as const, messageId: "msg_1" }),
);
const mockFireAndForget = mock(
  (promise: Promise<unknown>, _options?: unknown) => {
    void promise.catch(() => undefined);
  },
);
const mockCreateStatusToken = mock(
  (_reservationId: string, _expiresAt: Date) => "STATUS_TOKEN_TEST",
);

mock.module("server-only", () => ({}));
const AuditAction = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
} as const;

mock.module("@generated/prisma/enums", () => ({
  AuditAction,
  PaymentStatus,
  ReservationStatus,
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: mockReservationFindUnique,
      update: mockReservationUpdate,
      updateMany: mockReservationUpdateMany,
    },
  },
}));
mock.module("@/shared/domain/payment/availability", () => ({
  assertOnlinePaymentAvailable: () => mockAssertOnlinePaymentAvailable(),
  assertStripeCredentialsConfigured: () =>
    mockAssertStripeCredentialsConfigured(),
}));
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => mockGetStripeClient(),
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://example.com",
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    DATABASE: "DATABASE",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));
mock.module("@/shared/domain/reservations/pending-expiry", () => ({
  PENDING_RESERVATION_EXPIRY_MINUTES: 60,
}));
mock.module("@/shared/domain/payment/checkout-session-expiry", () => ({
  expireOpenCheckoutSessionBestEffort: mockExpireOpenCheckoutSessionBestEffort,
  retrieveCheckoutSessionStatus: mockRetrieveCheckoutSessionStatus,
}));
mock.module("@/shared/domain/reservations/checkout-session-expiry", () => ({
  expireOpenCheckoutSessionBestEffort: mockExpireOpenCheckoutSessionBestEffort,
  retrieveCheckoutSessionStatus: mockRetrieveCheckoutSessionStatus,
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));
mock.module("@/shared/domain/receipts/issue", () => ({
  issueReceiptForReservation: mockIssueReceiptForReservation,
}));
mock.module("@/shared/domain/receipts/notify-issued", () => ({
  notifyReceiptIssuedForReservation: mockNotifyReceiptIssuedForReservation,
}));
mock.module("@/shared/lib/reservation-status-token", () => ({
  createStatusToken: mockCreateStatusToken,
  STATUS_TOKEN_LIFETIME_MS: 90 * 24 * 60 * 60 * 1000,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { createCheckoutSessionCommand, recordManualReservationPaymentCommand } =
  await import("@/shared/domain/reservations/payment-commands");
// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} = await import("@/shared/domain/receipts/manual-payment-warnings");
// NOTE: `refundReservationPaymentCommand` の挙動は interactive tx + advisory lock +
// Refund child table 集計 + AuditLog を跨ぐため unit mock では過度に fragile。
// テストは `__tests__/integration/domain/reservations/refund-command.test.ts` の
// 実 DB 統合テストが担当する (partial refund / over-refund / concurrent race /
// paymentStatus 遷移 / idempotency の全網羅を実データで検証)。

const RESERVATION_ID = "550e8400-e29b-41d4-a716-446655440001";
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440002";
const PAYMENT_INTENT_ID = "pi_test_1234567890";

function paidReservation() {
  return {
    id: RESERVATION_ID,
    customerId: CUSTOMER_ID,
    paymentStatus: PaymentStatus.PAID,
    stripePaymentIntentId: PAYMENT_INTENT_ID,
    totalPrice: 5000,
  };
}

describe("reservations/payment-commands", () => {
  beforeEach(() => {
    mockReservationFindUnique.mockReset();
    mockReservationUpdate.mockReset();
    mockReservationUpdateMany.mockReset();
    mockAssertOnlinePaymentAvailable.mockReset();
    mockAssertStripeCredentialsConfigured.mockReset();
    mockGetStripeClient.mockReset();
    mockRefundCreate.mockReset();
    mockCheckoutSessionCreate.mockReset();
    mockCheckoutSessionExpire.mockReset();
    mockExpireOpenCheckoutSessionBestEffort.mockReset();
    mockLogError.mockReset();

    mockReservationFindUnique.mockResolvedValue(paidReservation());
    mockReservationUpdate.mockResolvedValue({ id: RESERVATION_ID });
    mockReservationUpdateMany.mockResolvedValue({ count: 1 });
    mockAssertOnlinePaymentAvailable.mockResolvedValue({
      stripeSecretKey: "enc-stripe-secret",
      stripeWebhookSecret: "enc-webhook-secret",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    });
    mockAssertStripeCredentialsConfigured.mockResolvedValue({
      stripeSecretKey: "enc-stripe-secret",
      stripeWebhookSecret: "enc-webhook-secret",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    });
    mockGetStripeClient.mockResolvedValue({
      client: {
        checkout: {
          sessions: {
            create: mockCheckoutSessionCreate,
            expire: mockCheckoutSessionExpire,
            retrieve: mockCheckoutSessionRetrieve,
          },
        },
        refunds: { create: mockRefundCreate },
      },
    });
    mockRefundCreate.mockResolvedValue({
      id: "re_test_123",
      status: "succeeded",
    });
    mockCheckoutSessionCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://stripe.example/checkout",
    });
    mockCheckoutSessionExpire.mockResolvedValue({ id: "cs_test_123" });
    mockExpireOpenCheckoutSessionBestEffort.mockResolvedValue(undefined);
    mockLogError.mockImplementation(() => undefined);
  });

  describe("createCheckoutSessionCommand", () => {
    const unpaidReservation = () => ({
      id: RESERVATION_ID,
      customerId: CUSTOMER_ID,
      // Codex P1 (PR #1022): status を fixture に含める。checkout gate は
      // status ∈ {PENDING, CONFIRMED} 以外を弾く。
      status: ReservationStatus.PENDING,
      totalPrice: 5000,
      paymentStatus: PaymentStatus.UNPAID,
      stripeCheckoutSessionId: null,
      guestEmail: "booked-address@example.com",
      space: { name: "テストスペース" },
      customer: {
        email: "current-customer@example.com",
        lastName: "山田",
        firstName: "太郎",
      },
    });

    // 新実装は findUnique を 2 回呼ぶ (初期 read + claim 後の authoritative re-read)。
    // authoritative は totalPriceWithTax/guestEmail/space/customer の subset のみ select。
    const authoritativeSameAsInitial = () => ({
      totalPriceWithTax: 5500,
      guestEmail: "booked-address@example.com",
      space: { name: "テストスペース" },
      customer: { email: "current-customer@example.com" },
    });

    test("Stripe Checkout customer_email は予約時メールを優先する (admin bypass)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: "booked-address@example.com",
        }),
      );
    });

    test("actorCustomerId が予約の customerId と一致すれば正常に決済セッション作成", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      const result = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: CUSTOMER_ID,
      });

      expect(result.sessionId).toBe("cs_test_123");
      expect(mockCheckoutSessionCreate).toHaveBeenCalledTimes(1);
    });

    test("IDOR 防止: actorCustomerId が予約の customerId と不一致なら DomainError(FORBIDDEN)", async () => {
      mockReservationFindUnique.mockResolvedValueOnce(unpaidReservation());

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: "other-customer-id",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("FORBIDDEN");
      // FORBIDDEN 判定は claim 前に throw されるため checkout session も claim も呼ばない
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
      expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    });

    test("存在しない reservationId は NOT_FOUND (FORBIDDEN より優先)", async () => {
      mockReservationFindUnique.mockResolvedValueOnce(null);

      const error = await createCheckoutSessionCommand({
        reservationId: "nonexistent",
        actorCustomerId: "any-customer",
      }).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe("NOT_FOUND");
    });

    test("Stripe session 作成 **前** に UNPAID → PENDING を atomic に claim する (Codex P1)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      // updateMany が呼ばれた時点で Stripe API は未実行、を実測
      // (最初の updateMany = UNPAID→PENDING claim。2 回目は session 確定書込で
      // Stripe 後に呼ばれる想定なので、最初の呼出時のみをチェックする)
      let checkoutCalledBeforeFirstClaim = false;
      let firstClaimCalled = false;
      mockReservationUpdateMany.mockImplementation(() => {
        if (!firstClaimCalled) {
          firstClaimCalled = true;
          if (mockCheckoutSessionCreate.mock.calls.length > 0) {
            checkoutCalledBeforeFirstClaim = true;
          }
        }
        return Promise.resolve({ count: 1 });
      });

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      expect(firstClaimCalled).toBe(true);
      expect(checkoutCalledBeforeFirstClaim).toBe(false);
      // claim の WHERE に paymentStatus IN [UNPAID, FAILED] が含まれることを確認
      // (#8 FAILED gate 緩和で再決済も同じ claim を通る)
      expect(mockReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: {
              in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
            },
          }),
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.PENDING,
          }),
        }),
      );
    });

    test("Claim 失敗 (別 request が先に PENDING に遷移) → CONFLICT & Stripe 未呼出", async () => {
      mockReservationFindUnique.mockResolvedValueOnce(unpaidReservation());
      mockReservationUpdateMany.mockResolvedValueOnce({ count: 0 });

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      }).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    test("決済方法と通貨が非互換 (konbini + USD) → VALIDATION & Stripe 未呼出", async () => {
      mockAssertOnlinePaymentAvailable.mockResolvedValueOnce({
        stripeSecretKey: "enc-stripe-secret",
        stripeWebhookSecret: "enc-webhook-secret",
        stripePublishableKey: null,
        stripeAccountId: null,
        stripeCurrency: "usd",
        stripePaymentMethodTypes: ["konbini", "card"],
      });
      mockReservationFindUnique.mockResolvedValueOnce(unpaidReservation());

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      }).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe("VALIDATION");
      expect((error as DomainError).message).toContain("互換性");
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
      expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    });

    test("Race 修正: claim 後 authoritative re-read で totalPriceWithTax が edit 済みなら新価格で Stripe 作成", async () => {
      mockReservationFindUnique.mockResolvedValueOnce(unpaidReservation());
      mockReservationFindUnique.mockResolvedValueOnce({
        totalPriceWithTax: 8800,
        guestEmail: "booked-address@example.com",
        space: { name: "テストスペース" },
        customer: { email: "current-customer@example.com" },
      });

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: 8800,
              }),
            }),
          ],
        }),
      );
    });

    test("Stripe 失敗時は PENDING → UNPAID に revert して顧客が再試行できる状態に戻す", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());
      mockCheckoutSessionCreate.mockRejectedValueOnce(
        new Error("Stripe API down"),
      );

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      }).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe("UNEXPECTED");
      // revert 用の updateMany が呼ばれる (2 回目: WHERE PENDING → UNPAID)
      const calls = mockReservationUpdateMany.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.UNPAID,
        }),
      });
    });

    test("Session 確定書込失敗時は作成済み Stripe session を best-effort expire する", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());
      mockReservationUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error("DB write failed"));

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      }).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe("UNEXPECTED");
      expect(mockExpireOpenCheckoutSessionBestEffort).toHaveBeenCalledWith({
        reservationId: RESERVATION_ID,
        sessionId: "cs_test_123",
      });
    });

    test("Session 確定書込は updateMany + WHERE `notIn [PAID, REFUNDED]` + PENDING 再 assert で stale webhook FAILED を巻き戻す (Codex P1 #3)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      // 3 回目の updateMany が session 確定書込 (1 回目: claim UNPAID→PENDING、
      // 2 回目は無し (Stripe 成功なので revert 未実行)、3 回目: session settle)
      const calls = mockReservationUpdateMany.mock.calls;
      expect(calls.length).toBe(2);
      // 1 回目: claim (UNPAID または FAILED から PENDING へ)
      //         data には fail-safe cron の cutoff SSoT である paymentInitiatedAt が
      //         Date として書き込まれる (Codex P1: PR#1042 対応)。
      expect(calls[0]?.[0]).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
          },
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
          paymentInitiatedAt: expect.any(Date),
        }),
      });
      // 2 回目: session 確定書込 (updateMany + notIn [PAID, PARTIALLY_REFUNDED, REFUNDED] + PENDING 再 assert)
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: expect.objectContaining({
            notIn: [
              PaymentStatus.PAID,
              PaymentStatus.PARTIALLY_REFUNDED,
              PaymentStatus.REFUNDED,
            ],
          }),
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
          stripeCheckoutSessionId: "cs_test_123",
        }),
      });
      // stripeCheckoutSessionId のみを書く旧 `update` は使わない
      expect(mockReservationUpdate).not.toHaveBeenCalled();
    });

    test("Stripe session に expires_at (cron cutoff と同期) が指定される (silent orphan 予防、Codex P1 #1042)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      const before = Math.floor(Date.now() / 1000);
      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });
      const after = Math.floor(Date.now() / 1000);

      const sessionArgs = mockCheckoutSessionCreate.mock.calls[0]?.[0] as
        { expires_at?: number } | undefined;
      expect(sessionArgs?.expires_at).toEqual(expect.any(Number));
      // expires_at は claim 時刻 + PENDING_RESERVATION_EXPIRY_MINUTES (60) 分後 = 3600 秒後。
      // fail-safe cron の cutoff と一致させることで、cron が生きた session を CANCELLED に
      // してしまい顧客が Stripe で決済完了 → orphan (paid but cancelled) が発生する window を潰す。
      const expected = before + 60 * 60;
      const expectedMax = after + 60 * 60;
      expect(sessionArgs?.expires_at).toBeGreaterThanOrEqual(expected);
      expect(sessionArgs?.expires_at).toBeLessThanOrEqual(expectedMax);
    });

    test("Session settle が PAID/REFUNDED race で count=0 → session expire + CONFLICT (session URL 返却しない)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      // 1 回目 (claim): count=1、2 回目 (settle): count=0 で PAID/REFUNDED race を再現
      mockReservationUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockCheckoutSessionExpire).toHaveBeenCalledWith("cs_test_123");
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          severity: "HIGH",
        }),
      );
    });

    test("Authoritative re-read で totalPriceWithTax が消えたら PENDING → UNPAID revert + VALIDATION", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce({
          totalPriceWithTax: null,
          guestEmail: null,
          space: { name: "テストスペース" },
          customer: { email: "current-customer@example.com" },
        });

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      }).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
      // revert updateMany が呼ばれる
      const calls = mockReservationUpdateMany.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[0]).toMatchObject({
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.UNPAID,
        }),
      });
    });

    // Codex Cloud Review P1 (PR#1022, comment_id=3566965666)
    test("キャンセル済み予約 (status=CANCELLED, paymentStatus=UNPAID) は Stripe checkout 不可", async () => {
      mockReservationFindUnique.mockResolvedValueOnce({
        ...unpaidReservation(),
        status: ReservationStatus.CANCELLED,
      });

      const error = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      // status gate は claim / Stripe / authoritative re-read の前に throw されるので
      // updateMany も Stripe も呼ばれない。
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
      expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    });

    test("Claim updateMany の WHERE に status IN [PENDING, CONFIRMED] を含む (並行 cancel race で count=0 → CONFLICT)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      const firstClaim = mockReservationUpdateMany.mock.calls[0]?.[0];
      expect(firstClaim).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
          },
          status: expect.objectContaining({
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          }),
        }),
      });
    });

    test("FAILED 予約からも再決済セッションを作成できる (#8 gate 緩和)", async () => {
      // 前回失敗 (webhook checkout.session.expired 経由で claimReservationAsFailed が
      // 打った FAILED) からも再度 Stripe checkout を作れる。
      mockReservationFindUnique
        .mockResolvedValueOnce({
          ...unpaidReservation(),
          paymentStatus: PaymentStatus.FAILED,
        })
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      const result = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      expect(result.sessionId).toBeTruthy();
      // Stripe が呼ばれた (VALIDATION で早期 throw されていないことを確認)
      expect(mockCheckoutSessionCreate).toHaveBeenCalledTimes(1);
    });

    test("PENDING / PAID / REFUNDED は既存通り拒否 (再決済不可)", async () => {
      for (const rejectedStatus of [
        PaymentStatus.PENDING,
        PaymentStatus.PAID,
        PaymentStatus.REFUNDED,
      ] as const) {
        mockCheckoutSessionCreate.mockClear();
        mockReservationUpdateMany.mockClear();
        mockReservationFindUnique.mockResolvedValueOnce({
          ...unpaidReservation(),
          paymentStatus: rejectedStatus,
        });

        const error = await createCheckoutSessionCommand({
          reservationId: RESERVATION_ID,
          actorCustomerId: null,
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("VALIDATION");
        expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
        expect(mockReservationUpdateMany).not.toHaveBeenCalled();
      }
    });
  });

  // refundReservationPaymentCommand の検証は integration test に集約
  // (`__tests__/integration/domain/reservations/refund-command.test.ts`)。

  describe("recordManualReservationPaymentCommand", () => {
    function unpaidReservation(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        customerId: CUSTOMER_ID,
        userId: null,
        paymentStatus: PaymentStatus.UNPAID,
        stripeCheckoutSessionId: null,
        totalPrice: 5000,
        totalPriceWithTax: 5500,
        ...overrides,
      };
    }

    beforeEach(() => {
      mockIssueReceiptForReservation.mockReset();
      mockCheckoutSessionRetrieve.mockReset();
      mockCheckoutSessionRetrieve.mockResolvedValue({ status: "expired" });
      mockRetrieveCheckoutSessionStatus.mockReset();
      mockRetrieveCheckoutSessionStatus.mockResolvedValue("expired");
      mockIssueReceiptForReservation.mockResolvedValue({
        id: "receipt-1",
        serialNo: "2026-000001",
      });
      mockNotifyReceiptIssuedForReservation.mockReset();
      mockNotifyReceiptIssuedForReservation.mockResolvedValue({
        ok: true,
        messageId: "msg_1",
      });
      mockFireAndForget.mockReset();
      mockFireAndForget.mockImplementation(
        (promise: Promise<unknown>, _options?: unknown) => {
          void promise.catch(() => undefined);
        },
      );
      mockCreateStatusToken.mockReset();
      mockCreateStatusToken.mockReturnValue("STATUS_TOKEN_TEST");
      mockLogError.mockReset();
    });

    test("marks UNPAID reservation as PAID when amount matches charge base", async () => {
      mockReservationFindUnique.mockResolvedValue(unpaidReservation());
      mockReservationUpdateMany.mockResolvedValue({ count: 1 });

      const result = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      });

      expect(result).toEqual({
        reservationId: RESERVATION_ID,
        customerId: CUSTOMER_ID,
      });
      expect(mockReservationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: RESERVATION_ID,
          deletedAt: null,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
          },
        },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paidAt: expect.any(Date),
          stripeCheckoutSessionId: null,
        },
      });
      expect(mockIssueReceiptForReservation).toHaveBeenCalledWith(
        RESERVATION_ID,
        { source: "manual-payment" },
      );
      expect(mockFireAndForget).toHaveBeenCalled();
      expect(mockNotifyReceiptIssuedForReservation).toHaveBeenCalledWith({
        receiptId: "receipt-1",
        detailUrl:
          "https://example.com/reservation/status?token=STATUS_TOKEN_TEST",
      });
    });

    test("member detailUrl uses mypage reservation path", async () => {
      mockReservationFindUnique.mockResolvedValue(
        unpaidReservation({ userId: "user-member-1" }),
      );
      mockReservationUpdateMany.mockResolvedValue({ count: 1 });

      await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      });

      expect(mockNotifyReceiptIssuedForReservation).toHaveBeenCalledWith({
        receiptId: "receipt-1",
        detailUrl: `https://example.com/mypage/reservations/${RESERVATION_ID}`,
      });
      expect(mockCreateStatusToken).not.toHaveBeenCalled();
    });

    test("VALIDATION receipt error keeps PAID and returns receiptWarning", async () => {
      mockReservationFindUnique.mockResolvedValue(unpaidReservation());
      mockReservationUpdateMany.mockResolvedValue({ count: 1 });
      mockIssueReceiptForReservation.mockRejectedValue(
        new DomainError("金額 0 の予約は領収書を発行しません", "VALIDATION"),
      );

      const result = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      });

      expect(result).toEqual({
        reservationId: RESERVATION_ID,
        customerId: CUSTOMER_ID,
        receiptWarning: MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
      });
      expect(mockNotifyReceiptIssuedForReservation).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalled();
    });

    test("unexpected receipt error keeps PAID and returns deferred warning", async () => {
      mockReservationFindUnique.mockResolvedValue(unpaidReservation());
      mockReservationUpdateMany.mockResolvedValue({ count: 1 });
      mockIssueReceiptForReservation.mockRejectedValue(
        new Error("db unavailable"),
      );

      const result = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      });

      expect(result).toEqual({
        reservationId: RESERVATION_ID,
        customerId: CUSTOMER_ID,
        receiptWarning: MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
      });
      expect(mockNotifyReceiptIssuedForReservation).not.toHaveBeenCalled();
    });

    test("rejects when stripe checkout session is still open", async () => {
      mockReservationFindUnique.mockResolvedValue(
        unpaidReservation({ stripeCheckoutSessionId: "cs_test_123" }),
      );
      mockRetrieveCheckoutSessionStatus.mockResolvedValue("open");

      const error = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect((error as DomainError).message).toContain("進行中");
      expect(mockReservationUpdateMany).not.toHaveBeenCalled();
      expect(mockIssueReceiptForReservation).not.toHaveBeenCalled();
    });

    test("allows FAILED reservation when checkout session is expired", async () => {
      mockReservationFindUnique.mockResolvedValue(
        unpaidReservation({
          paymentStatus: PaymentStatus.FAILED,
          stripeCheckoutSessionId: "cs_test_expired",
        }),
      );
      mockRetrieveCheckoutSessionStatus.mockResolvedValue("expired");
      mockReservationUpdateMany.mockResolvedValue({ count: 1 });

      const result = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      });

      expect(result.reservationId).toBe(RESERVATION_ID);
      expect(mockRetrieveCheckoutSessionStatus).toHaveBeenCalledWith(
        "cs_test_expired",
      );
      expect(mockReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: {
              in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
            },
          }),
          data: expect.objectContaining({
            stripeCheckoutSessionId: null,
          }),
        }),
      );
    });

    test("rejects when amount does not match charge base", async () => {
      mockReservationFindUnique.mockResolvedValue(unpaidReservation());

      const error = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5000,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    });

    test("rejects when claim updateMany updates zero rows", async () => {
      mockReservationFindUnique.mockResolvedValue(unpaidReservation());
      mockReservationUpdateMany.mockResolvedValue({ count: 0 });

      const error = await recordManualReservationPaymentCommand({
        reservationId: RESERVATION_ID,
        amount: 5500,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockIssueReceiptForReservation).not.toHaveBeenCalled();
    });
  });
});
