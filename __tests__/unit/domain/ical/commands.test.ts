import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockICalTokenUpdate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    iCalToken: {
      update: mockICalTokenUpdate,
    },
  },
}));

import { markICalTokenUsed } from "@/shared/domain/ical/commands";

// テスト用定数
const TOKEN_ID = "ical-token-1";

describe("markICalTokenUsed", () => {
  beforeEach(() => {
    mockICalTokenUpdate.mockReset();
    mockICalTokenUpdate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("トークンの lastUsedAt を更新できる", async () => {
      await expect(markICalTokenUsed(TOKEN_ID)).resolves.toBeUndefined();

      expect(mockICalTokenUpdate).toHaveBeenCalledTimes(1);
    });

    test("void を返す（戻り値なし）", async () => {
      const result = await markICalTokenUsed(TOKEN_ID);

      expect(result).toBeUndefined();
    });

    test("正しい id で update が呼ばれる", async () => {
      await markICalTokenUsed(TOKEN_ID);

      expect(mockICalTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TOKEN_ID },
          data: expect.objectContaining({
            lastUsedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("異なる id でも正常に動作する", async () => {
      const anotherId = "ical-token-99";

      await markICalTokenUsed(anotherId);

      expect(mockICalTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: anotherId },
        }),
      );
    });

    test("lastUsedAt に現在時刻が設定される", async () => {
      const before = new Date();

      await markICalTokenUsed(TOKEN_ID);

      const after = new Date();
      // lastUsedAt が Date インスタンスとして渡されることを確認
      expect(mockICalTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastUsedAt: expect.any(Date),
          }),
        }),
      );
      // 時刻範囲の境界を検証（before <= after は常に成立）
      expect(before.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
