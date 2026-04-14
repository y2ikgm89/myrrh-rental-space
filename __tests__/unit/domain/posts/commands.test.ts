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

const mockPostVersionFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostVersionFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostVersionCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "version-1" }),
);

const mockPostCategoryFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostCategoryFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockPostCategoryCreate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "category-1" }),
);

const mockPostCategoryUpdate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "category-1" }),
);

const mockPostCategoryDelete = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "category-1" }),
);

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
  (arg: unknown[] | ((tx: unknown) => Promise<unknown>)) => Promise<unknown>
>((arg) => {
  if (typeof arg === "function") {
    return Promise.resolve(null);
  }
  return Promise.resolve([]);
});

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
    postVersion: {
      findFirst: mockPostVersionFindFirst,
      findUnique: mockPostVersionFindUnique,
      create: mockPostVersionCreate,
    },
    postCategory: {
      findUnique: mockPostCategoryFindUnique,
      findFirst: mockPostCategoryFindFirst,
      create: mockPostCategoryCreate,
      update: mockPostCategoryUpdate,
      delete: mockPostCategoryDelete,
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
  },
}));

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
} from "@/shared/domain/posts/post-commands";
import {
  createPostBackup,
  restorePostVersion,
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  updatePostCategoryOrder,
  createPostTag,
  updatePostTag,
  deletePostTag,
} from "@/shared/domain/posts/commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const POST_ID = "post-1";
const POST_SLUG = "my-post";
const CATEGORY_ID = "category-1";
const TAG_ID = "tag-1";
const USER_ID = "user-1";
const VERSION = 1;

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
  contentHtml: "<p>テスト</p>",
  contentJson: '{"root":{}}',
};

const VALID_CATEGORY_INPUT = {
  name: "テストカテゴリ",
  slug: "test-category",
  description: null,
  order: 1,
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
    mockPostVersionFindFirst.mockReset();
    mockPostUpdate.mockReset();
    mockPostVersionCreate.mockReset();
    mockTransaction.mockReset();

    mockPostFindUnique.mockResolvedValue(EXISTING_POST_WITH_CONTENT);
    mockPostVersionFindFirst.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([]);
  });

  describe("正常系", () => {
    test("投稿を公開するとスラッグとバージョンを返す", async () => {
      const result = await publishPost(POST_ID, USER_ID);

      expect(result).toEqual({ slug: POST_SLUG, version: 1 });
    });

    test("既存バージョンがある場合はインクリメントされる", async () => {
      mockPostVersionFindFirst.mockResolvedValue({ version: 3 });

      const result = await publishPost(POST_ID, USER_ID);

      expect(result.version).toBe(4);
    });

    test("初回公開時は publishedAt が設定される", async () => {
      mockPostFindUnique.mockResolvedValue({
        ...EXISTING_POST_WITH_CONTENT,
        publishedAt: null,
      });

      const result = await publishPost(POST_ID, USER_ID);

      expect(result).toEqual({ slug: POST_SLUG, version: 1 });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    test("再公開時は既存の publishedAt が維持される", async () => {
      const existingDate = new Date("2024-01-15T12:00:00Z");
      mockPostFindUnique.mockResolvedValue({
        ...EXISTING_POST_WITH_CONTENT,
        publishedAt: existingDate,
      });

      const result = await publishPost(POST_ID, USER_ID);

      expect(result).toEqual({ slug: POST_SLUG, version: 1 });
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(publishPost(POST_ID, USER_ID)).rejects.toMatchObject({
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
          data: { status: "DRAFT" },
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
// createPostBackup
// =============================================================================

describe("createPostBackup", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostVersionFindFirst.mockReset();
    mockPostVersionCreate.mockReset();

    mockPostFindUnique.mockResolvedValue({
      id: POST_ID,
      contentHtml: "<p>テスト</p>",
      contentJson: '{"root":{}}',
    });
    mockPostVersionFindFirst.mockResolvedValue(null);
    mockPostVersionCreate.mockResolvedValue({ id: "version-1" });
  });

  describe("正常系", () => {
    test("バックアップを作成するとバージョン番号を返す", async () => {
      const result = await createPostBackup(POST_ID, USER_ID);

      expect(result).toEqual({ version: 1 });
      expect(mockPostVersionCreate).toHaveBeenCalledTimes(1);
    });

    test("既存バージョンがある場合はインクリメントされる", async () => {
      mockPostVersionFindFirst.mockResolvedValue({ version: 5 });

      const result = await createPostBackup(POST_ID, USER_ID);

      expect(result).toEqual({ version: 6 });
    });

    test("バージョン作成時に正しい postId と userId が渡される", async () => {
      await createPostBackup(POST_ID, USER_ID);

      expect(mockPostVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: POST_ID,
            createdBy: USER_ID,
            version: 1,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(
        createPostBackup("non-existent", USER_ID),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "投稿記事が見つかりません",
      });
    });
  });
});

// =============================================================================
// restorePostVersion
// =============================================================================

describe("restorePostVersion", () => {
  beforeEach(() => {
    mockPostVersionFindUnique.mockReset();
    mockPostFindUnique.mockReset();
    mockPostUpdate.mockReset();

    mockPostVersionFindUnique.mockResolvedValue({
      contentHtml: "<p>バージョン1</p>",
      contentJson: '{"root":{}}',
    });
    mockPostFindUnique.mockResolvedValue({ slug: POST_SLUG });
    mockPostUpdate.mockResolvedValue({ id: POST_ID });
  });

  describe("正常系", () => {
    test("バージョンを復元するとスラッグを返す", async () => {
      const result = await restorePostVersion(POST_ID, VERSION);

      expect(result).toEqual({ slug: POST_SLUG });
      expect(mockPostUpdate).toHaveBeenCalledTimes(1);
    });

    test("復元後は status が DRAFT になる", async () => {
      await restorePostVersion(POST_ID, VERSION);

      expect(mockPostUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DRAFT",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("バージョンが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostVersionFindUnique.mockResolvedValue(null);

      await expect(restorePostVersion(POST_ID, 999)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "バージョンが見つかりません",
      });
    });

    test("投稿が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostFindUnique.mockResolvedValue(null);

      await expect(restorePostVersion(POST_ID, VERSION)).rejects.toMatchObject({
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

    mockPostCategoryFindFirst.mockResolvedValue(null);
    mockPostCategoryCreate.mockResolvedValue({ id: "category-1" });
  });

  describe("正常系", () => {
    test("カテゴリを作成すると id を返す", async () => {
      const result = await createPostCategory(VALID_CATEGORY_INPUT);

      expect(result).toEqual({ id: "category-1" });
      expect(mockPostCategoryCreate).toHaveBeenCalledTimes(1);
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
    mockPostCategoryUpdate.mockReset();
    mockTransaction.mockReset();

    mockTransaction.mockResolvedValue([]);
  });

  describe("正常系", () => {
    test("空配列の場合は何もしない", async () => {
      await expect(updatePostCategoryOrder([])).resolves.toBeUndefined();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("複数アイテムの順序を一括更新できる", async () => {
      const items = [
        { id: "cat-1", order: 1 },
        { id: "cat-2", order: 2 },
        { id: "cat-3", order: 3 },
      ];

      await expect(updatePostCategoryOrder(items)).resolves.toBeUndefined();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
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
