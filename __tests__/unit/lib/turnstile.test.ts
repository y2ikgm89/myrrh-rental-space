/**
 * Turnstile 検証テスト（純粋 lib: context 注入）
 *
 * 公式推奨シグネチャ（remoteip / idempotency_key / expectedAction）に準拠
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { TurnstileVerifyContext } from "@/shared/lib/turnstile";

const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  TURNSTILE_SECRET_KEY: undefined,
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

const originalFetch = globalThis.fetch;
const fetchImpl = Object.assign(
  (_input: Parameters<typeof globalThis.fetch>[0]) =>
    Promise.resolve(new Response()),
  { preconnect: originalFetch.preconnect },
);
const mockFetch = Object.assign(mock(fetchImpl), {
  preconnect: originalFetch.preconnect,
});
beforeEach(() => {
  globalThis.fetch = mockFetch;
  mockServerEnv["NODE_ENV"] = "test";
  mockServerEnv["TURNSTILE_SECRET_KEY"] = undefined;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  mockFetch.mockClear();
});

const DEFAULT_PARAMS = {
  token: "test-token",
  expectedAction: TURNSTILE_ACTIONS.inquiry,
} as const;

function ctx(
  partial: Partial<TurnstileVerifyContext> = {},
): TurnstileVerifyContext {
  return {
    secretKey: partial.secretKey ?? null,
    enabled: partial.enabled ?? Boolean(partial.secretKey),
  };
}

describe("turnstile", () => {
  describe("verifyTurnstileToken", () => {
    test("シークレットキーが未設定の場合は dev で success: true を返す", async () => {
      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(ctx(), DEFAULT_PARAMS);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("トークンが空の場合は missing-input-response エラーを返す", async () => {
      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key" }),
        {
          ...DEFAULT_PARAMS,
          token: "",
        },
      );

      expect(result).toEqual({
        success: false,
        errorCodes: ["missing-input-response"],
      });
    });

    test("注入 secret で siteverify を実行する", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, action: TURNSTILE_ACTIONS.inquiry }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "env-secret-key", enabled: true }),
        DEFAULT_PARAMS,
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          body: expect.stringContaining("env-secret-key"),
        }),
      );
    });

    test("検証成功時は success: true + action/hostname を返す", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            hostname: "example.com",
            action: TURNSTILE_ACTIONS.inquiry,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        {
          ...DEFAULT_PARAMS,
          remoteip: "203.0.113.1",
        },
      );

      expect(result).toMatchObject({
        success: true,
        hostname: "example.com",
        action: TURNSTILE_ACTIONS.inquiry,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    test("action が一致しない場合は action-mismatch エラーを返す", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: TURNSTILE_ACTIONS.reservation,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        DEFAULT_PARAMS,
      );

      expect(result).toEqual({
        success: false,
        errorCodes: ["action-mismatch"],
      });
    });

    test("検証失敗時は error-codes をそのまま返す", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["invalid-input-response"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        {
          ...DEFAULT_PARAMS,
          token: "invalid-token",
        },
      );

      expect(result).toEqual({
        success: false,
        errorCodes: ["invalid-input-response"],
      });
    });

    test("API エラー時は http-<status> を errorCodes に含める", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        DEFAULT_PARAMS,
      );

      expect(result).toEqual({ success: false, errorCodes: ["http-500"] });
    });

    test("レスポンス形式が不正な場合は invalid-response を返す", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        DEFAULT_PARAMS,
      );

      expect(result).toEqual({
        success: false,
        errorCodes: ["invalid-response"],
      });
    });

    test("ネットワークエラー時は network-error を返す", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        DEFAULT_PARAMS,
      );

      expect(result).toEqual({ success: false, errorCodes: ["network-error"] });
    });

    test("remoteip と idempotency_key が siteverify body に含まれる", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, action: TURNSTILE_ACTIONS.inquiry }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      await verifyTurnstileToken(
        ctx({ secretKey: "test-secret-key", enabled: true }),
        {
          ...DEFAULT_PARAMS,
          remoteip: "203.0.113.1",
          idempotencyKey: "test-idempotency-key",
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("203.0.113.1"),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          body: expect.stringContaining("test-idempotency-key"),
        }),
      );
    });
  });

  describe("isTurnstileEnabled", () => {
    test("enabled: true の context では true を返す", async () => {
      const { isTurnstileEnabled } = await import("@/shared/lib/turnstile");
      expect(isTurnstileEnabled(ctx({ enabled: true, secretKey: "x" }))).toBe(
        true,
      );
    });

    test("enabled: false の context では false を返す", async () => {
      const { isTurnstileEnabled } = await import("@/shared/lib/turnstile");
      expect(isTurnstileEnabled(ctx({ enabled: false }))).toBe(false);
    });
  });
});
