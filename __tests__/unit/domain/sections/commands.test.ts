/**
 * sections/commands ドメインコマンド テスト
 *
 * 固定デザインのページセクションは、コンテンツ更新だけを許可する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSectionFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSectionUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "section-1" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    section: {
      findUnique: mockSectionFindUnique,
      update: mockSectionUpdate,
    },
  },
  Prisma: {
    JsonNull: "JsonNull",
  },
}));

mock.module("@/shared/db/json", () => ({
  parsePrismaInputJson: (json: string, _msg: string) => JSON.parse(json),
  clonePrismaInputJson: (value: unknown, _msg: string) =>
    JSON.parse(JSON.stringify(value)),
}));

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  },
}));

import { updatePageSectionCommand } from "@/shared/domain/sections/commands";

const SECTION_ID = "550e8400-e29b-41d4-a716-446655440001";
const PAGE_ID = "550e8400-e29b-41d4-a716-446655440002";

const HOMEPAGE_SECTION_RECORD = {
  id: SECTION_ID,
  pageId: null,
  type: "hero",
  title: "テストセクション",
  config: { variant: "default" },
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
  page: { slug: "test-page" },
};

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

  test("存在するページセクションのコンテンツを更新して pageId を返す", async () => {
    const result = await updatePageSectionCommand(SECTION_ID, {
      config: { variant: "default" },
    });

    expect(result).toMatchObject({ pageId: PAGE_ID, pageSlug: "test-page" });
    expect(mockSectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SECTION_ID },
        data: expect.objectContaining({
          config: expect.objectContaining({ variant: "default" }),
        }),
      }),
    );
  });

  test("存在しないセクション ID で NOT_FOUND をスロー", async () => {
    mockSectionFindUnique.mockImplementation(() => Promise.resolve(null));

    await expect(
      updatePageSectionCommand("nonexistent", { config: {} }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // 旧 test 「pageId が null のホームページセクション」は schema NOT NULL 化
  // （migration `_section_page_id_not_null`）により発生不能となったため削除
});
