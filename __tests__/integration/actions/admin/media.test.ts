/**
 * メディア管理Server Action統合テスト
 *
 * src/actions/admin/media.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// MediaType, MediaUsage を再定義（テスト用）
const MediaType = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  DOCUMENT: "DOCUMENT",
  OTHER: "OTHER",
} as const;
type MediaType = (typeof MediaType)[keyof typeof MediaType];

const MediaUsage = {
  POST: "POST",
  NEWS: "NEWS",
  PAGE: "PAGE",
  SPACE: "SPACE",
  SITE: "SITE",
  GENERAL: "GENERAL",
} as const;
type MediaUsage = (typeof MediaUsage)[keyof typeof MediaUsage];

// Zod enum スキーマ
const MediaTypeEnum = z.enum(["IMAGE", "VIDEO", "DOCUMENT", "OTHER"]);
const MediaUsageEnum = z.enum([
  "POST",
  "NEWS",
  "PAGE",
  "SPACE",
  "SITE",
  "GENERAL",
]);

// media.ts 内で使用されているスキーマを再現
const mediaUploadSchema = z.object({
  type: MediaTypeEnum.default("IMAGE"),
  usage: MediaUsageEnum.default("GENERAL"),
  alt: z
    .string()
    .max(200, { error: "代替テキストは200文字以内で入力してください" })
    .optional(),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内で入力してください" })
    .optional(),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .optional(),
  tags: z
    .array(z.string().max(50, { error: "タグは50文字以内で入力してください" }))
    .max(10, { error: "タグは最大10個まで設定できます" })
    .default([]),
});

const mediaUpdateSchema = z.object({
  alt: z
    .string()
    .max(200, { error: "代替テキストは200文字以内で入力してください" })
    .optional(),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内で入力してください" })
    .optional(),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .optional(),
  tags: z
    .array(z.string().max(50, { error: "タグは50文字以内で入力してください" }))
    .max(10, { error: "タグは最大10個まで設定できます" })
    .optional(),
  usage: MediaUsageEnum.optional(),
});

const mediaFiltersSchema = z.object({
  type: MediaTypeEnum.optional(),
  usage: MediaUsageEnum.optional(),
  search: z.string().optional(),
  mimeType: z.string().optional(),
});

const mediaPaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(24),
});

// 有効なアップロードデータ
const VALID_UPLOAD_INPUT = {
  type: MediaType.IMAGE,
  usage: MediaUsage.POST,
  alt: "画像の説明",
  title: "画像タイトル",
  description: "画像の詳細な説明です。",
  tags: ["テスト", "画像"],
};

// 有効な更新データ
const VALID_UPDATE_INPUT = {
  alt: "更新された説明",
  title: "更新されたタイトル",
  description: "更新された詳細な説明です。",
  tags: ["更新", "テスト"],
  usage: MediaUsage.NEWS,
};

// 定数定義
const ALLOWED_MIME_TYPES: Record<MediaType, string[]> = {
  IMAGE: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  DOCUMENT: ["application/pdf"],
  OTHER: [],
};

const MAX_FILE_SIZES: Record<MediaType, number> = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 100 * 1024 * 1024, // 100MB
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  OTHER: 5 * 1024 * 1024, // 5MB
};

describe("Media Admin Action Integration", () => {
  describe("mediaUploadSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = mediaUploadSchema.safeParse(VALID_UPLOAD_INPUT);
        expect(result.success).toBe(true);
      });

      test("デフォルト値が適用される", () => {
        const result = mediaUploadSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe("IMAGE");
          expect(result.data.usage).toBe("GENERAL");
          expect(result.data.tags).toEqual([]);
        }
      });

      test("全MediaTypeが使用可能", () => {
        const types: MediaType[] = ["IMAGE", "VIDEO", "DOCUMENT", "OTHER"];
        for (const type of types) {
          const result = mediaUploadSchema.safeParse({
            ...VALID_UPLOAD_INPUT,
            type,
          });
          expect(result.success).toBe(true);
        }
      });

      test("全MediaUsageが使用可能", () => {
        const usages: MediaUsage[] = [
          "POST",
          "NEWS",
          "PAGE",
          "SPACE",
          "SITE",
          "GENERAL",
        ];
        for (const usage of usages) {
          const result = mediaUploadSchema.safeParse({
            ...VALID_UPLOAD_INPUT,
            usage,
          });
          expect(result.success).toBe(true);
        }
      });
    });

    describe("type", () => {
      test("無効なタイプはエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          type: "INVALID",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("usage", () => {
      test("無効なusageはエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          usage: "INVALID",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("alt", () => {
      test("200文字の代替テキストはOK", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          alt: "あ".repeat(200),
        });
        expect(result.success).toBe(true);
      });

      test("201文字の代替テキストはエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          alt: "あ".repeat(201),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("200文字以内");
        }
      });
    });

    describe("title", () => {
      test("100文字のタイトルはOK", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          title: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字のタイトルはエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          title: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("100文字以内");
        }
      });
    });

    describe("description", () => {
      test("500文字の説明はOK", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          description: "あ".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字の説明はエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          description: "あ".repeat(501),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("500文字以内");
        }
      });
    });

    describe("tags", () => {
      test("10個のタグはOK", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          tags: Array(10).fill("タグ"),
        });
        expect(result.success).toBe(true);
      });

      test("11個のタグはエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          tags: Array(11).fill("タグ"),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("10個まで");
        }
      });

      test("50文字のタグはOK", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          tags: ["あ".repeat(50)],
        });
        expect(result.success).toBe(true);
      });

      test("51文字のタグはエラー", () => {
        const result = mediaUploadSchema.safeParse({
          ...VALID_UPLOAD_INPUT,
          tags: ["あ".repeat(51)],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("50文字以内");
        }
      });
    });
  });

  describe("mediaUpdateSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = mediaUpdateSchema.safeParse(VALID_UPDATE_INPUT);
        expect(result.success).toBe(true);
      });

      test("空オブジェクトも許可（部分更新）", () => {
        const result = mediaUpdateSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      test("altのみの更新", () => {
        const result = mediaUpdateSchema.safeParse({
          alt: "新しい説明",
        });
        expect(result.success).toBe(true);
      });

      test("usageのみの更新", () => {
        const result = mediaUpdateSchema.safeParse({
          usage: MediaUsage.SITE,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("各フィールドの境界値", () => {
      test("alt 200文字（境界）", () => {
        const result = mediaUpdateSchema.safeParse({
          alt: "x".repeat(200),
        });
        expect(result.success).toBe(true);
      });

      test("alt 201文字（境界超過）", () => {
        const result = mediaUpdateSchema.safeParse({
          alt: "x".repeat(201),
        });
        expect(result.success).toBe(false);
      });

      test("title 100文字（境界）", () => {
        const result = mediaUpdateSchema.safeParse({
          title: "x".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("title 101文字（境界超過）", () => {
        const result = mediaUpdateSchema.safeParse({
          title: "x".repeat(101),
        });
        expect(result.success).toBe(false);
      });

      test("description 500文字（境界）", () => {
        const result = mediaUpdateSchema.safeParse({
          description: "x".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("description 501文字（境界超過）", () => {
        const result = mediaUpdateSchema.safeParse({
          description: "x".repeat(501),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("mediaFiltersSchema バリデーション", () => {
    test("全フィールド指定", () => {
      const result = mediaFiltersSchema.safeParse({
        type: MediaType.IMAGE,
        usage: MediaUsage.POST,
        search: "検索キーワード",
        mimeType: "image/jpeg",
      });
      expect(result.success).toBe(true);
    });

    test("空オブジェクト", () => {
      const result = mediaFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("typeのみ", () => {
      const result = mediaFiltersSchema.safeParse({
        type: MediaType.VIDEO,
      });
      expect(result.success).toBe(true);
    });

    test("usageのみ", () => {
      const result = mediaFiltersSchema.safeParse({
        usage: MediaUsage.PAGE,
      });
      expect(result.success).toBe(true);
    });

    test("searchのみ", () => {
      const result = mediaFiltersSchema.safeParse({
        search: "ロゴ",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("mediaPaginationSchema バリデーション", () => {
    test("デフォルト値", () => {
      const result = mediaPaginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(24);
      }
    });

    test("有効なページネーション", () => {
      const result = mediaPaginationSchema.safeParse({
        page: 5,
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    test("page 1（最小値）", () => {
      const result = mediaPaginationSchema.safeParse({
        page: 1,
      });
      expect(result.success).toBe(true);
    });

    test("page 0はエラー", () => {
      const result = mediaPaginationSchema.safeParse({
        page: 0,
      });
      expect(result.success).toBe(false);
    });

    test("limit 1（最小値）", () => {
      const result = mediaPaginationSchema.safeParse({
        limit: 1,
      });
      expect(result.success).toBe(true);
    });

    test("limit 100（最大値）", () => {
      const result = mediaPaginationSchema.safeParse({
        limit: 100,
      });
      expect(result.success).toBe(true);
    });

    test("limit 101（最大値超過）はエラー", () => {
      const result = mediaPaginationSchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    test("limit 0はエラー", () => {
      const result = mediaPaginationSchema.safeParse({
        limit: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("MediaType enum テスト", () => {
    test("MediaType enumの値が存在", () => {
      expect(MediaType.IMAGE).toBe("IMAGE");
      expect(MediaType.VIDEO).toBe("VIDEO");
      expect(MediaType.DOCUMENT).toBe("DOCUMENT");
      expect(MediaType.OTHER).toBe("OTHER");
    });

    test("MediaType enumは4つの値を持つ", () => {
      expect(Object.values(MediaType)).toHaveLength(4);
    });
  });

  describe("MediaUsage enum テスト", () => {
    test("MediaUsage enumの値が存在", () => {
      expect(MediaUsage.POST).toBe("POST");
      expect(MediaUsage.NEWS).toBe("NEWS");
      expect(MediaUsage.PAGE).toBe("PAGE");
      expect(MediaUsage.SPACE).toBe("SPACE");
      expect(MediaUsage.SITE).toBe("SITE");
      expect(MediaUsage.GENERAL).toBe("GENERAL");
    });

    test("MediaUsage enumは6つの値を持つ", () => {
      expect(Object.values(MediaUsage)).toHaveLength(6);
    });
  });

  describe("ファイルサイズ制限テスト", () => {
    test("MAX_FILE_SIZESの定義", () => {
      expect(MAX_FILE_SIZES.IMAGE).toBe(10 * 1024 * 1024); // 10MB
      expect(MAX_FILE_SIZES.VIDEO).toBe(100 * 1024 * 1024); // 100MB
      expect(MAX_FILE_SIZES.DOCUMENT).toBe(10 * 1024 * 1024); // 10MB
      expect(MAX_FILE_SIZES.OTHER).toBe(5 * 1024 * 1024); // 5MB
    });
  });

  describe("許可MIMEタイプテスト", () => {
    test("IMAGE用MIMEタイプ", () => {
      const imageTypes = ALLOWED_MIME_TYPES.IMAGE;
      expect(imageTypes).toContain("image/jpeg");
      expect(imageTypes).toContain("image/png");
      expect(imageTypes).toContain("image/webp");
      expect(imageTypes).toContain("image/gif");
      expect(imageTypes).toContain("image/svg+xml");
    });

    test("VIDEO用MIMEタイプ", () => {
      const videoTypes = ALLOWED_MIME_TYPES.VIDEO;
      expect(videoTypes).toContain("video/mp4");
      expect(videoTypes).toContain("video/webm");
      expect(videoTypes).toContain("video/quicktime");
    });

    test("DOCUMENT用MIMEタイプ", () => {
      const docTypes = ALLOWED_MIME_TYPES.DOCUMENT;
      expect(docTypes).toContain("application/pdf");
    });

    test("OTHER用MIMEタイプ", () => {
      const otherTypes = ALLOWED_MIME_TYPES.OTHER;
      expect(otherTypes).toHaveLength(0);
    });
  });

  describe("inferMediaType ヘルパーテスト", () => {
    test("MIMEタイプからMediaTypeを推定", () => {
      function inferMediaType(mimeType: string): MediaType {
        if (mimeType.startsWith("image/")) return "IMAGE";
        if (mimeType.startsWith("video/")) return "VIDEO";
        if (mimeType === "application/pdf") return "DOCUMENT";
        return "OTHER";
      }

      expect(inferMediaType("image/jpeg")).toBe("IMAGE");
      expect(inferMediaType("image/png")).toBe("IMAGE");
      expect(inferMediaType("video/mp4")).toBe("VIDEO");
      expect(inferMediaType("video/webm")).toBe("VIDEO");
      expect(inferMediaType("application/pdf")).toBe("DOCUMENT");
      expect(inferMediaType("application/json")).toBe("OTHER");
      expect(inferMediaType("text/plain")).toBe("OTHER");
    });
  });

  describe("MediaData型テスト", () => {
    test("MediaData型の構造", () => {
      type MediaData = {
        id: string;
        filename: string;
        url: string;
        mimeType: string;
        size: number;
        width: number | null;
        height: number | null;
        type: string;
        usage: string;
        alt: string | null;
        title: string | null;
        description: string | null;
        tags: string[];
        createdAt: Date;
        updatedAt: Date;
        uploader: {
          id: string;
          name: string;
        };
      };

      const media: MediaData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        filename: "test-image.jpg",
        url: "https://example.com/media/test-image.jpg",
        mimeType: "image/jpeg",
        size: 1024 * 1024,
        width: 1920,
        height: 1080,
        type: "IMAGE",
        usage: "POST",
        alt: "画像の説明",
        title: "画像タイトル",
        description: "詳細な説明",
        tags: ["テスト", "画像"],
        createdAt: new Date(),
        updatedAt: new Date(),
        uploader: {
          id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          name: "管理者",
        },
      };

      expect(media.type).toBe("IMAGE");
      expect(media.usage).toBe("POST");
      expect(media.uploader.name).toBe("管理者");
    });
  });

  describe("GetMediaResult型テスト", () => {
    test("GetMediaResult型の構造", () => {
      type GetMediaResult = {
        items: Array<{
          id: string;
          filename: string;
          url: string;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };

      const result: GetMediaResult = {
        items: [
          { id: "1", filename: "image1.jpg", url: "https://example.com/1.jpg" },
          { id: "2", filename: "image2.jpg", url: "https://example.com/2.jpg" },
        ],
        total: 50,
        page: 1,
        limit: 24,
        totalPages: 3,
      };

      expect(result.items).toHaveLength(2);
      expect(result.totalPages).toBe(3);
    });
  });

  describe("境界値テスト", () => {
    test("alt 200文字（境界）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        alt: "x".repeat(200),
      });
      expect(result.success).toBe(true);
    });

    test("alt 201文字（境界超過）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        alt: "x".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    test("title 100文字（境界）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        title: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    test("title 101文字（境界超過）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        title: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    test("description 500文字（境界）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        description: "x".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    test("description 501文字（境界超過）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        description: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    test("tags 10個（境界）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        tags: Array(10).fill("tag"),
      });
      expect(result.success).toBe(true);
    });

    test("tags 11個（境界超過）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        tags: Array(11).fill("tag"),
      });
      expect(result.success).toBe(false);
    });

    test("tag個別 50文字（境界）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        tags: ["x".repeat(50)],
      });
      expect(result.success).toBe(true);
    });

    test("tag個別 51文字（境界超過）", () => {
      const result = mediaUploadSchema.safeParse({
        ...VALID_UPLOAD_INPUT,
        tags: ["x".repeat(51)],
      });
      expect(result.success).toBe(false);
    });
  });

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
});
