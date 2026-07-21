import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より前に定義 — TDZ 回避）
const mockFaqItemFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));

const mockFaqItemUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

const mockFaqCategoryFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

// bulkMoveFaqItems の interactive transaction 用 tx オブジェクト
type TxClient = {
  faqItem: {
    updateMany: typeof mockFaqItemUpdateMany;
    aggregate: (args: unknown) => Promise<{ _max: { order: number | null } }>;
  };
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<number>;
};

const mockFaqItemAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));

const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));

const txClient: TxClient = {
  faqItem: {
    updateMany: mockFaqItemUpdateMany,
    aggregate: mockFaqItemAggregate,
  },
  get $executeRaw() {
    return mockExecuteRaw;
  },
};

function isTransactionCallback(
  value: unknown,
): value is (tx: TxClient) => Promise<unknown> {
  return typeof value === "function";
}

const mockTransaction = mock<(argOrCallback: unknown) => Promise<unknown>>(
  (argOrCallback) => {
    if (isTransactionCallback(argOrCallback)) {
      return argOrCallback(txClient);
    }
    return Promise.resolve(argOrCallback);
  },
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    faqItem: {
      findMany: mockFaqItemFindMany,
      updateMany: mockFaqItemUpdateMany,
      aggregate: mockFaqItemAggregate,
    },
    faqCategory: {
      findFirst: mockFaqCategoryFindFirst,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

import {
  bulkPublishFaqItems,
  bulkDeleteFaqItems,
  bulkMoveFaqItems,
} from "@/shared/domain/faq/item-bulk-commands";
import { DomainError } from "@/shared/domain/domain-error";

const IDS = ["item-1", "item-2"];

// =============================================================================
// bulkPublishFaqItems
// =============================================================================

describe("bulkPublishFaqItems", () => {
  beforeEach(() => {
    mockFaqItemFindMany.mockReset();
    mockFaqItemUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("対象が存在する場合 updateMany を呼び count/affectedIds を返す", async () => {
      mockFaqItemFindMany.mockResolvedValue(IDS.map((id) => ({ id })));
      mockFaqItemUpdateMany.mockResolvedValue({ count: 2 });

      const result = await bulkPublishFaqItems(IDS, true);

      expect(result).toEqual({ count: 2, affectedIds: IDS });
    });

    test("updateMany の where に deletedAt: null を再チェックする（claim pattern／TOCTOU 対策）", async () => {
      mockFaqItemFindMany.mockResolvedValue(IDS.map((id) => ({ id })));
      mockFaqItemUpdateMany.mockResolvedValue({ count: 2 });

      await bulkPublishFaqItems(IDS, true);

      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: IDS }, deletedAt: null },
        }),
      );
    });

    test("isPublished: true の場合 publishedAt を現在時刻で設定する", async () => {
      mockFaqItemFindMany.mockResolvedValue([{ id: "item-1" }]);
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      await bulkPublishFaqItems(["item-1"], true);

      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("isPublished: false の場合 publishedAt を null にする", async () => {
      mockFaqItemFindMany.mockResolvedValue([{ id: "item-1" }]);
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      await bulkPublishFaqItems(["item-1"], false);

      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publishedAt: null,
          }),
        }),
      );
    });

    test("ids が空配列の場合 findMany/updateMany を呼ばず空結果を返す", async () => {
      const result = await bulkPublishFaqItems([], true);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockFaqItemFindMany).not.toHaveBeenCalled();
      expect(mockFaqItemUpdateMany).not.toHaveBeenCalled();
    });

    test("対象が全て削除済み等で見つからない場合 updateMany を呼ばず空結果を返す", async () => {
      mockFaqItemFindMany.mockResolvedValue([]);

      const result = await bulkPublishFaqItems(IDS, true);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockFaqItemUpdateMany).not.toHaveBeenCalled();
    });

    test("findMany と updateMany の間に一部が削除された場合 count は実際の claim 数を反映する", async () => {
      // findMany 時点では 2 件とも存在するが、updateMany 時点で 1 件が
      // 別操作により削除済みになっているケースを模擬する
      mockFaqItemFindMany.mockResolvedValue(IDS.map((id) => ({ id })));
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      const result = await bulkPublishFaqItems(IDS, true);

      expect(result.count).toBe(1);
    });
  });
});

// =============================================================================
// bulkDeleteFaqItems
// =============================================================================

describe("bulkDeleteFaqItems", () => {
  beforeEach(() => {
    mockFaqItemFindMany.mockReset();
    mockFaqItemUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("対象が存在する場合 updateMany を呼び count/affectedIds を返す", async () => {
      mockFaqItemFindMany.mockResolvedValue(IDS.map((id) => ({ id })));
      mockFaqItemUpdateMany.mockResolvedValue({ count: 2 });

      const result = await bulkDeleteFaqItems(IDS);

      expect(result).toEqual({ count: 2, affectedIds: IDS });
    });

    test("updateMany の where に deletedAt: null を再チェックする（claim pattern／TOCTOU 対策）", async () => {
      mockFaqItemFindMany.mockResolvedValue(IDS.map((id) => ({ id })));
      mockFaqItemUpdateMany.mockResolvedValue({ count: 2 });

      await bulkDeleteFaqItems(IDS);

      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: IDS }, deletedAt: null },
        }),
      );
    });

    test("update が deletedAt を現在時刻で設定する", async () => {
      mockFaqItemFindMany.mockResolvedValue([{ id: "item-1" }]);
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      await bulkDeleteFaqItems(["item-1"]);

      expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    test("ids が空配列の場合 findMany/updateMany を呼ばず空結果を返す", async () => {
      const result = await bulkDeleteFaqItems([]);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockFaqItemFindMany).not.toHaveBeenCalled();
      expect(mockFaqItemUpdateMany).not.toHaveBeenCalled();
    });

    test("対象が全て削除済み等で見つからない場合 updateMany を呼ばず空結果を返す", async () => {
      mockFaqItemFindMany.mockResolvedValue([]);

      const result = await bulkDeleteFaqItems(IDS);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockFaqItemUpdateMany).not.toHaveBeenCalled();
    });

    test("findMany と updateMany の間に一部が既に削除された場合 count は実際の claim 数を反映する", async () => {
      mockFaqItemFindMany.mockResolvedValue(IDS.map((id) => ({ id })));
      mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

      const result = await bulkDeleteFaqItems(IDS);

      expect(result.count).toBe(1);
    });
  });
});

// =============================================================================
// bulkMoveFaqItems（既存の claim pattern の参照実装 — 回帰確認）
// =============================================================================

describe("bulkMoveFaqItems", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockReset();
    mockFaqItemUpdateMany.mockReset();
    mockFaqItemAggregate.mockReset();
    mockExecuteRaw.mockReset();
    mockFaqCategoryFindFirst.mockResolvedValue({ id: "category-2" });
    mockFaqItemAggregate.mockResolvedValue({ _max: { order: null } });
  });

  test("per-id updateMany の where で deletedAt: null を claim する", async () => {
    mockFaqItemUpdateMany.mockResolvedValue({ count: 1 });

    await bulkMoveFaqItems(["item-1"], "category-2");

    expect(mockFaqItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1", deletedAt: null },
      }),
    );
  });

  test("移動先カテゴリが存在しない場合 NOT_FOUND エラーをスローする", async () => {
    mockFaqCategoryFindFirst.mockResolvedValue(null);

    await expect(
      bulkMoveFaqItems(["item-1"], "non-existent"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      bulkMoveFaqItems(["item-1"], "non-existent"),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
