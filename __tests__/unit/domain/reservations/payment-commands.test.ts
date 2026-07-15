import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

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
const mockGetStripeClient = mock(() =>
  Promise.resolve({
    client: {
      checkout: { sessions: { create: mockCheckoutSessionCreate } },
      refunds: { create: mockRefundCreate },
    },
  }),
);
const mockLogError = mock(() => undefined);

mock.module("server-only", () => ({}));
mock.module("@generated/prisma/enums", () => ({
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
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
  },
}));
mock.module("@/shared/domain/reservations/pending-expiry", () => ({
  PENDING_RESERVATION_EXPIRY_MINUTES: 60,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { createCheckoutSessionCommand, refundReservationPaymentCommand } =
  await import("@/shared/domain/reservations/payment-commands");

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
    mockGetStripeClient.mockReset();
    mockRefundCreate.mockReset();
    mockCheckoutSessionCreate.mockReset();
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
    mockGetStripeClient.mockResolvedValue({
      client: {
        checkout: { sessions: { create: mockCheckoutSessionCreate } },
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
    // authoritative は totalPrice/guestEmail/space/customer の subset のみ select。
    const authoritativeSameAsInitial = () => ({
      totalPrice: 5000,
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

    test("Race 修正: claim 後 authoritative re-read で totalPrice が edit 済みなら新価格で Stripe 作成", async () => {
      // 初期 read は totalPrice=5000
      mockReservationFindUnique.mockResolvedValueOnce(unpaidReservation());
      // claim と authoritative re-read の間で edit が totalPrice を 8000 に変更 (race シナリオ)
      mockReservationFindUnique.mockResolvedValueOnce({
        totalPrice: 8000,
        guestEmail: "booked-address@example.com",
        space: { name: "テストスペース" },
        customer: { email: "current-customer@example.com" },
      });

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      // Stripe には旧価格 5000 ではなく edit 後の 8000 が渡ることを assert
      expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                // JPY は zero-decimal 通貨で 100 倍しない
                unit_amount: 8000,
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
      // 2 回目: session 確定書込 (updateMany + notIn [PAID, REFUNDED] + PENDING 再 assert)
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: expect.objectContaining({
            notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
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

    test("Session settle が PAID/REFUNDED race で count=0 でも session URL は返す (log 出力)", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce(authoritativeSameAsInitial());

      // 1 回目 (claim): count=1、2 回目 (settle): count=0 で PAID/REFUNDED race を再現
      mockReservationUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      // Session URL は返す (webhook 側の冪等性に委任)
      expect(result.sessionId).toBe("cs_test_123");
      expect(result.sessionUrl).toBe("https://stripe.example/checkout");
      // 異常状態を log で通知
      expect(mockLogError).toHaveBeenCalled();
    });

    test("Authoritative re-read で totalPrice が消えたら PENDING → UNPAID revert + VALIDATION", async () => {
      mockReservationFindUnique
        .mockResolvedValueOnce(unpaidReservation())
        .mockResolvedValueOnce({
          totalPrice: null,
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

  describe("refundReservationPaymentCommand", () => {
    test("Stripe idempotency key を使い、PAID の予約だけ atomic に REFUNDED へ更新する", async () => {
      const result = await refundReservationPaymentCommand(RESERVATION_ID);

      expect(mockRefundCreate).toHaveBeenCalledWith(
        { payment_intent: PAYMENT_INTENT_ID },
        { idempotencyKey: `reservation-refund-${RESERVATION_ID}` },
      );
      expect(mockReservationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: RESERVATION_ID,
          deletedAt: null,
          paymentStatus: PaymentStatus.PAID,
        },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      });
      expect(mockReservationUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        refundId: "re_test_123",
        status: "succeeded",
        customerId: CUSTOMER_ID,
      });
    });

    test("PAID 以外の予約では Stripe refund を作成しない", async () => {
      mockReservationFindUnique.mockResolvedValueOnce({
        ...paidReservation(),
        paymentStatus: PaymentStatus.REFUNDED,
      });

      await expect(
        refundReservationPaymentCommand(RESERVATION_ID),
      ).rejects.toThrow(DomainError);
      expect(mockRefundCreate).not.toHaveBeenCalled();
      expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    });
  });
});
