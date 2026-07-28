/**
 * STRIPE-DEDUP-A: Stripe webhook chokepoint (event.id primary key + P2002 duplicate detection).
 *
 * Stripe 公式 "handle-duplicate-events" 推奨実装の unit テスト。
 * `claimStripeEventForProcessing` の戻り値による route の分岐:
 *   - "claimed"            : handler 続行 → 成功後に `markStripeEventProcessed`
 *   - "already_processed"  : handler 非実行 → 200 { duplicate: true }
 *   - "retry_unprocessed"  : crash 後の再送。handler 再実行 → 成功後に processedAt
 *
 * 加えて "署名検証失敗は chokepoint より前で完結する" の順序契約も確認。
 *
 * @see https://docs.stripe.com/webhooks#handle-duplicate-events
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// =============================================================================
// 1. モック関数定義（import より前に必須）
// =============================================================================

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
const mockAssertOnlinePaymentAvailable = mock<() => Promise<MockCredentials>>();
const mockSafeDecrypt = mock<(value: string) => string | null>();

type StripeWebhookEvent = {
  id: string;
  type: string;
  data: { object: unknown };
};
const mockConstructEvent =
  mock<
    (body: string, sig: string, secret: string) => Promise<StripeWebhookEvent>
  >();
const mockGetStripeClient = mock<
  () => Promise<{
    client: {
      webhooks: { constructEventAsync: typeof mockConstructEvent };
    } | null;
  }>
>();

// Chokepoint under test
const mockClaimStripeEventForProcessing =
  mock<
    (input: {
      eventId: string;
      eventType: string;
    }) => Promise<"claimed" | "already_processed" | "retry_unprocessed">
  >();
const mockMarkStripeEventProcessed = mock<(eventId: string) => Promise<void>>();

// Reservation-side (event.id 分岐の観測用: duplicate 時に handler が呼ばれないことを assert)
const mockClaimReservationAsPaid = mock<
  (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => Promise<{
    id: string;
    totalPrice: number;
    notes: string | null;
    startTime: string;
    endTime: string;
    icsSequence: number;
    guestEmail?: string | null;
    customer: { email: string; lastName: string; firstName: string };
    space: { name: string; location: { name: string } | null };
  } | null>
>();

// Cache invalidation (Route Handler variant)
const mockInvalidateSiteWideCacheFromRouteHandler =
  mock<(tags: readonly string[], options?: unknown) => void>();

// Errors / navigation / route responses
const mockLogError = mock<(error: unknown, opts?: unknown) => void>();
const mockNormalizeError = mock<(error: unknown) => Error>((e) => {
  if (e instanceof Error) return e;
  return new Error(String(e));
});
const mockUnstableRethrow = mock<(error: unknown) => void>(() => {
  // Next.js 内部エラーではないので no-op
});

const mockJsonError = mock<(msg: string, status: number) => Response>(
  (msg, status) => new Response(JSON.stringify({ error: msg }), { status }),
);
const mockJsonSuccess = mock<(data: unknown, status?: number) => Response>(
  (data, status = 200) => new Response(JSON.stringify(data), { status }),
);

const mockOmitUndefined = mock<
  (obj: Record<string, unknown>) => Record<string, unknown>
>((obj) => obj);
const mockFireAndForget = mock<(p: Promise<unknown>, opts?: unknown) => void>();

// Receipt stubs (webhook が fulfill 経路で await するため境界差替)
const mockIssueReceiptForReservation = mock<
  (id: string, options?: unknown) => Promise<{ id: string; serialNo: string }>
>(() => Promise.resolve({ id: "receipt-mock", serialNo: "2026-000001" }));
const mockIssueReceiptForEventRegistration = mock<
  (id: string, options?: unknown) => Promise<{ id: string; serialNo: string }>
>(() => Promise.resolve({ id: "receipt-event-mock", serialNo: "2026-000002" }));
const mockNotifyReceiptIssuedForReservation = mock<
  (input: { receiptId: string; detailUrl: string }) => Promise<unknown>
>(() => Promise.resolve({ ok: true, messageId: "msg_receipt" }));
const mockNotifyReceiptIssuedForEventRegistration = mock<
  (input: { receiptId: string; detailUrl: string }) => Promise<unknown>
>(() => Promise.resolve({ ok: true, messageId: "msg_receipt_event" }));

// Reservation-side email (fireAndForget 経由でしか呼ばれないので no-op stub)
const mockSendReservationConfirmationEmail =
  mock<(data: unknown) => Promise<void>>();

// =============================================================================
// 2. mock.module()
// =============================================================================

mock.module("@/shared/domain/payment/availability", () => ({
  assertStripeCredentialsConfigured: () =>
    mockAssertStripeCredentialsConfigured(),
  // reservations/payment-commands が実モジュールとしてロードされる経路向け
  // （refundCheckoutAmountMismatchForReservation 等）。named export 欠落は
  // Bun の link 時に SyntaxError になる。
  assertOnlinePaymentAvailable: () => mockAssertOnlinePaymentAvailable(),
  isOnlinePaymentAvailable: () => Promise.resolve(true),
}));

mock.module("@/shared/domain/reservations/payment-commands", () => ({
  refundCheckoutAmountMismatchForReservation: () =>
    Promise.resolve({ outcome: "not_applicable" }),
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

// 対象境界
mock.module("@/shared/domain/stripe-events/dedup", () => ({
  claimStripeEventForProcessing: (input: {
    eventId: string;
    eventType: string;
  }) => mockClaimStripeEventForProcessing(input),
  markStripeEventProcessed: (id: string) => mockMarkStripeEventProcessed(id),
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
  getReservationCheckoutExpectedAmount: () => Promise.resolve(5000),
}));

mock.module("@/shared/domain/events/payment-queries", () => ({
  claimEventRegistrationAsPaid: () => Promise.resolve(false),
  claimEventRegistrationAsFailed: () => Promise.resolve(false),
  saveEventRegistrationPaymentIntentId: () => Promise.resolve(),
  findEventRegistrationByPaymentIntent: () => Promise.resolve(null),
  findEventRegistrationForReceiptNotify: () => Promise.resolve(null),
  applyEventChargeRefundIdempotent: () => Promise.resolve(),
  findExpiredPendingWaitlistOfferRegistration: () => Promise.resolve(null),
  findWaitlistOfferRegistrationNeedingRefundAfterPaidSession: () =>
    Promise.resolve(null),
  expireWaitlistOfferForRefundIfNeeded: () => Promise.resolve(null),
  getEventRegistrationCheckoutExpectedAmount: () => Promise.resolve(5000),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  refundExpiredWaitlistOfferPaymentCommand: () =>
    Promise.resolve({ outcome: "not_applicable" }),
  refundCheckoutAmountMismatchForEventRegistration: () =>
    Promise.resolve({ outcome: "not_applicable" }),
}));

mock.module(
  "@/shared/domain/events/waitlist-admin-notification-side-effects",
  () => ({
    fireEventWaitlistConfirmedAdminNotification: () => Promise.resolve(),
  }),
);

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: () => Promise.resolve({ id: "notif-mock" }),
}));

mock.module("@/shared/domain/events/waitlist-commands", () => ({
  confirmWaitlistOfferCommand: () => Promise.resolve({}),
}));

mock.module("@/shared/domain/events/waitlist-queries", () => ({
  getWaitlistConfirmationEmailDetails: () => Promise.resolve(null),
}));

mock.module("@/shared/domain/email/lib-dispatch", () => ({
  sendReservationConfirmationEmail: (data: unknown) =>
    mockSendReservationConfirmationEmail(data),
  sendReservationCancelledEmail: mock(() => Promise.resolve()),
  sendReservationStatusChangedEmail: mock(() => Promise.resolve()),
  sendReservationAdminNotification: mock(() => Promise.resolve()),
  sendEventRegistrationConfirmation: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/receipts/issue", () => ({
  issueReceiptForReservation: (id: string, options?: unknown) =>
    mockIssueReceiptForReservation(id, options),
  issueReceiptForEventRegistration: (id: string, options?: unknown) =>
    mockIssueReceiptForEventRegistration(id, options),
}));

mock.module("@/shared/domain/receipts/notify-issued", () => ({
  notifyReceiptIssuedForReservation: (input: {
    receiptId: string;
    detailUrl: string;
  }) => mockNotifyReceiptIssuedForReservation(input),
  notifyReceiptIssuedForEventRegistration: (input: {
    receiptId: string;
    detailUrl: string;
  }) => mockNotifyReceiptIssuedForEventRegistration(input),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (
    tags: readonly string[],
    options?: unknown,
  ) => mockInvalidateSiteWideCacheFromRouteHandler(tags, options),
}));

const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>, opts?: unknown) =>
    mockFireAndForget(promise, opts),
  settleAllWithLogging: <T>(promises: Promise<T>[]) =>
    Promise.allSettled(promises),
  withTimeout: <T>(promise: Promise<T>) => promise,
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: (error: unknown, opts?: unknown) => mockLogError(error, opts),
  normalizeError: (error: unknown) => mockNormalizeError(error),
}));

mock.module("@/shared/lib/route-responses", () => ({
  getRouteErrorStatus: () => 400,
  jsonError: (msg: string, status = 400) => mockJsonError(msg, status),
  jsonSuccess: (data: unknown, status = 200) => mockJsonSuccess(data, status),
  jsonValidationError: (
    error: { issues: Array<{ message: string }> },
    fallback = "入力内容に誤りがあります",
  ) => mockJsonError(error.issues[0]?.message ?? fallback, 400),
}));

const actualSerialize = await import("@/shared/lib/serialize");
mock.module("@/shared/lib/serialize", () => ({
  ...actualSerialize,
  omitUndefined: (obj: Record<string, unknown>) => mockOmitUndefined(obj),
}));

const actualEnums = await import("@generated/prisma/enums");
mock.module("@generated/prisma/enums", () => actualEnums);

// =============================================================================
// 3. テスト対象の import
// =============================================================================

const { POST } = await import("@/app/api/webhooks/stripe/route");

// =============================================================================
// ヘルパー
// =============================================================================

const DEFAULT_SETTINGS: MockCredentials = {
  stripeSecretKey: "enc-secret-key",
  stripeWebhookSecret: "enc-webhook-secret",
  stripePublishableKey: null,
  stripeAccountId: null,
  stripeCurrency: "jpy",
  stripePaymentMethodTypes: ["card"],
};

const DEFAULT_RESERVATION = {
  id: "res-dedup-1",
  totalPrice: 5000,
  notes: null,
  startTime: "2026-08-01T10:00:00.000Z",
  endTime: "2026-08-01T12:00:00.000Z",
  status: "PENDING" as const,
  userId: "user-dedup-1",
  guestEmail: null,
  customer: { email: "test@example.com", lastName: "田中", firstName: "太郎" },
  space: { name: "テストスペース", location: { name: "東京" } },
};

function makeCheckoutCompletedEvent(eventId: string): StripeWebhookEvent {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_dedup",
        payment_status: "paid",
        payment_intent: "pi-dedup-1",
        amount_total: 5000,
        currency: "jpy",
        metadata: { reservationId: "res-dedup-1" },
      },
    },
  };
}

function makeRequest(body: string, signature: string | null = "sig-valid") {
  const headers: Record<string, string> = { "content-type": "text/plain" };
  if (signature !== null) {
    headers["stripe-signature"] = signature;
  }
  return new Request("https://example.com/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

// =============================================================================
// テスト
// =============================================================================

describe("POST /api/webhooks/stripe — STRIPE-DEDUP-A chokepoint", () => {
  beforeEach(() => {
    mockAssertStripeCredentialsConfigured.mockReset();
    mockSafeDecrypt.mockReset();
    mockGetStripeClient.mockReset();
    mockConstructEvent.mockReset();
    mockClaimStripeEventForProcessing.mockReset();
    mockMarkStripeEventProcessed.mockReset();
    mockClaimReservationAsPaid.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockNormalizeError.mockReset();
    mockUnstableRethrow.mockReset();
    mockJsonError.mockReset();
    mockJsonSuccess.mockReset();
    mockOmitUndefined.mockReset();
    mockFireAndForget.mockReset();
    mockSendReservationConfirmationEmail.mockReset();
    mockIssueReceiptForReservation.mockReset();
    mockIssueReceiptForEventRegistration.mockReset();

    mockJsonError.mockImplementation(
      (msg, status) => new Response(JSON.stringify({ error: msg }), { status }),
    );
    mockJsonSuccess.mockImplementation(
      (data, status = 200) => new Response(JSON.stringify(data), { status }),
    );
    mockNormalizeError.mockImplementation((e) => {
      if (e instanceof Error) return e;
      return new Error(String(e));
    });
    mockOmitUndefined.mockImplementation((obj) => obj);
    mockUnstableRethrow.mockImplementation(() => {
      // route.ts の内部 catch から呼ばれる。Next.js 内部エラーではないので no-op。
    });
    mockIssueReceiptForReservation.mockImplementation(() =>
      Promise.resolve({ id: "receipt-mock", serialNo: "2026-000001" }),
    );
    mockIssueReceiptForEventRegistration.mockImplementation(() =>
      Promise.resolve({ id: "receipt-event-mock", serialNo: "2026-000002" }),
    );

    mockAssertStripeCredentialsConfigured.mockResolvedValue(DEFAULT_SETTINGS);
    mockSafeDecrypt.mockImplementation((value) => `decrypted-${value}`);
    mockGetStripeClient.mockResolvedValue({
      client: {
        webhooks: { constructEventAsync: mockConstructEvent },
      },
    });
    mockClaimReservationAsPaid.mockResolvedValue({
      ...DEFAULT_RESERVATION,
      icsSequence: 0,
    });
  });

  test("初回配送 (claimed) → handler + processedAt 刻印が実行される", async () => {
    const event = makeCheckoutCompletedEvent("evt_first_delivery");
    mockConstructEvent.mockResolvedValue(event);
    mockClaimStripeEventForProcessing.mockResolvedValueOnce("claimed");
    mockMarkStripeEventProcessed.mockResolvedValueOnce(undefined);

    const response = await POST(makeRequest("body"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      received?: boolean;
      duplicate?: boolean;
    };
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();

    // chokepoint に event.id + type を渡す
    expect(mockClaimStripeEventForProcessing).toHaveBeenCalledWith({
      eventId: "evt_first_delivery",
      eventType: "checkout.session.completed",
    });
    // handler が実行された
    expect(mockClaimReservationAsPaid).toHaveBeenCalledTimes(1);
    // 成功後に processedAt を書込
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith(
      "evt_first_delivery",
    );
  });

  test("既処理 (already_processed) → handler 非実行 / cache invalidate skip / processedAt 非更新 / 200 { duplicate: true }", async () => {
    const event = makeCheckoutCompletedEvent("evt_duplicate_delivery");
    mockConstructEvent.mockResolvedValue(event);
    mockClaimStripeEventForProcessing.mockResolvedValueOnce(
      "already_processed",
    );

    const response = await POST(makeRequest("body"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      received?: boolean;
      duplicate?: boolean;
    };
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);

    expect(mockClaimStripeEventForProcessing).toHaveBeenCalledTimes(1);
    expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });

  test("crash 後再送 (retry_unprocessed) → handler 再実行 / 成功後 processedAt 刻印", async () => {
    const event = makeCheckoutCompletedEvent("evt_retry_unprocessed");
    mockConstructEvent.mockResolvedValue(event);
    mockClaimStripeEventForProcessing.mockResolvedValueOnce(
      "retry_unprocessed",
    );
    mockClaimReservationAsPaid.mockResolvedValueOnce({
      id: "res_1",
      totalPrice: 1000,
      notes: null,
      startTime: "2026-07-01T01:00:00.000Z",
      endTime: "2026-07-01T03:00:00.000Z",
      icsSequence: 1,
      guestEmail: null,
      customer: {
        email: "a@example.com",
        lastName: "Yamada",
        firstName: "Taro",
      },
      space: { name: "Room A", location: { name: "Tokyo" } },
    });
    mockMarkStripeEventProcessed.mockResolvedValue(undefined);

    const response = await POST(makeRequest("body"));
    expect(response.status).toBe(200);
    expect(mockClaimReservationAsPaid).toHaveBeenCalledTimes(1);
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith(
      "evt_retry_unprocessed",
    );
  });

  test("署名検証失敗 → chokepoint より前で 400 で終了 (dedup table 汚染防止)", async () => {
    mockConstructEvent.mockRejectedValue(new Error("Invalid signature"));

    const response = await POST(makeRequest("body"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain("Invalid signature");

    // chokepoint は呼ばれない (偽造リクエストで dedup table を汚染しない)
    expect(mockClaimStripeEventForProcessing).not.toHaveBeenCalled();
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });

  test("異なる event.id は独立 (event ごとに claim が呼ばれる)", async () => {
    const eventA = makeCheckoutCompletedEvent("evt_id_A");
    const eventB = makeCheckoutCompletedEvent("evt_id_B");
    mockClaimStripeEventForProcessing.mockResolvedValue("claimed");
    mockMarkStripeEventProcessed.mockResolvedValue(undefined);

    mockConstructEvent.mockResolvedValueOnce(eventA);
    const responseA = await POST(makeRequest("body"));
    expect(responseA.status).toBe(200);

    mockConstructEvent.mockResolvedValueOnce(eventB);
    const responseB = await POST(makeRequest("body"));
    expect(responseB.status).toBe(200);

    // 各 event に対応した eventId で chokepoint が呼ばれる
    expect(mockClaimStripeEventForProcessing).toHaveBeenNthCalledWith(1, {
      eventId: "evt_id_A",
      eventType: "checkout.session.completed",
    });
    expect(mockClaimStripeEventForProcessing).toHaveBeenNthCalledWith(2, {
      eventId: "evt_id_B",
      eventType: "checkout.session.completed",
    });
    expect(mockMarkStripeEventProcessed).toHaveBeenNthCalledWith(1, "evt_id_A");
    expect(mockMarkStripeEventProcessed).toHaveBeenNthCalledWith(2, "evt_id_B");
  });

  test("handler が throw → 500 で return し processedAt を刻印しない (crash-recovery で null 保持)", async () => {
    const event = makeCheckoutCompletedEvent("evt_crash");
    mockConstructEvent.mockResolvedValue(event);
    mockClaimStripeEventForProcessing.mockResolvedValueOnce("claimed");
    // handler が DB 例外を投げる
    mockClaimReservationAsPaid.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    const response = await POST(makeRequest("body"));
    expect(response.status).toBe(500);

    // chokepoint は claim 済み (行は残る = processedAt: null で crash-recovery marker)
    expect(mockClaimStripeEventForProcessing).toHaveBeenCalledTimes(1);
    // handler は throw で終了しているので processedAt は書き込まれない
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });
});
