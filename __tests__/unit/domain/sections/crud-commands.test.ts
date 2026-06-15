/**
 * sections/commands CRUD コマンド ユニットテスト
 *
 * 対象: createPageSectionCommand / deletePageSectionCommand /
 *       duplicatePageSectionCommand / togglePageSectionActiveCommand /
 *       reorderPageSectionsCommand
 *
 * page-hero は 1 ページに 1 つ制約 + 削除/複製不可（CONFLICT）。
 * page-hero は reorder 時に order=-1 維持。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// ─────────────────────────────────────────────────────────────
// Prisma mock
// ─────────────────────────────────────────────────────────────

const mockSectionFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSectionFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSectionFindMany = mock<() => Promise<Record<string, unknown>[]>>(() =>
  Promise.resolve([]),
);
const mockSectionCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({
    id: "section-new",
    pageId: "page-1",
    page: { slug: "test-page" },
  }),
);
const mockSectionUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "section-new", isActive: true }),
);
const mockSectionUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockSectionDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({}),
);
const mockSectionAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));
const mockPageFindUnique = mock<
  () => Promise<{ slug: string; template: string } | null>
>(() => Promise.resolve({ slug: "test-page", template: "content" }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    section: {
      findFirst: mockSectionFindFirst,
      findUnique: mockSectionFindUnique,
      findMany: mockSectionFindMany,
      create: mockSectionCreate,
      update: mockSectionUpdate,
      updateMany: mockSectionUpdateMany,
      delete: mockSectionDelete,
      aggregate: mockSectionAggregate,
    },
    page: {
      findUnique: mockPageFindUnique,
    },
    $transaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        section: {
          findFirst: mockSectionFindFirst,
          findUnique: mockSectionFindUnique,
          findMany: mockSectionFindMany,
          create: mockSectionCreate,
          update: mockSectionUpdate,
          updateMany: mockSectionUpdateMany,
          delete: mockSectionDelete,
          aggregate: mockSectionAggregate,
        },
      };
      return fn(tx);
    },
  },
  Prisma: { JsonNull: "JsonNull" },
}));

mock.module("@/shared/db/json", () => ({
  parsePrismaInputJson: (json: string, _msg: string) => JSON.parse(json),
  clonePrismaInputJson: (value: unknown, _msg: string) =>
    JSON.parse(JSON.stringify(value)),
}));

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: <T extends Record<string, unknown>>(obj: T): Partial<T> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result as Partial<T>;
  },
}));

import {
  createPageSectionCommand,
  deletePageSectionCommand,
  duplicatePageSectionCommand,
  reorderPageSectionsCommand,
  togglePageSectionActiveCommand,
} from "@/shared/domain/sections/commands";

const PAGE_ID = "550e8400-e29b-41d4-a716-446655440100";
const SECTION_ID = "550e8400-e29b-41d4-a716-446655440200";

beforeEach(() => {
  mockSectionFindFirst.mockReset();
  mockSectionFindUnique.mockReset();
  mockSectionFindMany.mockReset();
  mockSectionCreate.mockReset();
  mockSectionUpdate.mockReset();
  mockSectionUpdateMany.mockReset();
  mockSectionDelete.mockReset();
  mockSectionAggregate.mockReset();
  mockPageFindUnique.mockReset();
  // 各 test の前にデフォルトで page.findUnique は { slug, template } を返す
  // template="content" は universal + marketing を許可（cta / page-hero は universal）
  mockPageFindUnique.mockImplementation(() =>
    Promise.resolve({ slug: "test-page", template: "content" }),
  );
});

// ─────────────────────────────────────────────────────────────
// createPageSectionCommand
// ─────────────────────────────────────────────────────────────

describe("createPageSectionCommand", () => {
  test("不正な type は VALIDATION エラー", async () => {
    await expect(
      createPageSectionCommand({ pageId: PAGE_ID, type: "nonexistent-type" }),
    ).rejects.toThrow();
  });

  test("page-hero 重複作成は CONFLICT エラー", async () => {
    mockSectionFindFirst.mockImplementationOnce(() =>
      Promise.resolve({ id: "existing-hero" }),
    );

    await expect(
      createPageSectionCommand({ pageId: PAGE_ID, type: "page-hero" }),
    ).rejects.toThrow("ヒーローは既に存在します");
  });

  test("page-hero は order=-1 で作成（先頭固定）", async () => {
    mockSectionFindFirst.mockImplementationOnce(() => Promise.resolve(null));
    mockSectionAggregate.mockImplementationOnce(() =>
      Promise.resolve({ _max: { order: 5 } }),
    );
    mockSectionCreate.mockImplementationOnce(() =>
      Promise.resolve({
        id: "new-hero",
        pageId: PAGE_ID,
        page: { slug: "test-page" },
      }),
    );

    const result = await createPageSectionCommand({
      pageId: PAGE_ID,
      type: "page-hero",
    });

    expect(result.id).toBe("new-hero");
    expect(mockSectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pageId: PAGE_ID,
          type: "page-hero",
          order: -1,
          isActive: true,
        }),
      }),
    );
  });

  test("通常 type は max(order) + 1 で末尾に追加", async () => {
    mockSectionAggregate.mockImplementationOnce(() =>
      Promise.resolve({ _max: { order: 5 } }),
    );
    mockSectionCreate.mockImplementationOnce(() =>
      Promise.resolve({
        id: "new-cta",
        pageId: PAGE_ID,
        page: { slug: "test-page" },
      }),
    );

    await createPageSectionCommand({ pageId: PAGE_ID, type: "cta" });

    expect(mockSectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 6 }),
      }),
    );
  });

  test("既存セクション 0 件のページは order=0 で作成", async () => {
    mockSectionAggregate.mockImplementationOnce(() =>
      Promise.resolve({ _max: { order: null } }),
    );
    mockSectionCreate.mockImplementationOnce(() =>
      Promise.resolve({
        id: "new",
        pageId: PAGE_ID,
        page: { slug: "test-page" },
      }),
    );

    await createPageSectionCommand({ pageId: PAGE_ID, type: "cta" });

    expect(mockSectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 0 }),
      }),
    );
  });

  test("存在しないページは NOT_FOUND", async () => {
    mockPageFindUnique.mockImplementationOnce(() => Promise.resolve(null));

    await expect(
      createPageSectionCommand({ pageId: PAGE_ID, type: "cta" }),
    ).rejects.toThrow("ページが見つかりません");
  });

  test("テンプレートの許可外 type は VALIDATION エラー（サーバー権威 floor）", async () => {
    // reservation テンプレートは reservation-form のみ追加可・space-list は除外
    mockPageFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ slug: "reservation", template: "reservation" }),
    );

    await expect(
      createPageSectionCommand({ pageId: PAGE_ID, type: "space-list" }),
    ).rejects.toThrow("このページに追加できないセクションタイプです");
    // 許可外は create まで到達しない
    expect(mockSectionCreate).not.toHaveBeenCalled();
  });

  test("未知テンプレートは制限しない（クライアント fallback と同挙動）", async () => {
    mockPageFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ slug: "legacy", template: "totally-unknown" }),
    );
    mockSectionAggregate.mockImplementationOnce(() =>
      Promise.resolve({ _max: { order: 2 } }),
    );
    mockSectionCreate.mockImplementationOnce(() =>
      Promise.resolve({
        id: "new-space-list",
        pageId: PAGE_ID,
        page: { slug: "legacy" },
      }),
    );

    const result = await createPageSectionCommand({
      pageId: PAGE_ID,
      type: "space-list",
    });

    expect(result.id).toBe("new-space-list");
    expect(mockSectionCreate).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// deletePageSectionCommand
// ─────────────────────────────────────────────────────────────

describe("deletePageSectionCommand", () => {
  test("存在しない section は NOT_FOUND", async () => {
    mockSectionFindUnique.mockImplementationOnce(() => Promise.resolve(null));

    await expect(deletePageSectionCommand(SECTION_ID)).rejects.toThrow(
      "セクションが見つかりません",
    );
  });

  test("page-hero は削除不可（CONFLICT）", async () => {
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        type: "page-hero",
        page: { slug: "test-page", template: "home" },
      }),
    );

    await expect(deletePageSectionCommand(SECTION_ID)).rejects.toThrow(
      "ヒーローは削除できません",
    );
  });

  test("テンプレートの必須セクションは削除不可（CONFLICT・サーバー権威 floor）", async () => {
    // reservation テンプレートは reservation-form を必須（削除不可）にする
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        type: "reservation-form",
        page: { slug: "reservation", template: "reservation" },
      }),
    );

    await expect(deletePageSectionCommand(SECTION_ID)).rejects.toThrow(
      "このセクションはページの必須要素のため削除できません",
    );
    expect(mockSectionDelete).not.toHaveBeenCalled();
  });

  test("通常 section は削除成功", async () => {
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        type: "cta",
        page: { slug: "test-page", template: "content" },
      }),
    );
    mockSectionDelete.mockImplementationOnce(() => Promise.resolve({}));

    const result = await deletePageSectionCommand(SECTION_ID);

    expect(result.id).toBe(SECTION_ID);
    expect(result.pageId).toBe(PAGE_ID);
    expect(result.pageSlug).toBe("test-page");
    expect(mockSectionDelete).toHaveBeenCalledWith({
      where: { id: SECTION_ID },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// duplicatePageSectionCommand
// ─────────────────────────────────────────────────────────────

describe("duplicatePageSectionCommand", () => {
  test("存在しない section は NOT_FOUND", async () => {
    mockSectionFindUnique.mockImplementationOnce(() => Promise.resolve(null));

    await expect(duplicatePageSectionCommand(SECTION_ID)).rejects.toThrow(
      "セクションが見つかりません",
    );
  });

  test("page-hero は複製不可（CONFLICT）", async () => {
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        type: "page-hero",
        config: {},
        contentHtml: null,
        contentJson: null,
        order: -1,
        isActive: true,
        page: { slug: "test-page" },
      }),
    );

    await expect(duplicatePageSectionCommand(SECTION_ID)).rejects.toThrow(
      "ヒーローは複製できません",
    );
  });

  test("通常 section は直後に複製（order+1）", async () => {
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        type: "cta",
        config: { foo: "bar" },
        contentHtml: null,
        contentJson: null,
        order: 3,
        isActive: true,
        page: { slug: "test-page" },
      }),
    );
    mockSectionUpdateMany.mockImplementationOnce(() =>
      Promise.resolve({ count: 2 }),
    );
    mockSectionCreate.mockImplementationOnce(() =>
      Promise.resolve({ id: "duplicated-id" }),
    );

    const result = await duplicatePageSectionCommand(SECTION_ID);

    expect(result.id).toBe("duplicated-id");
    expect(result.pageId).toBe(PAGE_ID);
    // 後続セクションの order を +1 ずらした
    expect(mockSectionUpdateMany).toHaveBeenCalledWith({
      where: { pageId: PAGE_ID, order: { gt: 3 } },
      data: { order: { increment: 1 } },
    });
    // 新 section は order=4 で作成
    expect(mockSectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 4 }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// togglePageSectionActiveCommand
// ─────────────────────────────────────────────────────────────

describe("togglePageSectionActiveCommand", () => {
  test("存在しない section は NOT_FOUND", async () => {
    mockSectionFindUnique.mockImplementationOnce(() => Promise.resolve(null));

    await expect(togglePageSectionActiveCommand(SECTION_ID)).rejects.toThrow(
      "セクションが見つかりません",
    );
  });

  test("isActive=true → false にトグル", async () => {
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        isActive: true,
        page: { slug: "test-page" },
      }),
    );
    mockSectionUpdate.mockImplementationOnce(() =>
      Promise.resolve({ id: SECTION_ID, isActive: false }),
    );

    const result = await togglePageSectionActiveCommand(SECTION_ID);

    expect(result.isActive).toBe(false);
    expect(result.pageSlug).toBe("test-page");
    expect(mockSectionUpdate).toHaveBeenCalledWith({
      where: { id: SECTION_ID },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  });

  test("isActive=false → true にトグル", async () => {
    mockSectionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: SECTION_ID,
        pageId: PAGE_ID,
        isActive: false,
        page: { slug: "test-page" },
      }),
    );
    mockSectionUpdate.mockImplementationOnce(() =>
      Promise.resolve({ id: SECTION_ID, isActive: true }),
    );

    const result = await togglePageSectionActiveCommand(SECTION_ID);

    expect(result.isActive).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// reorderPageSectionsCommand
// ─────────────────────────────────────────────────────────────

describe("reorderPageSectionsCommand", () => {
  test("不正な ID が含まれると VALIDATION エラー", async () => {
    mockSectionFindMany.mockImplementationOnce(() =>
      Promise.resolve([
        { id: "id-a", type: "cta", order: 0 },
        { id: "id-b", type: "hero", order: 1 },
      ]),
    );

    await expect(
      reorderPageSectionsCommand({
        pageId: PAGE_ID,
        orderedIds: ["id-a", "unknown-id"],
      }),
    ).rejects.toThrow("不正なセクションID");
  });

  test("section 数が一致しないと VALIDATION エラー", async () => {
    mockSectionFindMany.mockImplementationOnce(() =>
      Promise.resolve([
        { id: "id-a", type: "cta", order: 0 },
        { id: "id-b", type: "hero", order: 1 },
        { id: "id-c", type: "gallery", order: 2 },
      ]),
    );

    await expect(
      reorderPageSectionsCommand({
        pageId: PAGE_ID,
        orderedIds: ["id-a", "id-b"], // id-c が欠けている
      }),
    ).rejects.toThrow("セクション数が一致しません");
  });

  test("page-hero は order=-1 維持（並び替え対象外）", async () => {
    mockSectionFindMany.mockImplementationOnce(() =>
      Promise.resolve([
        { id: "id-hero", type: "page-hero", order: -1 },
        { id: "id-a", type: "cta", order: 0 },
        { id: "id-b", type: "gallery", order: 1 },
      ]),
    );
    mockSectionUpdate.mockImplementation(() =>
      Promise.resolve({ id: "x", isActive: true }),
    );

    const result = await reorderPageSectionsCommand({
      pageId: PAGE_ID,
      orderedIds: ["id-b", "id-hero", "id-a"],
    });

    expect(result.count).toBe(3);
    expect(result.pageSlug).toBe("test-page");

    // page-hero（id-hero）は order=-1 維持
    expect(mockSectionUpdate).toHaveBeenCalledWith({
      where: { id: "id-hero" },
      data: { order: -1 },
    });

    // id-b は orderedIds[0] なので order=0（インデックス順）
    expect(mockSectionUpdate).toHaveBeenCalledWith({
      where: { id: "id-b" },
      data: { order: 0 },
    });

    // id-a は orderedIds[2] なので order=2
    expect(mockSectionUpdate).toHaveBeenCalledWith({
      where: { id: "id-a" },
      data: { order: 2 },
    });
  });
});
