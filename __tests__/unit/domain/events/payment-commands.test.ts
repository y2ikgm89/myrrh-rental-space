import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const RegistrationStatus = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  WAITLISTED: "WAITLISTED",
  WAITLISTED_OFFERED: "WAITLISTED_OFFERED",
  EXPIRED: "EXPIRED",
} as const;

const mockRegFindUnique = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegFindFirst = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegUpdateMany = mock<
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
const mockCheckoutSessionCreate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string; url: string | null }>
>(() =>
  Promise.resolve({
    id: "cs_test_waitlist",
    url: "https://stripe.example/waitlist-checkout",
  }),
);
const mockGetStripeClient = mock(() =>
  Promise.resolve({
    client: {
      checkout: { sessions: { create: mockCheckoutSessionCreate } },
    },
  }),
);
const mockLogError = mock(() => undefined);

mock.module("server-only", () => ({}));
mock.module("@generated/prisma/enums", () => ({
  PaymentStatus,
  RegistrationStatus,
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findUnique: mockRegFindUnique,
      findFirst: mockRegFindFirst,
      updateMany: mockRegUpdateMany,
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
mock.module("@/shared/lib/stripe-payment-methods", () => ({
  isStripePaymentMethodType: (v: string) => v === "card",
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

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  createWaitlistOfferCheckoutSessionCommand,
  claimEventRegistrationAsFailed,
} = await import("@/shared/domain/events/payment-commands");

const REGISTRATION_ID = "550e8400-e29b-41d4-a716-446655440101";
const OFFER_TOKEN = "test-offer-token-abc";
const SESSION_ID = "cs_test_waitlist";
const SESSION_URL = "https://stripe.example/waitlist-checkout";

// Codex P1-A (event-waitlist-task1 の並行 modified) が追加した「claim 後に
// authoritative.expiresAt <= now なら revert + VALIDATION」gate と共存させるため、
// fixture は必ず expiresAt を未来にする。expiresAt を過去にする expired path の
// 検証は out of scope (別テストで扱う)。
function futureExpiresAt(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function initialRead(overrides: Record<string, unknown> = {}) {
  return {
    id: REGISTRATION_ID,
    status: RegistrationStatus.WAITLISTED_OFFERED,
    ...overrides,
  };
}

function authoritative(overrides: Record<string, unknown> = {}) {
  return {
    email: "waitlisted@example.com",
    quantity: 2,
    expiresAt: futureExpiresAt(),
    ticket: { name: "Test Ticket", price: 3000 },
    event: { title: "Test Event", slug: "test-event" },
    ...overrides,
  };
}

describe("events/payment-commands", () => {
  beforeEach(() => {
    mockRegFindUnique.mockReset();
    mockRegFindFirst.mockReset();
    mockRegUpdateMany.mockReset();
    mockAssertOnlinePaymentAvailable.mockReset();
    mockGetStripeClient.mockReset();
    mockCheckoutSessionCreate.mockReset();
    mockLogError.mockReset();

    mockRegFindUnique.mockResolvedValue(initialRead());
    mockRegFindFirst.mockResolvedValue(authoritative());
    mockRegUpdateMany.mockResolvedValue({ count: 1 });
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
      },
    });
    mockCheckoutSessionCreate.mockResolvedValue({
      id: SESSION_ID,
      url: SESSION_URL,
    });
    mockLogError.mockImplementation(() => undefined);
  });

  describe("createWaitlistOfferCheckoutSessionCommand", () => {
    test("happy path: {url, sessionId} を返し、settle updateMany で PENDING + sessionId + paidAmount を書き込む", async () => {
      const result = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      });

      expect(result).toEqual({ url: SESSION_URL, sessionId: SESSION_ID });
      expect(mockCheckoutSessionCreate).toHaveBeenCalledTimes(1);

      // updateMany は 2 回: 1) claim UNPAID/FAILED→PENDING, 2) settle
      const calls = mockRegUpdateMany.mock.calls;
      expect(calls.length).toBe(2);

      // 2 回目: session 確定書込 (updateMany + notIn [PAID, REFUNDED] +
      // PENDING 再 assert + stripeCheckoutSessionId + paidAmount)
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
          paymentStatus: expect.objectContaining({
            notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
          }),
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
          stripeCheckoutSessionId: SESSION_ID,
          // ticket.price(3000) × quantity(2) = 6000
          paidAmount: 6000,
        }),
      });
    });

    test("status が WAITLISTED_OFFERED でなければ DomainError(VALIDATION) & claim / Stripe 未呼出", async () => {
      mockRegFindUnique.mockResolvedValueOnce(
        initialRead({ status: RegistrationStatus.CONFIRMED }),
      );

      const error = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    test("registration が存在しなければ DomainError(NOT_FOUND)", async () => {
      mockRegFindUnique.mockResolvedValueOnce(null);

      const error = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("NOT_FOUND");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    test("claim race (別 request が先に PENDING を確保) → DomainError(CONFLICT) & Stripe / authoritative 未呼出", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const error = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
      // authoritative re-read も走らない (claim 失敗で早期 throw)
      expect(mockRegFindFirst).not.toHaveBeenCalled();
    });

    test("Stripe API 失敗 → catch で PENDING → UNPAID を revert して DomainError(UNEXPECTED)", async () => {
      mockCheckoutSessionCreate.mockRejectedValueOnce(
        new Error("Stripe API down"),
      );

      const error = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNEXPECTED");

      // updateMany は 2 回: 1) claim UNPAID/FAILED→PENDING, 2) revert PENDING→UNPAID
      // (expiresAt は未来なので Codex P1-A の revert は fire しない)
      const calls = mockRegUpdateMany.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
          paymentStatus: PaymentStatus.PENDING,
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.UNPAID,
        }),
      });
      // Stripe エラーは logError に流れる (severity HIGH)
      expect(mockLogError).toHaveBeenCalled();
    });

    test("claim WHERE で status: WAITLISTED_OFFERED + paymentStatus in [UNPAID, FAILED] を要求 (FAILED も再決済許容、PAID/REFUNDED は対象外)", async () => {
      await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      });

      const firstClaim = mockRegUpdateMany.mock.calls[0]?.[0];
      expect(firstClaim).toMatchObject({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
          status: RegistrationStatus.WAITLISTED_OFFERED,
          paymentStatus: expect.objectContaining({
            in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
          }),
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
        }),
      });
    });

    test("Stripe 呼出は claim 成功後 (claim updateMany が先、Stripe API はその後)", async () => {
      let stripeBeforeClaim = false;
      mockRegUpdateMany.mockImplementationOnce(() => {
        if (mockCheckoutSessionCreate.mock.calls.length > 0) {
          stripeBeforeClaim = true;
        }
        return Promise.resolve({ count: 1 });
      });
      // settle 側は default (count: 1) がそのまま使われる

      await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      });

      expect(stripeBeforeClaim).toBe(false);
      expect(mockCheckoutSessionCreate).toHaveBeenCalledTimes(1);
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
      // 24h offer window 内で顧客が cancel → 再 checkout した場合、
      // 前回の checkout.session.expired が遅れて到達しても、
      // stripeCheckoutSessionId は新 session に更新済み。sessionId gate 一致
      // 無しで DB は 0 行更新、false を返す (= 新 PENDING を巻き込まない)。
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_stale_session",
      );

      expect(result).toBe(false);
      // 呼び出し自体は起き、WHERE に sessionId が入っていることを確認
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
});
