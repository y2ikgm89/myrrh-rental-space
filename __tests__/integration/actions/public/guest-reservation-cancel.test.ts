import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

// HttpOnly cookie 経由で token を取得する設計のため、cookies() をモック
const mockCookieGet = mock<(name: string) => { value: string } | undefined>(
  (name) =>
    name === "cancel-token" ? { value: "valid-token-fixture" } : undefined,
);
mock.module("next/headers", () => ({
  cookies: mock(() => Promise.resolve({ get: mockCookieGet })),
  headers: mock(() => Promise.resolve(new Headers())),
}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
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

const mockPerReservationCheck = mock(() =>
  Promise.resolve({ success: true, remaining: 3, reset: Date.now() + 3600000 }),
);
mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  cancelByReservationRateLimiter: { check: mockPerReservationCheck },
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const mockVerifyCancelToken = mock<
  (
    token: string,
    now: Date,
  ) =>
    | {
        valid: true;
        reservationId: string;
        issuedAt: number;
        expiresAt: number;
      }
    | { valid: false; reason: "invalid" | "expired" }
>(() => ({
  valid: true,
  reservationId: VALID_UUID,
  issuedAt: Date.now(),
  expiresAt: Date.now() + 3600000,
}));
mock.module("@/shared/lib/reservation-cancel-token", () => ({
  verifyCancelToken: mockVerifyCancelToken,
  tokenFingerprint: () => "abcd1234abcd1234",
}));

mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: mock(() =>
    Promise.resolve({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 24,
    }),
  ),
}));

const mockCancelByToken = mock<
  (
    ...args: unknown[]
  ) => Promise<{ success: boolean; error?: string; payload?: unknown }>
>(() =>
  Promise.resolve({ success: true, payload: { reservationId: VALID_UUID } }),
);
mock.module("@/shared/domain/reservations/customer-commands", () => ({
  cancelReservationByToken: mockCancelByToken,
  // mock.module は process-global なので他テスト import の cancelCustomerReservation /
  // updateCustomerReservation も互換のため stub 値を含めておく（呼ばれない）
  cancelCustomerReservation: mock(() =>
    Promise.resolve({ success: false, error: "not used in guest test" }),
  ),
  updateCustomerReservation: mock(() =>
    Promise.resolve({ success: false, error: "not used in guest test" }),
  ),
}));

mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/reservations/customer-queries", () => ({
  getReservationForGuestCancel: mock(() =>
    Promise.resolve({
      id: VALID_UUID,
      customerId: "cust-001",
      status: "PENDING",
      startTime: new Date(),
      endTime: new Date(),
      totalPrice: 1000,
      paymentStatus: "UNPAID",
      guestLastName: null,
      guestFirstName: null,
      space: { id: "sp-1", name: "テスト", slug: "test" },
    }),
  ),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => undefined),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => undefined),
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

const IMPORT_PATH = "@/app/(public)/reservation/cancel/_actions/cancel";

describe("cancelGuestReservationAction (cookie 経路)", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockReset();
    mockValidateTurnstile.mockReset();
    mockVerifyCancelToken.mockReset();
    mockCancelByToken.mockReset();
    mockPerReservationCheck.mockReset();
    mockCookieGet.mockReset();
    mockCheckActionRateLimit.mockResolvedValue({ success: true });
    mockValidateTurnstile.mockResolvedValue({ success: true });
    mockVerifyCancelToken.mockReturnValue({
      valid: true,
      reservationId: VALID_UUID,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    mockCancelByToken.mockResolvedValue({
      success: true,
      payload: { reservationId: VALID_UUID },
    });
    mockPerReservationCheck.mockResolvedValue({
      success: true,
      remaining: 3,
      reset: Date.now() + 3600000,
    });
    mockCookieGet.mockImplementation((name) =>
      name === "cancel-token" ? { value: "valid-token" } : undefined,
    );
  });

  test("有効トークン（cookie 経由）でキャンセル成功し null を返す", async () => {
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
    expect(result).toBeNull();
    expect(mockCancelByToken).toHaveBeenCalledTimes(1);
    expect(mockCancelByToken).toHaveBeenCalledWith(VALID_UUID, 24, null);
  });

  test("cookie に token が無いとエラー", async () => {
    mockCookieGet.mockImplementation(() => undefined);
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
    expect(result).toHaveProperty(
      "error",
      "キャンセルリンクが無効または期限切れです",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("期限切れトークンは統合文言でエラー（invalid / expired を区別しない）", async () => {
    mockVerifyCancelToken.mockReturnValue({ valid: false, reason: "expired" });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
    expect(result).toHaveProperty(
      "error",
      "キャンセルリンクが無効または期限切れです",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("無効トークンも同一文言でエラー（弱オラクル遮断）", async () => {
    mockVerifyCancelToken.mockReturnValue({ valid: false, reason: "invalid" });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
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
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
    expect(result).toHaveProperty("error", "認証に失敗しました");
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("IP rate limit 超過時はエラーで verify もしない", async () => {
    mockCheckActionRateLimit.mockResolvedValue({
      success: false,
      error: "リクエストが多すぎます",
    });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
    expect(result).toHaveProperty("error", "リクエストが多すぎます");
    expect(mockVerifyCancelToken).not.toHaveBeenCalled();
  });

  test("per-reservation rate-limit 超過時はエラーでドメインを呼ばない", async () => {
    mockPerReservationCheck.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 3600000,
    });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction(null, "ts");
    expect(result).toHaveProperty("error");
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("ドメインがエラーを返したらそのエラーを返す", async () => {
    mockCancelByToken.mockResolvedValue({
      success: false,
      error: "この予約はキャンセルできません",
    });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("理由", "ts");
    expect(result).toHaveProperty("error", "この予約はキャンセルできません");
  });
});
