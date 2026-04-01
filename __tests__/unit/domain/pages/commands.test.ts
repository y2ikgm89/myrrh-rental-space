import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より前に定義 — TDZ 回避）
const mockPageFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);

const mockPageCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "page-1", slug: "test-page" }),
);

const mockPageUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "page-1", slug: "test-page" }),
);

const mockPageDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "page-1", slug: "test-page" }),
);

const mockPageUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

// スラッグバリデーションモック
const mockCheckSlugAvailability = mock<
  () => Promise<{ available: boolean; reason?: unknown }>
>(() => Promise.resolve({ available: true }));

const mockGetSlugErrorMessage = mock<() => string>(
  () => "スラッグが使用できません",
);

// ensurePageSections モック
const mockEnsurePageSections = mock<() => Promise<number>>(() =>
  Promise.resolve(0),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    page: {
      findUnique: mockPageFindUnique,
      create: mockPageCreate,
      update: mockPageUpdate,
      delete: mockPageDelete,
      updateMany: mockPageUpdateMany,
    },
  },
}));

mock.module("@/shared/lib/slug-validation", () => ({
  checkSlugAvailability: mockCheckSlugAvailability,
  getSlugErrorMessage: mockGetSlugErrorMessage,
}));

mock.module("@/shared/lib/section-defaults", () => ({
  ensurePageSections: mockEnsurePageSections,
}));

import {
  createPageIfNotExistsCommand,
  ensureSystemPageCommand,
  updatePageCommand,
  createPageCommand,
  deletePageCommand,
  deletePagePermanentlyCommand,
  restorePageCommand,
  togglePagePublishedCommand,
  bulkTogglePagePublishedCommand,
  bulkDeletePagesCommand,
  updatePageSeoCommand,
} from "@/shared/domain/pages/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const PAGE_SLUG = "test-page";
const SYSTEM_PAGE_SLUG = "home";
const ANOTHER_SYSTEM_SLUG = "privacy";

const EXISTING_PAGE = {
  id: "page-1",
  slug: PAGE_SLUG,
  isActive: true,
  isPublished: false,
  publishedAt: null,
};

const EXISTING_PAGE_PUBLISHED = {
  id: "page-1",
  slug: PAGE_SLUG,
  isActive: true,
  isPublished: true,
  publishedAt: new Date("2024-06-01T12:00:00Z"),
};

const VALID_UPDATE_INPUT = {
  title: "テストページ",
  description: "テストの説明",
  metaDescription: "メタディスクリプション",
  metaKeywords: "キーワード",
  ogpTitle: "OGPタイトル",
  ogpDescription: "OGP説明",
  ogpImageUrl: "https://example.com/ogp.jpg",
  isPublished: false,
  publishedAt: undefined,
  contentWidth: undefined,
  contentWidthCustom: undefined,
  showSidebar: undefined,
};

const VALID_CREATE_INPUT = {
  slug: PAGE_SLUG,
  title: "テストページ",
  description: "テストの説明",
  isPublished: false,
};

const VALID_SEO_INPUT = {
  title: "SEOタイトル",
  metaDescription: "SEOメタ説明",
  metaKeywords: "SEOキーワード",
  ogpTitle: "OGPタイトル",
  ogpDescription: "OGP説明",
  ogpImageUrl: "https://example.com/ogp.jpg",
};

// =============================================================================
// createPageIfNotExistsCommand
// =============================================================================

describe("createPageIfNotExistsCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageCreate.mockReset();
    mockPageFindUnique.mockResolvedValue(null);
    mockPageCreate.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("ページが存在しない場合は新規作成される", async () => {
      const result = await createPageIfNotExistsCommand(
        PAGE_SLUG,
        "テストページ",
      );

      expect(result).toBeDefined();
      expect(mockPageCreate).toHaveBeenCalledTimes(1);
    });

    test("ページが既に存在する場合は既存ページを返す", async () => {
      mockPageFindUnique.mockResolvedValue(EXISTING_PAGE);

      await createPageIfNotExistsCommand(PAGE_SLUG, "テストページ");

      expect(mockPageCreate).not.toHaveBeenCalled();
    });

    test("既存ページを返す場合は create が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue({
        id: "existing-page",
        slug: PAGE_SLUG,
      });

      const result = await createPageIfNotExistsCommand(PAGE_SLUG, "タイトル");

      expect(result).toBeDefined();
      expect(mockPageCreate).not.toHaveBeenCalled();
    });

    test("create が正しいデータで呼ばれる", async () => {
      await createPageIfNotExistsCommand(PAGE_SLUG, "テストページ");

      expect(mockPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: PAGE_SLUG,
            title: "テストページ",
            isPublished: true,
            isActive: true,
          }),
        }),
      );
    });
  });
});

// =============================================================================
// ensureSystemPageCommand
// =============================================================================

describe("ensureSystemPageCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageCreate.mockReset();
    mockEnsurePageSections.mockReset();
    mockPageFindUnique.mockResolvedValue(null);
    mockPageCreate.mockResolvedValue({
      id: "page-1",
      slug: SYSTEM_PAGE_SLUG,
      title: "ホームページ",
    });
    mockEnsurePageSections.mockResolvedValue(0);
  });

  describe("正常系", () => {
    test("システムページが存在しない場合は作成して返す", async () => {
      const result = await ensureSystemPageCommand(SYSTEM_PAGE_SLUG);

      expect(result).not.toBeNull();
      expect(result?.created).toBe(true);
      expect(mockPageCreate).toHaveBeenCalledTimes(1);
    });

    test("システムページが既に存在する場合は作成しない", async () => {
      mockPageFindUnique.mockResolvedValue({
        id: "page-1",
        slug: SYSTEM_PAGE_SLUG,
      });

      const result = await ensureSystemPageCommand(SYSTEM_PAGE_SLUG);

      expect(result?.created).toBe(false);
      expect(mockPageCreate).not.toHaveBeenCalled();
    });

    test("ensurePageSections が呼ばれる", async () => {
      await ensureSystemPageCommand(SYSTEM_PAGE_SLUG);

      expect(mockEnsurePageSections).toHaveBeenCalledTimes(1);
    });

    test("システムページ作成時に isSystemPage: true で create が呼ばれる", async () => {
      await ensureSystemPageCommand(SYSTEM_PAGE_SLUG);

      expect(mockPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isSystemPage: true,
            isPublished: true,
            isActive: true,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("システムページ以外のスラッグでは null を返す", async () => {
      const result = await ensureSystemPageCommand("non-system-page");

      expect(result).toBeNull();
      expect(mockPageCreate).not.toHaveBeenCalled();
    });

    test("システムページ以外では ensurePageSections が呼ばれない", async () => {
      await ensureSystemPageCommand("non-system-page");

      expect(mockEnsurePageSections).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updatePageCommand
// =============================================================================

describe("updatePageCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageUpdate.mockReset();
    mockPageFindUnique.mockResolvedValue(EXISTING_PAGE);
    mockPageUpdate.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("既存ページを更新できる", async () => {
      await updatePageCommand(PAGE_SLUG, VALID_UPDATE_INPUT);

      expect(mockPageUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      await updatePageCommand(PAGE_SLUG, VALID_UPDATE_INPUT);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: PAGE_SLUG },
        }),
      );
    });

    test("nullable 文字列フィールドが空文字の場合 null に変換される", async () => {
      await updatePageCommand(PAGE_SLUG, {
        ...VALID_UPDATE_INPUT,
        description: "",
        metaDescription: "",
        metaKeywords: "",
        ogpTitle: "",
        ogpDescription: "",
        ogpImageUrl: "",
      });

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
            metaDescription: null,
            metaKeywords: null,
            ogpTitle: null,
            ogpDescription: null,
            ogpImageUrl: null,
          }),
        }),
      );
    });

    test("nullable 文字列フィールドに値がある場合はそのまま保存される", async () => {
      await updatePageCommand(PAGE_SLUG, {
        ...VALID_UPDATE_INPUT,
        description: "説明テキスト",
      });

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: "説明テキスト",
          }),
        }),
      );
    });

    test("publishedAt が undefined の場合は null として保存される", async () => {
      await updatePageCommand(PAGE_SLUG, {
        ...VALID_UPDATE_INPUT,
        publishedAt: undefined,
      });

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: null,
          }),
        }),
      );
    });

    test("publishedAt に日時が指定された場合はその値が保存される", async () => {
      const publishedAt = new Date("2024-07-01T12:00:00Z");

      await updatePageCommand(PAGE_SLUG, {
        ...VALID_UPDATE_INPUT,
        publishedAt,
      });

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("ページが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(
        updatePageCommand("non-existent", VALID_UPDATE_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ページが見つかりません",
      });
    });

    test("ページが存在しない場合は update が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(
        updatePageCommand("non-existent", VALID_UPDATE_INPUT),
      ).rejects.toThrow(DomainError);

      expect(mockPageUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// createPageCommand
// =============================================================================

describe("createPageCommand", () => {
  beforeEach(() => {
    mockPageCreate.mockReset();
    mockCheckSlugAvailability.mockReset();
    mockGetSlugErrorMessage.mockReset();
    mockPageCreate.mockResolvedValue({ slug: PAGE_SLUG });
    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockGetSlugErrorMessage.mockReturnValue("スラッグが使用できません");
  });

  describe("正常系", () => {
    test("有効な入力でページを作成できる", async () => {
      const result = await createPageCommand(VALID_CREATE_INPUT);

      expect(result).toEqual({ slug: PAGE_SLUG });
      expect(mockPageCreate).toHaveBeenCalledTimes(1);
    });

    test("create が正しいデータで呼ばれる", async () => {
      await createPageCommand(VALID_CREATE_INPUT);

      expect(mockPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: PAGE_SLUG,
            title: "テストページ",
            isActive: true,
          }),
        }),
      );
    });

    test("description が空文字の場合 null として保存される", async () => {
      await createPageCommand({ ...VALID_CREATE_INPUT, description: "" });

      expect(mockPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("description が undefined の場合 null として保存される", async () => {
      const { description: _unused, ...inputWithoutDesc } = VALID_CREATE_INPUT;
      void _unused;
      await createPageCommand(inputWithoutDesc);

      expect(mockPageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スラッグが使用不可の場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "page", id: "other-page" },
      });

      await expect(createPageCommand(VALID_CREATE_INPUT)).rejects.toMatchObject(
        { code: "CONFLICT" },
      );
    });

    test("スラッグエラー時は create が呼ばれない", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "reserved", path: "admin" },
      });

      await expect(createPageCommand(VALID_CREATE_INPUT)).rejects.toThrow(
        DomainError,
      );
      expect(mockPageCreate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deletePageCommand
// =============================================================================

describe("deletePageCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageUpdate.mockReset();
    mockPageFindUnique.mockResolvedValue(EXISTING_PAGE);
    mockPageUpdate.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("非システムページを論理削除できる", async () => {
      await deletePageCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: PAGE_SLUG },
          data: { isActive: false, isPublished: false },
        }),
      );
    });

    test("削除後は isActive と isPublished が false になる", async () => {
      await deletePageCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            isPublished: false,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("システムページを削除しようとすると VALIDATION エラーをスローする", async () => {
      await expect(deletePageCommand(SYSTEM_PAGE_SLUG)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "システムページは削除できません",
      });
    });

    test("システムページ削除時は update が呼ばれない", async () => {
      await expect(deletePageCommand(SYSTEM_PAGE_SLUG)).rejects.toThrow(
        DomainError,
      );

      expect(mockPageUpdate).not.toHaveBeenCalled();
    });

    test("ページが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(deletePageCommand(PAGE_SLUG)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ページが見つかりません",
      });
    });

    test("ページが存在しない場合は update が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(deletePageCommand(PAGE_SLUG)).rejects.toThrow(DomainError);

      expect(mockPageUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deletePagePermanentlyCommand
// =============================================================================

describe("deletePagePermanentlyCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageDelete.mockReset();
    mockPageFindUnique.mockResolvedValue(EXISTING_PAGE);
    mockPageDelete.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("非システムページを物理削除できる", async () => {
      await deletePagePermanentlyCommand(PAGE_SLUG);

      expect(mockPageDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: PAGE_SLUG },
        }),
      );
    });

    test("delete が正しい where 条件で呼ばれる", async () => {
      await deletePagePermanentlyCommand(PAGE_SLUG);

      expect(mockPageDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("システムページを物理削除しようとすると VALIDATION エラーをスローする", async () => {
      await expect(
        deletePagePermanentlyCommand(SYSTEM_PAGE_SLUG),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "システムページは削除できません",
      });
    });

    test("システムページ物理削除時は delete が呼ばれない", async () => {
      await expect(
        deletePagePermanentlyCommand(SYSTEM_PAGE_SLUG),
      ).rejects.toThrow(DomainError);

      expect(mockPageDelete).not.toHaveBeenCalled();
    });

    test("ページが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(
        deletePagePermanentlyCommand(PAGE_SLUG),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ページが見つかりません",
      });
    });

    test("ページが存在しない場合は delete が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(deletePagePermanentlyCommand(PAGE_SLUG)).rejects.toThrow(
        DomainError,
      );

      expect(mockPageDelete).not.toHaveBeenCalled();
    });
  });

  describe("deletePageCommand との違い", () => {
    test("deletePagePermanentlyCommand は delete（物理削除）を使い update（論理削除）は使わない", async () => {
      mockPageUpdate.mockReset();

      await deletePagePermanentlyCommand(PAGE_SLUG);

      expect(mockPageDelete).toHaveBeenCalledTimes(1);
      expect(mockPageUpdate).not.toHaveBeenCalled();
    });

    test("deletePageCommand は update（論理削除）を使い delete（物理削除）は使わない", async () => {
      mockPageDelete.mockReset();

      await deletePageCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledTimes(1);
      expect(mockPageDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// restorePageCommand
// =============================================================================

describe("restorePageCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageUpdate.mockReset();
    mockPageFindUnique.mockResolvedValue({
      ...EXISTING_PAGE,
      isActive: false,
    });
    mockPageUpdate.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("非アクティブなページを復元できる", async () => {
      await restorePageCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: PAGE_SLUG },
          data: { isActive: true },
        }),
      );
    });

    test("復元後は isActive が true になる", async () => {
      await restorePageCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: true,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("ページが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(restorePageCommand(PAGE_SLUG)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ページが見つかりません",
      });
    });

    test("既にアクティブなページを復元しようとすると VALIDATION エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(EXISTING_PAGE); // isActive: true

      await expect(restorePageCommand(PAGE_SLUG)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "このページは既にアクティブです",
      });
    });

    test("既にアクティブなページでは update が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue(EXISTING_PAGE);

      await expect(restorePageCommand(PAGE_SLUG)).rejects.toThrow(DomainError);

      expect(mockPageUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// togglePagePublishedCommand
// =============================================================================

describe("togglePagePublishedCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageUpdate.mockReset();
    mockPageFindUnique.mockResolvedValue(EXISTING_PAGE); // isPublished: false
    mockPageUpdate.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("非公開ページをトグルすると公開状態になる", async () => {
      const result = await togglePagePublishedCommand(PAGE_SLUG);

      expect(result).toEqual({ isPublished: true });
    });

    test("公開ページをトグルすると非公開状態になる", async () => {
      mockPageFindUnique.mockResolvedValue(EXISTING_PAGE_PUBLISHED);

      const result = await togglePagePublishedCommand(PAGE_SLUG);

      expect(result).toEqual({ isPublished: false });
    });

    test("公開時に publishedAt が設定される", async () => {
      await togglePagePublishedCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("非公開時に publishedAt が null になる", async () => {
      mockPageFindUnique.mockResolvedValue(EXISTING_PAGE_PUBLISHED);

      await togglePagePublishedCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: null,
          }),
        }),
      );
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      await togglePagePublishedCommand(PAGE_SLUG);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: PAGE_SLUG },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("ページが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(togglePagePublishedCommand(PAGE_SLUG)).rejects.toMatchObject(
        {
          code: "NOT_FOUND",
          message: "ページが見つかりません",
        },
      );
    });

    test("ページが存在しない場合は update が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(togglePagePublishedCommand(PAGE_SLUG)).rejects.toThrow(
        DomainError,
      );

      expect(mockPageUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// bulkTogglePagePublishedCommand
// =============================================================================

describe("bulkTogglePagePublishedCommand", () => {
  beforeEach(() => {
    mockPageUpdateMany.mockReset();
    mockPageUpdateMany.mockResolvedValue({ count: 2 });
  });

  describe("正常系", () => {
    test("複数ページを一括公開できる", async () => {
      await bulkTogglePagePublishedCommand(["page-a", "page-b"], true);

      expect(mockPageUpdateMany).toHaveBeenCalledTimes(1);
    });

    test("一括公開時に publishedAt が設定される", async () => {
      await bulkTogglePagePublishedCommand(["page-a", "page-b"], true);

      expect(mockPageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("一括非公開時に publishedAt が null になる", async () => {
      await bulkTogglePagePublishedCommand(["page-a", "page-b"], false);

      expect(mockPageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publishedAt: null,
          }),
        }),
      );
    });

    test("updateMany が isActive: true の条件で呼ばれる", async () => {
      await bulkTogglePagePublishedCommand(["page-a"], true);

      expect(mockPageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        }),
      );
    });

    test("スラッグリストが where の slug.in に渡される", async () => {
      const slugs = ["page-a", "page-b"];
      await bulkTogglePagePublishedCommand(slugs, true);

      expect(mockPageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            slug: { in: slugs },
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("空配列を渡すと VALIDATION エラーをスローする", async () => {
      await expect(
        bulkTogglePagePublishedCommand([], true),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "対象ページが選択されていません",
      });
    });

    test("空配列の場合は updateMany が呼ばれない", async () => {
      await expect(bulkTogglePagePublishedCommand([], false)).rejects.toThrow(
        DomainError,
      );

      expect(mockPageUpdateMany).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// bulkDeletePagesCommand
// =============================================================================

describe("bulkDeletePagesCommand", () => {
  beforeEach(() => {
    mockPageUpdateMany.mockReset();
    mockPageUpdateMany.mockResolvedValue({ count: 2 });
  });

  describe("正常系", () => {
    test("非システムページを一括論理削除できる", async () => {
      const result = await bulkDeletePagesCommand(["page-a", "page-b"]);

      expect(result).toEqual({
        deletedSlugs: ["page-a", "page-b"],
      });
      expect(mockPageUpdateMany).toHaveBeenCalledTimes(1);
    });

    test("システムページが混在する場合、システムページを除外して削除する", async () => {
      const result = await bulkDeletePagesCommand([
        "page-a",
        SYSTEM_PAGE_SLUG,
        "page-b",
      ]);

      expect(result.deletedSlugs).toEqual(["page-a", "page-b"]);
      expect(result.deletedSlugs).not.toContain(SYSTEM_PAGE_SLUG);
    });

    test("deleteMany が isActive: true の条件で呼ばれる", async () => {
      await bulkDeletePagesCommand(["page-a"]);

      expect(mockPageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        }),
      );
    });

    test("削除後は isActive と isPublished が false になる", async () => {
      await bulkDeletePagesCommand(["page-a"]);

      expect(mockPageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            isPublished: false,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("空配列を渡すと VALIDATION エラーをスローする", async () => {
      await expect(bulkDeletePagesCommand([])).rejects.toMatchObject({
        code: "VALIDATION",
        message: "対象ページが選択されていません",
      });
    });

    test("空配列の場合は updateMany が呼ばれない", async () => {
      await expect(bulkDeletePagesCommand([])).rejects.toThrow(DomainError);

      expect(mockPageUpdateMany).not.toHaveBeenCalled();
    });

    test("全てシステムページの場合 VALIDATION エラーをスローする", async () => {
      await expect(
        bulkDeletePagesCommand([SYSTEM_PAGE_SLUG, ANOTHER_SYSTEM_SLUG]),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "システムページは削除できません",
      });
    });

    test("全てシステムページの場合は updateMany が呼ばれない", async () => {
      await expect(bulkDeletePagesCommand([SYSTEM_PAGE_SLUG])).rejects.toThrow(
        DomainError,
      );

      expect(mockPageUpdateMany).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updatePageSeoCommand
// =============================================================================

describe("updatePageSeoCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageUpdate.mockReset();
    mockPageFindUnique.mockResolvedValue(EXISTING_PAGE);
    mockPageUpdate.mockResolvedValue({ id: "page-1", slug: PAGE_SLUG });
  });

  describe("正常系", () => {
    test("既存ページのSEO情報を更新できる", async () => {
      await updatePageSeoCommand(PAGE_SLUG, VALID_SEO_INPUT);

      expect(mockPageUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      await updatePageSeoCommand(PAGE_SLUG, VALID_SEO_INPUT);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: PAGE_SLUG },
        }),
      );
    });

    test("nullable 文字列フィールドが空文字の場合 null に変換される", async () => {
      await updatePageSeoCommand(PAGE_SLUG, {
        ...VALID_SEO_INPUT,
        metaDescription: "",
        metaKeywords: "",
        ogpTitle: "",
        ogpDescription: "",
        ogpImageUrl: "",
      });

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metaDescription: null,
            metaKeywords: null,
            ogpTitle: null,
            ogpDescription: null,
            ogpImageUrl: null,
          }),
        }),
      );
    });

    test("システムページ以外のページではシステムページのタイトル定義が使われない", async () => {
      await updatePageSeoCommand(PAGE_SLUG, VALID_SEO_INPUT);

      expect(mockPageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "SEOタイトル",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("ページが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(
        updatePageSeoCommand("non-existent", VALID_SEO_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ページが見つかりません",
      });
    });

    test("ページが存在しない場合は update が呼ばれない", async () => {
      mockPageFindUnique.mockResolvedValue(null);

      await expect(
        updatePageSeoCommand("non-existent", VALID_SEO_INPUT),
      ).rejects.toThrow(DomainError);

      expect(mockPageUpdate).not.toHaveBeenCalled();
    });
  });
});
