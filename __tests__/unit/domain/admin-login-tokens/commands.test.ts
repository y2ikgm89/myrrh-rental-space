import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockLoginTokenUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    loginToken: {
      updateMany: mockLoginTokenUpdateMany,
    },
  },
}));

import { consumeAdminLoginToken } from "@/shared/domain/admin-login-tokens/commands";

// テスト用定数
const VALID_TOKEN = "secure-token-xyz-123";

describe("consumeAdminLoginToken", () => {
  beforeEach(() => {
    mockLoginTokenUpdateMany.mockReset();
    mockLoginTokenUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("正常系", () => {
    test("有効なトークンを消費すると true を返す", async () => {
      mockLoginTokenUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await consumeAdminLoginToken(VALID_TOKEN);

      expect(result).toBe(true);
    });

    test("updateMany が count: 0 を返す場合は false を返す", async () => {
      mockLoginTokenUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await consumeAdminLoginToken(VALID_TOKEN);

      expect(result).toBe(false);
    });

    test("usedAt を指定してトークンを消費できる", async () => {
      const usedAt = new Date("2026-03-31T10:00:00Z");
      mockLoginTokenUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await consumeAdminLoginToken(VALID_TOKEN, usedAt);

      expect(result).toBe(true);
      expect(mockLoginTokenUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            token: VALID_TOKEN,
            usedAt: null,
            expiresAt: { gt: usedAt },
          }),
          data: { usedAt },
        }),
      );
    });

    test("usedAt を省略した場合も正常に動作する（デフォルト: new Date()）", async () => {
      mockLoginTokenUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await consumeAdminLoginToken(VALID_TOKEN);

      expect(result).toBe(true);
      expect(mockLoginTokenUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            token: VALID_TOKEN,
            usedAt: null,
          }),
        }),
      );
    });
  });

  describe("エッジケース", () => {
    test("既に消費済みのトークン（count: 0）は false を返す", async () => {
      mockLoginTokenUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await consumeAdminLoginToken("already-used-token");

      expect(result).toBe(false);
    });

    test("存在しないトークン（count: 0）は false を返す", async () => {
      mockLoginTokenUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await consumeAdminLoginToken("non-existent-token");

      expect(result).toBe(false);
    });
  });
});
