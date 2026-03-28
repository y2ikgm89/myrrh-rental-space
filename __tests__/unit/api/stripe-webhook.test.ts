import { beforeEach, describe, expect, mock, test } from "bun:test";

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

// Stripe Client
const mockConstructEvent =
  mock<(body: string, sig: string, secret: string) => unknown>();
const mockGetStripeClient =
  mock<
    () => Promise<{
      client: {
        webhooks: { constructEvent: typeof mockConstructEvent };
      } | null;
    }>
  >();

// Payment Queries
const mockGetReservationPaymentStatus =
  mock<(id: string) => Promise<{ paymentStatus: string } | null>>();
const mockUpdateReservationPaymentCompleted = mock<
  (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => Promise<{
    id: string;
    totalPrice: number;
    notes: string | null;
    startTime: string;
    endTime: string;
    customer: { email: string; lastName: string; firstName: string };
    space: { name: string; location: { name: string } | null };
  }>
>();
const mockSavePaymentIntentId =
  mock<(id: string, piId: string) => Promise<void>>();
const mockMarkReservationPaymentFailed = mock<(id: string) => Promise<void>>();
const mockFindReservationByPaymentIntent =
  mock<
    (piId: string) => Promise<{ id: string; paymentStatus: string } | null>
  >();
const mockMarkReservationRefunded = mock<(id: string) => Promise<void>>();

// Next.js cache
const mockRevalidateTag = mock<(tag: string, profile: string) => void>();

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
const mockJsonSuccess = mock<(data: unknown) => Response>(
  (data) => new Response(JSON.stringify(data), { status: 200 }),
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

mock.module("@/shared/lib/crypto", () => ({
  safeDecrypt: (value: string) => mockSafeDecrypt(value),
}));

mock.module("@/app/(admin)/admin/(dashboard)/_shared/lib/stripe", () => ({
  getStripeClient: () => mockGetStripeClient(),
}));

mock.module("@/shared/domain/reservations/payment-queries", () => ({
  getReservationPaymentStatus: (id: string) =>
    mockGetReservationPaymentStatus(id),
  updateReservationPaymentCompleted: (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => mockUpdateReservationPaymentCompleted(id, data),
  savePaymentIntentId: (id: string, piId: string) =>
    mockSavePaymentIntentId(id, piId),
  markReservationPaymentFailed: (id: string) =>
    mockMarkReservationPaymentFailed(id),
  findReservationByPaymentIntent: (piId: string) =>
    mockFindReservationByPaymentIntent(piId),
  markReservationRefunded: (id: string) => mockMarkReservationRefunded(id),
}));

mock.module("next/cache", () => ({
  revalidateTag: (tag: string, profile: string) =>
    mockRevalidateTag(tag, profile),
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>, opts?: unknown) =>
    mockFireAndForget(promise, opts),
}));

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationConfirmationEmail: (data: unknown) =>
    mockSendReservationConfirmationEmail(data),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (error: unknown, opts?: unknown) => mockLogError(error, opts),
  normalizeError: (error: unknown) => mockNormalizeError(error),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL",
  },
}));

mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: {
    RESERVATIONS: "reservations",
  },
  CACHE_LIFE: {
    DYNAMIC_DATA: "minutes",
  },
  getCacheTag: {
    reservations: {
      detail: (id: string) => `reservations-${id}`,
      calendar: () => "reservations-calendar",
    },
  },
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (msg: string, status: number) => mockJsonError(msg, status),
  jsonSuccess: (data: unknown) => mockJsonSuccess(data),
}));

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: (obj: Record<string, unknown>) => mockOmitUndefined(obj),
}));

mock.module("@/shared/db/enums", () => ({
  PaymentStatus: {
    PAID: "PAID",
    PENDING: "PENDING",
    FAILED: "FAILED",
    REFUNDED: "REFUNDED",
  },
}));

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
) {
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
function makeChargeRefundedEvent(paymentIntent: string | null = "pi-123") {
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
    mockGetReservationPaymentStatus.mockReset();
    mockUpdateReservationPaymentCompleted.mockReset();
    mockSavePaymentIntentId.mockReset();
    mockMarkReservationPaymentFailed.mockReset();
    mockFindReservationByPaymentIntent.mockReset();
    mockMarkReservationRefunded.mockReset();
    mockRevalidateTag.mockReset();
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
      (data) => new Response(JSON.stringify(data), { status: 200 }),
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
          constructEvent: mockConstructEvent,
        },
      },
    });
    mockGetReservationPaymentStatus.mockResolvedValue({
      paymentStatus: "PENDING",
    });
    mockUpdateReservationPaymentCompleted.mockResolvedValue(
      DEFAULT_RESERVATION,
    );
    mockSavePaymentIntentId.mockResolvedValue(undefined);
    mockMarkReservationPaymentFailed.mockResolvedValue(undefined);
    mockMarkReservationRefunded.mockResolvedValue(undefined);
    mockFindReservationByPaymentIntent.mockResolvedValue(null);
  });

  // ---------------------------------------------------------------------------
  // 署名エラー
  // ---------------------------------------------------------------------------

  test("stripe-signature ヘッダーがない → 400", async () => {
    // signature なしのリクエスト
    const request = makeRequest("body", null);
    // Stripeは設定済み・署名検証前に止まるので getStripeSettings は呼ばれる
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signature");
    });

    const response = await POST(request);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("stripe-signature");
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
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  test("Stripe 設定が null → 503", async () => {
    mockGetStripeSettings.mockResolvedValue(null);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { error: string };

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
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  test("Stripe クライアントが null → 503", async () => {
    mockGetStripeClient.mockResolvedValue({ client: null });

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  // ---------------------------------------------------------------------------
  // checkout.session.completed — 即時決済（paid）
  // ---------------------------------------------------------------------------

  test("checkout.session.completed (paid) → fulfill + キャッシュ無効化", async () => {
    const event = makeSessionCompletedEvent("paid", "pi-123");
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // fulfill が呼ばれた
    expect(mockUpdateReservationPaymentCompleted).toHaveBeenCalledWith(
      "res-123",
      { stripePaymentIntentId: "pi-123" },
    );

    // キャッシュ無効化 (3点セット)
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);

    // メール送信が fireAndForget で呼ばれた
    expect(mockFireAndForget).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // checkout.session.completed — 非同期決済（unpaid）
  // ---------------------------------------------------------------------------

  test("checkout.session.completed (unpaid) → PI ID のみ保存", async () => {
    const event = makeSessionCompletedEvent("unpaid", "pi-456");
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // PI IDのみ保存
    expect(mockSavePaymentIntentId).toHaveBeenCalledWith("res-123", "pi-456");

    // fulfill は呼ばれない
    expect(mockUpdateReservationPaymentCompleted).not.toHaveBeenCalled();

    // キャッシュ無効化は実行される
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);

    // メールは送信されない
    expect(mockFireAndForget).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // べき等性: 既に PAID
  // ---------------------------------------------------------------------------

  test("べき等性: checkout.session.completed で既に PAID → 再処理しない", async () => {
    mockGetReservationPaymentStatus.mockResolvedValue({
      paymentStatus: "PAID",
    });

    const event = makeSessionCompletedEvent("paid", "pi-123");
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // スキップされた
    expect(mockUpdateReservationPaymentCompleted).not.toHaveBeenCalled();
    expect(mockSavePaymentIntentId).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // checkout.session.async_payment_succeeded
  // ---------------------------------------------------------------------------

  test("checkout.session.async_payment_succeeded → fulfill", async () => {
    const event = {
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
    mockConstructEvent.mockReturnValue(event);
    mockGetReservationPaymentStatus.mockResolvedValue({
      paymentStatus: "PENDING",
    });
    mockUpdateReservationPaymentCompleted.mockResolvedValue({
      ...DEFAULT_RESERVATION,
      id: "res-456",
    });

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockUpdateReservationPaymentCompleted).toHaveBeenCalledWith(
      "res-456",
      { stripePaymentIntentId: "pi-789" },
    );
    expect(mockFireAndForget).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // checkout.session.async_payment_failed
  // ---------------------------------------------------------------------------

  test("checkout.session.async_payment_failed → FAILED", async () => {
    const event = {
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
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockMarkReservationPaymentFailed).toHaveBeenCalledWith("res-789");
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // checkout.session.expired
  // ---------------------------------------------------------------------------

  test("checkout.session.expired → FAILED", async () => {
    const event = {
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
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockMarkReservationPaymentFailed).toHaveBeenCalledWith("res-exp");
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);
  });

  test("べき等性: checkout.session.expired で既に PAID → スキップ", async () => {
    mockGetReservationPaymentStatus.mockResolvedValue({
      paymentStatus: "PAID",
    });
    const event = {
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
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));

    expect(response.status).toBe(200);
    expect(mockMarkReservationPaymentFailed).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // charge.refunded
  // ---------------------------------------------------------------------------

  test("charge.refunded → REFUNDED", async () => {
    const event = makeChargeRefundedEvent("pi-refund-123");
    mockConstructEvent.mockReturnValue(event);
    mockFindReservationByPaymentIntent.mockResolvedValue({
      id: "res-ref-1",
      paymentStatus: "PAID",
    });

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockFindReservationByPaymentIntent).toHaveBeenCalledWith(
      "pi-refund-123",
    );
    expect(mockMarkReservationRefunded).toHaveBeenCalledWith("res-ref-1");
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);
  });

  test("べき等性: charge.refunded で既に REFUNDED → スキップ", async () => {
    const event = makeChargeRefundedEvent("pi-refund-123");
    mockConstructEvent.mockReturnValue(event);
    mockFindReservationByPaymentIntent.mockResolvedValue({
      id: "res-ref-1",
      paymentStatus: "REFUNDED",
    });

    const response = await POST(makeRequest("body"));

    expect(response.status).toBe(200);
    expect(mockMarkReservationRefunded).not.toHaveBeenCalled();
  });

  test("charge.refunded で payment_intent が null → ログのみ、200 を返す", async () => {
    const event = makeChargeRefundedEvent(null);
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockMarkReservationRefunded).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  test("charge.refunded で予約が見つからない → ログのみ、200 を返す", async () => {
    const event = makeChargeRefundedEvent("pi-not-found");
    mockConstructEvent.mockReturnValue(event);
    mockFindReservationByPaymentIntent.mockResolvedValue(null);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(mockMarkReservationRefunded).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 未対応イベント
  // ---------------------------------------------------------------------------

  test("未対応イベント → 200 を返す（無視）", async () => {
    const event = {
      type: "payment_intent.created",
      data: { object: {} },
    };
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // 何も処理されない
    expect(mockGetReservationPaymentStatus).not.toHaveBeenCalled();
    expect(mockUpdateReservationPaymentCompleted).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // reservationId がセッションメタデータにない場合
  // ---------------------------------------------------------------------------

  test("reservationId がメタデータに存在しない → ログのみ、200 を返す", async () => {
    const event = {
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
    mockConstructEvent.mockReturnValue(event);

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // 処理はスキップ
    expect(mockGetReservationPaymentStatus).not.toHaveBeenCalled();
    expect(mockUpdateReservationPaymentCompleted).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });
});
