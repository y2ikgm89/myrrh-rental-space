import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockAccountUpdate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    account: {
      update: mockAccountUpdate,
    },
  },
}));

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: (obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  },
}));

import { updateGoogleOAuthAccountTokens } from "@/shared/domain/auth/commands";

// テスト用定数
const ACCOUNT_ID = "account-1";
const ACCESS_TOKEN = "new-access-token-xyz";
const REFRESH_TOKEN = "new-refresh-token-abc";
const EXPIRY_DATE = Date.now() + 3600 * 1000; // 1時間後

describe("updateGoogleOAuthAccountTokens", () => {
  beforeEach(() => {
    mockAccountUpdate.mockReset();
    mockAccountUpdate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("accessToken のみで更新できる（必須フィールド）", async () => {
      await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
      });

      expect(mockAccountUpdate).toHaveBeenCalledTimes(1);
      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ACCOUNT_ID },
          data: expect.objectContaining({
            accessToken: ACCESS_TOKEN,
          }),
        }),
      );
    });

    test("refreshToken を含めて更新できる", async () => {
      await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
      });

      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessToken: ACCESS_TOKEN,
            refreshToken: REFRESH_TOKEN,
          }),
        }),
      );
    });

    test("expiryDate を含めると accessTokenExpiresAt が Date に変換される", async () => {
      await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
        expiryDate: EXPIRY_DATE,
      });

      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessToken: ACCESS_TOKEN,
            accessTokenExpiresAt: new Date(EXPIRY_DATE),
          }),
        }),
      );
    });

    test("全フィールドを指定して更新できる", async () => {
      await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        expiryDate: EXPIRY_DATE,
      });

      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ACCOUNT_ID },
          data: expect.objectContaining({
            accessToken: ACCESS_TOKEN,
            refreshToken: REFRESH_TOKEN,
            accessTokenExpiresAt: new Date(EXPIRY_DATE),
          }),
        }),
      );
    });

    test("void を返す（戻り値なし）", async () => {
      const result = await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
      });

      expect(result).toBeUndefined();
    });
  });

  describe("エッジケース", () => {
    test("refreshToken が null の場合は data から省かれる（omitUndefined）", async () => {
      await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
        refreshToken: null,
      });

      // refreshToken: null は ?? undefined で undefined に変換され omitUndefined で除去される
      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            refreshToken: expect.anything(),
          }),
        }),
      );
    });

    test("expiryDate が undefined の場合 accessTokenExpiresAt は省かれる", async () => {
      await updateGoogleOAuthAccountTokens({
        accountId: ACCOUNT_ID,
        accessToken: ACCESS_TOKEN,
      });

      expect(mockAccountUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            accessTokenExpiresAt: expect.anything(),
          }),
        }),
      );
    });
  });
});
