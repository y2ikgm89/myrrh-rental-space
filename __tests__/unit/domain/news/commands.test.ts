import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック（import より前に定義）
const mockNewsFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockNewsCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "news-1", slug: "test-news" }),
);
const mockNewsUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "news-1" }),
);
const mockNewsDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "news-1" }),
);
const mockNewsVersionFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockNewsVersionFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockNewsVersionCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "version-1" }),
);
const mockTransaction = mock<(ops: unknown[]) => Promise<unknown[]>>((ops) =>
  Promise.resolve(ops as unknown[]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    news: {
      findUnique: mockNewsFindUnique,
      create: mockNewsCreate,
      update: mockNewsUpdate,
      delete: mockNewsDelete,
    },
    newsVersion: {
      findFirst: mockNewsVersionFindFirst,
      findUnique: mockNewsVersionFindUnique,
      create: mockNewsVersionCreate,
    },
    $transaction: mockTransaction,
  },
}));

mock.module("@/shared/db/json", () => ({
  parsePrismaInputJson: mock((value: string, _errorMessage: string) => {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error("本文データが不正です");
    }
  }),
}));

// checkSlugAvailability と getSlugErrorMessage をモック
const mockCheckSlugAvailability = mock<
  () => Promise<{ available: boolean; reason?: unknown }>
>(() => Promise.resolve({ available: true }));

mock.module("@/shared/lib/slug-validation", () => ({
  checkSlugAvailability: mockCheckSlugAvailability,
  getSlugErrorMessage: mock((reason: { type: string }) => {
    if (reason.type === "reserved") return "予約済みスラッグです";
    return "このスラッグは既に使用されています";
  }),
}));

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: mock(<T extends Record<string, unknown>>(obj: T): T => {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as T;
  }),
}));

import {
  createNews,
  updateNewsBody,
  updateNewsSettings,
  deleteNews,
  publishNews,
  unpublishNews,
  createNewsBackup,
  restoreNewsVersion,
} from "@/shared/domain/news/commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const NEWS_ID = "news-1";
const NEWS_SLUG = "test-news";
const USER_ID = "user-1";

const EXISTING_NEWS = {
  id: NEWS_ID,
  slug: NEWS_SLUG,
};

const VALID_CREATE_INPUT = {
  slug: NEWS_SLUG,
  title: "テストお知らせ",
  contentJson: '{"root":{"children":[]}}',
  contentHtml: "<p>テストコンテンツ</p>",
};

const VALID_UPDATE_BODY_INPUT = {
  contentJson: '{"root":{"children":[]}}',
  contentHtml: "<p>更新後コンテンツ</p>",
};

const VALID_UPDATE_SETTINGS_INPUT = {
  slug: NEWS_SLUG,
  title: "更新後タイトル",
  contentWidth: null,
  contentWidthCustom: null,
  metaDescription: null,
  metaKeywords: null,
  ogpTitle: null,
  ogpDescription: null,
  ogpImageUrl: null,
};

// ============================================================================
// createNews
// ============================================================================

describe("createNews", () => {
  beforeEach(() => {
    mockCheckSlugAvailability.mockReset();
    mockNewsCreate.mockReset();
    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockNewsCreate.mockResolvedValue({ id: NEWS_ID, slug: NEWS_SLUG });
  });

  describe("正常系", () => {
    test("有効な入力でお知らせを作成し id と slug を返す", async () => {
      const result = await createNews(VALID_CREATE_INPUT);

      expect(result).toEqual({ id: NEWS_ID, slug: NEWS_SLUG });
      expect(mockNewsCreate).toHaveBeenCalledTimes(1);
    });

    test("create が isPublished: false で呼ばれる", async () => {
      await createNews(VALID_CREATE_INPUT);

      expect(mockNewsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
          }),
        }),
      );
    });

    test("contentJson が空文字の場合も作成できる", async () => {
      await createNews({ ...VALID_CREATE_INPUT, contentJson: "" });

      expect(mockNewsCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("スラッグが使用不可の場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "news", id: "other-news" },
      });

      await expect(createNews(VALID_CREATE_INPUT)).rejects.toThrow(DomainError);
      await expect(createNews(VALID_CREATE_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("スラッグが予約済みの場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "reserved", path: "admin" },
      });

      await expect(createNews(VALID_CREATE_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("スラッグが使用不可の場合 create が呼ばれない", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "reserved", path: "admin" },
      });

      await expect(createNews(VALID_CREATE_INPUT)).rejects.toThrow(DomainError);
      expect(mockNewsCreate).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// updateNewsBody
// ============================================================================

describe("updateNewsBody", () => {
  beforeEach(() => {
    mockNewsFindUnique.mockReset();
    mockNewsUpdate.mockReset();
    mockNewsFindUnique.mockResolvedValue(EXISTING_NEWS);
    mockNewsUpdate.mockResolvedValue({ id: NEWS_ID });
  });

  describe("正常系", () => {
    test("本文のみを更新し既存のスラッグを返す", async () => {
      const result = await updateNewsBody(NEWS_ID, VALID_UPDATE_BODY_INPUT);

      expect(result).toEqual({
        oldSlug: NEWS_SLUG,
        slug: NEWS_SLUG,
      });
      expect(mockNewsUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しないお知らせの場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(
        updateNewsBody("non-existent", VALID_UPDATE_BODY_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お知らせが見つかりません",
      });
    });
  });
});

// ============================================================================
// updateNewsSettings
// ============================================================================

describe("updateNewsSettings", () => {
  beforeEach(() => {
    mockNewsFindUnique.mockReset();
    mockCheckSlugAvailability.mockReset();
    mockNewsUpdate.mockReset();
    mockNewsFindUnique.mockResolvedValue(EXISTING_NEWS);
    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockNewsUpdate.mockResolvedValue({ id: NEWS_ID });
  });

  describe("正常系", () => {
    test("有効な入力で設定を更新し oldSlug と slug を返す", async () => {
      const result = await updateNewsSettings(
        NEWS_ID,
        VALID_UPDATE_SETTINGS_INPUT,
      );

      expect(result).toEqual({
        oldSlug: NEWS_SLUG,
        slug: NEWS_SLUG,
      });
      expect(mockNewsUpdate).toHaveBeenCalledTimes(1);
    });

    test("スラッグが変更された場合に oldSlug と新しい slug を返す", async () => {
      const newSlug = "updated-news-slug";
      const result = await updateNewsSettings(NEWS_ID, {
        ...VALID_UPDATE_SETTINGS_INPUT,
        slug: newSlug,
      });

      expect(result).toEqual({
        oldSlug: NEWS_SLUG,
        slug: newSlug,
      });
    });

    test("nullable フィールドに値を設定して更新できる", async () => {
      await updateNewsSettings(NEWS_ID, {
        ...VALID_UPDATE_SETTINGS_INPUT,
        metaDescription: "説明文",
        ogpTitle: "OGPタイトル",
      });

      expect(mockNewsUpdate).toHaveBeenCalledTimes(1);
    });

    test("nullable フィールドに空文字を渡すと null として保存される", async () => {
      await updateNewsSettings(NEWS_ID, {
        ...VALID_UPDATE_SETTINGS_INPUT,
        metaDescription: "",
        ogpTitle: "",
      });

      expect(mockNewsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metaDescription: null,
            ogpTitle: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないお知らせの場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(
        updateNewsSettings("non-existent", VALID_UPDATE_SETTINGS_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お知らせが見つかりません",
      });
    });

    test("お知らせが見つからない場合 update が呼ばれない", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(
        updateNewsSettings("non-existent", VALID_UPDATE_SETTINGS_INPUT),
      ).rejects.toThrow(DomainError);
      expect(mockNewsUpdate).not.toHaveBeenCalled();
    });

    test("新スラッグが既に使用されている場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "post", id: "other-post" },
      });

      await expect(
        updateNewsSettings(NEWS_ID, {
          ...VALID_UPDATE_SETTINGS_INPUT,
          slug: "taken-slug",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });
});

// ============================================================================
// deleteNews
// ============================================================================

describe("deleteNews", () => {
  beforeEach(() => {
    mockNewsFindUnique.mockReset();
    mockNewsDelete.mockReset();
    mockNewsFindUnique.mockResolvedValue(EXISTING_NEWS);
    mockNewsDelete.mockResolvedValue({ id: NEWS_ID });
  });

  describe("正常系", () => {
    test("お知らせを削除し slug を返す", async () => {
      const result = await deleteNews(NEWS_ID);

      expect(result).toEqual({ slug: NEWS_SLUG });
      expect(mockNewsDelete).toHaveBeenCalledTimes(1);
    });

    test("delete が正しい ID で呼ばれる", async () => {
      await deleteNews(NEWS_ID);

      expect(mockNewsDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NEWS_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないお知らせの場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(deleteNews("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お知らせが見つかりません",
      });
    });

    test("お知らせが見つからない場合 delete が呼ばれない", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(deleteNews("non-existent")).rejects.toThrow(DomainError);
      expect(mockNewsDelete).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// publishNews
// ============================================================================

describe("publishNews", () => {
  const NEWS_FOR_PUBLISH = {
    id: NEWS_ID,
    slug: NEWS_SLUG,
    publishedAt: null,
    contentHtml: "<p>コンテンツ</p>",
    contentJson: { root: { children: [] } },
  };

  beforeEach(() => {
    mockNewsFindUnique.mockReset();
    mockNewsVersionFindFirst.mockReset();
    mockTransaction.mockReset();
    mockNewsFindUnique.mockResolvedValue(NEWS_FOR_PUBLISH);
    mockNewsVersionFindFirst.mockResolvedValue(null);
    mockTransaction.mockResolvedValue([{}, {}]);
  });

  describe("正常系", () => {
    test("お知らせを公開し slug と version を返す（初回公開）", async () => {
      const result = await publishNews(NEWS_ID, USER_ID);

      expect(result).toEqual({ slug: NEWS_SLUG, version: 1 });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    test("既存バージョンがある場合はバージョンがインクリメントされる", async () => {
      mockNewsVersionFindFirst.mockResolvedValue({ version: 3 });

      const result = await publishNews(NEWS_ID, USER_ID);

      expect(result).toEqual({ slug: NEWS_SLUG, version: 4 });
    });

    test("既に publishedAt がある場合は上書きしない（$transaction に渡すデータ確認）", async () => {
      const existingPublishedAt = new Date("2024-01-01");
      mockNewsFindUnique.mockResolvedValue({
        ...NEWS_FOR_PUBLISH,
        publishedAt: existingPublishedAt,
      });

      await publishNews(NEWS_ID, USER_ID);

      // $transaction が呼ばれることを確認
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しないお知らせの場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(publishNews("non-existent", USER_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お知らせが見つかりません",
      });
    });

    test("お知らせが見つからない場合 $transaction が呼ばれない", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(publishNews("non-existent", USER_ID)).rejects.toThrow(
        DomainError,
      );
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// unpublishNews
// ============================================================================

describe("unpublishNews", () => {
  beforeEach(() => {
    mockNewsFindUnique.mockReset();
    mockNewsUpdate.mockReset();
    mockNewsFindUnique.mockResolvedValue(EXISTING_NEWS);
    mockNewsUpdate.mockResolvedValue({ id: NEWS_ID });
  });

  describe("正常系", () => {
    test("お知らせを非公開にし slug を返す", async () => {
      const result = await unpublishNews(NEWS_ID);

      expect(result).toEqual({ slug: NEWS_SLUG });
      expect(mockNewsUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が isPublished: false で呼ばれる", async () => {
      await unpublishNews(NEWS_ID);

      expect(mockNewsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPublished: false },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないお知らせの場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(unpublishNews("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お知らせが見つかりません",
      });
    });

    test("お知らせが見つからない場合 update が呼ばれない", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(unpublishNews("non-existent")).rejects.toThrow(DomainError);
      expect(mockNewsUpdate).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// createNewsBackup
// ============================================================================

describe("createNewsBackup", () => {
  const NEWS_FOR_BACKUP = {
    id: NEWS_ID,
    contentHtml: "<p>コンテンツ</p>",
    contentJson: { root: { children: [] } },
  };

  beforeEach(() => {
    mockNewsFindUnique.mockReset();
    mockNewsVersionFindFirst.mockReset();
    mockNewsVersionCreate.mockReset();
    mockNewsFindUnique.mockResolvedValue(NEWS_FOR_BACKUP);
    mockNewsVersionFindFirst.mockResolvedValue(null);
    mockNewsVersionCreate.mockResolvedValue({ id: "version-1" });
  });

  describe("正常系", () => {
    test("バックアップを作成し version を返す（初回）", async () => {
      const result = await createNewsBackup(NEWS_ID, USER_ID);

      expect(result).toEqual({ version: 1 });
      expect(mockNewsVersionCreate).toHaveBeenCalledTimes(1);
    });

    test("既存バージョンがある場合はバージョンがインクリメントされる", async () => {
      mockNewsVersionFindFirst.mockResolvedValue({ version: 2 });

      const result = await createNewsBackup(NEWS_ID, USER_ID);

      expect(result).toEqual({ version: 3 });
    });

    test("newsVersion.create が正しい newsId で呼ばれる", async () => {
      await createNewsBackup(NEWS_ID, USER_ID);

      expect(mockNewsVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newsId: NEWS_ID,
            createdBy: USER_ID,
          }),
        }),
      );
    });

    test("contentJson が null の場合も正常にバックアップできる", async () => {
      mockNewsFindUnique.mockResolvedValue({
        ...NEWS_FOR_BACKUP,
        contentJson: null,
      });

      const result = await createNewsBackup(NEWS_ID, USER_ID);

      expect(result).toEqual({ version: 1 });
    });
  });

  describe("異常系", () => {
    test("存在しないお知らせの場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(
        createNewsBackup("non-existent", USER_ID),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お知らせが見つかりません",
      });
    });

    test("お知らせが見つからない場合 newsVersion.create が呼ばれない", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(createNewsBackup("non-existent", USER_ID)).rejects.toThrow(
        DomainError,
      );
      expect(mockNewsVersionCreate).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// restoreNewsVersion
// ============================================================================

describe("restoreNewsVersion", () => {
  const VERSION_DATA = {
    contentHtml: "<p>バージョン1のコンテンツ</p>",
    contentJson: { root: { children: [] } },
  };

  beforeEach(() => {
    mockNewsVersionFindUnique.mockReset();
    mockNewsFindUnique.mockReset();
    mockNewsUpdate.mockReset();
    mockNewsVersionFindUnique.mockResolvedValue(VERSION_DATA);
    mockNewsFindUnique.mockResolvedValue({ slug: NEWS_SLUG });
    mockNewsUpdate.mockResolvedValue({ id: NEWS_ID });
  });

  describe("正常系", () => {
    test("バージョンを復元し slug を返す", async () => {
      const result = await restoreNewsVersion(NEWS_ID, 1);

      expect(result).toEqual({ slug: NEWS_SLUG });
      expect(mockNewsUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が isPublished: false で呼ばれる", async () => {
      await restoreNewsVersion(NEWS_ID, 1);

      expect(mockNewsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
          }),
        }),
      );
    });

    test("update が正しいコンテンツで呼ばれる", async () => {
      await restoreNewsVersion(NEWS_ID, 1);

      expect(mockNewsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentHtml: VERSION_DATA.contentHtml,
          }),
        }),
      );
    });

    test("contentJson が null のバージョンも復元できる", async () => {
      mockNewsVersionFindUnique.mockResolvedValue({
        ...VERSION_DATA,
        contentJson: null,
      });

      const result = await restoreNewsVersion(NEWS_ID, 2);

      expect(result).toEqual({ slug: NEWS_SLUG });
    });
  });

  describe("異常系", () => {
    test("バージョンが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsVersionFindUnique.mockResolvedValue(null);

      await expect(restoreNewsVersion(NEWS_ID, 999)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "バージョンが見つかりません",
      });
    });

    test("お知らせが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockNewsFindUnique.mockResolvedValue(null);

      await expect(restoreNewsVersion("non-existent", 1)).rejects.toMatchObject(
        {
          code: "NOT_FOUND",
          message: "お知らせが見つかりません",
        },
      );
    });

    test("バージョンが見つからない場合 update が呼ばれない", async () => {
      mockNewsVersionFindUnique.mockResolvedValue(null);

      await expect(restoreNewsVersion(NEWS_ID, 999)).rejects.toThrow(
        DomainError,
      );
      expect(mockNewsUpdate).not.toHaveBeenCalled();
    });
  });
});
