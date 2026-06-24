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

const mockFaqItemFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));

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
    findMany: typeof mockFaqItemFindMany;
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
    findMany: mockFaqItemFindMany,
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

// $executeRaw tagged template の呼び出しを記録する（reorder 単一 SQL 化の検証用）
const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));

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
      findMany: mockFaqItemFindMany,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

// Prisma.sql / Prisma.join / Prisma.raw を結合済み文字列に展開するスタブ
mock.module("@generated/prisma/client", () => {
  type SqlFragment = { __sql: string; __values: unknown[] };
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) {
        const v = values[i] as SqlFragment | unknown;
        if (v && typeof v === "object" && "__sql" in (v as object)) {
          combined += (v as SqlFragment).__sql;
        } else {
          combined += `$${i + 1}`;
        }
      }
    }
    return { __sql: combined, __values: values };
  };
  return {
    Prisma: {
      sql,
      join: (parts: SqlFragment[], separator = ","): SqlFragment => ({
        __sql: parts.map((p) => p.__sql).join(separator),
        __values: parts.flatMap((p) => p.__values),
      }),
      raw: (s: string): SqlFragment => ({ __sql: s, __values: [] }),
      JsonNull: "JsonNull",
    },
  };
});

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
} from "@/shared/domain/faq/category-commands";
import {
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  reorderFaqItems,
  updateFaqItemPublished,
} from "@/shared/domain/faq/item-commands";
import {
  voteFaqItemHelpful,
  detectStaleFaqItems,
} from "@/shared/domain/faq/analytics-commands";
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
  isActive: true,
};

const VALID_ITEM_INPUT = {
  categoryId: CATEGORY_ID,
  question: "質問タイトル",
  answer: "回答内容",
  isPublished: false,
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

    test("末尾（maxOrder + 1）に自動採番する", async () => {
      mockFaqCategoryAggregate.mockResolvedValue({ _max: { order: 3 } });

      await createFaqCategory(VALID_CATEGORY_INPUT);

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

      await createFaqCategory(VALID_CATEGORY_INPUT);

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
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  describe("正常系", () => {
    test("複数 ID を渡すと CASE WHEN 単一 SQL で更新される", async () => {
      await reorderFaqCategories(["cat-1", "cat-2", "cat-3"]);

      expect(mockFaqCategoryUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    test("生成 SQL は faq_categories / CASE / deletedAt を含む", async () => {
      await reorderFaqCategories(["cat-a", "cat-b"]);

      const call = mockExecuteRaw.mock.calls[0];
      // 外側 template の静的部分（テーブル名・列名・CASE・WHERE）を検証
      const sql =
        (call?.[0] as TemplateStringsArray | undefined)?.join("?") ?? "";
      expect(sql).toContain("faq_categories");
      expect(sql).toContain("order");
      expect(sql).toContain("CASE");
      expect(sql).toContain("deletedAt");
    });
  });

  describe("エッジケース", () => {
    test("空配列を渡した場合 SQL が実行されない", async () => {
      await reorderFaqCategories([]);

      expect(mockFaqCategoryUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("1 件の配列を渡しても正常に動作する", async () => {
      await reorderFaqCategories(["cat-1"]);

      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
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

    test("末尾（maxOrder + 1）に自動採番する", async () => {
      mockFaqItemAggregate.mockResolvedValue({ _max: { order: 5 } });

      await createFaqItem(VALID_ITEM_INPUT);

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
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  describe("正常系", () => {
    test("複数 ID を渡すと CASE WHEN 単一 SQL で更新される", async () => {
      await reorderFaqItems(CATEGORY_ID, ["item-1", "item-2", "item-3"]);

      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    test("生成 SQL は faq_items / categoryId / CASE / deletedAt を含む", async () => {
      await reorderFaqItems(CATEGORY_ID, ["item-a", "item-b"]);

      const call = mockExecuteRaw.mock.calls[0];
      // 外側 template の静的部分（テーブル名・列名・CASE・WHERE）を検証
      const sql =
        (call?.[0] as TemplateStringsArray | undefined)?.join("?") ?? "";
      expect(sql).toContain("faq_items");
      expect(sql).toContain("categoryId");
      expect(sql).toContain("CASE");
      expect(sql).toContain("deletedAt");
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

    test("カテゴリが見つからない場合 SQL が実行されない", async () => {
      mockFaqCategoryFindFirst.mockResolvedValue(null);

      await expect(reorderFaqItems("non-existent", ["item-1"])).rejects.toThrow(
        DomainError,
      );
      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });

  describe("エッジケース", () => {
    test("空配列を渡した場合 SQL が実行されない", async () => {
      await reorderFaqItems(CATEGORY_ID, []);

      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("カテゴリは存在するが空配列の場合は正常終了する", async () => {
      await expect(reorderFaqItems(CATEGORY_ID, [])).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// updateFaqItemPublished
// =============================================================================

describe("updateFaqItemPublished", () => {
  beforeEach(() => {
    mockFaqItemFindFirst.mockReset();
    mockFaqItemUpdate.mockReset();
    mockFaqItemFindFirst.mockResolvedValue({ id: ITEM_ID });
    mockFaqItemUpdate.mockResolvedValue({ id: ITEM_ID });
  });

  describe("正常系", () => {
    test("isPublished: true を渡すと公開状態を返す", async () => {
      const result = await updateFaqItemPublished(ITEM_ID, true);

      expect(result).toEqual({ isPublished: true });
    });

    test("isPublished: false を渡すと非公開状態を返す", async () => {
      const result = await updateFaqItemPublished(ITEM_ID, false);

      expect(result).toEqual({ isPublished: false });
    });

    test("公開化時に publishedAt が設定される", async () => {
      await updateFaqItemPublished(ITEM_ID, true);

      expect(mockFaqItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("非公開化時に publishedAt が null になる", async () => {
      await updateFaqItemPublished(ITEM_ID, false);

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
      await updateFaqItemPublished(ITEM_ID, true);

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
        updateFaqItemPublished("non-existent", true),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "質問が見つかりません",
      });
    });

    test("質問が見つからない場合 update が呼ばれない", async () => {
      mockFaqItemFindFirst.mockResolvedValue(null);

      await expect(
        updateFaqItemPublished("non-existent", true),
      ).rejects.toThrow(DomainError);
      expect(mockFaqItemUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// voteFaqItemHelpful
// =============================================================================

describe("voteFaqItemHelpful", () => {
  beforeEach(() => {
    mockFaqItemUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("helpful 投票で helpfulCount を increment する", async () => {
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      const result = await voteFaqItemHelpful(ITEM_ID, "helpful");

      expect(result).toEqual({ voted: true });
      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ITEM_ID, isPublished: true, deletedAt: null },
          data: { helpfulCount: { increment: 1 } },
        }),
      );
    });

    test("not-helpful 投票で notHelpfulCount を increment する", async () => {
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      const result = await voteFaqItemHelpful(ITEM_ID, "not-helpful");

      expect(result).toEqual({ voted: true });
      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { notHelpfulCount: { increment: 1 } },
        }),
      );
    });

    test("対象が見つからない場合 voted: false を返す", async () => {
      mockFaqItemUpdateMany.mockResolvedValue({ count: 0 });

      const result = await voteFaqItemHelpful("non-existent", "helpful");

      expect(result).toEqual({ voted: false });
    });

    test("非公開項目は updateMany の where で除外される", async () => {
      mockFaqItemUpdateMany.mockResolvedValue({ count: 0 });

      await voteFaqItemHelpful(ITEM_ID, "helpful");

      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublished: true,
            deletedAt: null,
          }),
        }),
      );
    });
  });
});

// =============================================================================
// detectStaleFaqItems
// =============================================================================

describe("detectStaleFaqItems", () => {
  beforeEach(() => {
    mockFaqItemFindMany.mockReset();
  });

  describe("正常系", () => {
    test("指定日数以上更新されていない公開中項目を返す", async () => {
      const staleItems = [
        {
          id: "item-1",
          question: "古い質問 1",
          updatedAt: new Date("2024-01-01"),
        },
        {
          id: "item-2",
          question: "古い質問 2",
          updatedAt: new Date("2024-02-01"),
        },
      ];
      mockFaqItemFindMany.mockResolvedValue(staleItems);

      const result = await detectStaleFaqItems(180);

      expect(result).toHaveLength(2);
      expect(mockFaqItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublished: true,
            deletedAt: null,
            updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          orderBy: { updatedAt: "asc" },
          take: 20,
        }),
      );
    });

    test("対象が無い場合は空配列", async () => {
      mockFaqItemFindMany.mockResolvedValue([]);

      const result = await detectStaleFaqItems(180);

      expect(result).toEqual([]);
    });

    test("limit 引数で take を制御できる", async () => {
      mockFaqItemFindMany.mockResolvedValue([]);

      await detectStaleFaqItems(90, 5);

      expect(mockFaqItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe("異常系", () => {
    test("staleDays が 0 以下で DomainError", async () => {
      await expect(detectStaleFaqItems(0)).rejects.toThrow(DomainError);
      await expect(detectStaleFaqItems(-1)).rejects.toThrow(DomainError);
      expect(mockFaqItemFindMany).not.toHaveBeenCalled();
    });
  });
});
