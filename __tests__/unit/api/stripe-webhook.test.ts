import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  expectErrorResult,
  expectReceivedResult,
} from "../../helpers/type-assertions";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";

// `import Stripe from "stripe"` の default export は class & namespace の
// 合成（公式 UMD パターン）。`Stripe.Event` で discriminated union 型に
// 直接アクセスできるため別途 type import は不要。

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
// Bun runtime は SubtleCryptoProvider (async-only) を選択するため
// route handler は `await constructEventAsync` を使用する。mock 型も Promise 化。
type StripeWebhookEvent = {
  type: Stripe.Event.Type;
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

// Payment Queries (atomic claim API)
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
const mockClaimReservationAsFailed = mock<(id: string) => Promise<boolean>>();
const mockFindReservationByPaymentIntent =
  mock<
    (piId: string) => Promise<{ id: string; paymentStatus: string } | null>
  >();
const mockClaimReservationAsRefunded = mock<(id: string) => Promise<boolean>>();

// Site-wide cache invalidation (Route Handler variant)
// route.ts の invalidateReservationCache() は
// invalidateSiteWideCacheFromRouteHandler() を単一呼び出しで [3 tags] を渡す。
// テスト境界は「Route Handler がキャッシュ無効化ヘルパーを正しい tag セットで
// 呼んだか」で、Next.js の updateTag / revalidateTag / firePurgeAsync / CDN purge
// といった実装詳細に依存すべきではない (Codex review 対応・PR #945)。
const mockInvalidateSiteWideCacheFromRouteHandler =
  mock<(tags: readonly string[], options?: unknown) => void>();

// Next.js navigation
const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  // 実際のNext.jsと同様にNext.js内部エラーを再スローする
  // テストではNext.js内部エラーは投げられないので基本的に何もしない
  throw error;
});

// async-utils
const mockFireAndForget =
  mock<(promise: Promise<unknown>, opts?: unknown) => void>();

// Email
const mockSendReservationConfirmationEmail =
  mock<(data: unknown) => Promise<void>>();

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

// 実際の crypto モジュールを re-export し、safeDecrypt のみオーバーライド
// （不完全なモックは他テストファイルの crypto テストを壊す — Bun 既知制限）
const actualCrypto = await import("@/shared/lib/crypto");
mock.module("@/shared/lib/crypto", () => ({
  ...actualCrypto,
  safeDecrypt: (value: string) => mockSafeDecrypt(value),
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
  claimReservationAsFailed: (id: string) => mockClaimReservationAsFailed(id),
  findReservationByPaymentIntent: (piId: string) =>
    mockFindReservationByPaymentIntent(piId),
  claimReservationAsRefunded: (id: string) =>
    mockClaimReservationAsRefunded(id),
}));

// 境界 mock: route.ts が使う唯一の cache-invalidation entry point を差し替える。
// これで next/cache (updateTag / revalidateTag)・firePurgeAsync・fireAndForget・
// CDN tag purge の全下位実装が touch されない。CI/local の next/cache export 差
// (updateTag の有無) にも耐性がある。
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

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationConfirmationEmail: (data: unknown) =>
    mockSendReservationConfirmationEmail(data),
  sendReservationCancelledEmail: mock(() => Promise.resolve()),
  sendReservationStatusChangedEmail: mock(() => Promise.resolve()),
  sendReservationAdminNotification: mock(() => Promise.resolve()),
}));

const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: (error: unknown, opts?: unknown) => mockLogError(error, opts),
  normalizeError: (error: unknown) => mockNormalizeError(error),
}));

// @/shared/lib/constants はモック不要（純粋な定数ファイル、副作用なし）

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

// 実際の serialize を re-export し、omitUndefined のみオーバーライド
const actualSerialize = await import("@/shared/lib/serialize");
mock.module("@/shared/lib/serialize", () => ({
  ...actualSerialize,
  omitUndefined: (obj: Record<string, unknown>) => mockOmitUndefined(obj),
}));

// 実際のPrisma enumsを使用（ハードコード enum はモック汚染で他テストを壊す）
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

const DEFAULT_RESERVATION = {
  id: "res-123",
  totalPrice: 5000,
  notes: null,
  startTime: "2025-01-01T10:00:00.000Z",
  endTime: "2025-01-01T12:00:00.000Z",
  guestEmail: null,
  customer: {
    email: "test@example.com",
    lastName: "田中",
    firstName: "太郎",
  },
  space: {
    name: "テストスペース",
    location: { name: "東京" },
  },
};

/** Stripe セッション完了イベントを作成するヘルパー */
function makeSessionCompletedEvent(
  paymentStatus: "paid" | "unpaid" = "paid",
  paymentIntent: string | null = "pi-123",
): StripeWebhookEvent {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        payment_status: paymentStatus,
        payment_intent: paymentIntent,
        metadata: { reservationId: "res-123" },
      },
    },
  };
}

/** charge.refunded イベントを作成するヘルパー */
function makeChargeRefundedEvent(
  paymentIntent: string | null = "pi-123",
): StripeWebhookEvent {
  return {
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_test_123",
        payment_intent: paymentIntent,
      },
    },
  };
}

/** stripe-signature ヘッダー付きリクエストを作成するヘルパー */
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
// 4. テスト
// =============================================================================

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    // モックをリセット
    mockGetStripeSettings.mockReset();
    mockSafeDecrypt.mockReset();
    mockGetStripeClient.mockReset();
    mockConstructEvent.mockReset();
    mockClaimReservationAsPaid.mockReset();
    mockSavePaymentIntentId.mockReset();
    mockClaimReservationAsFailed.mockReset();
    mockFindReservationByPaymentIntent.mockReset();
    mockClaimReservationAsRefunded.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockFireAndForget.mockReset();
    mockSendReservationConfirmationEmail.mockReset();
    mockLogError.mockReset();
    mockNormalizeError.mockReset();
    mockJsonError.mockReset();
    mockJsonSuccess.mockReset();
    mockOmitUndefined.mockReset();

    // デフォルト実装を再設定
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
    mockFireAndForget.mockImplementation(() => undefined);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });

    // デフォルトの正常系設定
    mockGetStripeSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSafeDecrypt.mockImplementation((value) => `decrypted-${value}`);
    mockGetStripeClient.mockResolvedValue({
      client: {
        webhooks: {
          constructEventAsync: mockConstructEvent,
        },
      },
    });
    mockClaimReservationAsPaid.mockResolvedValue({
      ...DEFAULT_RESERVATION,
      icsSequence: 0,
    });
    mockSavePaymentIntentId.mockResolvedValue(undefined);
    mockClaimReservationAsFailed.mockResolvedValue(true);
    mockClaimReservationAsRefunded.mockResolvedValue(true);
    mockFindReservationByPaymentIntent.mockResolvedValue(null);
  });

  // ---------------------------------------------------------------------------
  // 署名エラー
  // ---------------------------------------------------------------------------

  test("stripe-signature ヘッダーがない → 400", async () => {
    const request = makeRequest("body", null);

    const response = await POST(request);
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(400);
    expect(body.error).toContain("stripe-signature");
    // constructEvent は呼ばれない（signature ガードで先に返る）
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  test("署名検証失敗（constructEventAsync rejection）→ 400", async () => {
    mockConstructEvent.mockRejectedValue(new Error("Invalid signature"));

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid signature");
    expect(mockLogError).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Stripe 未設定
  // ---------------------------------------------------------------------------

  test("Stripe が無効（stripeEnabled=false）→ 503", async () => {
    mockGetStripeSettings.mockResolvedValue({
      stripeEnabled: false,
      stripeSecretKey: "enc-key",
      stripeWebhookSecret: "enc-secret",
    });

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  test("Stripe 設定が null → 503", async () => {
    mockGetStripeSettings.mockResolvedValue(null);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  test("webhookSecret の復号が null を返す → 503", async () => {
    mockSafeDecrypt.mockImplementation((value) => {
      // stripeWebhookSecret の復号だけ失敗させる
      if (value === "enc-webhook-secret") return null;
      return `decrypted-${value}`;
    });

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  test("Stripe クライアントが null → 503", async () => {
    mockGetStripeClient.mockResolvedValue({ client: null });

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  // ---------------------------------------------------------------------------
  // checkout.session.completed — 即時決済（paid）
  // ---------------------------------------------------------------------------

  test("checkout.session.completed (paid) → fulfill + キャッシュ無効化", async () => {
    const event = makeSessionCompletedEvent("paid", "pi-123");
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // fulfill が呼ばれた
    expect(mockClaimReservationAsPaid).toHaveBeenCalledWith("res-123", {
      stripePaymentIntentId: "pi-123",
    });

    // キャッシュ無効化 (3点セット)
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );

    // メール送信が fireAndForget で呼ばれた
    expect(mockFireAndForget).toHaveBeenCalled();
  });

  test("checkout.session.completed (paid) は予約時メールを確認メールに使う", async () => {
    const event = makeSessionCompletedEvent("paid", "pi-123");
    mockConstructEvent.mockResolvedValue(event);
    mockClaimReservationAsPaid.mockResolvedValueOnce({
      ...DEFAULT_RESERVATION,
      guestEmail: "booked-address@example.com",
      customer: {
        ...DEFAULT_RESERVATION.customer,
        email: "current-customer@example.com",
      },
      icsSequence: 0,
    });

    const response = await POST(makeRequest("body"));

    expect(response.status).toBe(200);
    expect(mockSendReservationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "booked-address@example.com",
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // checkout.session.completed — 非同期決済（unpaid）
  // ---------------------------------------------------------------------------

  test("checkout.session.completed (unpaid) → PI ID のみ保存", async () => {
    const event = makeSessionCompletedEvent("unpaid", "pi-456");
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // PI IDのみ保存
    expect(mockSavePaymentIntentId).toHaveBeenCalledWith("res-123", "pi-456");

    // fulfill は呼ばれない
    expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();

    // キャッシュ無効化は実行される
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );

    // メールは送信されない
    expect(mockFireAndForget).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // べき等性: 既に PAID
  // ---------------------------------------------------------------------------

  test("べき等性: checkout.session.completed で既に PAID（atomic claim が null）→ メール / cache invalidate スキップ", async () => {
    // atomic claim: 既に PAID なら updateMany.count === 0 で null を返す
    mockClaimReservationAsPaid.mockResolvedValueOnce(null);

    const event = makeSessionCompletedEvent("paid", "pi-123");
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // claim 自体は呼ばれるが、null 戻り値で副作用がスキップされる
    expect(mockClaimReservationAsPaid).toHaveBeenCalledTimes(1);
    expect(mockFireAndForget).not.toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // checkout.session.async_payment_succeeded
  // ---------------------------------------------------------------------------

  test("checkout.session.async_payment_succeeded → fulfill", async () => {
    const event: StripeWebhookEvent = {
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_test_456",
          payment_status: "paid",
          payment_intent: "pi-789",
          metadata: { reservationId: "res-456" },
        },
      },
    };
    mockConstructEvent.mockResolvedValue(event);
    mockClaimReservationAsPaid.mockResolvedValueOnce({
      ...DEFAULT_RESERVATION,
      id: "res-456",
      icsSequence: 0,
    });

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockClaimReservationAsPaid).toHaveBeenCalledWith("res-456", {
      stripePaymentIntentId: "pi-789",
    });
    expect(mockFireAndForget).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // checkout.session.async_payment_failed
  // ---------------------------------------------------------------------------

  test("checkout.session.async_payment_failed → FAILED", async () => {
    const event: StripeWebhookEvent = {
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: "cs_test_789",
          payment_status: "unpaid",
          payment_intent: null,
          metadata: { reservationId: "res-789" },
        },
      },
    };
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockClaimReservationAsFailed).toHaveBeenCalledWith("res-789");
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
  });

  // ---------------------------------------------------------------------------
  // checkout.session.expired
  // ---------------------------------------------------------------------------

  test("checkout.session.expired → FAILED", async () => {
    const event: StripeWebhookEvent = {
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_test_expired",
          payment_status: "unpaid",
          payment_intent: null,
          metadata: { reservationId: "res-exp" },
        },
      },
    };
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockClaimReservationAsFailed).toHaveBeenCalledWith("res-exp");
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
  });

  test("べき等性: checkout.session.expired で既に PAID → claim が false で cache invalidate スキップ", async () => {
    // atomic claim: 既に PAID/REFUNDED/FAILED なら count === 0 で false を返す
    mockClaimReservationAsFailed.mockResolvedValueOnce(false);
    const event: StripeWebhookEvent = {
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_test_expired",
          payment_status: "unpaid",
          payment_intent: null,
          metadata: { reservationId: "res-exp" },
        },
      },
    };
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));

    expect(response.status).toBe(200);
    // claim は呼ばれるが false 戻り値で cache invalidate スキップ
    expect(mockClaimReservationAsFailed).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // charge.refunded
  // ---------------------------------------------------------------------------

  test("charge.refunded → REFUNDED", async () => {
    const event = makeChargeRefundedEvent("pi-refund-123");
    mockConstructEvent.mockResolvedValue(event);
    mockFindReservationByPaymentIntent.mockResolvedValue({
      id: "res-ref-1",
      paymentStatus: "PAID",
    });

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockFindReservationByPaymentIntent).toHaveBeenCalledWith(
      "pi-refund-123",
    );
    expect(mockClaimReservationAsRefunded).toHaveBeenCalledWith("res-ref-1");
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
  });

  test("べき等性: charge.refunded で既に REFUNDED → claim が false で cache invalidate スキップ", async () => {
    const event = makeChargeRefundedEvent("pi-refund-123");
    mockConstructEvent.mockResolvedValue(event);
    mockFindReservationByPaymentIntent.mockResolvedValue({
      id: "res-ref-1",
      paymentStatus: "REFUNDED",
    });
    mockClaimReservationAsRefunded.mockResolvedValueOnce(false);

    const response = await POST(makeRequest("body"));

    expect(response.status).toBe(200);
    // claim は呼ばれるが false 戻り値で cache invalidate スキップ
    expect(mockClaimReservationAsRefunded).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("charge.refunded で payment_intent が null → ログのみ、200 を返す", async () => {
    const event = makeChargeRefundedEvent(null);
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockClaimReservationAsRefunded).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  test("charge.refunded で予約が見つからない → ログのみ、200 を返す", async () => {
    const event = makeChargeRefundedEvent("pi-not-found");
    mockConstructEvent.mockResolvedValue(event);
    mockFindReservationByPaymentIntent.mockResolvedValue(null);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockClaimReservationAsRefunded).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 未対応イベント
  // ---------------------------------------------------------------------------

  test("未対応イベント → 200 を返す（無視）", async () => {
    const event: StripeWebhookEvent = {
      type: "payment_intent.created",
      data: { object: {} },
    };
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // 何も処理されない
    expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 内部例外時は 500 を返す（Stripe 公式: 5xx で再送、冪等性は atomic claim で担保）
  // ---------------------------------------------------------------------------

  test("内部例外（DB 障害等）→ 500 を返し、Stripe に再送させる", async () => {
    // unstable_rethrow は Next.js 内部エラー以外は no-op（再スローしない）
    mockUnstableRethrow.mockImplementation(() => {
      // Next.js 内部エラーではないので何もしない
    });

    // handler 内で DB 例外が発生する状況を再現
    mockClaimReservationAsPaid.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    const event = makeSessionCompletedEvent("paid", "pi-123");
    // mockConstructEvent は Promise 戻り型 (PR #744 で async 化)。
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectErrorResult(body);

    expect(response.status).toBe(500);
    // エラー詳細は body に出さない（情報漏洩防止）
    expect(body.error).toBe("Webhook processing failed");
    expect(body.error).not.toContain("DB connection lost");
    // ログには記録される
    expect(mockLogError).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // reservationId がセッションメタデータにない場合
  // ---------------------------------------------------------------------------

  test("reservationId がメタデータに存在しない → ログのみ、200 を返す", async () => {
    const event: StripeWebhookEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_no_meta",
          payment_status: "paid",
          payment_intent: "pi-123",
          metadata: {}, // reservationId なし
        },
      },
    };
    mockConstructEvent.mockResolvedValue(event);

    const response = await POST(makeRequest("body"));
    const body = await response.json();
    expectReceivedResult(body);

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // 処理はスキップ
    expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 実 fixture + 実 Stripe SDK の constructEvent 経由（contract drift 検知）
  //
  // 既存テストは `mockConstructEvent.mockReturnValue(...)` で SDK を完全に
  // バイパスしており、SDK の major bump で webhook event のシェイプや
  // `constructEvent` のシグネチャが変わっても検知できない。
  //
  // このブロックは:
  //   1. ディスク上の `__tests__/fixtures/stripe/*.json` を実 payload として読む
  //   2. `Stripe.webhooks.generateTestHeaderStringAsync` で公式に署名ヘッダーを生成
  //      (Bun runtime は SubtleCryptoProvider を選択するため async 版が必須。
  //       Stripe SDK v18+ で sync 版は同期コンテキストで throw する。)
  //   3. **実 Stripe インスタンス** を `getStripeClient` 経由で注入
  //   4. ルートハンドラに POST して構造を end-to-end で検証
  // 公式: https://github.com/stripe/stripe-node#testing-webhook-signing
  // ---------------------------------------------------------------------------

  describe("実 Stripe SDK 経由（fixture + generateTestHeaderStringAsync）", () => {
    const WEBHOOK_SECRET = "whsec_test_fixture_secret";

    // 実 Stripe インスタンス: secretKey はテスト用ダミー（呼び出すのは
    // webhooks.constructEvent / generateTestHeaderStringAsync のみで、HTTP API は
    // 叩かないので任意値で良い）
    // 公式: https://github.com/stripe/stripe-node — generateTestHeaderStringAsync /
    // constructEvent は **インスタンスメソッド** `stripeClient.webhooks.*`
    const realStripe = new Stripe("sk_test_dummy_fixture", {
      // ルート (`src/shared/lib/stripe.ts`) と同じ apiVersion ピン留め
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });

    /**
     * `__tests__/fixtures/stripe/*.json` を読み込んで生 string で返す。
     * 改ざんすると署名検証が落ちるので **string のまま** ハンドラに渡す。
     */
    function loadFixture(name: string): string {
      const path = join(
        process.cwd(),
        "__tests__",
        "fixtures",
        "stripe",
        `${name}.json`,
      );
      return readFileSync(path, "utf-8");
    }

    function setupRealStripeClient(): void {
      mockSafeDecrypt.mockImplementation((value) => {
        // webhook secret の復号は実 secret を返す（生成した署名と一致させる）
        if (value === "enc-webhook-secret") return WEBHOOK_SECRET;
        return `decrypted-${value}`;
      });

      // 実 constructEventAsync を `mockConstructEvent` 経由で配線
      // (signature 検証は実 SDK が実行する。Bun SubtleCrypto 対応で async 必須)
      mockConstructEvent.mockImplementation((body, sig, secret) =>
        realStripe.webhooks.constructEventAsync(body, sig, secret),
      );

      mockGetStripeClient.mockResolvedValue({
        client: {
          webhooks: { constructEventAsync: mockConstructEvent },
        },
      });
    }

    test("payment_intent.succeeded fixture → 実署名検証パス → 200 received（未対応イベントとして無視）", async () => {
      setupRealStripeClient();

      const payload = loadFixture("payment_intent_succeeded");
      const signature = await realStripe.webhooks.generateTestHeaderStringAsync(
        {
          payload,
          secret: WEBHOOK_SECRET,
        },
      );

      const response = await POST(makeRequest(payload, signature));
      const body = await response.json();
      expectReceivedResult(body);

      expect(response.status).toBe(200);
      expect(body.received).toBe(true);

      // 実 constructEvent が呼ばれ、署名検証もパスしたことを担保
      expect(mockConstructEvent).toHaveBeenCalledTimes(1);

      // payment_intent.succeeded は route の switch で未対応
      // → 副作用なし（claim/email/cache invalidate いずれも呼ばれない）
      expect(mockClaimReservationAsPaid).not.toHaveBeenCalled();
      expect(mockClaimReservationAsFailed).not.toHaveBeenCalled();
      expect(mockClaimReservationAsRefunded).not.toHaveBeenCalled();
      expect(
        mockInvalidateSiteWideCacheFromRouteHandler,
      ).not.toHaveBeenCalled();
    });

    test("payment_intent.succeeded fixture を改ざんすると署名検証が失敗 → 400", async () => {
      setupRealStripeClient();

      const payload = loadFixture("payment_intent_succeeded");
      const signature = await realStripe.webhooks.generateTestHeaderStringAsync(
        {
          payload,
          secret: WEBHOOK_SECRET,
        },
      );

      // body を 1 byte 改ざんすると signature が一致しない
      const tampered = payload.replace('"amount": 5000', '"amount": 9999999');
      const response = await POST(makeRequest(tampered, signature));
      const responseBody = await response.json();
      expectErrorResult(responseBody);

      expect(response.status).toBe(400);
      expect(responseBody.error).toContain("Invalid signature");
      expect(mockLogError).toHaveBeenCalled();
    });
  });
});
