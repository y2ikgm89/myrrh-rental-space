import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockSettingsUpsert = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockSettingsUpdate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockSettingsUpdateMany = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockInstagramPostCreate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockInstagramPostFindUnique = mock<() => Promise<{ id: string } | null>>(
  () => Promise.resolve(null),
);
const mockInstagramPostDelete = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockInstagramPostDeleteMany = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockInstagramPostAggregate = mock<
  () => Promise<{ _max: { sortOrder: number | null } }>
>(() => Promise.resolve({ _max: { sortOrder: null } }));
const mockInstagramPostUpdate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockTransaction = mock((updates: Promise<void>[]) =>
  Promise.all(updates),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      upsert: mockSettingsUpsert,
      update: mockSettingsUpdate,
      updateMany: mockSettingsUpdateMany,
    },
    instagramPost: {
      create: mockInstagramPostCreate,
      findUnique: mockInstagramPostFindUnique,
      delete: mockInstagramPostDelete,
      deleteMany: mockInstagramPostDeleteMany,
      aggregate: mockInstagramPostAggregate,
      update: mockInstagramPostUpdate,
    },
    $transaction: mockTransaction,
  },
}));

// enums モック
mock.module("@generated/prisma/enums", () => ({
  InstagramMediaType: {
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL_ALBUM: "CAROUSEL_ALBUM",
  },
}));

// encrypt モック
mock.module("@/shared/lib/crypto", () => ({
  encrypt: mock<(value: string, opts: { purpose: string }) => string>(
    (value) => `encrypted:${value}`,
  ),
}));

// testInstagramConnection モック
const mockTestInstagramConnection = mock<
  () => Promise<{
    success: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
  }>
>(() =>
  Promise.resolve({
    success: true,
    metadata: {
      userId: "ig-user-123",
      username: "test_account",
      accountType: "PERSONAL",
    },
  }),
);

mock.module("@/shared/lib/instagram", () => ({
  testInstagramConnection: mockTestInstagramConnection,
}));

// validations/instagram モック
mock.module("@/shared/lib/validations/instagram", () => ({
  extractInstagramShortcode: (url: string) => {
    const match = url.match(/instagram\.com\/(p|reel)\/([\w-]+)/);
    return match?.[2] ?? null;
  },
}));

import {
  saveInstagramToken,
  connectInstagramOAuthAccount,
  refreshInstagramAccessToken,
  disconnectInstagram,
} from "@/shared/domain/instagram/commands";

// テスト用定数
const VALID_TOKEN = "IGQV_valid_access_token_that_is_long_enough_for_testing";

describe("saveInstagramToken", () => {
  beforeEach(() => {
    mockTestInstagramConnection.mockReset();
    mockSettingsUpsert.mockReset();
    mockTestInstagramConnection.mockResolvedValue({
      success: true,
      metadata: {
        userId: "ig-user-123",
        username: "test_account",
        accountType: "PERSONAL",
      },
    });
    mockSettingsUpsert.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("有効なトークンで接続成功し username を返す", async () => {
      const result = await saveInstagramToken(VALID_TOKEN);

      expect(result).toMatchObject({ username: "test_account" });
    });

    test("upsert に暗号化済みトークンが渡される", async () => {
      await saveInstagramToken(VALID_TOKEN);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            instagramAccessToken: `encrypted:${VALID_TOKEN}`,
          }),
        }),
      );
    });

    test("metadata に username がない場合 undefined を返す", async () => {
      mockTestInstagramConnection.mockResolvedValueOnce({
        success: true,
        metadata: {},
      });

      const result = await saveInstagramToken(VALID_TOKEN);

      expect(result).toMatchObject({ username: undefined });
    });
  });

  describe("異常系", () => {
    test("接続テスト失敗は DomainError をスローする", async () => {
      mockTestInstagramConnection.mockResolvedValueOnce({
        success: false,
        error: "無効なトークンです",
      });

      await expect(saveInstagramToken(VALID_TOKEN)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "無効なトークンです",
      });

      expect(mockSettingsUpsert).not.toHaveBeenCalled();
    });

    test("接続テスト失敗でエラーメッセージがない場合デフォルトメッセージになる", async () => {
      mockTestInstagramConnection.mockResolvedValueOnce({
        success: false,
      });

      await expect(saveInstagramToken(VALID_TOKEN)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "接続テストに失敗しました",
      });
    });
  });
});

describe("connectInstagramOAuthAccount", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("有効な OAuth トークンで設定を保存できる", async () => {
      await expect(
        connectInstagramOAuthAccount({
          accessToken: "oauth-access-token",
          expiresIn: 3600,
          userId: "ig-user-1",
          username: "my_account",
          accountType: "PERSONAL",
        }),
      ).resolves.toBeUndefined();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("暗号化済みトークンが upsert に渡される", async () => {
      await connectInstagramOAuthAccount({
        accessToken: "oauth-token-xyz",
        expiresIn: 7200,
        userId: "ig-user-1",
        username: "my_account",
        accountType: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            instagramAccessToken: "encrypted:oauth-token-xyz",
            instagramUserId: "ig-user-1",
            instagramUsername: "my_account",
            instagramAccountType: null,
          }),
        }),
      );
    });
  });
});

describe("refreshInstagramAccessToken", () => {
  beforeEach(() => {
    mockSettingsUpdateMany.mockReset();
    mockSettingsUpdateMany.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("新しいアクセストークンで全 settings を更新できる", async () => {
      const expiresAt = new Date("2026-06-01T00:00:00Z");

      await expect(
        refreshInstagramAccessToken({
          accessToken: "new-access-token",
          expiresAt,
        }),
      ).resolves.toBeUndefined();

      expect(mockSettingsUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            instagramAccessToken: "encrypted:new-access-token",
            instagramTokenExpiresAt: expiresAt,
          },
        }),
      );
    });
  });
});

describe("disconnectInstagram", () => {
  beforeEach(() => {
    mockSettingsUpdate.mockReset();
    mockInstagramPostDeleteMany.mockReset();
    mockSettingsUpdate.mockResolvedValue(undefined);
    mockInstagramPostDeleteMany.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("Instagram 連携を切断して投稿を削除できる", async () => {
      await expect(disconnectInstagram()).resolves.toBeUndefined();

      expect(mockSettingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          data: {
            instagramAccessToken: null,
            instagramTokenExpiresAt: null,
            instagramUserId: null,
            instagramUsername: null,
            instagramAccountType: null,
          },
        }),
      );
      expect(mockInstagramPostDeleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
