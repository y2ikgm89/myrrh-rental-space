import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve({ id: "category-1" }),
);
const mockFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([]),
);
const mockUpdate = mock<() => Promise<{ id: string; isActive: boolean }>>(() =>
  Promise.resolve({ id: "category-1", isActive: false }),
);
const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));
type TxClient = { $executeRaw: typeof mockExecuteRaw };
const mockTransaction = mock<
  (cb: (tx: TxClient) => Promise<unknown>) => Promise<unknown>
>((cb) => cb({ $executeRaw: mockExecuteRaw }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    faqCategory: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      update: mockUpdate,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    sql: () => ({ __sql: "", __values: [] }),
    join: () => ({ __sql: "", __values: [] }),
  },
}));

const categoryCommands =
  (await import("@/shared/domain/faq/category-commands")) as unknown as {
    updateFaqCategoryActive: (
      id: string,
      isActive: boolean,
    ) => Promise<{ id: string; isActive: boolean }>;
    reorderFaqCategories: (orderedIds: string[]) => Promise<void>;
  };

describe("updateFaqCategoryActive", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValue({ id: "category-1" });
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ id: "category-1", isActive: false });
  });

  test("category active flag is updated without rewriting category content", async () => {
    const result = await categoryCommands.updateFaqCategoryActive(
      "category-1",
      false,
    );

    expect(result).toEqual({ id: "category-1", isActive: false });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "category-1", deletedAt: null },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  });

  test("missing category throws NOT_FOUND before update", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      categoryCommands.updateFaqCategoryActive("missing-id", true),
    ).rejects.toThrow("カテゴリが見つかりません");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("reorderFaqCategories", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({ $executeRaw: mockExecuteRaw }),
    );
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  test("orderedIds の全 ID が存在する場合だけ二段更新で再採番する", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "category-1" },
      { id: "category-2" },
      { id: "category-3" },
    ]);

    await categoryCommands.reorderFaqCategories([
      "category-1",
      "category-2",
      "category-3",
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
  });

  test("存在しない ID を含む場合は SQL 実行前に NOT_FOUND", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "category-1" },
      { id: "category-2" },
    ]);

    await expect(
      categoryCommands.reorderFaqCategories(["category-1", "missing-id"]),
    ).rejects.toThrow("カテゴリが見つかりません");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("重複 ID は DB アクセス前に拒否する", async () => {
    await expect(
      categoryCommands.reorderFaqCategories(["category-1", "category-1"]),
    ).rejects.toThrow("同じIDを複数指定することはできません");

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("既存 ID の subset は過不足として拒否する", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "category-1" },
      { id: "category-2" },
      { id: "category-3" },
    ]);

    await expect(
      categoryCommands.reorderFaqCategories(["category-1", "category-2"]),
    ).rejects.toThrow("カテゴリ数が一致しません");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("空配列の場合は DB アクセスしない", async () => {
    await categoryCommands.reorderFaqCategories([]);

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
