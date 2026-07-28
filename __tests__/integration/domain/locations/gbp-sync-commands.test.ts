/**
 * `gbp-sync-commands.ts` の統合テスト。
 *
 * - `toggleLocationGbpSyncCommand` が enabled / disabled で error クリア挙動を切り替えるか
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockLocationUpdate = mock<
  (args: {
    where: { id: string };
    data: Record<string, unknown>;
    select?: Record<string, boolean>;
  }) => Promise<{ id: string; gbpSyncEnabled: boolean }>
>(() => Promise.resolve({ id: "loc-1", gbpSyncEnabled: true }));

const mockLocationFindUnique = mock<
  (args: { where: { id: string; isActive: boolean } }) => Promise<{
    id: string;
    _count: { spaces: number };
  } | null>
>((args) => Promise.resolve({ id: args.where.id, _count: { spaces: 0 } }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      update: (args: {
        where: { id: string };
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => mockLocationUpdate(args),
      findUnique: (args: { where: { id: string; isActive: boolean } }) =>
        mockLocationFindUnique(args),
    },
  },
}));

// 3. テスト対象を import（モック適用後）
import { toggleLocationGbpSyncCommand } from "@/shared/domain/locations/gbp-sync-commands";

describe("gbp-sync-commands", () => {
  beforeEach(() => {
    mockLocationUpdate.mockClear();
    mockLocationFindUnique.mockClear();
  });

  describe("toggleLocationGbpSyncCommand", () => {
    test("enabled: false のとき gbpSyncError を null にクリアする", async () => {
      mockLocationUpdate.mockResolvedValueOnce({
        id: "loc-1",
        gbpSyncEnabled: false,
      });

      const result = await toggleLocationGbpSyncCommand({
        locationId: "loc-1",
        enabled: false,
      });

      expect(mockLocationUpdate).toHaveBeenCalledTimes(1);
      expect(mockLocationUpdate).toHaveBeenCalledWith({
        where: { id: "loc-1" },
        data: { gbpSyncEnabled: false, gbpSyncError: null },
        select: { id: true, gbpSyncEnabled: true },
      });
      expect(result).toEqual({ id: "loc-1", gbpSyncEnabled: false });
    });

    test("enabled: true のとき既存の gbpSyncError を保持する（クリアしない）", async () => {
      mockLocationUpdate.mockResolvedValueOnce({
        id: "loc-2",
        gbpSyncEnabled: true,
      });

      const result = await toggleLocationGbpSyncCommand({
        locationId: "loc-2",
        enabled: true,
      });

      expect(mockLocationUpdate).toHaveBeenCalledTimes(1);
      expect(mockLocationUpdate).toHaveBeenCalledWith({
        where: { id: "loc-2" },
        data: { gbpSyncEnabled: true },
        select: { id: true, gbpSyncEnabled: true },
      });
      expect(result).toEqual({ id: "loc-2", gbpSyncEnabled: true });
    });

    test("存在しない / 論理削除済み locationId は NOT_FOUND エラーをスローし update を呼ばない", async () => {
      mockLocationFindUnique.mockResolvedValueOnce(null);

      await expect(
        toggleLocationGbpSyncCommand({
          locationId: "loc-gone",
          enabled: true,
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "場所が見つかりません",
      });

      expect(mockLocationUpdate).not.toHaveBeenCalled();
    });

    test("update の前に active な場所として存在確認する", async () => {
      await toggleLocationGbpSyncCommand({
        locationId: "loc-3",
        enabled: true,
      });

      expect(mockLocationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "loc-3", isActive: true },
        }),
      );
    });
  });
});
