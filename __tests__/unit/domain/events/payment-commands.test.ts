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
const mockCheckoutSessionCreate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string; url: string | null }>
>(() =>
  Promise.resolve({
    id: "cs_test_waitlist",
    url: "https://stripe.example/waitlist-checkout",
  }),
);
const mockCheckoutSessionExpire = mock<
  (sessionId: string) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "cs_test_waitlist" }));
const mockGetStripeClient = mock(() =>
  Promise.resolve({
    client: {
      checkout: {
        sessions: {
          create: mockCheckoutSessionCreate,
          expire: mockCheckoutSessionExpire,
        },
      },
    },
  }),
);
const mockLogError = mock(() => undefined);

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
  RegistrationStatus,
  // payment-commands → receipts/issue → helpers/guards が SocialPlatform を要求する。
  SocialPlatform: {
    INSTAGRAM: "INSTAGRAM",
    FACEBOOK: "FACEBOOK",
    TWITTER: "TWITTER",
    YOUTUBE: "YOUTUBE",
    LINE: "LINE",
    TIKTOK: "TIKTOK",
    OTHER: "OTHER",
  },
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
  assertStripeCredentialsConfigured: () =>
    mockAssertStripeCredentialsConfigured(),
}));
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => mockGetStripeClient(),
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://example.com",
}));
const actualStripePaymentMethods =
  await import("@/shared/lib/stripe-payment-methods");
mock.module("@/shared/lib/stripe-payment-methods", () => ({
  ...actualStripePaymentMethods,
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
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: () => undefined,
}));
mock.module("@/shared/domain/receipts/issue", () => ({
  issueReceiptForEventRegistration: () =>
    Promise.resolve({ id: "receipt-1", serialNo: "2026-000001" }),
}));
mock.module("@/shared/domain/receipts/notify-issued", () => ({
  notifyReceiptIssuedForEventRegistration: () => Promise.resolve(),
}));
mock.module("@/shared/lib/receipt-download-token", () => ({
  createReceiptDownloadToken: () => "RECEIPT_TOKEN",
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  createEventCheckoutSessionCommand,
  createWaitlistOfferCheckoutSessionCommand,
  recordManualEventPaymentCommand,
} = await import("@/shared/domain/events/payment-commands");

const REGISTRATION_ID = "550e8400-e29b-41d4-a716-446655440101";
const OFFER_TOKEN = "test-offer-token-abc";
const SESSION_ID = "cs_test_waitlist";
const SESSION_URL = "https://stripe.example/waitlist-checkout";

// ── createEventCheckoutSessionCommand fixtures ──────────────────────────────
const CUSTOMER_ID = "customer-abc123";
const CHECKOUT_SESSION_ID = "cs_test_checkout";
const CHECKOUT_SESSION_URL = "https://stripe.example/event-checkout";

/**
 * prisma.eventRegistration.findUnique の初回読み込み結果（pre-flight チェック用）。
 * createEventCheckoutSessionCommand は status: CONFIRMED + paymentStatus: UNPAID を要求。
 */
function checkoutInitialRead(overrides: Record<string, unknown> = {}) {
  return {
    id: REGISTRATION_ID,
    customerId: CUSTOMER_ID,
    email: "customer@example.com",
    name: "Test Customer",
    quantity: 1,
    status: RegistrationStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    stripeCheckoutSessionId: null,
    ticket: { name: "Standard Ticket", price: 5000 },
    event: { title: "Test Event" },
    ...overrides,
  };
}

/**
 * claim 後の authoritative 再読み込み結果（event.slug 付き）。
 */
function checkoutAuthoritative(overrides: Record<string, unknown> = {}) {
  return {
    email: "customer@example.com",
    name: "Test Customer",
    quantity: 1,
    ticket: { name: "Standard Ticket", price: 5000 },
    event: { title: "Test Event", slug: "test-event" },
    ...overrides,
  };
}

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
    mockAssertStripeCredentialsConfigured.mockReset();
    mockGetStripeClient.mockReset();
    mockCheckoutSessionCreate.mockReset();
    mockCheckoutSessionExpire.mockReset();
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
          },
        },
      },
    });
    mockCheckoutSessionCreate.mockResolvedValue({
      id: SESSION_ID,
      url: SESSION_URL,
    });
    mockCheckoutSessionExpire.mockResolvedValue({ id: SESSION_ID });
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

      // 2 回目: session 確定書込 (updateMany + notIn [PAID, PARTIALLY_REFUNDED, REFUNDED] +
      // PENDING 再 assert + stripeCheckoutSessionId + paidAmount)
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
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

    test("Session settle が PAID/REFUNDED race で count=0 → session expire + CONFLICT (session URL 返却しない)", async () => {
      mockRegUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const error = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockCheckoutSessionExpire).toHaveBeenCalledWith(SESSION_ID);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          severity: "HIGH",
        }),
      );
    });

    test("Session 作成後 settle 書込失敗 → best-effort expire + PENDING→UNPAID revert", async () => {
      mockRegUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error("DB write failed"));

      const error = await createWaitlistOfferCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        offerToken: OFFER_TOKEN,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNEXPECTED");
      expect(mockCheckoutSessionExpire).toHaveBeenCalledWith(SESSION_ID);

      const calls = mockRegUpdateMany.mock.calls;
      expect(calls.length).toBe(3);
      expect(calls[2]?.[0]).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.UNPAID,
        }),
      });
    });
  });

  describe("createEventCheckoutSessionCommand", () => {
    // ── NOT_FOUND ─────────────────────────────────────────────────────────────
    test("NOT_FOUND: registration が存在しなければ DomainError(NOT_FOUND)", async () => {
      mockRegFindUnique.mockResolvedValueOnce(null);

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("NOT_FOUND");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    // ── FORBIDDEN ─────────────────────────────────────────────────────────────
    test("FORBIDDEN: actorCustomerId が registration.customerId と不一致 → DomainError(FORBIDDEN)", async () => {
      mockRegFindUnique.mockResolvedValueOnce(
        checkoutInitialRead({ customerId: "other-customer-id" }),
      );

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("FORBIDDEN");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    test("actorCustomerId が null (admin 経路) は FORBIDDEN を throw しない", async () => {
      // admin 経路は本人性検証 bypass — CONFIRMED + UNPAID なら通過する。
      // 次の updateMany (claim) で count=1 が返れば happy path を辿る。
      mockRegFindUnique
        .mockResolvedValueOnce(
          checkoutInitialRead({ customerId: "any-customer" }),
        )
        .mockResolvedValueOnce(checkoutAuthoritative());
      mockCheckoutSessionCreate.mockResolvedValueOnce({
        id: CHECKOUT_SESSION_ID,
        url: CHECKOUT_SESSION_URL,
      });

      const result = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: null,
      });

      expect(result.sessionId).toBe(CHECKOUT_SESSION_ID);
    });

    // ── VALIDATION: status ─────────────────────────────────────────────────────
    test("VALIDATION: status が CONFIRMED でなければ DomainError(VALIDATION) & claim/Stripe 未呼出", async () => {
      mockRegFindUnique.mockResolvedValueOnce(
        checkoutInitialRead({ status: RegistrationStatus.CANCELLED }),
      );

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    // ── VALIDATION: paymentStatus ──────────────────────────────────────────────
    test("VALIDATION: paymentStatus が PENDING なら DomainError(VALIDATION) & claim/Stripe 未呼出", async () => {
      mockRegFindUnique.mockResolvedValueOnce(
        checkoutInitialRead({ paymentStatus: PaymentStatus.PENDING }),
      );

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    // ── VALIDATION: free ticket ────────────────────────────────────────────────
    test("VALIDATION: 無料チケット (price 0) は DomainError(VALIDATION) & claim/Stripe 未呼出", async () => {
      mockRegFindUnique.mockResolvedValueOnce(
        checkoutInitialRead({ ticket: { name: "Free Ticket", price: 0 } }),
      );

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    });

    // ── Happy path ─────────────────────────────────────────────────────────────
    test("happy path: claim UNPAID→PENDING + Stripe session 作成 + {sessionId, sessionUrl, customerId} 返却", async () => {
      mockRegFindUnique
        .mockResolvedValueOnce(checkoutInitialRead())
        .mockResolvedValueOnce(checkoutAuthoritative());
      mockCheckoutSessionCreate.mockResolvedValueOnce({
        id: CHECKOUT_SESSION_ID,
        url: CHECKOUT_SESSION_URL,
      });

      const result = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      });

      expect(result).toEqual({
        sessionId: CHECKOUT_SESSION_ID,
        sessionUrl: CHECKOUT_SESSION_URL,
        customerId: CUSTOMER_ID,
      });
      expect(mockCheckoutSessionCreate).toHaveBeenCalledTimes(1);

      // updateMany は 2 回: 1) claim UNPAID→PENDING, 2) settle (sessionId + paidAmount)
      const calls = mockRegUpdateMany.mock.calls;
      expect(calls.length).toBe(2);

      // 1 回目: claim — status: CONFIRMED + paymentStatus in [UNPAID, FAILED] → PENDING
      // (Codex P1 #1026: status: CONFIRMED も WHERE に含めることで
      //  並行 cancel が走ったケースを DB レベルで塞ぐ。FAILED は再 checkout 許容)
      expect(calls[0]?.[0]).toMatchObject({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
          },
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
        }),
      });

      // 2 回目: settle — stripeCheckoutSessionId + paidAmount を書き込む
      // price(5000) × quantity(1) = 5000
      expect(calls[1]?.[0]).toMatchObject({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
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
          stripeCheckoutSessionId: CHECKOUT_SESSION_ID,
          paidAmount: 5000,
        }),
      });
    });

    test("Stripe session に expires_at (cron cutoff と同期) が指定される", async () => {
      mockRegFindUnique
        .mockResolvedValueOnce(checkoutInitialRead())
        .mockResolvedValueOnce(checkoutAuthoritative());
      mockCheckoutSessionCreate.mockResolvedValueOnce({
        id: CHECKOUT_SESSION_ID,
        url: CHECKOUT_SESSION_URL,
      });

      const before = Math.floor(Date.now() / 1000);
      await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      });
      const after = Math.floor(Date.now() / 1000);

      const sessionArgs = mockCheckoutSessionCreate.mock.calls[0]?.[0] as
        { expires_at?: number } | undefined;
      expect(sessionArgs?.expires_at).toEqual(expect.any(Number));
      const expected = before + 60 * 60;
      const expectedMax = after + 60 * 60;
      expect(sessionArgs?.expires_at).toBeGreaterThanOrEqual(expected);
      expect(sessionArgs?.expires_at).toBeLessThanOrEqual(expectedMax);
    });

    test("Stripe 失敗 → PENDING → UNPAID revert + DomainError(UNEXPECTED) + logError 呼出", async () => {
      mockRegFindUnique
        .mockResolvedValueOnce(checkoutInitialRead())
        .mockResolvedValueOnce(checkoutAuthoritative());
      mockCheckoutSessionCreate.mockRejectedValueOnce(
        new Error("Stripe API error"),
      );

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNEXPECTED");

      // updateMany: 1) claim UNPAID→PENDING, 2) revert PENDING→UNPAID
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
      expect(mockLogError).toHaveBeenCalled();
    });

    test("Session settle が PAID/REFUNDED race で count=0 → session expire + CONFLICT (session URL 返却しない)", async () => {
      mockRegFindUnique
        .mockResolvedValueOnce(checkoutInitialRead())
        .mockResolvedValueOnce(checkoutAuthoritative());
      mockCheckoutSessionCreate.mockResolvedValueOnce({
        id: CHECKOUT_SESSION_ID,
        url: CHECKOUT_SESSION_URL,
      });
      mockRegUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockCheckoutSessionExpire).toHaveBeenCalledWith(
        CHECKOUT_SESSION_ID,
      );
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          severity: "HIGH",
        }),
      );
    });

    test("Session 作成後 settle 書込失敗 → best-effort expire + PENDING→UNPAID revert", async () => {
      mockRegFindUnique
        .mockResolvedValueOnce(checkoutInitialRead())
        .mockResolvedValueOnce(checkoutAuthoritative());
      mockCheckoutSessionCreate.mockResolvedValueOnce({
        id: CHECKOUT_SESSION_ID,
        url: CHECKOUT_SESSION_URL,
      });
      mockRegUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error("DB write failed"));

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNEXPECTED");
      expect(mockCheckoutSessionExpire).toHaveBeenCalledWith(
        CHECKOUT_SESSION_ID,
      );

      const calls = mockRegUpdateMany.mock.calls;
      expect(calls.length).toBe(3);
      expect(calls[2]?.[0]).toMatchObject({
        where: expect.objectContaining({
          paymentStatus: PaymentStatus.PENDING,
        }),
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.UNPAID,
        }),
      });
    });

    test("claim race (別 request が先に PENDING を確保) → DomainError(CONFLICT) & Stripe 未呼出", async () => {
      mockRegFindUnique.mockResolvedValueOnce(checkoutInitialRead());
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const error = await createEventCheckoutSessionCommand({
        registrationId: REGISTRATION_ID,
        actorCustomerId: CUSTOMER_ID,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
      // authoritative 再読み込みも走らない
      expect(mockRegFindUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe("recordManualEventPaymentCommand", () => {
    function unpaidRegistration(overrides: Record<string, unknown> = {}) {
      return {
        paymentStatus: PaymentStatus.UNPAID,
        stripeCheckoutSessionId: null,
        customerId: CUSTOMER_ID,
        quantity: 1,
        ticket: { price: 5000 },
        ...overrides,
      };
    }

    test("amount が ticket.price × quantity と一致すれば PAID に claim する", async () => {
      mockRegFindUnique.mockResolvedValueOnce(unpaidRegistration());
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await recordManualEventPaymentCommand({
        registrationId: REGISTRATION_ID,
        amount: 5000,
      });

      expect(result.registrationId).toBe(REGISTRATION_ID);
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: REGISTRATION_ID,
            status: RegistrationStatus.CONFIRMED,
            paymentStatus: PaymentStatus.UNPAID,
          }),
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.PAID,
            paidAmount: 5000,
          }),
        }),
      );
    });

    test("amount が charge base と不一致なら VALIDATION で拒否", async () => {
      mockRegFindUnique.mockResolvedValueOnce(unpaidRegistration());

      const error = await recordManualEventPaymentCommand({
        registrationId: REGISTRATION_ID,
        amount: 4000,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect((error as DomainError).message).toContain("5000");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
    });

    test("無料チケット (price × quantity <= 0) は VALIDATION で拒否", async () => {
      mockRegFindUnique.mockResolvedValueOnce(
        unpaidRegistration({ ticket: { price: 0 } }),
      );

      const error = await recordManualEventPaymentCommand({
        registrationId: REGISTRATION_ID,
        amount: 0,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
      expect(mockRegUpdateMany).not.toHaveBeenCalled();
    });
  });
});
