/**
 * Turnstile 検証テスト
 *
 * 公式推奨シグネチャ（remoteip / idempotency_key / expectedAction）に準拠
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// モック用prismaクライアント（mock.module より前に定義してTDZを回避）
const mockPrismaClient = {
  settings: {
    findUnique: mock<() => Promise<Record<string, string | null> | null>>(() =>
      Promise.resolve(null),
    ),
  },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: mockPrismaClient,
}));

mock.module("@/shared/lib/crypto", () => ({
  encrypt: (value: string) => `v1:generic:iv:${value}:tag`,
  decrypt: (value: string) => value,
  isEncrypted: (_value: string) => true,
  safeEncrypt: (value: string) => `v1:generic:iv:${value}:tag`,
  safeDecrypt: (value: string) => value,
  encryptApiKey: (value: string) => `v1:api-key:iv:${value}:tag`,
  encryptStripeData: (value: string) => `v1:stripe:iv:${value}:tag`,
}));

const mockFetch = mock(() => Promise.resolve(new Response()));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockPrismaClient.settings.findUnique.mockClear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  mockFetch.mockClear();
});

const DEFAULT_PARAMS = {
  token: "test-token",
  expectedAction: TURNSTILE_ACTIONS.inquiry,
} as const;

describe("turnstile", () => {
  describe("verifyTurnstileToken", () => {
    test("シークレットキーが未設定の場合は dev で success: true を返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce(null);

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(DEFAULT_PARAMS);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("シークレットキーが空の場合は dev で success: true を返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: null,
      });

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(DEFAULT_PARAMS);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("トークンが空の場合は missing-input-response エラーを返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken({
        ...DEFAULT_PARAMS,
        token: "",
      });

      expect(result).toEqual({
        success: false,
        errorCodes: ["missing-input-response"],
      });
    });

    test("検証成功時は success: true + action/hostname を返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

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
      const result = await verifyTurnstileToken({
        ...DEFAULT_PARAMS,
        remoteip: "203.0.113.1",
      });

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
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

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
      const result = await verifyTurnstileToken(DEFAULT_PARAMS);

      expect(result).toEqual({
        success: false,
        errorCodes: ["action-mismatch"],
      });
    });

    test("検証失敗時は error-codes をそのまま返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

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
      const result = await verifyTurnstileToken({
        ...DEFAULT_PARAMS,
        token: "invalid-token",
      });

      expect(result).toEqual({
        success: false,
        errorCodes: ["invalid-input-response"],
      });
    });

    test("API エラー時は http-<status> を errorCodes に含める", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

      mockFetch.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(DEFAULT_PARAMS);

      expect(result).toEqual({ success: false, errorCodes: ["http-500"] });
    });

    test("ネットワークエラー時は network-error を返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      const result = await verifyTurnstileToken(DEFAULT_PARAMS);

      expect(result).toEqual({ success: false, errorCodes: ["network-error"] });
    });

    test("remoteip と idempotency_key が siteverify body に含まれる", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSecretKey: "test-secret-key",
      });

      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, action: TURNSTILE_ACTIONS.inquiry }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const { verifyTurnstileToken } = await import("@/shared/lib/turnstile");
      await verifyTurnstileToken({
        ...DEFAULT_PARAMS,
        remoteip: "203.0.113.1",
        idempotencyKey: "test-idempotency-key",
      });

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
    test("両方のキーが設定されている場合はtrueを返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSiteKey: "site-key",
        turnstileSecretKey: "secret-key",
      });

      const { isTurnstileEnabled } = await import("@/shared/lib/turnstile");
      const result = await isTurnstileEnabled();

      expect(result).toBe(true);
    });

    test("設定が存在しない場合はfalseを返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce(null);

      const { isTurnstileEnabled } = await import("@/shared/lib/turnstile");
      const result = await isTurnstileEnabled();

      expect(result).toBe(false);
    });

    test("サイトキーが未設定の場合はfalseを返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSiteKey: null,
        turnstileSecretKey: "secret-key",
      });

      const { isTurnstileEnabled } = await import("@/shared/lib/turnstile");
      const result = await isTurnstileEnabled();

      expect(result).toBe(false);
    });

    test("シークレットキーが未設定の場合はfalseを返す", async () => {
      mockPrismaClient.settings.findUnique.mockResolvedValueOnce({
        turnstileSiteKey: "site-key",
        turnstileSecretKey: null,
      });

      const { isTurnstileEnabled } = await import("@/shared/lib/turnstile");
      const result = await isTurnstileEnabled();

      expect(result).toBe(false);
    });
  });
});
