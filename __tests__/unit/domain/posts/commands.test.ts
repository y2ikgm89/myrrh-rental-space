import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より先に定義）
const mockPostFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);

const mockPostCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "post-1", slug: "my-post" }),
);

const mockPostUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "post-1" }),
);

const mockPostDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "post-1" }),
);

const mockPostCategoryFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostCategoryFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostCategoryFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));

const mockPostCategoryCreate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "category-1" }),
);

const mockPostCategoryUpdate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "category-1" }),
);

const mockPostCategoryDelete = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "category-1" }),
);

const mockPostCategoryAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));

const mockPostTagFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostTagFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostTagCount = mock<() => Promise<number>>(() => Promise.resolve(0));

const mockPostTagCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "tag-1" }),
);

const mockPostTagUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "tag-1" }),
);

const mockPostTagDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "tag-1" }),
);

// $transaction はバッチ配列を受け取るパターンと関数パターン両方に対応
const mockTransaction = mock<
  (
    arg:
      | unknown[]
      | ((tx: {
          $executeRaw: typeof mockExecuteRaw;
          postCategory: {
            create: typeof mockPostCategoryCreate;
            aggregate: typeof mockPostCategoryAggregate;
          };
        }) => Promise<unknown>),
  ) => Promise<unknown>
>((arg) => {
  if (typeof arg === "function") {
    return arg({
      $executeRaw: mockExecuteRaw,
      postCategory: {
        create: mockPostCategoryCreate,
        aggregate: mockPostCategoryAggregate,
      },
    });
  }
  return Promise.resolve([]);
});
const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: {
      findUnique: mockPostFindUnique,
      create: mockPostCreate,
      update: mockPostUpdate,
      delete: mockPostDelete,
    },
    postCategory: {
      findUnique: mockPostCategoryFindUnique,
      findFirst: mockPostCategoryFindFirst,
      findMany: mockPostCategoryFindMany,
      create: mockPostCategoryCreate,
      update: mockPostCategoryUpdate,
      delete: mockPostCategoryDelete,
      aggregate: mockPostCategoryAggregate,
    },
    postTag: {
      findUnique: mockPostTagFindUnique,
      findFirst: mockPostTagFindFirst,
      count: mockPostTagCount,
      create: mockPostTagCreate,
      update: mockPostTagUpdate,
      delete: mockPostTagDelete,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

type SqlFragment = { __sql: string; __values: unknown[] };

function isSqlFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === "object" &&
    value !== null &&
    "__sql" in value &&
    "__values" in value
  );
}

mock.module("@generated/prisma/client", () => {
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) {
        const value = values[i];
        combined += isSqlFragment(value) ? value.__sql : "?";
      }
    }
    return { __sql: combined, __values: values };
  };

  return {
    Prisma: {
      sql,
      join: (items: SqlFragment[], separator = ", ") => ({
        __sql: items.map((item) => item.__sql).join(separator),
        __values: items.flatMap((item) => item.__values),
      }),
    },
  };
});

mock.module("@generated/prisma/enums", () => ({
  PostStatus: {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED",
  },
}));

// slug-validation モック（checkSlugAvailability を利用するため）
const mockCheckSlugAvailability = mock<
  () => Promise<{ available: boolean; reason?: Record<string, unknown> }>
>(() => Promise.resolve({ available: true }));

const mockGetSlugErrorMessage = mock<
  (reason: Record<string, unknown>) => string
>((reason) => {
  if (reason["type"] === "reserved")
    return `「${String(reason["path"])}」はシステムで予約されているため使用できません`;
  return "このスラッグは既に投稿で使用されています";
});

mock.module("@/shared/lib/slug-validation", () => ({
  checkSlugAvailability: mockCheckSlugAvailability,
  getSlugErrorMessage: mockGetSlugErrorMessage,
}));

// parsePrismaInputJson モック（contentJson のパース用）
mock.module("@/shared/db/json", () => ({
  parsePrismaInputJson: mock((json: unknown, _errMsg: string) => {
    if (!json) return undefined;
    try {
      return typeof json === "string" ? JSON.parse(json) : json;
    } catch {
      return undefined;
    }
  }),
}));

import {
  createPost,
  updatePostBody,
  updatePostSettings,
  deletePost,
  publishPost,
  unpublishPost,
  archivePost,
} from "@/shared/domain/posts/post-commands";
import {
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  updatePostCategoryOrder,
} from "@/shared/domain/posts/category-commands";
import {
  createPostTag,
  updatePostTag,
  deletePostTag,
} from "@/shared/domain/posts/tag-commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const POST_ID = "post-1";
const POST_SLUG = "my-post";
const CATEGORY_ID = "category-1";
const TAG_ID = "tag-1";
const USER_ID = "user-1";

const VALID_CREATE_INPUT = {
  title: "テスト投稿",
  slug: "test-post",
  excerpt: "概要テキスト",
  contentJson: '{"root":{}}',
  contentHtml: "<p>テスト</p>",
  thumbnailUrl: "https://example.com/thumb.jpg",
  ogpImageUrl: null,
  categoryId: CATEGORY_ID,
  tags: [],
  metaDescription: null,
  metaKeywords: null,
  ogpTitle: null,
  ogpDescription: null,
  contentWidth: null,
  contentWidthCustom: null,
  authorId: USER_ID,
};

const VALID_UPDATE_BODY_INPUT = {
  contentJson: '{"root":{}}',
  contentHtml: "<p>更新テスト</p>",
};

const VALID_UPDATE_SETTINGS_INPUT = {
  title: "更新テスト投稿",
  slug: "test-post-updated",
  excerpt: "更新概要",
  thumbnailUrl: "https://example.com/thumb-updated.jpg",
  ogpImageUrl: null,
  categoryId: CATEGORY_ID,
  tags: [],
  metaDescription: null,
  metaKeywords: null,
  ogpTitle: null,
  ogpDescription: null,
  status: "DRAFT" as const,
  publishedAt: null,
  contentWidth: null,
  contentWidthCustom: null,
};

const EXISTING_POST = {
  id: POST_ID,
  slug: POST_SLUG,
};

const EXISTING_POST_WITH_CONTENT = {
  id: POST_ID,
  slug: POST_SLUG,
  publishedAt: null,
};

const VALID_CATEGORY_INPUT = {
  name: "テストカテゴリ",
  slug: "test-category",
  description: null,
  metaTitle: null,
  metaDescription: null,
  ogpImageUrl: null,
};

const VALID_TAG_INPUT = {
  name: "テストタグ",
  slug: "test-tag",
  description: null,
  metaTitle: null,
  metaDescription: null,
  ogpImageUrl: null,
};

// =============================================================================
// createPost
// =============================================================================

describe("createPost", () => {
  beforeEach(() => {
    mockCheckSlugAvailability.mockReset();
    mockPostCategoryFindUnique.mockReset();
    mockPostTagCount.mockReset();
    mockPostCreate.mockReset();

    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockPostCategoryFindUnique.mockResolvedValue({ id: CATEGORY_ID });
    mockPostTagCount.mockResolvedValue(0);
    mockPostCreate.mockResolvedValue({ id: POST_ID, slug: "test-post" });
  });

  describe("正常系", () => {
    test("有効な入力で投稿を作成できる", async () => {
      const result = await createPost(VALID_CREATE_INPUT);

      expect(result).toEqual({ id: POST_ID, slug: "test-post" });
      expect(mockPostCreate).toHaveBeenCalledTimes(1);
    });

    test("タグが複数ある場合も作成できる", async () => {
      mockPostTagCount.mockResolvedValue(2);
      const input = { ...VALID_CREATE_INPUT, tags: [TAG_ID, "tag-2"] };

      const result = await createPost(input);

      expect(result).toEqual({ id: POST_ID, slug: "test-post" });
    });

    test("contentJson が空文字の場合も作成できる（undefined として保存）", async () => {
      const input = { ...VALID_CREATE_INPUT, contentJson: "" };

      await createPost(input);

      expect(mockPostCreate).toHaveBeenCalledTimes(1);
    });

    test("nullable な文字列フィールドは null に正規化される", async () => {
      const input = {
        ...VALID_CREATE_INPUT,
        ogpImageUrl: "",
        metaDescription: "",
      };

      await createPost(input);

      expect(mockPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ogpImageUrl: null,
            metaDescription: null,
          }),
        }),
      );
    });

    test("作成時にレイアウト設定も保存される", async () => {
      await createPost({
        ...VALID_CREATE_INPUT,
        contentWidth: "CUSTOM",
        contentWidthCustom: 960,
      });

      expect(mockPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentWidth: "CUSTOM",
            contentWidthCustom: 960,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スラッグが使用不可の場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "post", id: "other-post" },
      });

      await expect(createPost(VALID_CREATE_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(createPost(VALID_CREATE_INPUT)).rejects.toThrow(DomainError);
    });

    test("カテゴリが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostCategoryFindUnique.mockResolvedValue(null);

      await expect(createPost(VALID_CREATE_INPUT)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("タグが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostTagCount.mockResolvedValue(0);
      const input = { ...VALID_CREATE_INPUT, tags: [TAG_ID] };

      await expect(createPost(input)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "タグが見つかりません",
      });
    });
  });
});

// =============================================================================
// updatePostBody
// =============================================================================

describe("updatePostBody", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostUpdate.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST);
    mockPostUpdate.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("本文のみを更新でき、既存のスラッグを返す", async () => {
      const result = await updatePostBody(POST_ID, VALID_UPDATE_BODY_INPUT);

      expect(result).toEqual({
        oldSlug: POST_SLUG,
        slug: POST_SLUG,
      });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(
        updatePostBody(POST_ID, VALID_UPDATE_BODY_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });
  });
});

// =============================================================================
// updatePostSettings
// =============================================================================

describe("updatePostSettings", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockCheckSlugAvailability.mockReset();
    mockPostCategoryFindUnique.mockReset();
    mockPostTagCount.mockReset();
    mockPostUpdate.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST);
    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockPostCategoryFindUnique.mockResolvedValue({ id: CATEGORY_ID });
    mockPostTagCount.mockResolvedValue(0);
    mockPostUpdate.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("有効な入力で設定を更新でき、oldSlug と新しいスラッグを返す", async () => {
      const result = await updatePostSettings(
        POST_ID,
        VALID_UPDATE_SETTINGS_INPUT,
      );

      expect(result).toEqual({
        oldSlug: POST_SLUG,
        slug: "test-post-updated",
      });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });

    test("スラッグが変わっていない場合も更新できる", async () => {
      const input = { ...VALID_UPDATE_SETTINGS_INPUT, slug: POST_SLUG };
      mockCheckSlugAvailability.mockResolvedValue({ available: true });

      const result = await updatePostSettings(POST_ID, input);

      expect(result.slug).toBe(POST_SLUG);
    });

    test("公開ステータスと公開日時も設定更新で永続化される", async () => {
      const publishedAt = new Date("2026-01-02T03:04:00.000Z");

      await updatePostSettings(POST_ID, {
        ...VALID_UPDATE_SETTINGS_INPUT,
        status: "PUBLISHED",
        publishedAt,
      });

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PUBLISHED",
            publishedAt,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(
        updatePostSettings(POST_ID, VALID_UPDATE_SETTINGS_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });

    test("新スラッグが使用不可の場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "post", id: "other-post" },
      });

      await expect(
        updatePostSettings(POST_ID, VALID_UPDATE_SETTINGS_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("カテゴリが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostCategoryFindUnique.mockResolvedValue(null);

      await expect(
        updatePostSettings(POST_ID, VALID_UPDATE_SETTINGS_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });
  });
});

// =============================================================================
// deletePost
// =============================================================================

describe("deletePost", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostDelete.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST);
    mockPostDelete.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("投稿を削除するとスラッグを返す", async () => {
      const result = await deletePost(POST_ID);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostDelete).toHaveBeenCalledTimes(1);
    });

    test("正しいIDで delete が呼ばれる", async () => {
      await deletePost(POST_ID);

      expect(mockPostDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: POST_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(deletePost("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });

    test("存在しない投稿では delete が呼ばれない", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(deletePost("non-existent")).rejects.toThrow(DomainError);

      expect(mockPostDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// publishPost
// =============================================================================

describe("publishPost", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostUpdate.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST_WITH_CONTENT);
    mockPostUpdate.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("投稿を公開するとスラッグを返す", async () => {
      const result = await publishPost(POST_ID);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });

    test("初回公開時は publishedAt が設定される", async () => {
      mockPostFindUnique.mockResolvedValue({
        ...EXISTING_POST_WITH_CONTENT,
        publishedAt: null,
      });

      const result = await publishPost(POST_ID);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });

    test("再公開時は既存の publishedAt が維持される", async () => {
      const existingDate = new Date("2024-01-15T12:00:00Z");
      mockPostFindUnique.mockResolvedValue({
        ...EXISTING_POST_WITH_CONTENT,
        publishedAt: existingDate,
      });

      const result = await publishPost(POST_ID);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: existingDate,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(publishPost(POST_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });
  });
});

// =============================================================================
// unpublishPost
// =============================================================================

describe("unpublishPost", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostUpdate.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST);
    mockPostUpdate.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("投稿を非公開にするとスラッグを返す", async () => {
      const result = await unpublishPost(POST_ID);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });

    test("status が DRAFT になるよう update が呼ばれる", async () => {
      await unpublishPost(POST_ID);

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DRAFT",
            publishedAt: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(unpublishPost("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });
  });
});

// =============================================================================
// archivePost
// =============================================================================

describe("archivePost", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostUpdate.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST);
    mockPostUpdate.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("投稿をアーカイブするとスラッグを返す", async () => {
      const result = await archivePost(POST_ID);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });

    test("status が ARCHIVED になるよう update が呼ばれる", async () => {
      await archivePost(POST_ID);

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ARCHIVED",
            publishedAt: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(archivePost("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });
  });
});

// =============================================================================
// createPostCategory
// =============================================================================

describe("createPostCategory", () => {
  beforeEach(() => {
    mockPostCategoryFindFirst.mockReset();
    mockPostCategoryCreate.mockReset();
    mockPostCategoryAggregate.mockReset();

    mockPostCategoryFindFirst.mockResolvedValue(null);
    mockPostCategoryCreate.mockResolvedValue({ id: "category-1" });
    mockPostCategoryAggregate.mockResolvedValue({ _max: { order: null } });
  });

  describe("正常系", () => {
    test("カテゴリを作成すると id を返す", async () => {
      const result = await createPostCategory(VALID_CATEGORY_INPUT);

      expect(result).toEqual({ id: "category-1" });
      expect(mockPostCategoryCreate).toHaveBeenCalledTimes(1);
    });

    test("order は末尾に自動採番される（maxOrder + 1）", async () => {
      mockPostCategoryAggregate.mockResolvedValue({ _max: { order: 7 } });

      await createPostCategory(VALID_CATEGORY_INPUT);

      expect(mockPostCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 8 }),
        }),
      );
    });

    test("description が空文字の場合 null に正規化される", async () => {
      const input = { ...VALID_CATEGORY_INPUT, description: "" };

      await createPostCategory(input);

      expect(mockPostCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("カテゴリ名が重複する場合 CONFLICT エラーをスローする", async () => {
      mockPostCategoryFindFirst.mockResolvedValue({
        name: "テストカテゴリ",
        slug: "other-slug",
      });

      await expect(
        createPostCategory(VALID_CATEGORY_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このカテゴリ名は既に使用されています",
      });
    });

    test("スラッグが重複する場合 CONFLICT エラーをスローする", async () => {
      mockPostCategoryFindFirst.mockResolvedValue({
        name: "他のカテゴリ",
        slug: "test-category",
      });

      await expect(
        createPostCategory(VALID_CATEGORY_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このスラッグは既に使用されています",
      });
    });
  });
});

// =============================================================================
// updatePostCategory
// =============================================================================

describe("updatePostCategory", () => {
  beforeEach(() => {
    mockPostCategoryFindFirst.mockReset();
    mockPostCategoryFindUnique.mockReset();
    mockPostCategoryUpdate.mockReset();

    mockPostCategoryFindFirst.mockResolvedValue(null);
    mockPostCategoryFindUnique.mockResolvedValue({ id: CATEGORY_ID });
    mockPostCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("有効な入力でカテゴリを更新できる", async () => {
      await expect(
        updatePostCategory(CATEGORY_ID, VALID_CATEGORY_INPUT),
      ).resolves.toBeUndefined();
      expect(mockPostCategoryUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("カテゴリが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostCategoryFindUnique.mockResolvedValue(null);

      await expect(
        updatePostCategory(CATEGORY_ID, VALID_CATEGORY_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("名前重複の場合 CONFLICT エラーをスローする（自分自身を除く）", async () => {
      mockPostCategoryFindFirst.mockResolvedValue({
        name: "テストカテゴリ",
        slug: "other-slug",
      });

      await expect(
        updatePostCategory(CATEGORY_ID, VALID_CATEGORY_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このカテゴリ名は既に使用されています",
      });
    });
  });
});

// =============================================================================
// deletePostCategory
// =============================================================================

describe("deletePostCategory", () => {
  beforeEach(() => {
    mockPostCategoryFindUnique.mockReset();
    mockPostCategoryDelete.mockReset();

    mockPostCategoryFindUnique.mockResolvedValue({
      id: CATEGORY_ID,
      _count: { posts: 0 },
    });
    mockPostCategoryDelete.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("記事が紐づいていないカテゴリを削除できる", async () => {
      await expect(deletePostCategory(CATEGORY_ID)).resolves.toBeUndefined();
      expect(mockPostCategoryDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("カテゴリが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostCategoryFindUnique.mockResolvedValue(null);

      await expect(deletePostCategory("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("記事が紐づいている場合 CONFLICT エラーをスローする", async () => {
      mockPostCategoryFindUnique.mockResolvedValue({
        id: CATEGORY_ID,
        _count: { posts: 3 },
      });

      await expect(deletePostCategory(CATEGORY_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このカテゴリには記事が紐づいているため削除できません",
      });
    });

    test("紐づき記事がある場合は delete が呼ばれない", async () => {
      mockPostCategoryFindUnique.mockResolvedValue({
        id: CATEGORY_ID,
        _count: { posts: 1 },
      });

      await expect(deletePostCategory(CATEGORY_ID)).rejects.toThrow(
        DomainError,
      );

      expect(mockPostCategoryDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updatePostCategoryOrder
// =============================================================================

describe("updatePostCategoryOrder", () => {
  beforeEach(() => {
    mockPostCategoryFindMany.mockReset();
    mockPostCategoryUpdate.mockReset();
    mockTransaction.mockReset();
    mockExecuteRaw.mockReset();

    mockTransaction.mockImplementation((arg) => {
      if (typeof arg === "function") {
        return arg({
          $executeRaw: mockExecuteRaw,
          postCategory: {
            create: mockPostCategoryCreate,
            aggregate: mockPostCategoryAggregate,
          },
        });
      }
      return Promise.resolve([]);
    });
    mockExecuteRaw.mockResolvedValue(0);
  });

  describe("正常系", () => {
    test("空配列の場合は何もしない", async () => {
      await expect(updatePostCategoryOrder([])).resolves.toBeUndefined();
      expect(mockPostCategoryFindMany).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("複数アイテムの順序を CASE WHEN 二段更新で更新できる", async () => {
      const items = [
        { id: "cat-1", order: 1 },
        { id: "cat-2", order: 2 },
        { id: "cat-3", order: 3 },
      ];
      mockPostCategoryFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      await expect(updatePostCategoryOrder(items)).resolves.toBeUndefined();
      expect(mockPostCategoryUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
      for (const call of mockExecuteRaw.mock.calls.slice(1)) {
        const sql = call[0].join("?");
        expect(sql).toContain("post_categories");
        expect(sql).toContain("CASE");
      }
    });
  });

  describe("異常系", () => {
    test("重複 ID は DB アクセス前に拒否する", async () => {
      await expect(
        updatePostCategoryOrder([
          { id: "cat-1", order: 1 },
          { id: "cat-1", order: 2 },
        ]),
      ).rejects.toThrow("同じIDを複数指定することはできません");

      expect(mockPostCategoryFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("重複 order は DB アクセス前に拒否する", async () => {
      await expect(
        updatePostCategoryOrder([
          { id: "cat-1", order: 1 },
          { id: "cat-2", order: 1 },
        ]),
      ).rejects.toThrow("同じ順序を複数指定することはできません");

      expect(mockPostCategoryFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("存在しない ID が混ざる場合 SQL が実行されない", async () => {
      const items = [
        { id: "cat-1", order: 1 },
        { id: "missing-id", order: 2 },
      ];
      mockPostCategoryFindMany.mockResolvedValueOnce([{ id: "cat-1" }]);

      await expect(updatePostCategoryOrder(items)).rejects.toThrow(
        "カテゴリが見つかりません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("既存 ID の subset は過不足として拒否する", async () => {
      const items = [
        { id: "cat-1", order: 1 },
        { id: "cat-2", order: 2 },
      ];
      mockPostCategoryFindMany.mockResolvedValueOnce([
        { id: "cat-1" },
        { id: "cat-2" },
        { id: "cat-3" },
      ]);

      await expect(updatePostCategoryOrder(items)).rejects.toThrow(
        "カテゴリ数が一致しません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// createPostTag
// =============================================================================

describe("createPostTag", () => {
  beforeEach(() => {
    mockPostTagFindFirst.mockReset();
    mockPostTagCreate.mockReset();

    mockPostTagFindFirst.mockResolvedValue(null);
    mockPostTagCreate.mockResolvedValue({ id: TAG_ID });
  });

  describe("正常系", () => {
    test("タグを作成すると id を返す", async () => {
      const result = await createPostTag(VALID_TAG_INPUT);

      expect(result).toEqual({ id: TAG_ID });
      expect(mockPostTagCreate).toHaveBeenCalledTimes(1);
    });

    test("description が空文字の場合 null に正規化される", async () => {
      const input = { ...VALID_TAG_INPUT, description: "" };

      await createPostTag(input);

      expect(mockPostTagCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("タグ名が重複する場合 CONFLICT エラーをスローする", async () => {
      mockPostTagFindFirst.mockResolvedValue({
        name: "テストタグ",
        slug: "other-slug",
      });

      await expect(createPostTag(VALID_TAG_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このタグ名は既に使用されています",
      });
    });

    test("スラッグが重複する場合 CONFLICT エラーをスローする", async () => {
      mockPostTagFindFirst.mockResolvedValue({
        name: "他のタグ",
        slug: "test-tag",
      });

      await expect(createPostTag(VALID_TAG_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このスラッグは既に使用されています",
      });
    });
  });
});

// =============================================================================
// updatePostTag
// =============================================================================

describe("updatePostTag", () => {
  beforeEach(() => {
    mockPostTagFindFirst.mockReset();
    mockPostTagFindUnique.mockReset();
    mockPostTagUpdate.mockReset();

    mockPostTagFindFirst.mockResolvedValue(null);
    mockPostTagFindUnique.mockResolvedValue({ id: TAG_ID });
    mockPostTagUpdate.mockResolvedValue({ id: TAG_ID });
  });

  describe("正常系", () => {
    test("有効な入力でタグを更新できる", async () => {
      await expect(
        updatePostTag(TAG_ID, VALID_TAG_INPUT),
      ).resolves.toBeUndefined();
      expect(mockPostTagUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("タグが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostTagFindUnique.mockResolvedValue(null);

      await expect(
        updatePostTag(TAG_ID, VALID_TAG_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "タグが見つかりません",
      });
    });

    test("タグ名重複の場合 CONFLICT エラーをスローする", async () => {
      mockPostTagFindFirst.mockResolvedValue({
        name: "テストタグ",
        slug: "other-slug",
      });

      await expect(
        updatePostTag(TAG_ID, VALID_TAG_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このタグ名は既に使用されています",
      });
    });
  });
});

// =============================================================================
// deletePostTag
// =============================================================================

describe("deletePostTag", () => {
  beforeEach(() => {
    mockPostTagFindUnique.mockReset();
    mockPostTagDelete.mockReset();

    mockPostTagFindUnique.mockResolvedValue({
      id: TAG_ID,
      _count: { posts: 0 },
    });
    mockPostTagDelete.mockResolvedValue({ id: TAG_ID });
  });

  describe("正常系", () => {
    test("記事で使用されていないタグを削除できる", async () => {
      await expect(deletePostTag(TAG_ID)).resolves.toBeUndefined();
      expect(mockPostTagDelete).toHaveBeenCalledTimes(1);
    });

    test("正しいタグIDで delete が呼ばれる", async () => {
      await deletePostTag(TAG_ID);

      expect(mockPostTagDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TAG_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("タグが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostTagFindUnique.mockResolvedValue(null);

      await expect(deletePostTag("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "タグが見つかりません",
      });
    });

    test("記事で使用中のタグは削除できず CONFLICT エラーをスローする", async () => {
      mockPostTagFindUnique.mockResolvedValue({
        id: TAG_ID,
        _count: { posts: 2 },
      });

      await expect(deletePostTag(TAG_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このタグは記事で使用されているため削除できません",
      });
    });

    test("記事で使用中のタグでは delete が呼ばれない", async () => {
      mockPostTagFindUnique.mockResolvedValue({
        id: TAG_ID,
        _count: { posts: 1 },
      });

      await expect(deletePostTag(TAG_ID)).rejects.toThrow(DomainError);

      expect(mockPostTagDelete).not.toHaveBeenCalled();
    });
  });
});
