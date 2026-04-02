/**
 * ナビゲーション管理 domain 統合テスト
 *
 * source of truth:
 * - src/shared/domain/navigation/commands.ts
 * - src/shared/domain/navigation/queries.ts
 *
 * 注: write action は thin adapter 化したため、
 *     domain schema + 型構造を直接テストする
 */

import { describe, test, expect } from "bun:test";
import { NavigationType, SocialPlatform } from "@generated/prisma/enums";
import {
  navigationItemInputSchema as navigationItemSchema,
  socialLinkInputSchema as socialLinkSchema,
} from "@/shared/domain/navigation/commands";
import type {
  NavigationItemData,
  SocialLinkData,
} from "@/shared/domain/navigation/queries";

// =============================================================================
// テストデータ
// =============================================================================

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const VALID_NAVIGATION_ITEM_INPUT = {
  type: "HEADER_DESKTOP" as const,
  parentId: null,
  label: "ホーム",
  url: "/",
  isExternal: false,
  order: 0,
  isActive: true,
};

const VALID_SOCIAL_LINK_INPUT = {
  platform: "INSTAGRAM" as const,
  url: "https://www.instagram.com/example/",
  order: 0,
  isActive: true,
  showOnDesktop: true,
  showOnMobile: true,
};

describe("Navigation Admin Action Integration", () => {
  describe("navigationItemSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = navigationItemSchema.safeParse(
          VALID_NAVIGATION_ITEM_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("子メニュー（parentId指定）も許可", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          parentId: VALID_UUID,
        });
        expect(result.success).toBe(true);
      });

      test("parentIdはオプション（省略可能）", () => {
        const input = {
          type: "HEADER_DESKTOP" as const,
          label: "ホーム",
          url: "/",
          order: 0,
        };
        const result = navigationItemSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      test("外部リンクは許可", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          url: "https://external.example.com",
          isExternal: true,
        });
        expect(result.success).toBe(true);
      });

      test("isExternalはデフォルトでfalse", () => {
        const input = {
          type: "HEADER_DESKTOP" as const,
          label: "ホーム",
          url: "/",
          order: 0,
        };
        const result = navigationItemSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isExternal).toBe(false);
        }
      });

      test("isActiveはデフォルトでtrue", () => {
        const input = {
          type: "HEADER_DESKTOP" as const,
          label: "ホーム",
          url: "/",
          order: 0,
        };
        const result = navigationItemSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isActive).toBe(true);
        }
      });
    });

    describe("type", () => {
      test("全NavigationType値が許可", () => {
        const types = ["HEADER_DESKTOP", "HEADER_MOBILE", "FOOTER"] as const;
        for (const type of types) {
          const result = navigationItemSchema.safeParse({
            ...VALID_NAVIGATION_ITEM_INPUT,
            type,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なタイプはエラー", () => {
        const invalidTypes = ["SIDEBAR", "MAIN", "header", "footer", ""];
        for (const type of invalidTypes) {
          const result = navigationItemSchema.safeParse({
            ...VALID_NAVIGATION_ITEM_INPUT,
            type,
          });
          expect(result.success).toBe(false);
        }
      });
    });

    describe("parentId", () => {
      test("有効なUUIDは許可", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          parentId: VALID_UUID,
        });
        expect(result.success).toBe(true);
      });

      test("nullは許可", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          parentId: null,
        });
        expect(result.success).toBe(true);
      });

      test("無効なUUIDはエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          parentId: "not-a-uuid",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("label", () => {
      test("空のラベルはエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          label: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("ラベルは必須");
        }
      });

      test("50文字のラベルはOK", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          label: "あ".repeat(50),
        });
        expect(result.success).toBe(true);
      });

      test("51文字のラベルはエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          label: "あ".repeat(51),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("50文字以内");
        }
      });

      test("日本語ラベルは許可", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          label: "お問い合わせ",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("url", () => {
      test("空のURLはエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          url: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("URLは必須");
        }
      });

      test("有効な相対パスは許可", () => {
        const validUrls = [
          "/",
          "/about",
          "/spaces/conference",
          "/contact#form",
        ];
        for (const url of validUrls) {
          const result = navigationItemSchema.safeParse({
            ...VALID_NAVIGATION_ITEM_INPUT,
            url,
          });
          expect(result.success).toBe(true);
        }
      });

      test("有効な絶対URLは許可", () => {
        const validUrls = [
          "https://example.com",
          "https://www.example.co.jp/path",
          "http://localhost:3000",
        ];
        for (const url of validUrls) {
          const result = navigationItemSchema.safeParse({
            ...VALID_NAVIGATION_ITEM_INPUT,
            url,
          });
          expect(result.success).toBe(true);
        }
      });

      test("500文字のURLはOK", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          url: "/" + "a".repeat(499),
        });
        expect(result.success).toBe(true);
      });

      test("501文字のURLはエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          url: "/" + "a".repeat(500),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("order", () => {
      test("0以上の整数は許可", () => {
        const orders = [0, 1, 50, 100, 999];
        for (const order of orders) {
          const result = navigationItemSchema.safeParse({
            ...VALID_NAVIGATION_ITEM_INPUT,
            order,
          });
          expect(result.success).toBe(true);
        }
      });

      test("負の数はエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          order: -1,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          order: 1.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("isExternal / isActive", () => {
      test("boolean値は許可", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          isExternal: true,
          isActive: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列のisExternalはエラー", () => {
        const result = navigationItemSchema.safeParse({
          ...VALID_NAVIGATION_ITEM_INPUT,
          isExternal: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("socialLinkSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = socialLinkSchema.safeParse(VALID_SOCIAL_LINK_INPUT);
        expect(result.success).toBe(true);
      });

      test("showOnDesktop/showOnMobileはデフォルトでtrue", () => {
        const input = {
          platform: "INSTAGRAM" as const,
          url: "https://www.instagram.com/example/",
          order: 0,
        };
        const result = socialLinkSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.showOnDesktop).toBe(true);
          expect(result.data.showOnMobile).toBe(true);
        }
      });
    });

    describe("platform", () => {
      test("全SocialPlatform値が許可", () => {
        const platforms = [
          "TWITTER",
          "FACEBOOK",
          "INSTAGRAM",
          "YOUTUBE",
          "LINE",
          "TIKTOK",
          "OTHER",
        ] as const;
        for (const platform of platforms) {
          const result = socialLinkSchema.safeParse({
            ...VALID_SOCIAL_LINK_INPUT,
            platform,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なプラットフォームはエラー", () => {
        const invalidPlatforms = ["LINKEDIN", "PINTEREST", "twitter", ""];
        for (const platform of invalidPlatforms) {
          const result = socialLinkSchema.safeParse({
            ...VALID_SOCIAL_LINK_INPUT,
            platform,
          });
          expect(result.success).toBe(false);
        }
      });
    });

    describe("url", () => {
      test("有効なURLは許可", () => {
        const validUrls = [
          "https://twitter.com/example",
          "https://www.facebook.com/example",
          "https://www.instagram.com/example/",
          "https://www.youtube.com/channel/example",
          "https://line.me/R/ti/p/@example",
          "https://www.tiktok.com/@example",
        ];
        for (const url of validUrls) {
          const result = socialLinkSchema.safeParse({
            ...VALID_SOCIAL_LINK_INPUT,
            url,
          });
          expect(result.success).toBe(true);
        }
      });

      test("空のURLはエラー", () => {
        const result = socialLinkSchema.safeParse({
          ...VALID_SOCIAL_LINK_INPUT,
          url: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("URLは必須");
        }
      });

      test("無効なURL形式はエラー", () => {
        const invalidUrls = ["not-a-url", "example.com"];
        for (const url of invalidUrls) {
          const result = socialLinkSchema.safeParse({
            ...VALID_SOCIAL_LINK_INPUT,
            url,
          });
          expect(result.success).toBe(false);
        }
      });
    });

    describe("order", () => {
      test("0以上の整数は許可", () => {
        const orders = [0, 1, 50, 100];
        for (const order of orders) {
          const result = socialLinkSchema.safeParse({
            ...VALID_SOCIAL_LINK_INPUT,
            order,
          });
          expect(result.success).toBe(true);
        }
      });

      test("負の数はエラー", () => {
        const result = socialLinkSchema.safeParse({
          ...VALID_SOCIAL_LINK_INPUT,
          order: -1,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = socialLinkSchema.safeParse({
          ...VALID_SOCIAL_LINK_INPUT,
          order: 1.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("showOnDesktop / showOnMobile", () => {
      test("デスクトップのみ表示", () => {
        const result = socialLinkSchema.safeParse({
          ...VALID_SOCIAL_LINK_INPUT,
          showOnDesktop: true,
          showOnMobile: false,
        });
        expect(result.success).toBe(true);
      });

      test("モバイルのみ表示", () => {
        const result = socialLinkSchema.safeParse({
          ...VALID_SOCIAL_LINK_INPUT,
          showOnDesktop: false,
          showOnMobile: true,
        });
        expect(result.success).toBe(true);
      });

      test("両方非表示も許可", () => {
        const result = socialLinkSchema.safeParse({
          ...VALID_SOCIAL_LINK_INPUT,
          showOnDesktop: false,
          showOnMobile: false,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe("NavigationItemData型テスト", () => {
    test("NavigationItemData型の構造（ルートメニュー）", () => {
      const rootItem: NavigationItemData = {
        id: VALID_UUID,
        type: NavigationType.HEADER_DESKTOP,
        parentId: null,
        label: "スペース",
        url: "/spaces",
        isExternal: false,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        children: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            type: NavigationType.HEADER_DESKTOP,
            parentId: VALID_UUID,
            label: "会議室",
            url: "/spaces/conference",
            isExternal: false,
            order: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            children: [],
          },
        ],
      };

      expect(rootItem.label).toBe("スペース");
      expect(rootItem.parentId).toBeNull();
      expect(rootItem.children).toHaveLength(1);
      expect(rootItem.children[0].label).toBe("会議室");
      expect(rootItem.children[0].parentId).toBe(VALID_UUID);
    });
  });

  describe("SocialLinkData型テスト", () => {
    test("SocialLinkData型の構造", () => {
      const link: SocialLinkData = {
        id: VALID_UUID,
        platform: SocialPlatform.INSTAGRAM,
        url: "https://www.instagram.com/example/",
        order: 0,
        isActive: true,
        showOnDesktop: true,
        showOnMobile: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(link.platform).toBe("INSTAGRAM");
      expect(link.url).toBe("https://www.instagram.com/example/");
      expect(link.showOnDesktop).toBe(true);
      expect(link.showOnMobile).toBe(true);
    });
  });

  describe("境界値テスト", () => {
    test("ラベル 50文字（境界）", () => {
      const result = navigationItemSchema.safeParse({
        ...VALID_NAVIGATION_ITEM_INPUT,
        label: "x".repeat(50),
      });
      expect(result.success).toBe(true);
    });

    test("ラベル 51文字（境界超過）", () => {
      const result = navigationItemSchema.safeParse({
        ...VALID_NAVIGATION_ITEM_INPUT,
        label: "x".repeat(51),
      });
      expect(result.success).toBe(false);
    });

    test("URL 500文字（境界）", () => {
      const result = navigationItemSchema.safeParse({
        ...VALID_NAVIGATION_ITEM_INPUT,
        url: "/" + "a".repeat(499),
      });
      expect(result.success).toBe(true);
    });

    test("URL 501文字（境界超過）", () => {
      const result = navigationItemSchema.safeParse({
        ...VALID_NAVIGATION_ITEM_INPUT,
        url: "/" + "a".repeat(500),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("NavigationType enum値テスト", () => {
    test("NavigationTypeの全値", () => {
      expect(NavigationType.HEADER_DESKTOP).toBe("HEADER_DESKTOP");
      expect(NavigationType.HEADER_MOBILE).toBe("HEADER_MOBILE");
      expect(NavigationType.FOOTER).toBe("FOOTER");
    });

    test("NavigationTypeは3つの値を持つ", () => {
      expect(Object.keys(NavigationType)).toHaveLength(3);
    });
  });

  describe("SocialPlatform enum値テスト", () => {
    test("SocialPlatformの全値", () => {
      expect(SocialPlatform.TWITTER).toBe("TWITTER");
      expect(SocialPlatform.FACEBOOK).toBe("FACEBOOK");
      expect(SocialPlatform.INSTAGRAM).toBe("INSTAGRAM");
      expect(SocialPlatform.YOUTUBE).toBe("YOUTUBE");
      expect(SocialPlatform.LINE).toBe("LINE");
      expect(SocialPlatform.TIKTOK).toBe("TIKTOK");
      expect(SocialPlatform.OTHER).toBe("OTHER");
    });

    test("SocialPlatformは7つの値を持つ", () => {
      expect(Object.keys(SocialPlatform)).toHaveLength(7);
    });
  });
});
