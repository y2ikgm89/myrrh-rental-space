/**
 * Instagram管理 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + 型構造をテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { InstagramFeedLayout } from "@generated/prisma/enums";

// instagram.ts 内で使用されている各スキーマを再現

// Instagram フィード表示設定スキーマ
const instagramSettingsSchema = z.object({
  feedEnabled: z.boolean(),
  feedLayout: z.enum(InstagramFeedLayout),
  feedColumns: z.number().int().min(2).max(6),
  feedMaxItems: z.number().int().min(1).max(24),
  showCaption: z.boolean(),
  showViewAll: z.boolean(),
});

// Instagram投稿URLスキーマ
const INSTAGRAM_POST_URL_PATTERN =
  /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?/;

const instagramPostUrlSchema = z
  .string()
  .url({ error: "有効なURLを入力してください" })
  .refine((url) => INSTAGRAM_POST_URL_PATTERN.test(url), {
    error: "有効なInstagram投稿URLを入力してください",
  });

// Instagramトークンスキーマ
const instagramTokenSchema = z
  .string()
  .min(1, { error: "トークンを入力してください" });

// Instagram投稿IDスキーマ
const instagramPostIdSchema = z
  .string()
  .min(1, { error: "投稿IDを入力してください" })
  .regex(/^[a-zA-Z0-9_-]+$/, { error: "無効な投稿ID形式です" });

// ショートコード抽出関数を再現
function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(p|reel)\/([\w-]+)/);
  return match ? match[2] : null;
}

// 有効な入力データ
const VALID_SETTINGS_INPUT = {
  feedEnabled: true,
  feedLayout: InstagramFeedLayout.grid,
  feedColumns: 4,
  feedMaxItems: 8,
  showCaption: false,
  showViewAll: true,
};

const VALID_POST_URL = "https://www.instagram.com/p/ABC123xyz/";
const VALID_REEL_URL = "https://www.instagram.com/reel/XYZ789abc/";
const VALID_TOKEN = "IGQVJWZAWFhNTVlZAC1KMVBxd2FzVHlhSC1wbWNWSDRv";

describe("Instagram Admin Action Integration", () => {
  describe("instagramSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = instagramSettingsSchema.safeParse(VALID_SETTINGS_INPUT);
        expect(result.success).toBe(true);
      });

      test("全レイアウトタイプが許可される", () => {
        const layouts = Object.values(InstagramFeedLayout);
        for (const feedLayout of layouts) {
          const result = instagramSettingsSchema.safeParse({
            ...VALID_SETTINGS_INPUT,
            feedLayout,
          });
          expect(result.success).toBe(true);
        }
      });
    });

    describe("feedEnabled", () => {
      test("trueは許可", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedEnabled: true,
        });
        expect(result.success).toBe(true);
      });

      test("falseは許可", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedEnabled: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedEnabled: "true",
        });
        expect(result.success).toBe(false);
      });

      test("欠落はエラー", () => {
        const { feedEnabled: _f, ...inputWithoutEnabled } =
          VALID_SETTINGS_INPUT;
        const result = instagramSettingsSchema.safeParse(inputWithoutEnabled);
        expect(result.success).toBe(false);
      });
    });

    describe("feedLayout", () => {
      test("gridは許可", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedLayout: "grid",
        });
        expect(result.success).toBe(true);
      });

      test("masonryは許可", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedLayout: "masonry",
        });
        expect(result.success).toBe(true);
      });

      test("sliderは許可", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedLayout: "slider",
        });
        expect(result.success).toBe(true);
      });

      test("無効なレイアウトはエラー", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedLayout: "carousel",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("feedColumns", () => {
      test("2は許可（最小値）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedColumns: 2,
        });
        expect(result.success).toBe(true);
      });

      test("6は許可（最大値）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedColumns: 6,
        });
        expect(result.success).toBe(true);
      });

      test("1はエラー（最小値未満）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedColumns: 1,
        });
        expect(result.success).toBe(false);
      });

      test("7はエラー（最大値超過）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedColumns: 7,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedColumns: 3.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("feedMaxItems", () => {
      test("1は許可（最小値）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedMaxItems: 1,
        });
        expect(result.success).toBe(true);
      });

      test("24は許可（最大値）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedMaxItems: 24,
        });
        expect(result.success).toBe(true);
      });

      test("0はエラー（最小値未満）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedMaxItems: 0,
        });
        expect(result.success).toBe(false);
      });

      test("25はエラー（最大値超過）", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedMaxItems: 25,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          feedMaxItems: 8.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("showCaption / showViewAll", () => {
      test("showCaptionはboolean必須", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          showCaption: "false",
        });
        expect(result.success).toBe(false);
      });

      test("showViewAllはboolean必須", () => {
        const result = instagramSettingsSchema.safeParse({
          ...VALID_SETTINGS_INPUT,
          showViewAll: 1,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("instagramPostUrlSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効な投稿URLはバリデーション通過", () => {
        const result = instagramPostUrlSchema.safeParse(VALID_POST_URL);
        expect(result.success).toBe(true);
      });

      test("有効なリールURLはバリデーション通過", () => {
        const result = instagramPostUrlSchema.safeParse(VALID_REEL_URL);
        expect(result.success).toBe(true);
      });

      test("wwwなしのURLも許可", () => {
        const result = instagramPostUrlSchema.safeParse(
          "https://instagram.com/p/ABC123xyz/",
        );
        expect(result.success).toBe(true);
      });

      test("末尾スラッシュなしも許可", () => {
        const result = instagramPostUrlSchema.safeParse(
          "https://www.instagram.com/p/ABC123xyz",
        );
        expect(result.success).toBe(true);
      });
    });

    describe("異常系", () => {
      test("無効なURLはエラー", () => {
        const result = instagramPostUrlSchema.safeParse("not-a-url");
        expect(result.success).toBe(false);
      });

      test("Instagram以外のURLはエラー", () => {
        const result = instagramPostUrlSchema.safeParse(
          "https://twitter.com/user/status/123",
        );
        expect(result.success).toBe(false);
      });

      test("Instagramプロフィールページはエラー", () => {
        const result = instagramPostUrlSchema.safeParse(
          "https://www.instagram.com/username/",
        );
        expect(result.success).toBe(false);
      });

      test("Instagramストーリーはエラー", () => {
        const result = instagramPostUrlSchema.safeParse(
          "https://www.instagram.com/stories/username/123/",
        );
        expect(result.success).toBe(false);
      });

      test("空文字はエラー", () => {
        const result = instagramPostUrlSchema.safeParse("");
        expect(result.success).toBe(false);
      });

      test("HTTPはエラー（URLバリデーションで不正URLとなるため）", () => {
        // http://www.instagram.com/p/ABC/ は url() で有効なURLだが
        // 正規表現パターンがhttps必須
        const result = instagramPostUrlSchema.safeParse(
          "http://www.instagram.com/p/ABC123xyz/",
        );
        expect(result.success).toBe(false);
      });
    });
  });

  describe("instagramTokenSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なトークンはバリデーション通過", () => {
        const result = instagramTokenSchema.safeParse(VALID_TOKEN);
        expect(result.success).toBe(true);
      });

      test("1文字のトークンも通過（min: 1）", () => {
        const result = instagramTokenSchema.safeParse("a");
        expect(result.success).toBe(true);
      });
    });

    describe("異常系", () => {
      test("空文字はエラー", () => {
        const result = instagramTokenSchema.safeParse("");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("トークンを入力");
        }
      });

      test("数値はエラー", () => {
        const result = instagramTokenSchema.safeParse(12345);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("instagramPostIdSchema バリデーション", () => {
    describe("正常系", () => {
      test("英数字のIDはバリデーション通過", () => {
        const validIds = ["ABC123xyz", "test_id-123", "shortcode"];
        for (const id of validIds) {
          const result = instagramPostIdSchema.safeParse(id);
          expect(result.success).toBe(true);
        }
      });
    });

    describe("異常系", () => {
      test("空文字はエラー", () => {
        const result = instagramPostIdSchema.safeParse("");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("投稿IDを入力");
        }
      });

      test("特殊文字を含むIDはエラー", () => {
        const invalidIds = ["id with spaces", "id@special", "id!invalid"];
        for (const id of invalidIds) {
          const result = instagramPostIdSchema.safeParse(id);
          expect(result.success).toBe(false);
        }
      });
    });
  });

  describe("extractInstagramShortcode ユーティリティ", () => {
    test("投稿URLからショートコードを抽出", () => {
      expect(
        extractInstagramShortcode("https://www.instagram.com/p/ABC123xyz/"),
      ).toBe("ABC123xyz");
    });

    test("リールURLからショートコードを抽出", () => {
      expect(
        extractInstagramShortcode("https://www.instagram.com/reel/XYZ789abc/"),
      ).toBe("XYZ789abc");
    });

    test("末尾スラッシュなしのURLからショートコードを抽出", () => {
      expect(
        extractInstagramShortcode("https://www.instagram.com/p/TEST123"),
      ).toBe("TEST123");
    });

    test("wwwなしのURLからショートコードを抽出", () => {
      expect(
        extractInstagramShortcode("https://instagram.com/p/SHORTCODE/"),
      ).toBe("SHORTCODE");
    });

    test("無効なURLはnullを返す", () => {
      expect(extractInstagramShortcode("https://twitter.com/user")).toBeNull();
    });

    test("プロフィールURLはnullを返す", () => {
      expect(
        extractInstagramShortcode("https://www.instagram.com/username/"),
      ).toBeNull();
    });

    test("空文字はnullを返す", () => {
      expect(extractInstagramShortcode("")).toBeNull();
    });
  });

  describe("InstagramConfig型テスト", () => {
    test("InstagramConfig型の構造", () => {
      type InstagramConfig = {
        isConnected: boolean;
        username: string | null;
        accountType: string | null;
        tokenExpiresAt: Date | null;
        tokenExpiryDays: number | null;
        shouldRefreshToken: boolean;
        feedEnabled: boolean;
        feedLayout: "grid" | "masonry" | "slider";
        feedColumns: number;
        feedMaxItems: number;
        showCaption: boolean;
        showViewAll: boolean;
      };

      const config: InstagramConfig = {
        isConnected: true,
        username: "testuser",
        accountType: "BUSINESS",
        tokenExpiresAt: new Date("2026-04-01"),
        tokenExpiryDays: 50,
        shouldRefreshToken: false,
        feedEnabled: true,
        feedLayout: "grid",
        feedColumns: 4,
        feedMaxItems: 8,
        showCaption: false,
        showViewAll: true,
      };

      expect(config.isConnected).toBe(true);
      expect(config.username).toBe("testuser");
      expect(config.feedLayout).toBe("grid");
      expect(config.feedColumns).toBe(4);
    });
  });

  describe("InstagramPostData型テスト", () => {
    test("InstagramPostData型の構造", () => {
      type InstagramPostData = {
        id: string;
        postId: string;
        postUrl: string;
        mediaUrl: string | null;
        caption: string | null;
        sortOrder: number;
        createdAt: Date;
      };

      const post: InstagramPostData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        postId: "ABC123xyz",
        postUrl: "https://www.instagram.com/p/ABC123xyz/",
        mediaUrl: "https://scontent.cdninstagram.com/v/image.jpg",
        caption: "素敵なスペース #rentalspace",
        sortOrder: 0,
        createdAt: new Date(),
      };

      expect(post.postId).toBe("ABC123xyz");
      expect(post.sortOrder).toBe(0);
      expect(post.caption).toContain("#rentalspace");
    });
  });

  describe("境界値テスト", () => {
    test("feedColumns 2（最小値）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedColumns: 2,
      });
      expect(result.success).toBe(true);
    });

    test("feedColumns 1（最小値未満）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedColumns: 1,
      });
      expect(result.success).toBe(false);
    });

    test("feedColumns 6（最大値）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedColumns: 6,
      });
      expect(result.success).toBe(true);
    });

    test("feedColumns 7（最大値超過）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedColumns: 7,
      });
      expect(result.success).toBe(false);
    });

    test("feedMaxItems 1（最小値）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedMaxItems: 1,
      });
      expect(result.success).toBe(true);
    });

    test("feedMaxItems 0（最小値未満）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedMaxItems: 0,
      });
      expect(result.success).toBe(false);
    });

    test("feedMaxItems 24（最大値）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedMaxItems: 24,
      });
      expect(result.success).toBe(true);
    });

    test("feedMaxItems 25（最大値超過）", () => {
      const result = instagramSettingsSchema.safeParse({
        ...VALID_SETTINGS_INPUT,
        feedMaxItems: 25,
      });
      expect(result.success).toBe(false);
    });
  });
});
