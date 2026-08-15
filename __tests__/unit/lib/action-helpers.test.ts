/**
 * Server Action ヘルパー関数テスト
 */

import { describe, test, expect, mock } from "bun:test";
import { z } from "zod";
import {
  checkBotHeuristics,
  checkEmailRateLimit,
  extractFieldErrors,
  isTransientError,
  withRetry,
} from "@/shared/lib/action-helpers";
import { createFormRenderToken } from "@/shared/lib/tokens/form-render-token";

describe("action-helpers", () => {
  describe("extractFieldErrors", () => {
    test("ZodErrorからフィールドエラーを抽出する", () => {
      const schema = z.object({
        name: z.string().min(1, { error: "名前は必須です" }),
        email: z
          .string()
          .email({ error: "有効なメールアドレスを入力してください" }),
      });

      const result = schema.safeParse({ name: "", email: "invalid" });
      if (result.success) throw new Error("Should have failed");

      const fieldErrors = extractFieldErrors(result.error);

      expect(fieldErrors["name"]).toContain("名前は必須です");
      expect(fieldErrors["email"]).toContain(
        "有効なメールアドレスを入力してください",
      );
    });

    test("複数のエラーを持つフィールドを処理する", () => {
      const schema = z.object({
        password: z
          .string()
          .min(8, { error: "8文字以上必要です" })
          .regex(/[A-Z]/, { error: "大文字を含める必要があります" }),
      });

      const result = schema.safeParse({ password: "short" });
      if (result.success) throw new Error("Should have failed");

      const fieldErrors = extractFieldErrors(result.error);

      expect(fieldErrors["password"]).toHaveLength(2);
      expect(fieldErrors["password"]).toContain("8文字以上必要です");
      expect(fieldErrors["password"]).toContain("大文字を含める必要があります");
    });

    test("ネストされたパスはトップレベルフィールドのみ抽出する", () => {
      const schema = z.object({
        address: z.object({
          city: z.string().min(1, { error: "市区町村は必須です" }),
        }),
      });

      const result = schema.safeParse({ address: { city: "" } });
      if (result.success) throw new Error("Should have failed");

      const fieldErrors = extractFieldErrors(result.error);

      expect(fieldErrors["address"]).toBeDefined();
    });
  });

  describe("isTransientError", () => {
    test("接続エラーはtrueを返す", () => {
      expect(isTransientError(new Error("Connection refused"))).toBe(true);
      expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
      expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    });

    test("タイムアウトエラーはtrueを返す", () => {
      expect(isTransientError(new Error("Request timeout"))).toBe(true);
      expect(isTransientError(new Error("Connection timeout"))).toBe(true);
    });

    test("ネットワークエラーはtrueを返す", () => {
      expect(isTransientError(new Error("Network error"))).toBe(true);
      expect(isTransientError(new Error("Socket closed"))).toBe(true);
    });

    test("データベース接続エラーはtrueを返す", () => {
      expect(isTransientError(new Error("Too many connections"))).toBe(true);
      expect(isTransientError(new Error("Deadlock detected"))).toBe(true);
    });

    test("通常のエラーはfalseを返す", () => {
      expect(isTransientError(new Error("Validation failed"))).toBe(false);
      expect(isTransientError(new Error("Not found"))).toBe(false);
      expect(isTransientError(new Error("Permission denied"))).toBe(false);
    });

    test("Error以外はfalseを返す", () => {
      expect(isTransientError("string error")).toBe(false);
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
      expect(isTransientError({ message: "connection error" })).toBe(false);
    });
  });

  describe("checkBotHeuristics", () => {
    /**
     * `msAgo` ミリ秒前にサーバーが発行したトークンを作る。
     *
     * **クライアントの時計は一切登場しない**（監査 F-71）。旧実装は
     * 「サーバー時刻 − クライアント時刻」を見ており、端末の時計が進んでいる
     * 利用者は実際に 2 分かけて入力しても必ず bot 判定で拒否されていた。
     */
    function tokenIssuedMsAgo(msAgo: number): string {
      const originalNow = Date.now;
      Date.now = () => originalNow() - msAgo;
      try {
        return createFormRenderToken();
      } finally {
        Date.now = originalNow;
      }
    }

    test("honeypot空 + トークンが十分過去 → success", () => {
      const result = checkBotHeuristics({
        honeypot: "",
        formRenderToken: tokenIssuedMsAgo(10_000),
      });
      expect(result).toEqual({ success: true });
    });

    test("honeypotが未入力(undefined) + トークン未指定 → failure（欠落を fail-open しない）", () => {
      const result = checkBotHeuristics({
        honeypot: undefined,
        formRenderToken: undefined,
      });
      expect(result.success).toBe(false);
    });

    test("honeypotに値が入っている → bot判定でfailure", () => {
      const result = checkBotHeuristics({
        honeypot: "http://spam.example.com",
        formRenderToken: tokenIssuedMsAgo(10_000),
      });
      expect(result.success).toBe(false);
    });

    test("トークン発行から3秒未満での送信 → bot判定でfailure", () => {
      const result = checkBotHeuristics({
        honeypot: "",
        formRenderToken: tokenIssuedMsAgo(500),
      });
      expect(result.success).toBe(false);
    });

    test("トークン発行がちょうど3秒以上前 → success", () => {
      const result = checkBotHeuristics({
        honeypot: "",
        formRenderToken: tokenIssuedMsAgo(3_000),
      });
      expect(result.success).toBe(true);
    });

    test("復号できないトークンは判定不能として通す（bot 扱いにしない）", () => {
      // 鍵ローテーション直後や壊れた値で、正当な利用者を締め出さない。
      // 時間トラップの目的は「速すぎる送信を弾く」ことで、判定できない送信を
      // 弾くことではない（監査 F-71）。
      expect(
        checkBotHeuristics({ honeypot: "", formRenderToken: "not-a-token" }),
      ).toEqual({ success: true });
    });

    test("honeypotとtimingの両方に問題があっても同じエラーメッセージを返す(理由を開示しない)", () => {
      const honeypotResult = checkBotHeuristics({
        honeypot: "filled",
        formRenderToken: tokenIssuedMsAgo(10_000),
      });
      const timingResult = checkBotHeuristics({
        honeypot: "",
        formRenderToken: tokenIssuedMsAgo(0),
      });
      expect(honeypotResult.success).toBe(false);
      expect(timingResult.success).toBe(false);
      if (!honeypotResult.success && !timingResult.success) {
        expect(honeypotResult.error).toBe(timingResult.error);
      }
    });
  });

  describe("checkEmailRateLimit", () => {
    test("制限内なら success", async () => {
      const mockLimiter = {
        check: mock(() => Promise.resolve({ success: true })),
      };
      const result = await checkEmailRateLimit(mockLimiter, "taro@example.com");
      expect(result).toEqual({ success: true });
    });

    test("制限超過時はエラーメッセージを返す", async () => {
      const mockLimiter = {
        check: mock(() => Promise.resolve({ success: false })),
      };
      const result = await checkEmailRateLimit(mockLimiter, "taro@example.com");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("リクエストが多すぎます");
      }
    });

    test("emailはnormalizeEmailForIdentityで正規化してtokenに使う", async () => {
      const mockLimiter = {
        check: mock(() => Promise.resolve({ success: true })),
      };
      await checkEmailRateLimit(mockLimiter, "  Taro@EXAMPLE.com  ");
      expect(mockLimiter.check).toHaveBeenCalledWith("taro@example.com");
    });
  });

  describe("withRetry", () => {
    test("成功した場合は結果を返す", async () => {
      const fn = mock(() => Promise.resolve("success"));

      const result = await withRetry(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("一時的なエラーをリトライする", async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error("Connection error"));
        }
        return Promise.resolve("success");
      });

      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 1 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("最大リトライ回数を超えるとエラーをスローする", async () => {
      const fn = mock(() => Promise.reject(new Error("Always fails")));

      await expect(
        withRetry(fn, { maxRetries: 2, initialDelayMs: 1 }),
      ).rejects.toThrow("Always fails");

      expect(fn).toHaveBeenCalledTimes(3); // 初回 + 2回リトライ
    });

    test("shouldRetryがfalseを返すとリトライしない", async () => {
      const fn = mock(() => Promise.reject(new Error("Not retryable")));

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 1,
          shouldRetry: () => false,
        }),
      ).rejects.toThrow("Not retryable");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("isTransientErrorと組み合わせて使用できる", async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error("Connection timeout"));
        }
        if (attempts === 2) {
          return Promise.reject(new Error("Validation error"));
        }
        return Promise.resolve("success");
      });

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 1,
          shouldRetry: isTransientError,
        }),
      ).rejects.toThrow("Validation error");

      // 1回目: connection timeout (リトライ対象)
      // 2回目: validation error (リトライ対象外) -> 即座にスロー
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
