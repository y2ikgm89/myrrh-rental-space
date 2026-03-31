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
const mockGetStripeClient = mock<
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

mock.module("@/shared/lib/constants", () => {
  const tags = {
    POSTS: "posts",
    POST_COMMENTS: "post-comments",
    POST_TAGS: "post-tags",
    NEWS: "news",
    SPACES: "spaces",
    SPACE_CATEGORIES: "space-categories",
    LOCATIONS: "locations",
    PAGES: "pages",
    SETTINGS: "settings",
    FAQ: "faq",
    FAQ_CATEGORIES: "faq-categories",
    RESERVATIONS: "reservations",
    CUSTOMERS: "customers",
    INQUIRIES: "inquiries",
    MEDIA: "media",
    NAVIGATION: "navigation",
    ANNOUNCEMENT_BAR: "announcement-bar",
    SECTIONS: "sections",
    HOMEPAGE_SECTIONS: "homepage-sections",
    PAGE_SECTIONS: "page-sections",
    TERMS: "terms",
    STAFF: "staff",
    COUPONS: "coupons",
    BUSINESS_SETTINGS: "business-settings",
    COOKIE_CONSENT: "cookie-consent",
    PERMALINK: "permalink",
    ROBOTS_TXT: "robots-txt",
    LAYOUT: "layout",
    LAYOUT_SETTINGS: "layout-settings",
    ANALYTICS_CONFIG: "analytics-config",
    SEO_SETTINGS: "seo-settings",
    ORGANIZATION_SETTINGS: "organization-settings",
    SOCIAL_LINKS: "social-links",
    PAGE_SEO: "page-seo",
    SIDEBAR_DATA: "sidebar-data",
    SIDEBAR_SETTINGS: "sidebar-settings",
    INSTAGRAM_FEED: "instagram-feed",
    CANCELLATION_POLICY: "cancellation-policy",
    BLOCK_TEMPLATES: "block-templates",
    PERMISSIONS: "permissions",
    PAGE_CONTENT: "page-content",
    REVIEWS: "reviews",
  };
  return {
    CACHE_TAGS: tags,
    CACHE_LIFE: {
      PUBLIC_CONTENT: "hours",
      STATIC_SETTINGS: "days",
      DYNAMIC_DATA: "minutes",
      METADATA: "hours",
    },
    getCacheTag: {
      posts: {
        list: () => tags.POSTS,
        detail: (slug: string) => `${tags.POSTS}-${slug}`,
        comments: (slug: string) => `${tags.POST_COMMENTS}-${slug}`,
        tags: () => tags.POST_TAGS,
        tagPage: (slug: string) => `${tags.POST_TAGS}-${slug}`,
      },
      news: {
        list: () => tags.NEWS,
        detail: (id: string) => `${tags.NEWS}-${id}`,
      },
      spaces: {
        list: () => tags.SPACES,
        detail: (id: string) => `${tags.SPACES}-${id}`,
      },
      pages: {
        list: () => tags.PAGES,
        detail: (slug: string) => `${tags.PAGES}-${slug}`,
      },
      faq: {
        list: () => tags.FAQ,
        detail: (id: string) => `${tags.FAQ}-${id}`,
      },
      reservations: {
        list: () => tags.RESERVATIONS,
        detail: (id: string) => `${tags.RESERVATIONS}-${id}`,
        calendar: () => `${tags.RESERVATIONS}-calendar`,
      },
      customers: {
        list: () => tags.CUSTOMERS,
        detail: (id: string) => `${tags.CUSTOMERS}-${id}`,
      },
      inquiries: {
        list: () => tags.INQUIRIES,
        detail: (id: string) => `${tags.INQUIRIES}-${id}`,
      },
      coupons: {
        list: () => tags.COUPONS,
        detail: (id: string) => `${tags.COUPONS}-${id}`,
      },
      media: {
        list: () => tags.MEDIA,
        detail: (id: string) => `${tags.MEDIA}-${id}`,
      },
      staff: {
        list: () => tags.STAFF,
        detail: (id: string) => `${tags.STAFF}-${id}`,
      },
      layoutSettings: {
        site: () => tags.LAYOUT_SETTINGS,
        post: (postId: string) => `${tags.LAYOUT_SETTINGS}-post-${postId}`,
        news: (newsId: string) => `${tags.LAYOUT_SETTINGS}-news-${newsId}`,
        page: (slug: string) => `${tags.LAYOUT_SETTINGS}-page-${slug}`,
      },
      pageSeo: {
        detail: (slug: string) => `${tags.PAGE_SEO}-${slug}`,
      },
      pageContent: {
        detail: (pageKey: string) => `${tags.PAGE_CONTENT}-${pageKey}`,
        meta: (pageKey: string) => `${tags.PAGE_CONTENT}-meta-${pageKey}`,
      },
      reviews: {
        space: (spaceId: string) => `${tags.REVIEWS}-space-${spaceId}`,
        stats: (spaceId: string) => `${tags.REVIEWS}-stats-${spaceId}`,
      },
    },
  };
});

mock.module("@/shared/lib/route-responses", () => ({
  getRouteErrorStatus: (message: string) =>
    message.includes("ログイン") || message.includes("権限") ? 403 : 400,
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
mock.module("@/shared/db/enums", () => actualEnums);

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
    const request = makeRequest("body", null);

    const response = await POST(request);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("stripe-signature");
    // constructEvent は呼ばれない（signature ガードで先に返る）
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  test("署名検証失敗（constructEvent 例外）→ 400", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await POST(makeRequest("body"));
    const body = (await response.json()) as { error: string };

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
