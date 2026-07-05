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

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    R2_PUBLIC_URL: "https://media.example.com",
  },
}));

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
  isRecord: (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value),
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

  test("管理メディア origin 外のセクション画像 URL は拒否する", async () => {
    mockSectionFindUnique.mockImplementation(() =>
      Promise.resolve({
        ...PAGE_SECTION_RECORD,
        type: "page-hero",
      }),
    );

    await expect(
      updatePageSectionCommand(SECTION_ID, {
        config: {
          variant: "editorial-split",
          label: [],
          title: [],
          description: [],
          images: [
            {
              url: "https://external.example.com/hero.jpg",
              alt: "外部画像",
            },
          ],
          transition: "crossfade",
          buttons: [
            {
              label: [],
              url: "https://external.example.com/page",
              variant: "primary",
              size: "lg",
              openInNewTab: true,
              backgroundColor: "",
              textColor: "",
            },
          ],
          layout: {
            containerWidth: "lg",
            hideOnMobile: false,
            hideOnDesktop: false,
            animateOnScroll: "none",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(mockSectionUpdate).not.toHaveBeenCalled();
  });

  test("セクションの外部埋め込み URL はメディア検査対象にしない", async () => {
    mockSectionFindUnique.mockImplementation(() =>
      Promise.resolve({
        ...PAGE_SECTION_RECORD,
        type: "embed",
      }),
    );

    await updatePageSectionCommand(SECTION_ID, {
      config: {
        sectionLabel: "Media",
        title: [],
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        embedCode: "",
        aspectRatio: "16:9",
        borderRadius: "sm",
        layout: {
          containerWidth: "lg",
          hideOnMobile: false,
          hideOnDesktop: false,
          animateOnScroll: "none",
        },
      },
    });

    expect(mockSectionUpdate).toHaveBeenCalledTimes(1);
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
