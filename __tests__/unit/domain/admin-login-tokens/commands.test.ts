import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockLoginTokenCreate = mock<
  () => Promise<{ token: string; expiresAt: Date }>
>(() =>
  Promise.resolve({
    token: "test-token-abc",
    expiresAt: new Date("2026-04-01T12:00:00Z"),
  }),
);

const mockLoginTokenUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    loginToken: {
      create: mockLoginTokenCreate,
      updateMany: mockLoginTokenUpdateMany,
    },
  },
}));

import {
  createAdminLoginTokenRecord,
  consumeAdminLoginToken,
} from "@/shared/domain/admin-login-tokens/commands";

// テスト用定数
const VALID_TOKEN = "secure-token-xyz-123";
const CREATED_BY = "admin-user-1";
const EXPIRES_AT = new Date("2026-04-01T12:00:00Z");

describe("createAdminLoginTokenRecord", () => {
  beforeEach(() => {
    mockLoginTokenCreate.mockReset();
    mockLoginTokenCreate.mockResolvedValue({
      token: VALID_TOKEN,
      expiresAt: EXPIRES_AT,
    });
  });

  describe("正常系", () => {
    test("有効なトークンレコードを作成して token と expiresAt を返す", async () => {
      const result = await createAdminLoginTokenRecord({
        token: VALID_TOKEN,
        createdBy: CREATED_BY,
        expiresAt: EXPIRES_AT,
      });

      expect(result).toEqual({ token: VALID_TOKEN, expiresAt: EXPIRES_AT });
      expect(mockLoginTokenCreate).toHaveBeenCalledTimes(1);
    });

    test("prisma.loginToken.create に正しいデータが渡される", async () => {
      await createAdminLoginTokenRecord({
        token: VALID_TOKEN,
        createdBy: CREATED_BY,
        expiresAt: EXPIRES_AT,
      });

      expect(mockLoginTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            token: VALID_TOKEN,
            createdBy: CREATED_BY,
            expiresAt: EXPIRES_AT,
          },
          select: {
            token: true,
            expiresAt: true,
          },
        }),
      );
    });

    test("異なる createdBy でトークンを作成できる", async () => {
      const anotherAdmin = "another-admin-2";
      mockLoginTokenCreate.mockResolvedValueOnce({
        token: "another-token",
        expiresAt: EXPIRES_AT,
      });

      const result = await createAdminLoginTokenRecord({
        token: "another-token",
        createdBy: anotherAdmin,
        expiresAt: EXPIRES_AT,
      });

      expect(result.token).toBe("another-token");
      expect(mockLoginTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: anotherAdmin }),
        }),
      );
    });
  });
});

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
