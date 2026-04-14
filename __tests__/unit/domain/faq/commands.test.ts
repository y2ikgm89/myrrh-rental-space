import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より前に定義 — TDZ 回避）
const mockFaqCategoryFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockFaqCategoryFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockFaqCategoryCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "category-1" }),
);

const mockFaqCategoryUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "category-1" }),
);

const mockFaqCategoryDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "category-1" }),
);

const mockFaqCategoryAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));

const mockFaqItemFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockFaqItemFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockFaqItemCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "item-1" }),
);

const mockFaqItemUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "item-1" }),
);

const mockFaqItemDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "item-1" }),
);

const mockFaqItemUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

const mockFaqCategoryUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

const mockFaqItemAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));

// Interactive transaction の tx オブジェクト型
type TxClient = {
  faqCategory: {
    findUnique: typeof mockFaqCategoryFindUnique;
    findFirst: typeof mockFaqCategoryFindFirst;
    create: typeof mockFaqCategoryCreate;
    update: typeof mockFaqCategoryUpdate;
    delete: typeof mockFaqCategoryDelete;
    aggregate: typeof mockFaqCategoryAggregate;
    updateMany: typeof mockFaqCategoryUpdateMany;
  };
  faqItem: {
    findUnique: typeof mockFaqItemFindUnique;
    findFirst: typeof mockFaqItemFindFirst;
    create: typeof mockFaqItemCreate;
    update: typeof mockFaqItemUpdate;
    delete: typeof mockFaqItemDelete;
    aggregate: typeof mockFaqItemAggregate;
    updateMany: typeof mockFaqItemUpdateMany;
  };
};

const txClient: TxClient = {
  faqCategory: {
    findUnique: mockFaqCategoryFindUnique,
    findFirst: mockFaqCategoryFindFirst,
    create: mockFaqCategoryCreate,
    update: mockFaqCategoryUpdate,
    delete: mockFaqCategoryDelete,
    aggregate: mockFaqCategoryAggregate,
    updateMany: mockFaqCategoryUpdateMany,
  },
  faqItem: {
    findUnique: mockFaqItemFindUnique,
    findFirst: mockFaqItemFindFirst,
    create: mockFaqItemCreate,
    update: mockFaqItemUpdate,
    delete: mockFaqItemDelete,
    aggregate: mockFaqItemAggregate,
    updateMany: mockFaqItemUpdateMany,
  },
};

// $transaction は配列形式と callback 形式の両方をサポート
const mockTransaction = mock<(argOrCallback: unknown) => Promise<unknown>>(
  (argOrCallback) => {
    if (typeof argOrCallback === "function") {
      return (argOrCallback as (tx: TxClient) => Promise<unknown>)(txClient);
    }
    return Promise.resolve(argOrCallback);
  },
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    faqCategory: {
      findUnique: mockFaqCategoryFindUnique,
      findFirst: mockFaqCategoryFindFirst,
      create: mockFaqCategoryCreate,
      update: mockFaqCategoryUpdate,
      delete: mockFaqCategoryDelete,
      aggregate: mockFaqCategoryAggregate,
      updateMany: mockFaqCategoryUpdateMany,
    },
    faqItem: {
      findUnique: mockFaqItemFindUnique,
      findFirst: mockFaqItemFindFirst,
      create: mockFaqItemCreate,
      update: mockFaqItemUpdate,
      delete: mockFaqItemDelete,
      aggregate: mockFaqItemAggregate,
      updateMany: mockFaqItemUpdateMany,
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
      throw new Error("回答データが不正です");
    }
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
  createFaqCategory,
  updateFaqCategory,
  deleteFaqCategory,
  reorderFaqCategories,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  reorderFaqItems,
  toggleFaqItemPublished,
} from "@/shared/domain/faq/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const CATEGORY_ID = "category-1";
const ITEM_ID = "item-1";

const EXISTING_CATEGORY = {
  id: CATEGORY_ID,
  name: "よくある質問",
  slug: "faq",
  _count: { items: 0 },
};

const EXISTING_CATEGORY_WITH_ITEMS = {
  id: CATEGORY_ID,
  name: "よくある質問",
  slug: "faq",
  _count: { items: 3 },
};

const EXISTING_ITEM = {
  id: ITEM_ID,
  isPublished: false,
};

const VALID_CATEGORY_INPUT = {
  name: "よくある質問",
  slug: "faq",
  description: "よくある質問一覧",
  order: 1,
  isActive: true,
};

const VALID_ITEM_INPUT = {
  categoryId: CATEGORY_ID,
  question: "質問タイトル",
  answerJson: '{"root":{"children":[]}}',
  answerHtml: "<p>回答内容</p>",
  order: 1,
  isPublished: false,
  metaDescription: null,
  metaKeywords: null,
  ogpTitle: null,
  ogpDescription: null,
  ogpImageUrl: null,
};

// =============================================================================
// createFaqCategory
// =============================================================================

describe("createFaqCategory", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockReset();
    mockFaqCategoryAggregate.mockReset();
    mockFaqCategoryCreate.mockReset();
    mockFaqCategoryFindFirst.mockResolvedValue(null);
    mockFaqCategoryAggregate.mockResolvedValue({ _max: { order: null } });
    mockFaqCategoryCreate.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("有効な入力でカテゴリを作成し id を返す", async () => {
      const result = await createFaqCategory(VALID_CATEGORY_INPUT);

      expect(result).toEqual({ id: CATEGORY_ID });
      expect(mockFaqCategoryCreate).toHaveBeenCalledTimes(1);
    });

    test("order が未設定の場合 maxOrder + 1 で作成する", async () => {
      mockFaqCategoryAggregate.mockResolvedValue({ _max: { order: 3 } });

      await createFaqCategory({ ...VALID_CATEGORY_INPUT, order: 0 });

      expect(mockFaqCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            order: 4,
          }),
        }),
      );
    });

    test("maxOrder が null の場合 order 1 で作成する", async () => {
      mockFaqCategoryAggregate.mockResolvedValue({ _max: { order: null } });

      await createFaqCategory({ ...VALID_CATEGORY_INPUT, order: 0 });

      expect(mockFaqCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            order: 1,
          }),
        }),
      );
    });

    test("description が空文字の場合 null として保存する", async () => {
      await createFaqCategory({ ...VALID_CATEGORY_INPUT, description: "" });

      expect(mockFaqCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("description が null の場合も null として保存する", async () => {
      await createFaqCategory({ ...VALID_CATEGORY_INPUT, description: null });

      expect(mockFaqCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("description が未定義の場合も null として保存する", async () => {
      const { description: _d, ...inputWithoutDescription } =
        VALID_CATEGORY_INPUT;
      await createFaqCategory({
        ...inputWithoutDescription,
      });

      expect(mockFaqCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スラッグが既に使用されている場合 CONFLICT エラーをスローする", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue({ id: "other-category" });

      await expect(
        createFaqCategory(VALID_CATEGORY_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このスラッグは既に使用されています",
      });
    });

    test("スラッグが重複している場合 create が呼ばれない", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue({ id: "other-category" });

      await expect(createFaqCategory(VALID_CATEGORY_INPUT)).rejects.toThrow(
        DomainError,
      );
      expect(mockFaqCategoryCreate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateFaqCategory
// =============================================================================

describe("updateFaqCategory", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockReset();
    mockFaqCategoryUpdate.mockReset();
    // ensureFaqCategoryExists (findFirst #1) → EXISTING
    // ensureFaqCategoryUnique (findFirst #2) → null (no slug conflict)
    mockFaqCategoryFindFirst
      .mockResolvedValueOnce(EXISTING_CATEGORY)
      .mockResolvedValue(null);
    mockFaqCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("有効な入力でカテゴリを更新する", async () => {
      await updateFaqCategory(CATEGORY_ID, VALID_CATEGORY_INPUT);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しいデータで呼ばれる", async () => {
      await updateFaqCategory(CATEGORY_ID, VALID_CATEGORY_INPUT);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CATEGORY_ID, deletedAt: null },
          data: expect.objectContaining({
            name: VALID_CATEGORY_INPUT.name,
            slug: VALID_CATEGORY_INPUT.slug,
            isActive: VALID_CATEGORY_INPUT.isActive,
          }),
        }),
      );
    });

    test("description が空文字の場合 null として保存する", async () => {
      await updateFaqCategory(CATEGORY_ID, {
        ...VALID_CATEGORY_INPUT,
        description: "",
      });

      expect(mockFaqCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないカテゴリの場合 NOT_FOUND エラーをスローする", async () => {
      // beforeEach の mockResolvedValueOnce キューをクリアしてから null 固定
      mockFaqCategoryFindFirst.mockReset();
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(
        updateFaqCategory("non-existent", VALID_CATEGORY_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("カテゴリが見つからない場合 update が呼ばれない", async () => {
      mockFaqCategoryFindFirst.mockReset();
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(
        updateFaqCategory("non-existent", VALID_CATEGORY_INPUT),
      ).rejects.toThrow(DomainError);
      expect(mockFaqCategoryUpdate).not.toHaveBeenCalled();
    });

    test("新スラッグが別カテゴリで使用されている場合 CONFLICT エラーをスローする", async () => {
      // beforeEach の once キューをクリアし、両方とも conflict 返却
      mockFaqCategoryFindFirst.mockReset();
      mockFaqCategoryFindFirst
        .mockResolvedValueOnce(EXISTING_CATEGORY) // ensureFaqCategoryExists
        .mockResolvedValue({ id: "other-category" }); // ensureFaqCategoryUnique

      await expect(
        updateFaqCategory(CATEGORY_ID, {
          ...VALID_CATEGORY_INPUT,
          slug: "taken-slug",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });
});

// =============================================================================
// deleteFaqCategory
// =============================================================================

describe("deleteFaqCategory (soft delete)", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockReset();
    mockFaqCategoryUpdate.mockReset();
    mockFaqCategoryFindFirst.mockResolvedValue(EXISTING_CATEGORY);
    mockFaqCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("質問が 0 件のカテゴリをソフトデリートする", async () => {
      await deleteFaqCategory(CATEGORY_ID);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が deletedAt を設定して呼ばれる", async () => {
      await deleteFaqCategory(CATEGORY_ID);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CATEGORY_ID },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないカテゴリの場合 NOT_FOUND エラーをスローする", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(deleteFaqCategory("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("カテゴリが見つからない場合 update が呼ばれない", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(deleteFaqCategory("non-existent")).rejects.toThrow(
        DomainError,
      );
      expect(mockFaqCategoryUpdate).not.toHaveBeenCalled();
    });

    test("質問が含まれているカテゴリの場合 CONFLICT エラーをスローする", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(EXISTING_CATEGORY_WITH_ITEMS);

      await expect(deleteFaqCategory(CATEGORY_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message:
          "このカテゴリには質問が含まれています。先に質問を削除または移動してください",
      });
    });

    test("質問が含まれているカテゴリの場合 update が呼ばれない", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(EXISTING_CATEGORY_WITH_ITEMS);

      await expect(deleteFaqCategory(CATEGORY_ID)).rejects.toThrow(DomainError);
      expect(mockFaqCategoryUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// reorderFaqCategories
// =============================================================================

describe("reorderFaqCategories", () => {
  beforeEach(() => {
    mockFaqCategoryUpdate.mockReset();
    mockFaqCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
    // mockTransaction は interactive callback をそのまま実行するデフォルト実装
  });

  describe("正常系", () => {
    test("複数 ID を渡すと update が 3 回呼ばれる（interactive transaction）", async () => {
      await reorderFaqCategories(["cat-1", "cat-2", "cat-3"]);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledTimes(3);
    });

    test("各カテゴリが配列インデックス順で update される", async () => {
      await reorderFaqCategories(["cat-a", "cat-b"]);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledTimes(2);
      expect(mockFaqCategoryUpdate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: "cat-a", deletedAt: null },
          data: { order: 0 },
        }),
      );
      expect(mockFaqCategoryUpdate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: "cat-b", deletedAt: null },
          data: { order: 1 },
        }),
      );
    });
  });

  describe("エッジケース", () => {
    test("空配列を渡した場合 update が呼ばれない", async () => {
      await reorderFaqCategories([]);

      expect(mockFaqCategoryUpdate).not.toHaveBeenCalled();
    });

    test("1 件の配列を渡しても正常に動作する", async () => {
      await reorderFaqCategories(["cat-1"]);

      expect(mockFaqCategoryUpdate).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// createFaqItem
// =============================================================================

describe("createFaqItem", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockReset();
    mockFaqItemAggregate.mockReset();
    mockFaqItemCreate.mockReset();
    mockFaqCategoryFindFirst.mockResolvedValue({ id: CATEGORY_ID });
    mockFaqItemAggregate.mockResolvedValue({ _max: { order: null } });
    mockFaqItemCreate.mockResolvedValue({ id: ITEM_ID });
  });

  describe("正常系", () => {
    test("有効な入力で質問を作成し id を返す", async () => {
      const result = await createFaqItem(VALID_ITEM_INPUT);

      expect(result).toEqual({ id: ITEM_ID });
      expect(mockFaqItemCreate).toHaveBeenCalledTimes(1);
    });

    test("order が未設定の場合 maxOrder + 1 で作成する", async () => {
      mockFaqItemAggregate.mockResolvedValue({ _max: { order: 5 } });

      await createFaqItem({ ...VALID_ITEM_INPUT, order: 0 });

      expect(mockFaqItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            order: 6,
          }),
        }),
      );
    });

    test("isPublished: true の場合 publishedAt が設定される", async () => {
      await createFaqItem({ ...VALID_ITEM_INPUT, isPublished: true });

      expect(mockFaqItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("isPublished: false の場合 publishedAt が null になる", async () => {
      await createFaqItem({ ...VALID_ITEM_INPUT, isPublished: false });

      expect(mockFaqItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publishedAt: null,
          }),
        }),
      );
    });

    test("nullable フィールドに値を設定して作成できる", async () => {
      await createFaqItem({
        ...VALID_ITEM_INPUT,
        metaDescription: "説明",
        ogpTitle: "OGPタイトル",
      });

      expect(mockFaqItemCreate).toHaveBeenCalledTimes(1);
    });

    test("nullable フィールドが空文字の場合 null として保存する", async () => {
      await createFaqItem({
        ...VALID_ITEM_INPUT,
        metaDescription: "",
        ogpTitle: "",
      });

      expect(mockFaqItemCreate).toHaveBeenCalledWith(
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
    test("存在しないカテゴリ ID の場合 NOT_FOUND エラーをスローする", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(createFaqItem(VALID_ITEM_INPUT)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("カテゴリが見つからない場合 create が呼ばれない", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(createFaqItem(VALID_ITEM_INPUT)).rejects.toThrow(
        DomainError,
      );
      expect(mockFaqItemCreate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateFaqItem
// =============================================================================

describe("updateFaqItem", () => {
  beforeEach(() => {
    mockFaqItemFindFirst.mockReset();
    mockFaqCategoryFindFirst.mockReset();
    mockFaqItemUpdate.mockReset();
    mockFaqItemFindFirst.mockResolvedValue(EXISTING_ITEM);
    mockFaqCategoryFindFirst.mockResolvedValue({ id: CATEGORY_ID });
    mockFaqItemUpdate.mockResolvedValue({ id: ITEM_ID });
  });

  describe("正常系", () => {
    test("有効な入力で質問を更新する", async () => {
      await updateFaqItem(ITEM_ID, VALID_ITEM_INPUT);

      expect(mockFaqItemUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しいデータで呼ばれる", async () => {
      await updateFaqItem(ITEM_ID, VALID_ITEM_INPUT);

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ITEM_ID, deletedAt: null },
          data: expect.objectContaining({
            question: VALID_ITEM_INPUT.question,
            categoryId: VALID_ITEM_INPUT.categoryId,
          }),
        }),
      );
    });

    test("isPublished: true に変更すると publishedAt が設定される", async () => {
      await updateFaqItem(ITEM_ID, { ...VALID_ITEM_INPUT, isPublished: true });

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("isPublished: false に変更すると publishedAt が null になる", async () => {
      await updateFaqItem(ITEM_ID, { ...VALID_ITEM_INPUT, isPublished: false });

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publishedAt: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない質問 ID の場合 NOT_FOUND エラーをスローする", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(
        updateFaqItem("non-existent", VALID_ITEM_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "質問が見つかりません",
      });
    });

    test("質問が見つからない場合 update が呼ばれない", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(
        updateFaqItem("non-existent", VALID_ITEM_INPUT),
      ).rejects.toThrow(DomainError);
      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
    });

    test("存在しないカテゴリ ID に変更しようとすると NOT_FOUND エラーをスローする", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(
        updateFaqItem(ITEM_ID, {
          ...VALID_ITEM_INPUT,
          categoryId: "non-existent-category",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });
  });
});

// =============================================================================
// deleteFaqItem
// =============================================================================

describe("deleteFaqItem (soft delete)", () => {
  beforeEach(() => {
    mockFaqItemFindFirst.mockReset();
    mockFaqItemUpdate.mockReset();
    mockFaqItemFindFirst.mockResolvedValue(EXISTING_ITEM);
    mockFaqItemUpdate.mockResolvedValue({ id: ITEM_ID });
  });

  describe("正常系", () => {
    test("質問をソフトデリートする", async () => {
      await deleteFaqItem(ITEM_ID);

      expect(mockFaqItemUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が deletedAt を設定して呼ばれる", async () => {
      await deleteFaqItem(ITEM_ID);

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ITEM_ID, deletedAt: null },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない質問の場合 NOT_FOUND エラーをスローする", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(deleteFaqItem("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "質問が見つかりません",
      });
    });

    test("質問が見つからない場合 update が呼ばれない", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(deleteFaqItem("non-existent")).rejects.toThrow(DomainError);
      expect(mockFaqItemDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// reorderFaqItems
// =============================================================================

describe("reorderFaqItems", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockReset();
    mockFaqItemUpdate.mockReset();
    mockFaqCategoryFindFirst.mockResolvedValue({ id: CATEGORY_ID });
    mockFaqItemUpdate.mockResolvedValue({ id: ITEM_ID });
  });

  describe("正常系", () => {
    test("複数 ID を渡すと update が ID 数分呼ばれる", async () => {
      await reorderFaqItems(CATEGORY_ID, ["item-1", "item-2", "item-3"]);

      expect(mockFaqItemUpdate).toHaveBeenCalledTimes(3);
    });

    test("各質問が配列インデックス順で update される", async () => {
      await reorderFaqItems(CATEGORY_ID, ["item-a", "item-b"]);

      expect(mockFaqItemUpdate).toHaveBeenCalledTimes(2);
      expect(mockFaqItemUpdate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: "item-a", deletedAt: null },
          data: { order: 0, categoryId: CATEGORY_ID },
        }),
      );
      expect(mockFaqItemUpdate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: "item-b", deletedAt: null },
          data: { order: 1, categoryId: CATEGORY_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないカテゴリ ID の場合 NOT_FOUND エラーをスローする", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(
        reorderFaqItems("non-existent", ["item-1"]),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリが見つかりません",
      });
    });

    test("カテゴリが見つからない場合 update が呼ばれない", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(reorderFaqItems("non-existent", ["item-1"])).rejects.toThrow(
        DomainError,
      );
      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
    });
  });

  describe("エッジケース", () => {
    test("空配列を渡した場合 update が呼ばれない", async () => {
      await reorderFaqItems(CATEGORY_ID, []);

      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
    });

    test("カテゴリは存在するが空配列の場合は正常終了する", async () => {
      await expect(reorderFaqItems(CATEGORY_ID, [])).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// toggleFaqItemPublished
// =============================================================================

describe("toggleFaqItemPublished", () => {
  beforeEach(() => {
    mockFaqItemFindFirst.mockReset();
    mockFaqItemUpdate.mockReset();
    mockFaqItemUpdate.mockResolvedValue({ id: ITEM_ID });
  });

  describe("正常系", () => {
    test("未公開の質問をトグルすると isPublished: true を返す", async () => {
      mockFaqItemFindFirst.mockResolvedValue({
        id: ITEM_ID,
        isPublished: false,
      });

      const result = await toggleFaqItemPublished(ITEM_ID);

      expect(result).toEqual({ isPublished: true });
    });

    test("公開済みの質問をトグルすると isPublished: false を返す", async () => {
      mockFaqItemFindFirst.mockResolvedValue({
        id: ITEM_ID,
        isPublished: true,
      });

      const result = await toggleFaqItemPublished(ITEM_ID);

      expect(result).toEqual({ isPublished: false });
    });

    test("公開にトグルすると publishedAt が設定される", async () => {
      mockFaqItemFindFirst.mockResolvedValue({
        id: ITEM_ID,
        isPublished: false,
      });

      await toggleFaqItemPublished(ITEM_ID);

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("非公開にトグルすると publishedAt が null になる", async () => {
      mockFaqItemFindFirst.mockResolvedValue({
        id: ITEM_ID,
        isPublished: true,
      });

      await toggleFaqItemPublished(ITEM_ID);

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publishedAt: null,
          }),
        }),
      );
    });

    test("update が正しい ID で呼ばれる", async () => {
      mockFaqItemFindFirst.mockResolvedValue({
        id: ITEM_ID,
        isPublished: false,
      });

      await toggleFaqItemPublished(ITEM_ID);

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ITEM_ID, deletedAt: null },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない質問の場合 NOT_FOUND エラーをスローする", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(
        toggleFaqItemPublished("non-existent"),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "質問が見つかりません",
      });
    });

    test("質問が見つからない場合 update が呼ばれない", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(toggleFaqItemPublished("non-existent")).rejects.toThrow(
        DomainError,
      );
      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
    });
  });
});
