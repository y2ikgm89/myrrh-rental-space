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
    test("Stripe Checkout customer_email は予約時メールを優先する", async () => {
      mockReservationFindUnique.mockResolvedValueOnce({
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

      await createCheckoutSessionCommand(RESERVATION_ID);

      expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: "booked-address@example.com",
        }),
      );
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
