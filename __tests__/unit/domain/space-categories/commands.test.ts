import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より先に定義）
const mockSpaceCategoryFindFirst = mock<() => Promise<{ id: string } | null>>(
  () => Promise.resolve(null),
);

const mockSpaceCategoryFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockSpaceCategoryCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "category-1" }),
);

const mockSpaceCategoryUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "category-1" }),
);

const mockSpaceCategoryDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "category-1" }),
);

const mockSpaceCategoryAggregate = mock<
  () => Promise<{ _max: { sortOrder: number | null } }>
>(() => Promise.resolve({ _max: { sortOrder: null } }));

const mockTransaction = mock<
  (ops: unknown[]) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    spaceCategory: {
      findFirst: mockSpaceCategoryFindFirst,
      findUnique: mockSpaceCategoryFindUnique,
      create: mockSpaceCategoryCreate,
      update: mockSpaceCategoryUpdate,
      delete: mockSpaceCategoryDelete,
      aggregate: mockSpaceCategoryAggregate,
    },
    $transaction: mockTransaction,
  },
}));

import {
  createSpaceCategory,
  updateSpaceCategory,
  updateSpaceCategoryOrder,
  deleteSpaceCategory,
  updateSpaceCategoryActive,
} from "@/shared/domain/space-categories/commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const CATEGORY_ID = "category-1";

const VALID_FORM_DATA = {
  name: "会議室",
  description: "ビジネス用途の会議室カテゴリー",
  icon: "building",
  color: "#3B82F6",
} as const;

const EXISTING_CATEGORY = {
  id: CATEGORY_ID,
};

const EXISTING_CATEGORY_WITH_COUNT = {
  id: CATEGORY_ID,
  _count: { spaces: 0 },
};

// =============================================================================
// createSpaceCategory
// =============================================================================

describe("createSpaceCategory", () => {
  beforeEach(() => {
    mockSpaceCategoryFindFirst.mockReset();
    mockSpaceCategoryCreate.mockReset();
    mockSpaceCategoryAggregate.mockReset();
    mockSpaceCategoryFindFirst.mockResolvedValue(null);
    mockSpaceCategoryCreate.mockResolvedValue({ id: CATEGORY_ID });
    mockSpaceCategoryAggregate.mockResolvedValue({ _max: { sortOrder: null } });
  });

  describe("正常系", () => {
    test("重複しない名前でカテゴリーを作成できる", async () => {
      const result = await createSpaceCategory(VALID_FORM_DATA);

      expect(result).toEqual({ id: CATEGORY_ID });
      expect(mockSpaceCategoryCreate).toHaveBeenCalledTimes(1);
    });

    test("create が正しいデータで呼ばれる", async () => {
      await createSpaceCategory(VALID_FORM_DATA);

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "会議室",
          }),
        }),
      );
    });

    test("sortOrder は末尾に自動採番される（maxOrder + 1）", async () => {
      mockSpaceCategoryAggregate.mockResolvedValue({ _max: { sortOrder: 4 } });

      await createSpaceCategory(VALID_FORM_DATA);

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 5 }),
        }),
      );
    });

    test("description が空文字の場合は null に変換される", async () => {
      await createSpaceCategory({ ...VALID_FORM_DATA, description: "" });

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("icon が空文字の場合は null に変換される", async () => {
      await createSpaceCategory({ ...VALID_FORM_DATA, icon: "" });

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            icon: null,
          }),
        }),
      );
    });

    test("color が空文字の場合は null に変換される", async () => {
      await createSpaceCategory({ ...VALID_FORM_DATA, color: "" });

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            color: null,
          }),
        }),
      );
    });

    test("description が undefined の場合は null に変換される", async () => {
      await createSpaceCategory({ ...VALID_FORM_DATA, description: undefined });

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("全フィールドを指定して作成できる", async () => {
      await createSpaceCategory(VALID_FORM_DATA);

      expect(mockSpaceCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "会議室",
            description: "ビジネス用途の会議室カテゴリー",
            icon: "building",
            color: "#3B82F6",
            sortOrder: 1,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("同じ名前のカテゴリーが存在する場合は CONFLICT エラーをスローする", async () => {
      mockSpaceCategoryFindFirst.mockResolvedValue({ id: "other-category" });

      await expect(createSpaceCategory(VALID_FORM_DATA)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "同じ名前のカテゴリーが既に存在します",
      });
    });

    test("重複が存在する場合は create が呼ばれない", async () => {
      mockSpaceCategoryFindFirst.mockResolvedValue({ id: "other-category" });

      await expect(createSpaceCategory(VALID_FORM_DATA)).rejects.toThrow(
        DomainError,
      );

      expect(mockSpaceCategoryCreate).not.toHaveBeenCalled();
    });

    test("重複チェックは DB 一意制約に合わせて全カテゴリーを対象にする", async () => {
      await createSpaceCategory(VALID_FORM_DATA);

      expect(mockSpaceCategoryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: "会議室" },
        }),
      );
    });
  });
});

// =============================================================================
// updateSpaceCategory
// =============================================================================

describe("updateSpaceCategory", () => {
  beforeEach(() => {
    mockSpaceCategoryFindUnique.mockReset();
    mockSpaceCategoryFindFirst.mockReset();
    mockSpaceCategoryUpdate.mockReset();
    mockSpaceCategoryFindUnique.mockResolvedValue(null);
    mockSpaceCategoryFindFirst.mockResolvedValue(null);
    mockSpaceCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("存在するカテゴリーの情報を更新できる", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      const result = await updateSpaceCategory(CATEGORY_ID, VALID_FORM_DATA);

      expect(result).toEqual({ id: CATEGORY_ID });
      expect(mockSpaceCategoryUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      await updateSpaceCategory(CATEGORY_ID, VALID_FORM_DATA);

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CATEGORY_ID },
        }),
      );
    });

    test("update が正しいデータで呼ばれる", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      await updateSpaceCategory(CATEGORY_ID, VALID_FORM_DATA);

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ sortOrder: expect.anything() }),
        }),
      );
    });

    test("重複チェックで自分自身の ID を除外する", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      await updateSpaceCategory(CATEGORY_ID, VALID_FORM_DATA);

      expect(mockSpaceCategoryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: "会議室",
            id: { not: CATEGORY_ID },
          }),
        }),
      );
    });

    test("description が空文字の場合は null に変換される", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      await updateSpaceCategory(CATEGORY_ID, {
        ...VALID_FORM_DATA,
        description: "",
      });

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("icon が空文字の場合は null に変換される", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      await updateSpaceCategory(CATEGORY_ID, { ...VALID_FORM_DATA, icon: "" });

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            icon: null,
          }),
        }),
      );
    });

    test("color が空文字の場合は null に変換される", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);

      await updateSpaceCategory(CATEGORY_ID, {
        ...VALID_FORM_DATA,
        color: "",
      });

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            color: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(null);

      await expect(
        updateSpaceCategory("non-existent", VALID_FORM_DATA),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリーが見つかりません",
      });
    });

    test("存在しない場合は update が呼ばれない", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(null);

      await expect(
        updateSpaceCategory("non-existent", VALID_FORM_DATA),
      ).rejects.toThrow(DomainError);

      expect(mockSpaceCategoryUpdate).not.toHaveBeenCalled();
    });

    test("他の同名カテゴリーが存在する場合は CONFLICT エラーをスローする", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);
      mockSpaceCategoryFindFirst.mockResolvedValue({ id: "other-category" });

      await expect(
        updateSpaceCategory(CATEGORY_ID, VALID_FORM_DATA),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "同じ名前のカテゴリーが既に存在します",
      });
    });

    test("名前が重複している場合は update が呼ばれない", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(EXISTING_CATEGORY);
      mockSpaceCategoryFindFirst.mockResolvedValue({ id: "other-category" });

      await expect(
        updateSpaceCategory(CATEGORY_ID, VALID_FORM_DATA),
      ).rejects.toThrow(DomainError);

      expect(mockSpaceCategoryUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateSpaceCategoryOrder
// =============================================================================

describe("updateSpaceCategoryOrder", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockSpaceCategoryUpdate.mockReset();
    mockTransaction.mockResolvedValue([]);
  });

  describe("正常系", () => {
    test("複数アイテムの並び順を更新し updated 件数を返す", async () => {
      const items = [
        { id: "category-1", sortOrder: 0 },
        { id: "category-2", sortOrder: 1 },
        { id: "category-3", sortOrder: 2 },
      ];

      const result = await updateSpaceCategoryOrder(items);

      expect(result).toEqual({ updated: 3 });
    });

    test("各アイテムに対して spaceCategory.update が並列実行される", async () => {
      const items = [
        { id: "category-1", sortOrder: 0 },
        { id: "category-2", sortOrder: 1 },
      ];

      await updateSpaceCategoryOrder(items);

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledTimes(2);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("空配列を渡すと updated: 0 を返す", async () => {
      const result = await updateSpaceCategoryOrder([]);

      expect(result).toEqual({ updated: 0 });
    });

    test("1件の場合も updated: 1 を返す", async () => {
      const result = await updateSpaceCategoryOrder([
        { id: "category-1", sortOrder: 5 },
      ]);

      expect(result).toEqual({ updated: 1 });
    });
  });
});

// =============================================================================
// deleteSpaceCategory（ソフトデリート）
// =============================================================================

describe("deleteSpaceCategory", () => {
  beforeEach(() => {
    mockSpaceCategoryFindUnique.mockReset();
    mockSpaceCategoryUpdate.mockReset();
    mockSpaceCategoryFindUnique.mockResolvedValue(null);
    mockSpaceCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
  });

  describe("正常系", () => {
    test("スペースが紐づいていないカテゴリーを論理削除できる", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(
        EXISTING_CATEGORY_WITH_COUNT,
      );

      const result = await deleteSpaceCategory(CATEGORY_ID);

      expect(result).toEqual({ id: CATEGORY_ID });
    });

    test("論理削除時に isActive: false で update が呼ばれる", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(
        EXISTING_CATEGORY_WITH_COUNT,
      );

      await deleteSpaceCategory(CATEGORY_ID);

      expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CATEGORY_ID },
          data: { isActive: false },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue(null);

      await expect(deleteSpaceCategory("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "カテゴリーが見つかりません",
      });
    });

    test("スペースが紐づいている場合は CONFLICT エラーをスローする", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue({
        id: CATEGORY_ID,
        _count: { spaces: 3 },
      });

      await expect(deleteSpaceCategory(CATEGORY_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("3件のスペース"),
      });
    });

    test("スペースが紐づいている場合は update が呼ばれない", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue({
        id: CATEGORY_ID,
        _count: { spaces: 1 },
      });

      await expect(deleteSpaceCategory(CATEGORY_ID)).rejects.toThrow(
        DomainError,
      );

      expect(mockSpaceCategoryUpdate).not.toHaveBeenCalled();
    });

    test("スペースが紐づいていない場合は CONFLICT エラーにならない", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue({
        id: CATEGORY_ID,
        _count: { spaces: 0 },
      });

      const result = await deleteSpaceCategory(CATEGORY_ID);

      expect(result).toEqual({ id: CATEGORY_ID });
    });

    test("エラーメッセージにスペース件数が含まれる", async () => {
      mockSpaceCategoryFindUnique.mockResolvedValue({
        id: CATEGORY_ID,
        _count: { spaces: 5 },
      });

      await expect(deleteSpaceCategory(CATEGORY_ID)).rejects.toMatchObject({
        message: expect.stringContaining("5件のスペース"),
      });
    });
  });
});

// =============================================================================
// updateSpaceCategoryActive
// =============================================================================

describe("updateSpaceCategoryActive", () => {
  beforeEach(() => {
    mockSpaceCategoryFindUnique.mockReset();
    mockSpaceCategoryFindFirst.mockReset();
    mockSpaceCategoryUpdate.mockReset();
    mockSpaceCategoryFindUnique.mockResolvedValue(null);
    mockSpaceCategoryFindFirst.mockResolvedValue(null);
    mockSpaceCategoryUpdate.mockResolvedValue({ id: CATEGORY_ID });
  });

  test("スペースが紐づいていないカテゴリーを非アクティブ化できる", async () => {
    mockSpaceCategoryFindUnique.mockResolvedValue({
      id: CATEGORY_ID,
      name: "会議室",
      _count: { spaces: 0 },
    });

    const result = await updateSpaceCategoryActive(CATEGORY_ID, false);

    expect(result).toEqual({ id: CATEGORY_ID, isActive: false });
    expect(mockSpaceCategoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CATEGORY_ID },
        data: { isActive: false },
      }),
    );
  });

  test("再アクティブ化時は同名カテゴリーの重複を拒否する", async () => {
    mockSpaceCategoryFindUnique.mockResolvedValue({
      id: CATEGORY_ID,
      name: "会議室",
      _count: { spaces: 0 },
    });
    mockSpaceCategoryFindFirst.mockResolvedValue({ id: "other-category" });

    await expect(
      updateSpaceCategoryActive(CATEGORY_ID, true),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "同じ名前のカテゴリーが既に存在します",
    });

    expect(mockSpaceCategoryUpdate).not.toHaveBeenCalled();
  });

  test("再アクティブ化時は自分以外のカテゴリー名を確認する", async () => {
    mockSpaceCategoryFindUnique.mockResolvedValue({
      id: CATEGORY_ID,
      name: "会議室",
      _count: { spaces: 0 },
    });

    await updateSpaceCategoryActive(CATEGORY_ID, true);

    expect(mockSpaceCategoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: "会議室",
          id: { not: CATEGORY_ID },
        }),
      }),
    );
  });
});
