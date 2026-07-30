import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";
import {
  expectErrorResult,
  expectReceivedResult,
} from "../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

type StripeWebhookEvent = {
  type: string;
  data: { object: unknown };
};

type MockCredentials = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string | null;
  stripeAccountId: string | null;
  stripeCurrency: string;
  stripePaymentMethodTypes: readonly string[];
};

const mockAssertStripeCredentialsConfigured =
  mock<() => Promise<MockCredentials>>();
const mockSafeDecrypt = mock<(value: string) => string | null>();
const mockConstructEvent =
  mock<
    (body: string, sig: string, secret: string) => Promise<StripeWebhookEvent>
  >();
const mockRetrieveCheckoutSession =
  mock<
    (
      sessionId: string,
      params?: unknown,
    ) => Promise<{ payment_intent: unknown }>
  >();
const mockGetStripeClient = mock<
  () => {
    client: {
      webhooks: { constructEventAsync: typeof mockConstructEvent };
      checkout: { sessions: { retrieve: typeof mockRetrieveCheckoutSession } };
    } | null;
  }
>();

const mockClaimReservationAsPaid = mock<
  (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => Promise<unknown>
>(() => Promise.resolve(null));
const mockGetReservationCheckoutExpectedAmount = mock<
  (id: string) => Promise<number | null>
>(() => Promise.resolve(5000));
const mockRefundCheckoutAmountMismatchForReservation = mock<
  (input: {
    reservationId: string;
    stripePaymentIntentId: string;
    capturedAppAmount: number;
  }) => Promise<{
    outcome: "refunded" | "already_refunded" | "not_applicable";
    refundId?: string;
    refundAmount?: number;
  }>
>(() =>
  Promise.resolve({
    outcome: "refunded",
    refundId: "re_res_mismatch",
    refundAmount: 9999,
  }),
);

const mockConfirmWaitlistOfferCommand = mock<
  (args: { registrationId: string; now: Date }) => Promise<{
    registration: { id: string; status: "CONFIRMED" | "EXPIRED" };
  }>
>();
const mockClaimEventRegistrationAsPaid = mock<
  (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => Promise<boolean>
>(() => Promise.resolve(false));
const mockRefundExpiredWaitlistOfferPaymentCommand = mock<
  (input: {
    registrationId: string;
    stripePaymentIntentId: string;
  }) => Promise<{ outcome: string }>
>(() => Promise.resolve({ outcome: "refunded" }));
const mockFindExpiredPendingWaitlistOfferRegistration = mock<
  (id: string) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));
const mockFindWaitlistOfferRegistrationNeedingRefundAfterPaidSession = mock<
  (id: string) => Promise<{ id: string; status: string } | null>
>(() => Promise.resolve(null));
const mockExpireWaitlistOfferForRefundIfNeeded = mock<
  (id: string) => Promise<void>
>(() => Promise.resolve());
const mockRefundCheckoutAmountMismatchForEventRegistration = mock<
  (input: {
    registrationId: string;
    stripePaymentIntentId: string;
    capturedAppAmount: number;
  }) => Promise<{
    outcome: "refunded" | "already_refunded" | "not_applicable";
    refundId?: string;
    refundAmount?: number;
  }>
>(() =>
  Promise.resolve({
    outcome: "refunded",
    refundId: "re_event_mismatch",
    refundAmount: 9999,
  }),
);
const mockGetEventRegistrationCheckoutExpectedAmount = mock<
  (id: string) => Promise<number | null>
>(() => Promise.resolve(5000));

const mockInvalidateSiteWideCacheFromRouteHandler =
  mock<(tags: readonly string[]) => void>();
const mockCreateNotificationCommand = mock<
  (input: unknown) => Promise<unknown>
>(() => Promise.resolve({ id: "notif-1" }));
const mockFireAndForget = mock<(promise: Promise<unknown>) => void>();
const mockLogError = mock<(error: unknown, opts?: unknown) => void>();
const mockJsonError = mock<(msg: string, status: number) => Response>(
  (msg, status) => new Response(JSON.stringify({ error: msg }), { status }),
);
const mockJsonSuccess = mock<(data: unknown) => Response>(
  (data) => new Response(JSON.stringify(data), { status: 200 }),
);

const actualPaymentAvailability =
  await import("@/shared/domain/payment/availability");
mock.module("@/shared/domain/payment/availability", () => ({
  ...actualPaymentAvailability,
  assertStripeCredentialsConfigured: () =>
    mockAssertStripeCredentialsConfigured(),
}));

const actualCrypto = await import("@/shared/lib/crypto");
mock.module("@/shared/lib/crypto", () => ({
  ...actualCrypto,
  safeDecrypt: (value: string) => mockSafeDecrypt(value),
  safeDecryptToString: (value: string | null | undefined) =>
    value ? mockSafeDecrypt(value) : null,
}));

mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => mockGetStripeClient(),
}));

mock.module("@/shared/domain/reservations/payment-queries", () => ({
  claimReservationAsPaid: (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => mockClaimReservationAsPaid(id, data),
  savePaymentIntentId: () => Promise.resolve(),
  claimReservationAsFailed: () => Promise.resolve(false),
  findReservationByPaymentIntent: () => Promise.resolve(null),
  applyChargeRefundIdempotent: () => Promise.resolve(),
  getReservationCheckoutExpectedAmount: (id: string) =>
    mockGetReservationCheckoutExpectedAmount(id),
}));

mock.module("@/shared/domain/reservations/payment-commands", () => ({
  refundCheckoutAmountMismatchForReservation: (input: {
    reservationId: string;
    stripePaymentIntentId: string;
    capturedAppAmount: number;
  }) => mockRefundCheckoutAmountMismatchForReservation(input),
}));

mock.module("@/shared/domain/stripe-events/dedup", () => ({
  claimStripeEventForProcessing: () => Promise.resolve("claimed"),
  markStripeEventProcessed: () => Promise.resolve(),
}));

mock.module("@/shared/domain/events/waitlist-commands", () => ({
  confirmWaitlistOfferCommand: (args: { registrationId: string; now: Date }) =>
    mockConfirmWaitlistOfferCommand(args),
}));

mock.module("@/shared/domain/events/payment-queries", () => ({
  claimEventRegistrationAsPaid: (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => mockClaimEventRegistrationAsPaid(id, data),
  claimEventRegistrationAsFailed: () => Promise.resolve(false),
  saveEventRegistrationPaymentIntentId: () => Promise.resolve(),
  findEventRegistrationByPaymentIntent: () => Promise.resolve(null),
  findEventRegistrationForReceiptNotify: () => Promise.resolve(null),
  applyEventChargeRefundIdempotent: () => Promise.resolve(),
  findExpiredPendingWaitlistOfferRegistration: (id: string) =>
    mockFindExpiredPendingWaitlistOfferRegistration(id),
  findWaitlistOfferRegistrationNeedingRefundAfterPaidSession: (id: string) =>
    mockFindWaitlistOfferRegistrationNeedingRefundAfterPaidSession(id),
  expireWaitlistOfferForRefundIfNeeded: (id: string) =>
    mockExpireWaitlistOfferForRefundIfNeeded(id),
  getEventRegistrationCheckoutExpectedAmount: (id: string) =>
    mockGetEventRegistrationCheckoutExpectedAmount(id),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  refundExpiredWaitlistOfferPaymentCommand: (input: {
    registrationId: string;
    stripePaymentIntentId: string;
  }) => mockRefundExpiredWaitlistOfferPaymentCommand(input),
  refundCheckoutAmountMismatchForEventRegistration: (input: {
    registrationId: string;
    stripePaymentIntentId: string;
    capturedAppAmount: number;
  }) => mockRefundCheckoutAmountMismatchForEventRegistration(input),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (input: unknown) =>
    mockCreateNotificationCommand(input),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (tags: readonly string[]) =>
    mockInvalidateSiteWideCacheFromRouteHandler(tags),
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: () => undefined,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => mockFireAndForget(promise),
  settleAllWithLogging: <T>(promises: Promise<T>[]) =>
    Promise.allSettled(promises),
  withTimeout: <T>(promise: Promise<T>) => promise,
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: (error: unknown, opts?: unknown) => mockLogError(error, opts),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));

mock.module("@/shared/lib/route-responses", () => ({
  getRouteErrorStatus: () => 400,
  jsonError: (msg: string, status = 400) => mockJsonError(msg, status),
  jsonSuccess: (data: unknown) => mockJsonSuccess(data),
  jsonValidationError: (error: { issues: Array<{ message: string }> }) =>
    mockJsonError(error.issues[0]?.message ?? "validation", 400),
}));

installEmailLibDispatchMock({
  sendReservationConfirmationEmail: () => Promise.resolve({ ok: true }),
  sendReservationCancelledEmail: mock(() => Promise.resolve()),
  sendReservationStatusChangedEmail: mock(() => Promise.resolve()),
  sendReservationAdminNotification: mock(() => Promise.resolve()),
  sendEventRegistrationConfirmation: () => Promise.resolve({ ok: true }),
});

mock.module("@/shared/domain/receipts/issue", () => ({
  issueReceiptForReservation: () =>
    Promise.resolve({ id: "receipt-mock", serialNo: "2026-000001" }),
  issueReceiptForEventRegistration: () =>
    Promise.resolve({ id: "receipt-event-mock", serialNo: "2026-000002" }),
}));

mock.module("@/shared/domain/receipts/notify-issued", () => ({
  notifyReceiptIssuedForReservation: () => Promise.resolve({ ok: true }),
  notifyReceiptIssuedForEventRegistration: () => Promise.resolve({ ok: true }),
}));

mock.module("@/shared/domain/events/waitlist-queries", () => ({
  getWaitlistConfirmationEmailDetails: () => Promise.resolve(null),
}));

mock.module(
  "@/shared/domain/events/waitlist-admin-notification-side-effects",
  () => ({
    fireEventWaitlistConfirmedAdminNotification: mock(() => undefined),
    fireEventWaitlistOfferedAdminNotification: mock(() => undefined),
    notifyEventWaitlistConfirmedForRegistration: mock(() => Promise.resolve()),
    notifyEventWaitlistOfferedForRegistration: mock(() => Promise.resolve()),
  }),
);

const actualSerialize = await import("@/shared/lib/serialize");
mock.module("@/shared/lib/serialize", () => ({
  ...actualSerialize,
  omitUndefined: (obj: Record<string, unknown>) => obj,
}));

const actualEnums = await import("@generated/prisma/enums");
mock.module("@generated/prisma/enums", () => actualEnums);

const { POST } = await import("@/app/api/webhooks/stripe/route");

const DEFAULT_SETTINGS: MockCredentials = {
  stripeSecretKey: "enc-secret-key",
  stripeWebhookSecret: "enc-webhook-secret",
  stripePublishableKey: null,
  stripeAccountId: null,
  stripeCurrency: "jpy",
  stripePaymentMethodTypes: ["card"],
};

function makeWaitlistOfferCompletedEvent(
  paymentIntent: string | null,
  sessionId = "cs_waitlist_orphan",
): StripeWebhookEvent {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        payment_status: "paid",
        payment_intent: paymentIntent,
        amount_total: 5000,
        currency: "jpy",
        metadata: {
          type: "event-registration",
          registrationId: "reg-waitlist-refund",
          source: "waitlist-offer",
        },
      },
    },
  };
}

function makeReservationMismatchEvent(amountTotal = 9999): StripeWebhookEvent {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_res_mismatch",
        payment_status: "paid",
        payment_intent: "pi_res_mismatch",
        amount_total: amountTotal,
        currency: "jpy",
        metadata: { reservationId: "res-mismatch-1" },
      },
    },
  };
}

function makeRequest(body = "body") {
  return new Request("https://example.com/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "stripe-signature": "sig-valid",
    },
    body,
  });
}

describe("POST /api/webhooks/stripe — orphan refund hardening", () => {
  beforeEach(() => {
    mockAssertStripeCredentialsConfigured.mockReset();
    mockSafeDecrypt.mockReset();
    mockGetStripeClient.mockReset();
    mockConstructEvent.mockReset();
    mockRetrieveCheckoutSession.mockReset();
    mockClaimReservationAsPaid.mockReset();
    mockGetReservationCheckoutExpectedAmount.mockReset();
    mockRefundCheckoutAmountMismatchForReservation.mockReset();
    mockConfirmWaitlistOfferCommand.mockReset();
    mockClaimEventRegistrationAsPaid.mockReset();
    mockRefundExpiredWaitlistOfferPaymentCommand.mockReset();
    mockFindExpiredPendingWaitlistOfferRegistration.mockReset();
    mockFindWaitlistOfferRegistrationNeedingRefundAfterPaidSession.mockReset();
    mockExpireWaitlistOfferForRefundIfNeeded.mockReset();
    mockRefundCheckoutAmountMismatchForEventRegistration.mockReset();
    mockGetEventRegistrationCheckoutExpectedAmount.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockFireAndForget.mockReset();
    mockLogError.mockReset();
    mockJsonError.mockReset();
    mockJsonSuccess.mockReset();

    mockJsonError.mockImplementation(
      (msg, status) => new Response(JSON.stringify({ error: msg }), { status }),
    );
    mockJsonSuccess.mockImplementation(
      (data) => new Response(JSON.stringify(data), { status: 200 }),
    );
    mockFireAndForget.mockImplementation(() => undefined);
    mockCreateNotificationCommand.mockImplementation(() =>
      Promise.resolve({ id: "notif-1" }),
    );

    mockAssertStripeCredentialsConfigured.mockResolvedValue(DEFAULT_SETTINGS);
    mockSafeDecrypt.mockImplementation((value) => `decrypted-${value}`);
    mockGetStripeClient.mockReturnValue({
      client: {
        webhooks: { constructEventAsync: mockConstructEvent },
        checkout: { sessions: { retrieve: mockRetrieveCheckoutSession } },
      },
    });
    mockGetReservationCheckoutExpectedAmount.mockResolvedValue(5000);
    mockGetEventRegistrationCheckoutExpectedAmount.mockResolvedValue(5000);
    mockRefundCheckoutAmountMismatchForReservation.mockResolvedValue({
      outcome: "refunded",
      refundId: "re_res_mismatch",
      refundAmount: 9999,
    });
    mockRefundCheckoutAmountMismatchForEventRegistration.mockResolvedValue({
      outcome: "refunded",
      refundId: "re_event_mismatch",
      refundAmount: 9999,
    });
    mockConfirmWaitlistOfferCommand.mockResolvedValue({
      registration: { id: "reg-waitlist-refund", status: "EXPIRED" },
    });
    mockRefundExpiredWaitlistOfferPaymentCommand.mockResolvedValue({
      outcome: "refunded",
    });
  });

  test("waitlist offer: payment_intent null → retrieve succeeds → auto-refund", async () => {
    mockRetrieveCheckoutSession.mockResolvedValueOnce({
      payment_intent: "pi_retrieved_waitlist",
    });
    mockConstructEvent.mockResolvedValue(makeWaitlistOfferCompletedEvent(null));

    const response = await POST(makeRequest());
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(mockRetrieveCheckoutSession).toHaveBeenCalledWith(
      "cs_waitlist_orphan",
      { expand: ["payment_intent"] },
    );
    expect(mockRefundExpiredWaitlistOfferPaymentCommand).toHaveBeenCalledWith({
      registrationId: "reg-waitlist-refund",
      stripePaymentIntentId: "pi_retrieved_waitlist",
    });
    expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
  });

  test("waitlist offer: payment_intent still null after retrieve → 500 (Stripe retry)", async () => {
    mockRetrieveCheckoutSession.mockResolvedValueOnce({
      payment_intent: null,
    });
    mockConstructEvent.mockResolvedValue(makeWaitlistOfferCompletedEvent(null));

    const response = await POST(makeRequest());
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(500);
    expect(mockRefundExpiredWaitlistOfferPaymentCommand).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  test("reservation amount mismatch with captured payment → auto-refund orchestration", async () => {
    mockConstructEvent.mockResolvedValue(makeReservationMismatchEvent());

    const response = await POST(makeRequest());
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
    expect(mockRefundCheckoutAmountMismatchForReservation).toHaveBeenCalledWith(
      {
        reservationId: "res-mismatch-1",
        stripePaymentIntentId: "pi_res_mismatch",
        capturedAppAmount: 9999,
      },
    );
    expect(mockCreateNotificationCommand).toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalled();
  });

  test("waitlist offer: confirm DomainError without EXPIRED → re-read triggers refund", async () => {
    mockConfirmWaitlistOfferCommand.mockRejectedValueOnce(
      new DomainError("既に他の処理が完了しています", "CONFLICT"),
    );
    mockFindWaitlistOfferRegistrationNeedingRefundAfterPaidSession.mockResolvedValueOnce(
      { id: "reg-waitlist-refund", status: "WAITLISTED_OFFERED" },
    );
    mockConstructEvent.mockResolvedValue(
      makeWaitlistOfferCompletedEvent("pi-waitlist-conflict"),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(mockExpireWaitlistOfferForRefundIfNeeded).toHaveBeenCalledWith(
      "reg-waitlist-refund",
    );
    expect(mockRefundExpiredWaitlistOfferPaymentCommand).toHaveBeenCalledWith({
      registrationId: "reg-waitlist-refund",
      stripePaymentIntentId: "pi-waitlist-conflict",
    });
    expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
  });
});
