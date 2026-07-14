import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  expectErrorResult,
  expectReceivedResult,
} from "../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// 1. モック関数定義（import より前に必須）
// =============================================================================

// Settings / Crypto
const mockGetStripeSettings = mock<
  () => Promise<{
    stripeEnabled: boolean;
    stripeSecretKey: string | null;
    stripeWebhookSecret: string | null;
  } | null>
>();
const mockSafeDecrypt = mock<(value: string) => string | null>();

// Stripe Client — route が読む webhook event の最小 contract に固定する。
type StripeWebhookEvent = {
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

// Reservation 側（route.ts が import するため mock 必須。このファイルのテストは
// event-registration 経路が主眼だが、reservation 分岐が「触られていない」ことを
// 示す 1 ケースのみ含める）
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
const mockSavePaymentIntentId =
  mock<(id: string, piId: string) => Promise<void>>();
const mockClaimReservationAsFailed =
  mock<(id: string, sessionId: string) => Promise<boolean>>();
const mockFindReservationByPaymentIntent =
  mock<
    (piId: string) => Promise<{ id: string; paymentStatus: string } | null>
  >();
const mockClaimReservationAsRefunded = mock<(id: string) => Promise<boolean>>();
const mockSendReservationConfirmationEmail =
  mock<(data: unknown) => Promise<void>>();

// Event-registration 側（Task 9 が新規配線する経路）
const mockConfirmWaitlistOfferCommand = mock<
  (args: { registrationId: string; now: Date }) => Promise<{
    registration: { id: string; status: "CONFIRMED" | "EXPIRED" };
  }>
>();
const mockClaimEventRegistrationAsPaid =
  mock<
    (
      id: string,
      data: { stripePaymentIntentId: string | null },
    ) => Promise<boolean>
  >();
const mockClaimEventRegistrationAsFailed =
  mock<(id: string, sessionId: string) => Promise<boolean>>();
const mockSaveEventRegistrationPaymentIntentId =
  mock<(id: string, paymentIntentId: string) => Promise<void>>();
const mockGetWaitlistConfirmationEmailDetails = mock<
  (id: string) => Promise<{
    id: string;
    name: string;
    email: string | null;
    customerId: string | null;
    quantity: number;
    icsSequence: number;
    eventTitle: string;
    startTime: Date;
    endTime: Date;
    location: string | null;
  } | null>
>();
const mockSendEventRegistrationConfirmation =
  mock<(data: unknown) => Promise<unknown>>();

// Site-wide cache invalidation (Route Handler variant)
const mockInvalidateSiteWideCacheFromRouteHandler =
  mock<(tags: readonly string[], options?: unknown) => void>();

// Next.js navigation
const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

// async-utils — fireAndForget は渡された promise をそのまま握り潰さず、テストから
// 完了を observe できるよう Promise を保持しておく（await 用）。
let lastFireAndForgetPromise: Promise<unknown> | null = null;
const mockFireAndForget = mock<
  (promise: Promise<unknown>, opts?: unknown) => void
>((promise) => {
  lastFireAndForgetPromise = promise;
});

// Errors
const mockLogError = mock<(error: unknown, opts?: unknown) => void>();
const mockNormalizeError = mock<(error: unknown) => Error>((e) => {
  if (e instanceof Error) return e;
  return new Error(String(e));
});

// Route Responses
const mockJsonError = mock<(msg: string, status: number) => Response>(
  (msg, status) => new Response(JSON.stringify({ error: msg }), { status }),
);
const mockJsonSuccess = mock<(data: unknown, status?: number) => Response>(
  (data, status = 200) => new Response(JSON.stringify(data), { status }),
);

// Serialize
const mockOmitUndefined = mock<
  (obj: Record<string, unknown>) => Record<string, unknown>
>((obj) => obj);

// =============================================================================
// 2. mock.module() — import より前に宣言
// =============================================================================

mock.module("@/shared/domain/settings/queries/integration", () => ({
  getStripeSettings: () => mockGetStripeSettings(),
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
  savePaymentIntentId: (id: string, piId: string) =>
    mockSavePaymentIntentId(id, piId),
  claimReservationAsFailed: (id: string, sessionId: string) =>
    mockClaimReservationAsFailed(id, sessionId),
  findReservationByPaymentIntent: (piId: string) =>
    mockFindReservationByPaymentIntent(piId),
  claimReservationAsRefunded: (id: string) =>
    mockClaimReservationAsRefunded(id),
}));

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationConfirmationEmail: (data: unknown) =>
    mockSendReservationConfirmationEmail(data),
  sendReservationCancelledEmail: mock(() => Promise.resolve()),
  sendReservationStatusChangedEmail: mock(() => Promise.resolve()),
  sendReservationAdminNotification: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/events/waitlist-commands", () => ({
  confirmWaitlistOfferCommand: (args: { registrationId: string; now: Date }) =>
    mockConfirmWaitlistOfferCommand(args),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  claimEventRegistrationAsPaid: (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => mockClaimEventRegistrationAsPaid(id, data),
  claimEventRegistrationAsFailed: (id: string, sessionId: string) =>
    mockClaimEventRegistrationAsFailed(id, sessionId),
  saveEventRegistrationPaymentIntentId: (id: string, paymentIntentId: string) =>
    mockSaveEventRegistrationPaymentIntentId(id, paymentIntentId),
}));

mock.module("@/shared/domain/events/waitlist-queries", () => ({
  getWaitlistConfirmationEmailDetails: (id: string) =>
    mockGetWaitlistConfirmationEmailDetails(id),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationConfirmation: (data: unknown) =>
    mockSendEventRegistrationConfirmation(data),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (
    tags: readonly string[],
    options?: unknown,
  ) => mockInvalidateSiteWideCacheFromRouteHandler(tags, options),
}));

mock.module("next/navigation", () => ({
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
  getRouteErrorStatus: (message: string) => {
    if (message.includes("ログイン")) return 401;
    if (message.includes("権限") || message.includes("アクセス権")) return 403;
    return 400;
  },
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
// 3. テスト対象を import
// =============================================================================

const { POST } = await import("@/app/api/webhooks/stripe/route");

// =============================================================================
// テストヘルパー
// =============================================================================

const DEFAULT_SETTINGS = {
  stripeEnabled: true,
  stripeSecretKey: "enc-secret-key",
  stripeWebhookSecret: "enc-webhook-secret",
};

const DEFAULT_WAITLIST_DETAILS = {
  id: "reg-waitlist-1",
  name: "田中太郎",
  email: "waitlist@example.com",
  customerId: null,
  quantity: 1,
  icsSequence: 0,
  eventTitle: "テストイベント",
  startTime: new Date("2026-08-01T10:00:00.000Z"),
  endTime: new Date("2026-08-01T12:00:00.000Z"),
  location: "東京会場",
};

function makeSessionCompletedEvent(
  metadata: Record<string, string>,
  paymentStatus: "paid" | "unpaid" = "paid",
  paymentIntent: string | null = "pi-123",
  sessionId = "cs_test_123",
): StripeWebhookEvent {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        payment_status: paymentStatus,
        payment_intent: paymentIntent,
        metadata,
      },
    },
  };
}

function makeSessionExpiredEvent(
  metadata: Record<string, string>,
  sessionId = "cs_test_expired",
): StripeWebhookEvent {
  return {
    type: "checkout.session.expired",
    data: {
      object: {
        id: sessionId,
        payment_status: "unpaid",
        payment_intent: null,
        metadata,
      },
    },
  };
}

function makeAsyncPaymentFailedEvent(
  metadata: Record<string, string>,
  sessionId = "cs_test_async_failed",
): StripeWebhookEvent {
  return {
    type: "checkout.session.async_payment_failed",
    data: {
      object: {
        id: sessionId,
        payment_status: "unpaid",
        payment_intent: null,
        metadata,
      },
    },
  };
}

function makeAsyncPaymentSucceededEvent(
  metadata: Record<string, string>,
  paymentIntent: string | null = "pi-async-succeeded-1",
  sessionId = "cs_test_async_succeeded",
): StripeWebhookEvent {
  return {
    type: "checkout.session.async_payment_succeeded",
    data: {
      object: {
        id: sessionId,
        payment_status: "paid",
        payment_intent: paymentIntent,
        metadata,
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

/** fireAndForget に渡された promise の完了を待つ（実送信は同期呼出のため通常は不要だが、念のため）。 */
async function flushFireAndForget(): Promise<void> {
  if (lastFireAndForgetPromise) {
    await lastFireAndForgetPromise.catch(() => undefined);
  }
}

// =============================================================================
// 4. テスト
// =============================================================================

describe("POST /api/webhooks/stripe — event-registration routing (Task 9)", () => {
  beforeEach(() => {
    mockGetStripeSettings.mockReset();
    mockSafeDecrypt.mockReset();
    mockGetStripeClient.mockReset();
    mockConstructEvent.mockReset();
    mockClaimReservationAsPaid.mockReset();
    mockSavePaymentIntentId.mockReset();
    mockClaimReservationAsFailed.mockReset();
    mockFindReservationByPaymentIntent.mockReset();
    mockClaimReservationAsRefunded.mockReset();
    mockSendReservationConfirmationEmail.mockReset();
    mockConfirmWaitlistOfferCommand.mockReset();
    mockClaimEventRegistrationAsPaid.mockReset();
    mockClaimEventRegistrationAsFailed.mockReset();
    mockSaveEventRegistrationPaymentIntentId.mockReset();
    mockGetWaitlistConfirmationEmailDetails.mockReset();
    mockSendEventRegistrationConfirmation.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockFireAndForget.mockReset();
    mockLogError.mockReset();
    mockNormalizeError.mockReset();
    mockJsonError.mockReset();
    mockJsonSuccess.mockReset();
    mockOmitUndefined.mockReset();
    lastFireAndForgetPromise = null;

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
    mockFireAndForget.mockImplementation((promise) => {
      lastFireAndForgetPromise = promise;
    });
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });

    mockGetStripeSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSafeDecrypt.mockImplementation((value) => `decrypted-${value}`);
    mockGetStripeClient.mockResolvedValue({
      client: {
        webhooks: { constructEventAsync: mockConstructEvent },
      },
    });

    // Reservation 側デフォルト（このファイルでは主に「触られていない」ことの確認用）
    mockClaimReservationAsPaid.mockResolvedValue(null);
    mockSavePaymentIntentId.mockResolvedValue(undefined);
    mockClaimReservationAsFailed.mockResolvedValue(false);
    mockFindReservationByPaymentIntent.mockResolvedValue(null);
    mockClaimReservationAsRefunded.mockResolvedValue(false);

    // Event-registration 側デフォルト
    mockConfirmWaitlistOfferCommand.mockResolvedValue({
      registration: { id: "reg-1", status: "CONFIRMED" },
    });
    mockClaimEventRegistrationAsPaid.mockResolvedValue(true);
    mockClaimEventRegistrationAsFailed.mockResolvedValue(true);
    mockSaveEventRegistrationPaymentIntentId.mockResolvedValue(undefined);
    mockGetWaitlistConfirmationEmailDetails.mockResolvedValue(
      DEFAULT_WAITLIST_DETAILS,
    );
    mockSendEventRegistrationConfirmation.mockResolvedValue({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // extractPaymentSubject（route.ts 非 export のため POST 経由で間接検証）
  // ---------------------------------------------------------------------------

  describe("決済対象の判別（extractPaymentSubject）", () => {
    test("reservation: metadata.reservationId のみ → reservation として処理される", async () => {
      const event = makeSessionCompletedEvent({ reservationId: "res-1" });
      mockConstructEvent.mockResolvedValue(event);
      mockClaimReservationAsPaid.mockResolvedValueOnce({
        id: "res-1",
        totalPrice: 5000,
        notes: null,
        startTime: "2025-01-01T10:00:00.000Z",
        endTime: "2025-01-01T12:00:00.000Z",
        icsSequence: 0,
        customer: {
          email: "a@example.com",
          lastName: "田中",
          firstName: "太郎",
        },
        space: { name: "スペース", location: null },
      });

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimReservationAsPaid).toHaveBeenCalledWith("res-1", {
        stripePaymentIntentId: "pi-123",
      });
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
    });

    test("event-registration: metadata.type=event-registration + registrationId → event-registration として処理される", async () => {
      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-1",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimEventRegistrationAsPaid).toHaveBeenCalledWith("reg-1", {
        stripePaymentIntentId: "pi-123",
      });
      expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
    });

    test("不正/欠損 metadata → null（claim 系は一切呼ばれず 200 を返す）", async () => {
      const event = makeSessionCompletedEvent({});
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // checkout.session.completed — 直接購入 (source なし) vs waitlist offer
  // ---------------------------------------------------------------------------

  describe("checkout.session.completed — event-registration", () => {
    test("直接購入（source なし）→ confirmWaitlistOfferCommand は呼ばれず claimEventRegistrationAsPaid のみ", async () => {
      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-direct",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
      expect(mockClaimEventRegistrationAsPaid).toHaveBeenCalledWith(
        "reg-direct",
        { stripePaymentIntentId: "pi-123" },
      );
      // mock.module のラッパーが options を明示的に(undefined でも)前段する契約のため
      // 第2引数まで含めて assert する（呼び出し元は 1 引数のみ渡す）。
      expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith(
        ["events", "event-waitlist"],
        undefined,
      );
      // 直接購入は登録時点で確認メール送信済みのため、ここでは送らない
      await flushFireAndForget();
      expect(mockGetWaitlistConfirmationEmailDetails).not.toHaveBeenCalled();
      expect(mockSendEventRegistrationConfirmation).not.toHaveBeenCalled();
    });

    test("waitlist offer（source=waitlist-offer）→ confirmWaitlistOfferCommand が claimEventRegistrationAsPaid より先に呼ばれる（CALL ORDER）", async () => {
      const callOrder: string[] = [];
      mockConfirmWaitlistOfferCommand.mockImplementation(async (args) => {
        callOrder.push("confirm");
        return {
          registration: { id: args.registrationId, status: "CONFIRMED" },
        };
      });
      mockClaimEventRegistrationAsPaid.mockImplementation(async () => {
        callOrder.push("claimPaid");
        return true;
      });

      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-waitlist-1",
        source: "waitlist-offer",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      // 呼出順序そのものを assert する（両方呼ばれた、だけでは不十分）
      expect(callOrder).toEqual(["confirm", "claimPaid"]);
      expect(mockConfirmWaitlistOfferCommand).toHaveBeenCalledWith({
        registrationId: "reg-waitlist-1",
        now: expect.any(Date),
      });
      expect(mockClaimEventRegistrationAsPaid).toHaveBeenCalledWith(
        "reg-waitlist-1",
        { stripePaymentIntentId: "pi-123" },
      );

      // waitlist offer の CONFIRMED 確定は初めての確定通知なのでメールを送る
      await flushFireAndForget();
      expect(mockGetWaitlistConfirmationEmailDetails).toHaveBeenCalledWith(
        "reg-waitlist-1",
      );
      expect(mockSendEventRegistrationConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: "reg-waitlist-1",
          customerEmail: "waitlist@example.com",
        }),
      );
    });

    test("容量race: confirmWaitlistOfferCommand が EXPIRED を返す → claimEventRegistrationAsPaid は呼ばれず CRITICAL ログのみ", async () => {
      mockConfirmWaitlistOfferCommand.mockResolvedValueOnce({
        registration: { id: "reg-race", status: "EXPIRED" },
      });

      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-race",
        source: "waitlist-offer",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(
        mockInvalidateSiteWideCacheFromRouteHandler,
      ).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ severity: "CRITICAL" }),
      );
      // 会計上の虚偽表示になるため FAILED にもしない
      expect(mockClaimEventRegistrationAsFailed).not.toHaveBeenCalled();
    });

    test("冪等性: confirmWaitlistOfferCommand が DomainError(NOT_FOUND) を投げる（再送 webhook）→ 500 にせず skip", async () => {
      mockConfirmWaitlistOfferCommand.mockRejectedValueOnce(
        new DomainError("対象の繰り上げ当選申込が見つかりません", "NOT_FOUND"),
      );

      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-redelivered",
        source: "waitlist-offer",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(DomainError),
        expect.objectContaining({ severity: "LOW" }),
      );
    });

    test("想定外の例外（DomainError 以外）は再送させるため 500", async () => {
      mockConfirmWaitlistOfferCommand.mockRejectedValueOnce(
        new Error("DB connection lost"),
      );
      mockUnstableRethrow.mockImplementation(() => undefined);

      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-crash",
        source: "waitlist-offer",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectErrorResult(body);

      expect(response.status).toBe(500);
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
    });

    test("べき等性: 既に PAID（claimEventRegistrationAsPaid が false）→ cache invalidate / メールをスキップ", async () => {
      mockClaimEventRegistrationAsPaid.mockResolvedValueOnce(false);

      const event = makeSessionCompletedEvent({
        type: "event-registration",
        registrationId: "reg-waitlist-1",
        source: "waitlist-offer",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(mockClaimEventRegistrationAsPaid).toHaveBeenCalledTimes(1);
      expect(
        mockInvalidateSiteWideCacheFromRouteHandler,
      ).not.toHaveBeenCalled();
      await flushFireAndForget();
      expect(mockSendEventRegistrationConfirmation).not.toHaveBeenCalled();
    });

    test("非同期決済 (payment_status !== paid) → PaymentIntent ID のみ保存、confirm/claim は呼ばれない", async () => {
      const event = makeSessionCompletedEvent(
        {
          type: "event-registration",
          registrationId: "reg-async",
          source: "waitlist-offer",
        },
        "unpaid",
        "pi-async-1",
      );
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(mockSaveEventRegistrationPaymentIntentId).toHaveBeenCalledWith(
        "reg-async",
        "pi-async-1",
      );
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith(
        ["events", "event-waitlist"],
        undefined,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // checkout.session.expired / async_payment_failed — WAITLISTED_OFFERED status
  // には触れず paymentStatus のみ FAILED に claim する
  // ---------------------------------------------------------------------------

  describe("checkout.session.expired — event-registration", () => {
    test("claimEventRegistrationAsFailed を (registrationId, sessionId) で呼ぶ。waitlist status には触れない", async () => {
      const event = makeSessionExpiredEvent(
        { type: "event-registration", registrationId: "reg-exp-1" },
        "cs_test_expired_1",
      );
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimEventRegistrationAsFailed).toHaveBeenCalledWith(
        "reg-exp-1",
        "cs_test_expired_1",
      );
      // status 遷移（WAITLISTED_OFFERED → *）を行う唯一の関数が呼ばれていないことで
      // 「waitlist status に触れていない」ことを担保する。
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
      expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith(
        ["events", "event-waitlist"],
        undefined,
      );
    });

    test("べき等性: 既に PAID/REFUNDED/FAILED（claim が false）→ cache invalidate スキップ", async () => {
      mockClaimEventRegistrationAsFailed.mockResolvedValueOnce(false);
      const event = makeSessionExpiredEvent({
        type: "event-registration",
        registrationId: "reg-exp-2",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);
      expect(mockClaimEventRegistrationAsFailed).toHaveBeenCalledTimes(1);
      expect(
        mockInvalidateSiteWideCacheFromRouteHandler,
      ).not.toHaveBeenCalled();
    });

    test("reservation 分岐は既存どおり byte-identical（claimReservationAsFailed が呼ばれる）", async () => {
      const event = makeSessionExpiredEvent(
        { reservationId: "res-exp-1" },
        "cs_test_res_expired",
      );
      mockConstructEvent.mockResolvedValue(event);
      mockClaimReservationAsFailed.mockResolvedValueOnce(true);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);
      expect(mockClaimReservationAsFailed).toHaveBeenCalledWith(
        "res-exp-1",
        "cs_test_res_expired",
      );
      expect(mockClaimEventRegistrationAsFailed).not.toHaveBeenCalled();
    });
  });

  describe("checkout.session.async_payment_failed — event-registration", () => {
    test("claimEventRegistrationAsFailed を (registrationId, sessionId) で呼ぶ", async () => {
      const event = makeAsyncPaymentFailedEvent(
        { type: "event-registration", registrationId: "reg-async-fail-1" },
        "cs_test_async_fail_1",
      );
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);
      expect(mockClaimEventRegistrationAsFailed).toHaveBeenCalledWith(
        "reg-async-fail-1",
        "cs_test_async_fail_1",
      );
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // checkout.session.async_payment_succeeded — Fix commit (レビュー Important #2):
  // 非同期決済 (konbini / bank transfer) の event-registration 配線
  // ---------------------------------------------------------------------------

  describe("checkout.session.async_payment_succeeded — event-registration", () => {
    test("reservation: 既存どおり claimReservationAsPaid が呼ばれる（byte-identical 回帰確認）", async () => {
      const event = makeAsyncPaymentSucceededEvent(
        { reservationId: "res-async-1" },
        "pi-res-async-1",
      );
      mockConstructEvent.mockResolvedValue(event);
      mockClaimReservationAsPaid.mockResolvedValueOnce({
        id: "res-async-1",
        totalPrice: 3000,
        notes: null,
        startTime: "2025-02-01T10:00:00.000Z",
        endTime: "2025-02-01T12:00:00.000Z",
        icsSequence: 0,
        customer: {
          email: "b@example.com",
          lastName: "佐藤",
          firstName: "花子",
        },
        space: { name: "スペースB", location: null },
      });

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimReservationAsPaid).toHaveBeenCalledWith("res-async-1", {
        stripePaymentIntentId: "pi-res-async-1",
      });
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
    });

    test("直接購入（source なし）→ confirmWaitlistOfferCommand は呼ばれず claimEventRegistrationAsPaid のみ", async () => {
      const event = makeAsyncPaymentSucceededEvent({
        type: "event-registration",
        registrationId: "reg-async-direct",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
      expect(mockClaimEventRegistrationAsPaid).toHaveBeenCalledWith(
        "reg-async-direct",
        { stripePaymentIntentId: "pi-async-succeeded-1" },
      );
      expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
      expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith(
        ["events", "event-waitlist"],
        undefined,
      );
    });

    test("waitlist offer（source=waitlist-offer）→ confirmWaitlistOfferCommand が claimEventRegistrationAsPaid より先に呼ばれる（CALL ORDER）", async () => {
      const callOrder: string[] = [];
      mockConfirmWaitlistOfferCommand.mockImplementation(async (args) => {
        callOrder.push("confirm");
        return {
          registration: { id: args.registrationId, status: "CONFIRMED" },
        };
      });
      mockClaimEventRegistrationAsPaid.mockImplementation(async () => {
        callOrder.push("claimPaid");
        return true;
      });

      const event = makeAsyncPaymentSucceededEvent(
        {
          type: "event-registration",
          registrationId: "reg-waitlist-1",
          source: "waitlist-offer",
        },
        "pi-async-succeeded-waitlist",
        "cs_test_async_succeeded_waitlist",
      );
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(callOrder).toEqual(["confirm", "claimPaid"]);
      expect(mockConfirmWaitlistOfferCommand).toHaveBeenCalledWith({
        registrationId: "reg-waitlist-1",
        now: expect.any(Date),
      });
      expect(mockClaimEventRegistrationAsPaid).toHaveBeenCalledWith(
        "reg-waitlist-1",
        { stripePaymentIntentId: "pi-async-succeeded-waitlist" },
      );

      // waitlist offer の CONFIRMED 確定は初めての確定通知なのでメールを送る
      await flushFireAndForget();
      expect(mockGetWaitlistConfirmationEmailDetails).toHaveBeenCalledWith(
        "reg-waitlist-1",
      );
      expect(mockSendEventRegistrationConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: "reg-waitlist-1",
          customerEmail: "waitlist@example.com",
        }),
      );
    });

    test("容量race: confirmWaitlistOfferCommand が EXPIRED を返す → claimEventRegistrationAsPaid は呼ばれず CRITICAL ログのみ", async () => {
      mockConfirmWaitlistOfferCommand.mockResolvedValueOnce({
        registration: { id: "reg-race-async", status: "EXPIRED" },
      });

      const event = makeAsyncPaymentSucceededEvent({
        type: "event-registration",
        registrationId: "reg-race-async",
        source: "waitlist-offer",
      });
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      expect(response.status).toBe(200);

      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(
        mockInvalidateSiteWideCacheFromRouteHandler,
      ).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ severity: "CRITICAL" }),
      );
      expect(mockClaimEventRegistrationAsFailed).not.toHaveBeenCalled();
    });

    test("不正/欠損 metadata → null（claim 系は一切呼ばれず 200 を返す）", async () => {
      const event = makeAsyncPaymentSucceededEvent({});
      mockConstructEvent.mockResolvedValue(event);

      const response = await POST(makeRequest("body"));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
      expect(mockClaimEventRegistrationAsPaid).not.toHaveBeenCalled();
      expect(mockConfirmWaitlistOfferCommand).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalled();
    });
  });
});
