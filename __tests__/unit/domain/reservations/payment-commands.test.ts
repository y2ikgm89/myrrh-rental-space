import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
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

const mockGetStripeSettings = mock<
  () => Promise<Record<string, unknown> | null>
>(() =>
  Promise.resolve({
    stripeEnabled: true,
    stripeSecretKey: "enc-stripe-secret",
  }),
);
const mockRefundCreate = mock<
  (
    params: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<{ id: string; status: string | null }>
>(() => Promise.resolve({ id: "re_test_123", status: "succeeded" }));
const mockCheckoutSessionCreate = mock(() =>
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
mock.module("@generated/prisma/enums", () => ({ PaymentStatus }));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: mockReservationFindUnique,
      update: mockReservationUpdate,
      updateMany: mockReservationUpdateMany,
    },
  },
}));
mock.module("@/shared/domain/settings/queries/integration", () => ({
  getStripeSettings: () => mockGetStripeSettings(),
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
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH" },
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
    mockGetStripeSettings.mockReset();
    mockGetStripeClient.mockReset();
    mockRefundCreate.mockReset();
    mockCheckoutSessionCreate.mockReset();
    mockLogError.mockReset();

    mockReservationFindUnique.mockResolvedValue(paidReservation());
    mockReservationUpdate.mockResolvedValue({ id: RESERVATION_ID });
    mockReservationUpdateMany.mockResolvedValue({ count: 1 });
    mockGetStripeSettings.mockResolvedValue({
      stripeEnabled: true,
      stripeSecretKey: "enc-stripe-secret",
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
      let checkoutCalledBeforeClaim = false;
      let claimCalled = false;
      mockReservationUpdateMany.mockImplementation(() => {
        claimCalled = true;
        if (mockCheckoutSessionCreate.mock.calls.length > 0) {
          checkoutCalledBeforeClaim = true;
        }
        return Promise.resolve({ count: 1 });
      });

      await createCheckoutSessionCommand({
        reservationId: RESERVATION_ID,
        actorCustomerId: null,
      });

      expect(claimCalled).toBe(true);
      expect(checkoutCalledBeforeClaim).toBe(false);
      // claim の WHERE に paymentStatus: UNPAID 述語が含まれることを確認
      expect(mockReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: PaymentStatus.UNPAID,
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
