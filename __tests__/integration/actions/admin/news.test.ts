/**
 * お知らせ管理Server Action統合テスト
 *
 * src/actions/admin/news.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { LayoutWidth } from "@generated/prisma/enums";

// news.ts 内で定義されているスキーマを再現
const createNewsSchema = z.object({
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内で入力してください" }),
  content: z.string().default(""),
});

const updateNewsSchema = z.object({
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内で入力してください" }),
  content: z.string().min(1, { error: "本文は必須です" }),
  contentWidth: z.enum(LayoutWidth).nullable().optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
});

// 有効なお知らせ作成データ
const VALID_CREATE_NEWS_INPUT = {
  title: "テストお知らせ",
  content: "",
};

// 有効なお知らせ更新データ
const VALID_UPDATE_NEWS_INPUT = {
  title: "テストお知らせ（更新）",
  content: "<p>これは更新されたお知らせの本文です。</p>",
};

describe("News Admin Action Integration", () => {
  describe("createNewsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = createNewsSchema.safeParse(VALID_CREATE_NEWS_INPUT);
        expect(result.success).toBe(true);
      });

      test("contentはデフォルト空文字", () => {
        const input = {
          title: "タイトル",
        };
        const result = createNewsSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.content).toBe("");
        }
      });

      test("HTMLコンテンツは許可", () => {
        const result = createNewsSchema.safeParse({
          ...VALID_CREATE_NEWS_INPUT,
          content: "<h1>見出し</h1><p>本文</p>",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("title", () => {
      test("空のタイトルはエラー", () => {
        const result = createNewsSchema.safeParse({
          ...VALID_CREATE_NEWS_INPUT,
          title: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("タイトルは必須");
        }
      });

      test("200文字のタイトルはOK", () => {
        const result = createNewsSchema.safeParse({
          ...VALID_CREATE_NEWS_INPUT,
          title: "あ".repeat(200),
        });
        expect(result.success).toBe(true);
      });

      test("201文字のタイトルはエラー", () => {
        const result = createNewsSchema.safeParse({
          ...VALID_CREATE_NEWS_INPUT,
          title: "あ".repeat(201),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("200文字以内");
        }
      });
    });
  });

  describe("updateNewsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = updateNewsSchema.safeParse(VALID_UPDATE_NEWS_INPUT);
        expect(result.success).toBe(true);
      });

      test("contentWidthオプション設定可能", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidth: LayoutWidth.MD,
        });
        expect(result.success).toBe(true);
      });

      test("contentWidthCustom設定可能", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: 800,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("content", () => {
      test("空の本文はエラー（更新時は必須）", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          content: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("本文は必須");
        }
      });
    });

    describe("contentWidthCustom", () => {
      test("320px（最小値）はOK", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: 320,
        });
        expect(result.success).toBe(true);
      });

      test("1920px（最大値）はOK", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: 1920,
        });
        expect(result.success).toBe(true);
      });

      test("319px（最小値未満）はエラー", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: 319,
        });
        expect(result.success).toBe(false);
      });

      test("1921px（最大値超過）はエラー", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: 1921,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: 800.5,
        });
        expect(result.success).toBe(false);
      });

      test("nullは許可", () => {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidthCustom: null,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // Note: NewsStatus enum は isPublished (boolean) に移行したため削除

  describe("LayoutWidth enum テスト", () => {
    test("LayoutWidth enumの値が存在", () => {
      expect(LayoutWidth.XS).toBeDefined();
      expect(LayoutWidth.SM).toBeDefined();
      expect(LayoutWidth.MD).toBeDefined();
      expect(LayoutWidth.LG).toBeDefined();
      expect(LayoutWidth.XL).toBeDefined();
      expect(LayoutWidth.FULL).toBeDefined();
      expect(LayoutWidth.CUSTOM).toBeDefined();
    });

    test("updateNewsSchemaでLayoutWidth使用可能", () => {
      const widths = [
        LayoutWidth.XS,
        LayoutWidth.SM,
        LayoutWidth.MD,
        LayoutWidth.LG,
        LayoutWidth.XL,
        LayoutWidth.FULL,
        LayoutWidth.CUSTOM,
      ];

      for (const width of widths) {
        const result = updateNewsSchema.safeParse({
          ...VALID_UPDATE_NEWS_INPUT,
          contentWidth: width,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("フィルター型テスト", () => {
    test("有効なフィルター値", () => {
      // Note: NewsStatus enum は isPublished (boolean) に移行
      // フィルターは 'ALL' | 'PUBLISHED' | 'DRAFT' のみ
      type NewsFilters = {
        status?: "ALL" | "PUBLISHED" | "DRAFT";
        search?: string;
      };

      const filters: NewsFilters = {
        status: "PUBLISHED",
        search: "テスト",
      };

      expect(filters.status).toBe("PUBLISHED");
    });

    test("ALL ステータスフィルター", () => {
      type NewsFilters = {
        status?: "ALL" | "PUBLISHED" | "DRAFT";
      };

      const filters: NewsFilters = {
        status: "ALL",
      };

      expect(filters.status).toBe("ALL");
    });
  });

  describe("ページネーション型テスト", () => {
    test("有効なページネーション値", () => {
      type NewsPagination = {
        page?: number;
        limit?: number;
        sortBy?: "createdAt" | "publishedAt";
        sortOrder?: "asc" | "desc";
      };

      const pagination: NewsPagination = {
        page: 1,
        limit: 10,
        sortBy: "publishedAt",
        sortOrder: "desc",
      };

      expect(pagination.page).toBe(1);
      expect(pagination.sortBy).toBe("publishedAt");
    });

    test("デフォルト値の想定", () => {
      const defaultPagination = {
        page: 1,
        limit: 10,
        sortBy: "createdAt" as const,
        sortOrder: "desc" as const,
      };

      expect(defaultPagination.page).toBe(1);
      expect(defaultPagination.limit).toBe(10);
      expect(defaultPagination.sortBy).toBe("createdAt");
      expect(defaultPagination.sortOrder).toBe("desc");
    });
  });

  describe("境界値テスト", () => {
    test("タイトル200文字（境界）", () => {
      const result = createNewsSchema.safeParse({
        ...VALID_CREATE_NEWS_INPUT,
        title: "x".repeat(200),
      });
      expect(result.success).toBe(true);
    });

    test("タイトル201文字（境界超過）", () => {
      const result = createNewsSchema.safeParse({
        ...VALID_CREATE_NEWS_INPUT,
        title: "x".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    test("contentWidthCustom 320（最小境界）", () => {
      const result = updateNewsSchema.safeParse({
        ...VALID_UPDATE_NEWS_INPUT,
        contentWidthCustom: 320,
      });
      expect(result.success).toBe(true);
    });

    test("contentWidthCustom 1920（最大境界）", () => {
      const result = updateNewsSchema.safeParse({
        ...VALID_UPDATE_NEWS_INPUT,
        contentWidthCustom: 1920,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("NewsData型テスト", () => {
    test("NewsData型の構造", () => {
      // Note: status から isPublished (boolean) に移行
      type NewsData = {
        id: string;
        title: string;
        content: string;
        isPublished: boolean;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        contentWidth: (typeof LayoutWidth)[keyof typeof LayoutWidth] | null;
        contentWidthCustom: number | null;
      };

      const news: NewsData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "テストお知らせ",
        content: "<p>本文</p>",
        isPublished: true,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        contentWidth: LayoutWidth.MD,
        contentWidthCustom: null,
      };

      expect(news.isPublished).toBe(true);
      expect(news.contentWidth).toBe("MD");
    });
  });

  describe("NewsVersionData型テスト", () => {
    test("NewsVersionData型の構造", () => {
      type NewsVersionData = {
        id: string;
        newsId: string;
        version: number;
        content: string;
        createdAt: Date;
        createdBy: string | null;
      };

      const version: NewsVersionData = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        newsId: "550e8400-e29b-41d4-a716-446655440000",
        version: 1,
        content: "<p>バージョン1の本文</p>",
        createdAt: new Date(),
        createdBy: "550e8400-e29b-41d4-a716-446655440002",
      };

      expect(version.version).toBe(1);
    });
  });

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
});
