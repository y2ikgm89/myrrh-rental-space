import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

// HttpOnly cookie 経由で token を取得する設計のため、cookies() をモック
const mockCookieGet = mock<(name: string) => { value: string } | undefined>(
  (name) =>
    name === "event-cancel-token"
      ? { value: "valid-token-fixture" }
      : undefined,
);
mock.module("next/headers", () => ({
  cookies: mock(() => Promise.resolve({ get: mockCookieGet })),
  headers: mock(() => Promise.resolve(new Headers())),
}));

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mockValidateTurnstile,
}));

const mockPerRegistrationCheck = mock(() =>
  Promise.resolve({ success: true, remaining: 3, reset: Date.now() + 3600000 }),
);
mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  cancelByEventRegistrationRateLimiter: { check: mockPerRegistrationCheck },
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

const VALID_ID = "ckv1a2b3c0000abcdefghijk";
const mockVerifyCancelToken = mock<
  (
    token: string,
    now: Date,
  ) =>
    | {
        valid: true;
        registrationId: string;
        issuedAt: number;
        expiresAt: number;
      }
    | { valid: false; reason: "invalid" | "expired" }
>(() => ({
  valid: true,
  registrationId: VALID_ID,
  issuedAt: Date.now(),
  expiresAt: Date.now() + 3600000,
}));
mock.module("@/shared/lib/event-registration-cancel-token", () => ({
  verifyCancelToken: mockVerifyCancelToken,
  tokenFingerprint: () => "abcd1234abcd1234",
}));

const mockCancelByToken = mock<
  (...args: unknown[]) => Promise<{ id: string; eventId: string }>
>(() => Promise.resolve({ id: VALID_ID, eventId: "evt1" }));
mock.module("@/shared/domain/events/registration-commands", () => ({
  cancelEventRegistrationByToken: mockCancelByToken,
  // mock.module は process-global なので他 import の cancelEventRegistrationCommand /
  // adminCancelEventRegistrationCommand も互換のため stub 値を含めておく（呼ばれない）
  cancelEventRegistrationCommand: mock(() =>
    Promise.reject(new Error("not used in guest test")),
  ),
  adminCancelEventRegistrationCommand: mock(() =>
    Promise.reject(new Error("not used in guest test")),
  ),
}));

const mockApplySideEffects = mock(() => Promise.resolve());
mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mockApplySideEffects,
  }),
);

const mockGetEventRegistrationForGuestCancel = mock(() =>
  Promise.resolve({
    id: VALID_ID,
    customerId: null as string | null,
    status: "CONFIRMED",
    quantity: 2,
    name: "山田太郎",
    event: { title: "夏祭り" },
    slot: { startAt: new Date(), endAt: new Date() },
  }),
);
mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationForGuestCancel: mockGetEventRegistrationForGuestCancel,
}));

const mockGetCustomerByUserId = mock<
  (userId: string) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));
mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

const mockGetCustomerSession = mock<
  () => Promise<{ user: { id: string } } | null>
>(() => Promise.resolve(null));
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL",
  },
}));

const IMPORT_PATH = "@/app/(public)/events/cancel/_actions/cancel";

describe("cancelGuestEventRegistrationAction (cookie 経路)", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockReset();
    mockValidateTurnstile.mockReset();
    mockVerifyCancelToken.mockReset();
    mockCancelByToken.mockReset();
    mockPerRegistrationCheck.mockReset();
    mockApplySideEffects.mockReset();
    mockCookieGet.mockReset();
    mockGetEventRegistrationForGuestCancel.mockReset();
    mockGetCustomerByUserId.mockReset();
    mockGetCustomerSession.mockReset();
    mockGetEventRegistrationForGuestCancel.mockResolvedValue({
      id: VALID_ID,
      customerId: null,
      status: "CONFIRMED",
      quantity: 2,
      name: "山田太郎",
      event: { title: "夏祭り" },
      slot: { startAt: new Date(), endAt: new Date() },
    });
    mockGetCustomerByUserId.mockResolvedValue(null);
    mockGetCustomerSession.mockResolvedValue(null);
    mockCheckActionRateLimit.mockResolvedValue({ success: true });
    mockValidateTurnstile.mockResolvedValue({ success: true });
    mockVerifyCancelToken.mockReturnValue({
      valid: true,
      registrationId: VALID_ID,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    mockCancelByToken.mockResolvedValue({ id: VALID_ID, eventId: "evt1" });
    mockApplySideEffects.mockResolvedValue(undefined);
    mockPerRegistrationCheck.mockResolvedValue({
      success: true,
      remaining: 3,
      reset: Date.now() + 3600000,
    });
    mockCookieGet.mockImplementation((name) =>
      name === "event-cancel-token" ? { value: "valid-token" } : undefined,
    );
  });

  test("有効トークン（cookie 経由）でキャンセル成功し null を返す", async () => {
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toBeNull();
    expect(mockCancelByToken).toHaveBeenCalledTimes(1);
    expect(mockCancelByToken).toHaveBeenCalledWith(VALID_ID);
    expect(mockApplySideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: VALID_ID,
        channel: "customer-token",
      }),
    );
  });

  test("cookie に token が無いとエラー", async () => {
    mockCookieGet.mockImplementation(() => undefined);
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty(
      "error",
      "キャンセルリンクが無効または期限切れです",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("期限切れトークンは統合文言でエラー（invalid / expired を区別しない）", async () => {
    mockVerifyCancelToken.mockReturnValue({ valid: false, reason: "expired" });
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty(
      "error",
      "キャンセルリンクが無効または期限切れです",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("Turnstile 失敗時はエラーでドメインを呼ばない", async () => {
    mockValidateTurnstile.mockResolvedValue({
      success: false,
      error: "認証に失敗しました",
    });
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty("error", "認証に失敗しました");
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("IP rate limit 超過時はエラーで verify もしない", async () => {
    mockCheckActionRateLimit.mockResolvedValue({
      success: false,
      error: "リクエストが多すぎます",
    });
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty("error", "リクエストが多すぎます");
    expect(mockVerifyCancelToken).not.toHaveBeenCalled();
  });

  test("per-registration rate-limit 超過時はエラーでドメインを呼ばない", async () => {
    mockPerRegistrationCheck.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 3600000,
    });
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty("error");
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("ドメインがエラーを投げたらそのメッセージを返す", async () => {
    const { DomainError } = await import("@/shared/domain/domain-error");
    mockCancelByToken.mockImplementation(() =>
      Promise.reject(
        new DomainError("この申込はキャンセルできません", "CONFLICT"),
      ),
    );
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty("error", "この申込はキャンセルできません");
  });

  test("表示中の申込 ID と cookie 復号後の申込 ID が異なればエラーでドメインを呼ばない（別タブでの cookie 上書き対策）", async () => {
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const staleRegistrationId = "ckstaleaaaa0000abcdefghi";
    const result = await cancelGuestEventRegistrationAction(
      staleRegistrationId,
      "ts",
    );
    expect(result).toHaveProperty(
      "error",
      "表示中のページが最新ではありません。ページを再読み込みしてから再度お試しください",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("ログイン中でも未claim（customerId が null）のゲスト申込はトークンで通常通りキャンセルできる", async () => {
    mockGetCustomerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCustomerByUserId.mockResolvedValue({ id: "cust-logged-in" });
    mockGetEventRegistrationForGuestCancel.mockResolvedValue({
      id: VALID_ID,
      customerId: null,
      status: "CONFIRMED",
      quantity: 2,
      name: "山田太郎",
      event: { title: "夏祭り" },
      slot: { startAt: new Date(), endAt: new Date() },
    });
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toBeNull();
    expect(mockCancelByToken).toHaveBeenCalledWith(VALID_ID);
  });

  test("ログイン中に customerId が別会員の claim 済み申込へアクセスするとエラー", async () => {
    mockGetCustomerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCustomerByUserId.mockResolvedValue({ id: "cust-logged-in" });
    mockGetEventRegistrationForGuestCancel.mockResolvedValue({
      id: VALID_ID,
      customerId: "cust-someone-else",
      status: "CONFIRMED",
      quantity: 2,
      name: "山田太郎",
      event: { title: "夏祭り" },
      slot: { startAt: new Date(), endAt: new Date() },
    });
    const { cancelGuestEventRegistrationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestEventRegistrationAction(VALID_ID, "ts");
    expect(result).toHaveProperty(
      "error",
      "このリンクは別のお客様のご参加申込です。マイページからご自身の申込をご確認ください",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });
});
