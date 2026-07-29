import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockCookiesGet = mock(() => undefined as { value: string } | undefined);
mock.module("next/headers", () => ({
  cookies: mock(async () => ({
    get: mockCookiesGet,
  })),
  headers: mock(async () => new Headers()),
}));

const mockCheckActionRateLimit = mock(() =>
  Promise.resolve({ success: true as const }),
);
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

const mockGetClientIpFromHeaders = mock(() => Promise.resolve("127.0.0.1"));
mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  getClientIpFromHeaders: mockGetClientIpFromHeaders,
}));

const mockGetCustomerSession = mock(() => Promise.resolve(null));
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
}));

import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { GuestTokenMutationConfig } from "@/shared/domain/guest-token-actions/run-guest-mutation";

const { runGuestTokenMutation } =
  await import("@/shared/domain/guest-token-actions/run-guest-mutation");

function baseConfig(): GuestTokenMutationConfig {
  return {
    operation: "testGuestMutation",
    getMaintenanceBlock: mock(() => Promise.resolve(null)),
    cookieName: "guest-test-token",
    turnstileAction: TURNSTILE_ACTIONS.guest_reservation_cancel,
    turnstileToken: "turnstile-token",
    validateTurnstile: mock(() => Promise.resolve({ success: true as const })),
    expectedEntityId: "res-1",
    verifyToken: mock(() => ({
      valid: true as const,
      entityId: "res-1",
    })),
    verifyNow: () => new Date("2026-01-01T00:00:00.000Z"),
    parseEntityId: (entityId: string) =>
      ({ success: true as const, data: entityId }) as const,
    perEntityRateLimiter: {
      check: mock(() =>
        Promise.resolve({
          success: true,
          remaining: 1,
          reset: Date.now() + 60_000,
        }),
      ),
    },
    perEntityRateLimitLogLimiter: "guestCancelPerReservation",
    perEntityRateLimitError: "操作回数の上限に達しました",
    execute: mock(() => Promise.resolve(null)),
  };
}

afterEach(() => {
  mockCookiesGet.mockReset();
  mockCheckActionRateLimit.mockReset();
  mockGetCustomerSession.mockReset();
  mockCheckActionRateLimit.mockImplementation(() =>
    Promise.resolve({ success: true as const }),
  );
  mockGetCustomerSession.mockImplementation(() => Promise.resolve(null));
});

describe("runGuestTokenMutation", () => {
  test("maintenance block があれば execute 前に返す", async () => {
    const config = baseConfig();
    config.getMaintenanceBlock = mock(() =>
      Promise.resolve({ error: "メンテナンス中" }),
    );

    const result = await runGuestTokenMutation(config);
    expect(result).toEqual({ error: "メンテナンス中" });
    expect(config.execute).not.toHaveBeenCalled();
  });

  test("cookie 無し → 無効リンクエラー", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    const config = baseConfig();

    const result = await runGuestTokenMutation(config);
    expect(result).toEqual({
      error: "キャンセルリンクが無効または期限切れです",
    });
    expect(config.execute).not.toHaveBeenCalled();
  });

  test("expectedEntityId 不一致 → stale tab エラー", async () => {
    mockCookiesGet.mockReturnValue({ value: "token-value" });
    const config = baseConfig();
    config.expectedEntityId = "res-other";

    const result = await runGuestTokenMutation(config);
    expect(result).toEqual({
      error:
        "表示中のページが最新ではありません。ページを再読み込みしてから再度お試しください",
    });
    expect(config.execute).not.toHaveBeenCalled();
  });

  test("全 gate 通過 → execute を呼ぶ", async () => {
    mockCookiesGet.mockReturnValue({ value: "token-value" });
    const config = baseConfig();

    const result = await runGuestTokenMutation(config);
    expect(result).toBeNull();
    expect(config.execute).toHaveBeenCalledWith({
      entityId: "res-1",
      token: "token-value",
      sessionUserId: null,
      memberContext: undefined,
    });
  });
});
