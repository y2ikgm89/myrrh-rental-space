import { describe, test, expect, mock, beforeEach } from "bun:test";

// モック設定（import より前に配置）

mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({ headers: mock(() => new Headers()) }));
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
mock.module("@/shared/lib/rate-limit", () => ({ formSubmitRateLimiter: {} }));

const mockVerifyCancelToken = mock<
  (
    token: string,
    now: Date,
  ) =>
    | { valid: true; reservationId: string }
    | { valid: false; reason: "invalid" | "expired" }
>(() => ({ valid: true, reservationId: "res-001" }));
mock.module("@/shared/lib/reservation-cancel-token", () => ({
  verifyCancelToken: mockVerifyCancelToken,
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
  Promise.resolve({ success: true, payload: { reservationId: "res-001" } }),
);
mock.module("@/shared/domain/reservations/customer-commands", () => ({
  cancelReservationByToken: mockCancelByToken,
}));

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mock(() => undefined),
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => undefined),
}));
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(() => Promise.resolve()),
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  ErrorCategory: { DATABASE: "DATABASE", UNKNOWN: "UNKNOWN" },
  ErrorSeverity: {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL",
  },
}));

const IMPORT_PATH = "@/app/(public)/reservation/cancel/_actions/cancel";

describe("cancelGuestReservationAction", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockReset();
    mockValidateTurnstile.mockReset();
    mockVerifyCancelToken.mockReset();
    mockCancelByToken.mockReset();
    mockCheckActionRateLimit.mockResolvedValue({ success: true });
    mockValidateTurnstile.mockResolvedValue({ success: true });
    mockVerifyCancelToken.mockReturnValue({
      valid: true,
      reservationId: "res-001",
    });
    mockCancelByToken.mockResolvedValue({
      success: true,
      payload: { reservationId: "res-001" },
    });
  });

  test("有効トークンでキャンセル成功し null を返す", async () => {
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("tok", null, "ts");
    expect(result).toBeNull();
    expect(mockCancelByToken).toHaveBeenCalledTimes(1);
    expect(mockCancelByToken).toHaveBeenCalledWith("res-001", 24, null);
  });

  test("期限切れトークンはエラーでドメインを呼ばない", async () => {
    mockVerifyCancelToken.mockReturnValue({ valid: false, reason: "expired" });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("tok", null, "ts");
    expect(result).toHaveProperty(
      "error",
      "キャンセルリンクの有効期限が切れています",
    );
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("無効トークンはエラー", async () => {
    mockVerifyCancelToken.mockReturnValue({ valid: false, reason: "invalid" });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("tok", null, "ts");
    expect(result).toHaveProperty("error", "キャンセルリンクが無効です");
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("Turnstile 失敗時はエラーでドメインを呼ばない", async () => {
    mockValidateTurnstile.mockResolvedValue({
      success: false,
      error: "認証に失敗しました",
    });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("tok", null, "ts");
    expect(result).toHaveProperty("error", "認証に失敗しました");
    expect(mockCancelByToken).not.toHaveBeenCalled();
  });

  test("レート制限超過時はエラーで検証もしない", async () => {
    mockCheckActionRateLimit.mockResolvedValue({
      success: false,
      error: "リクエストが多すぎます",
    });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("tok", null, "ts");
    expect(result).toHaveProperty("error", "リクエストが多すぎます");
    expect(mockVerifyCancelToken).not.toHaveBeenCalled();
  });

  test("ドメインがエラーを返したらそのエラーを返す", async () => {
    mockCancelByToken.mockResolvedValue({
      success: false,
      error: "この予約はキャンセルできません",
    });
    const { cancelGuestReservationAction } = await import(IMPORT_PATH);
    const result = await cancelGuestReservationAction("tok", "理由", "ts");
    expect(result).toHaveProperty("error", "この予約はキャンセルできません");
  });
});
