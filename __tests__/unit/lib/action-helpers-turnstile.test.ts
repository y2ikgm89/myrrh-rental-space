import { afterEach, describe, expect, mock, test } from "bun:test";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

mock.module("server-only", () => ({}));

const mockIsTurnstileEnabled = mock(() => Promise.resolve(false));
const mockVerifyTurnstileToken = mock(() =>
  Promise.resolve({ success: true as const }),
);
const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
  // isLocalhostUrl は e2e-runtime.ts が env/server から import する transitive dep。
  // rate-limit.ts → e2e-runtime.ts → env/server の chain で必要になる。
  // このテスト環境では E2E bypass を発動させないため常に false を返す。
  isLocalhostUrl: () => false,
}));

mock.module("@/shared/lib/turnstile", () => ({
  isTurnstileEnabled: mockIsTurnstileEnabled,
  verifyTurnstileToken: mockVerifyTurnstileToken,
}));

const { validateTurnstile } = await import("@/shared/lib/action-helpers");

afterEach(() => {
  mockIsTurnstileEnabled.mockClear();
  mockVerifyTurnstileToken.mockClear();
  mockServerEnv["NODE_ENV"] = "test";
});

describe("validateTurnstile", () => {
  test("development/test では Turnstile 無効設定を dev-friendly にスキップできる", async () => {
    mockServerEnv["NODE_ENV"] = "test";
    mockIsTurnstileEnabled.mockResolvedValueOnce(false);

    await expect(
      validateTurnstile({
        token: undefined,
        expectedAction: TURNSTILE_ACTIONS.inquiry,
      }),
    ).resolves.toEqual({ success: true });

    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
  });

  test("production では Turnstile 無効設定でも token 未検証を成功扱いにしない", async () => {
    mockServerEnv["NODE_ENV"] = "production";
    mockIsTurnstileEnabled.mockResolvedValueOnce(false);

    await expect(
      validateTurnstile({
        token: undefined,
        expectedAction: TURNSTILE_ACTIONS.inquiry,
      }),
    ).resolves.toEqual({
      success: false,
      error: "セキュリティ検証が必要です。ページを再読み込みしてください。",
    });

    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
  });
});
