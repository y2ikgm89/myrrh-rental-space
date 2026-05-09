/**
 * `gbp-sync-commands.ts` の統合テスト。
 *
 * - `syncLocationToGbpCommand` が `syncLocationToGbp` に delegate するか
 * - `toggleLocationGbpSyncCommand` が enabled / disabled で error クリア挙動を切り替えるか
 *
 * `@/shared/lib/google-business-profile` は全 export を stub 化する
 * （cloudflare 全 stub テンプレ準拠、partial mock は batch pollution の silent bug）。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

import type {
  GbpSyncInput,
  GbpSyncResult,
} from "@/shared/lib/google-business-profile";

// 1. モック関数を先に定義
const mockSyncLocationToGbp = mock<
  (input: GbpSyncInput) => Promise<GbpSyncResult>
>(() =>
  Promise.resolve({
    locationId: "loc-1",
    syncedAt: new Date("2026-04-28T00:00:00.000Z"),
  }),
);

const mockLocationUpdate = mock<
  (args: {
    where: { id: string };
    data: Record<string, unknown>;
    select?: Record<string, boolean>;
  }) => Promise<{ id: string; gbpSyncEnabled: boolean }>
>(() => Promise.resolve({ id: "loc-1", gbpSyncEnabled: true }));

// 2. モジュールを差し替え（import より前）
mock.module("@/shared/lib/google-business-profile", () => ({
  // 全 export を stub 化（partial mock の batch pollution 防止）
  syncLocationToGbp: (input: GbpSyncInput) => mockSyncLocationToGbp(input),
  getGbpAuthState: mock(() => Promise.resolve(null)),
  saveGbpAuthState: mock(() => Promise.resolve()),
  clearGbpAuthState: mock(() => Promise.resolve()),
  listGbpAccounts: mock(() => Promise.resolve([])),
  getGbpAuthorizeUrl: mock(() => "https://example.com/authorize"),
  exchangeGbpAuthCode: mock(() =>
    Promise.resolve({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 0,
    }),
  ),
  revokeGbpToken: mock(() => Promise.resolve()),
  createOAuth2Client: mock(() => null),
  getGbpClient: mock(() => Promise.resolve(null)),
  GBP_SCOPES: [] as readonly string[],
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      update: (args: {
        where: { id: string };
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => mockLocationUpdate(args),
    },
  },
}));

// 3. テスト対象を import（モック適用後）
import {
  syncLocationToGbpCommand,
  toggleLocationGbpSyncCommand,
} from "@/shared/domain/locations/gbp-sync-commands";

describe("gbp-sync-commands", () => {
  beforeEach(() => {
    mockSyncLocationToGbp.mockClear();
    mockLocationUpdate.mockClear();
  });

  describe("syncLocationToGbpCommand", () => {
    test("syncLocationToGbp に locationId を委譲する", async () => {
      const syncedAt = new Date("2026-04-28T01:23:45.000Z");
      mockSyncLocationToGbp.mockResolvedValueOnce({
        locationId: "loc-42",
        syncedAt,
      });

      const result = await syncLocationToGbpCommand({ locationId: "loc-42" });

      expect(mockSyncLocationToGbp).toHaveBeenCalledTimes(1);
      expect(mockSyncLocationToGbp).toHaveBeenCalledWith({
        locationId: "loc-42",
      });
      expect(result).toEqual({ locationId: "loc-42", syncedAt });
    });
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
  });
});
