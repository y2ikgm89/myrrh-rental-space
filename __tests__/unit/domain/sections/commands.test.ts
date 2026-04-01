/**
 * sections/commands ドメインコマンド テスト
 *
 * src/shared/domain/sections/commands.ts のテスト
 * Prisma + 依存モジュールをモックして各コマンドのロジックを検証する
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// -----------------------------------------------------------------------
// Prisma モック関数（import より前に定義 — TDZ 回避）
// -----------------------------------------------------------------------
const mockSectionCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "section-1" }),
);
const mockSectionFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSectionUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "section-1" }),
);
const mockSectionDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "section-1" }),
);
const mockSectionAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));
const mockSectionCount = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockSectionFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockPageFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve({ id: "page-1" }),
);
const mockTransaction = mock<
  (
    ops: Array<Promise<Record<string, unknown>>>,
  ) => Promise<Record<string, unknown>[]>
>((ops) => Promise.all(ops));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    section: {
      create: mockSectionCreate,
      findUnique: mockSectionFindUnique,
      update: mockSectionUpdate,
      delete: mockSectionDelete,
      aggregate: mockSectionAggregate,
      count: mockSectionCount,
      findFirst: mockSectionFindFirst,
    },
    page: {
      findUnique: mockPageFindUnique,
    },
    $transaction: mockTransaction,
  },
  Prisma: {
    JsonNull: "DbNull",
  },
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

mock.module("@/shared/lib/validations/section-defaults", () => ({
  defaultSectionConfigs: {
    HERO: { variant: "default" },
    HERO_PARALLAX: {},
    CUSTOM: {},
    CONCEPT: {},
    SPACE_LIST: {},
    SPACE_SHOWCASE: {},
    NEWS_LIST: {},
    POST_LIST: {},
    FAQ_LIST: {},
    FEATURES: {},
    TESTIMONIAL: {},
    GALLERY: {},
    CTA: {},
    CONTACT_FORM: {},
    MAP: {},
    EMBED: {},
    INSTAGRAM: {},
  },
}));

mock.module("@/shared/lib/validations/section", () => ({
  SectionType: {
    HERO: "HERO",
    HERO_PARALLAX: "HERO_PARALLAX",
    CUSTOM: "CUSTOM",
    CONCEPT: "CONCEPT",
    SPACE_LIST: "SPACE_LIST",
    SPACE_SHOWCASE: "SPACE_SHOWCASE",
    NEWS_LIST: "NEWS_LIST",
    POST_LIST: "POST_LIST",
    FAQ_LIST: "FAQ_LIST",
    FEATURES: "FEATURES",
    TESTIMONIAL: "TESTIMONIAL",
    GALLERY: "GALLERY",
    CTA: "CTA",
    CONTACT_FORM: "CONTACT_FORM",
    MAP: "MAP",
    EMBED: "EMBED",
    INSTAGRAM: "INSTAGRAM",
  },
  defaultHomepageSectionOrder: ["HERO", "FEATURES", "CTA"],
  validateSectionConfig: (_type: string, config: unknown) => ({
    success: true,
    data: config ?? {},
  }),
}));

mock.module("@/shared/db/enums", () => ({
  SectionType: {
    HERO: "HERO",
    HERO_PARALLAX: "HERO_PARALLAX",
    CUSTOM: "CUSTOM",
    CONCEPT: "CONCEPT",
    SPACE_LIST: "SPACE_LIST",
    SPACE_SHOWCASE: "SPACE_SHOWCASE",
    NEWS_LIST: "NEWS_LIST",
    POST_LIST: "POST_LIST",
    FAQ_LIST: "FAQ_LIST",
    FEATURES: "FEATURES",
    TESTIMONIAL: "TESTIMONIAL",
    GALLERY: "GALLERY",
    CTA: "CTA",
    CONTACT_FORM: "CONTACT_FORM",
    MAP: "MAP",
    EMBED: "EMBED",
    INSTAGRAM: "INSTAGRAM",
  },
}));

// -----------------------------------------------------------------------
// テスト対象を import
// -----------------------------------------------------------------------
import {
  createPageSectionCommand,
  updatePageSectionCommand,
  togglePageSectionCommand,
  updatePageSectionOrderCommand,
  deletePageSectionCommand,
  duplicatePageSectionCommand,
} from "@/shared/domain/sections/commands";

// -----------------------------------------------------------------------
// テストフィクスチャ
// -----------------------------------------------------------------------
const SECTION_ID = "550e8400-e29b-41d4-a716-446655440001";
const PAGE_ID = "550e8400-e29b-41d4-a716-446655440002";

const HOMEPAGE_SECTION_RECORD = {
  id: SECTION_ID,
  pageId: null,
  type: "hero",
  title: "テストセクション",
  config: { variant: "default" },
  design: {},
  contentHtml: "<p>テスト</p>",
  contentJson: null,
  order: 0,
  isActive: true,
  createdAt: new Date("2024-01-15T12:00:00Z"),
  updatedAt: new Date("2024-01-15T12:00:00Z"),
};

const PAGE_SECTION_RECORD = {
  ...HOMEPAGE_SECTION_RECORD,
  pageId: PAGE_ID,
};

const VALID_CREATE_INPUT = {
  type: "hero" as const,
  config: { variant: "default" },
  design: {},
  isActive: true,
};

// -----------------------------------------------------------------------
// ページセクション CRUD
// -----------------------------------------------------------------------
describe("createPageSectionCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockSectionCreate.mockReset();
    mockSectionAggregate.mockReset();
    mockPageFindUnique.mockImplementation(() =>
      Promise.resolve({ id: PAGE_ID }),
    );
    mockSectionCreate.mockImplementation(() =>
      Promise.resolve({ id: SECTION_ID }),
    );
    mockSectionAggregate.mockImplementation(() =>
      Promise.resolve({ _max: { order: null } }),
    );
  });

  describe("正常系", () => {
    test("pageId を指定してページセクションを作成できる", async () => {
      const result = await createPageSectionCommand(
        { ...VALID_CREATE_INPUT, pageId: PAGE_ID },
        null,
      );
      expect(result).toMatchObject({ id: SECTION_ID });
      expect(mockSectionCreate).toHaveBeenCalledTimes(1);
    });

    test("既存セクションがある場合 order = maxOrder + 1 で作成する", async () => {
      mockSectionAggregate.mockImplementation(() =>
        Promise.resolve({ _max: { order: 4 } }),
      );
      await createPageSectionCommand(
        { ...VALID_CREATE_INPUT, pageId: PAGE_ID },
        null,
      );
      expect(mockSectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 5 }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("pageId が未指定（undefined）の場合 VALIDATION エラーをスロー", async () => {
      await expect(
        createPageSectionCommand(VALID_CREATE_INPUT, null),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    test("存在しないページ ID を指定すると NOT_FOUND をスロー", async () => {
      mockPageFindUnique.mockImplementation(() => Promise.resolve(null));
      await expect(
        createPageSectionCommand(
          { ...VALID_CREATE_INPUT, pageId: PAGE_ID },
          null,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("updatePageSectionCommand", () => {
  beforeEach(() => {
    mockSectionFindUnique.mockReset();
    mockSectionUpdate.mockReset();
    mockSectionFindUnique.mockImplementation(() =>
      Promise.resolve(PAGE_SECTION_RECORD),
    );
    mockSectionUpdate.mockImplementation(() =>
      Promise.resolve({ id: SECTION_ID }),
    );
  });

  describe("正常系", () => {
    test("存在するページセクションを更新して pageId を返す", async () => {
      const result = await updatePageSectionCommand(SECTION_ID, {
        title: "更新タイトル",
      });
      expect(result).toMatchObject({ pageId: PAGE_ID });
      expect(mockSectionUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しないセクション ID で NOT_FOUND をスロー", async () => {
      mockSectionFindUnique.mockImplementation(() => Promise.resolve(null));
      await expect(
        updatePageSectionCommand("nonexistent", { title: "テスト" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("pageId が null（ホームページセクション）は NOT_FOUND をスロー", async () => {
      mockSectionFindUnique.mockImplementation(() =>
        Promise.resolve(HOMEPAGE_SECTION_RECORD),
      );
      await expect(
        updatePageSectionCommand(SECTION_ID, { title: "テスト" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("togglePageSectionCommand", () => {
  beforeEach(() => {
    mockSectionFindUnique.mockReset();
    mockSectionUpdate.mockReset();
    mockSectionFindUnique.mockImplementation(() =>
      Promise.resolve(PAGE_SECTION_RECORD),
    );
    mockSectionUpdate.mockImplementation(() =>
      Promise.resolve({ id: SECTION_ID }),
    );
  });

  describe("正常系", () => {
    test("isActive を切り替えて pageId を返す", async () => {
      const result = await togglePageSectionCommand(SECTION_ID, false);
      expect(result).toMatchObject({ pageId: PAGE_ID });
      expect(mockSectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });

  describe("異常系", () => {
    test("ホームページセクションを指定すると NOT_FOUND をスロー", async () => {
      mockSectionFindUnique.mockImplementation(() =>
        Promise.resolve(HOMEPAGE_SECTION_RECORD),
      );
      await expect(
        togglePageSectionCommand(SECTION_ID, true),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("updatePageSectionOrderCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockTransaction.mockReset();
    mockSectionUpdate.mockReset();
    mockPageFindUnique.mockImplementation(() =>
      Promise.resolve({ id: PAGE_ID }),
    );
    mockTransaction.mockImplementation((ops) => Promise.all(ops));
    mockSectionUpdate.mockImplementation(() =>
      Promise.resolve({ id: SECTION_ID }),
    );
  });

  describe("正常系", () => {
    test("存在するページのセクション順序を更新する", async () => {
      await expect(
        updatePageSectionOrderCommand(PAGE_ID, {
          sections: [{ id: SECTION_ID, order: 0 }],
        }),
      ).resolves.toBeUndefined();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しないページ ID で NOT_FOUND をスロー", async () => {
      mockPageFindUnique.mockImplementation(() => Promise.resolve(null));
      await expect(
        updatePageSectionOrderCommand(PAGE_ID, { sections: [] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("deletePageSectionCommand", () => {
  beforeEach(() => {
    mockSectionFindUnique.mockReset();
    mockSectionDelete.mockReset();
    mockSectionFindUnique.mockImplementation(() =>
      Promise.resolve(PAGE_SECTION_RECORD),
    );
    mockSectionDelete.mockImplementation(() =>
      Promise.resolve({ id: SECTION_ID }),
    );
  });

  describe("正常系", () => {
    test("存在するページセクションを削除して pageId を返す", async () => {
      const result = await deletePageSectionCommand(SECTION_ID);
      expect(result).toMatchObject({ pageId: PAGE_ID });
      expect(mockSectionDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("ホームページセクションを指定すると NOT_FOUND をスロー", async () => {
      mockSectionFindUnique.mockImplementation(() =>
        Promise.resolve(HOMEPAGE_SECTION_RECORD),
      );
      await expect(deletePageSectionCommand(SECTION_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("duplicatePageSectionCommand", () => {
  const DUPLICATED_SECTION = {
    ...PAGE_SECTION_RECORD,
    id: "duplicated-section-id",
    title: "コピー - テストセクション",
    order: 1,
  };

  beforeEach(() => {
    mockSectionFindUnique.mockReset();
    mockSectionCreate.mockReset();
    mockSectionFindFirst.mockReset();
    // ensurePageSectionExists 用
    mockSectionFindUnique.mockImplementation(() => {
      // 2回目の呼び出し（full record 取得）も同じレコードを返す
      return Promise.resolve(PAGE_SECTION_RECORD);
    });
    mockSectionFindFirst.mockImplementation(() =>
      Promise.resolve({ order: 0 }),
    );
    mockSectionCreate.mockImplementation(() =>
      Promise.resolve(DUPLICATED_SECTION),
    );
  });

  describe("正常系", () => {
    test("ページセクションを複製して新しいセクション情報と pageId を返す", async () => {
      const result = await duplicatePageSectionCommand(SECTION_ID);
      expect(result).toMatchObject({ pageId: PAGE_ID });
      expect(result.section).toMatchObject({ id: "duplicated-section-id" });
      expect(mockSectionCreate).toHaveBeenCalledTimes(1);
    });

    test("タイトルがある場合「コピー - {元タイトル}」になる", async () => {
      await duplicatePageSectionCommand(SECTION_ID);
      expect(mockSectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "コピー - テストセクション" }),
        }),
      );
    });

    test("タイトルがない場合 null になる", async () => {
      mockSectionFindUnique.mockImplementation(() =>
        Promise.resolve({ ...PAGE_SECTION_RECORD, title: null }),
      );
      await duplicatePageSectionCommand(SECTION_ID);
      expect(mockSectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: null }),
        }),
      );
    });

    test("複製したセクションの order は maxOrder + 1 になる", async () => {
      mockSectionFindFirst.mockImplementation(() =>
        Promise.resolve({ order: 3 }),
      );
      await duplicatePageSectionCommand(SECTION_ID);
      expect(mockSectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 4 }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("ホームページセクションを指定すると NOT_FOUND をスロー", async () => {
      mockSectionFindUnique.mockImplementation(() =>
        Promise.resolve(HOMEPAGE_SECTION_RECORD),
      );
      await expect(
        duplicatePageSectionCommand(SECTION_ID),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
