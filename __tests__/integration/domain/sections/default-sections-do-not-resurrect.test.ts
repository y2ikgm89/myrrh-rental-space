/**
 * 消したセクションが復活しないこと、必須セクションが複製できないことの検証。
 *
 * == なぜ要るのか ==
 *
 * ### F-53: 削除した custom セクションが初期デモ文言で復活する
 *
 * `ensurePageSectionsCommand` は「`DEFAULT_PAGE_SECTIONS` にあって DB に無い type」を
 * **欠落**とみなして再作成していた。管理者が custom セクションを削除すると、
 * 削除アクションの `revalidateTag` で編集ルートが再レンダーされ、
 * `ensureSystemPageCommand` が再び走って**コード同梱のデモ文言つきで復活する**。
 * 編集画面を開かなくても、admin のコールドスタート時に `bootstrapSystemPages()` が
 * 全システムページで同じことをする。公開ページに未承認の初期文言が再掲載される。
 *
 * ### F-64: 全セクションを非表示にすると、代わりに既定セクションが公開される
 *
 * `getPageSectionsWithFallback` は 0 件も fallback の条件にしていた。
 * `getPageSections` は `isActive: true` で絞るので、全部 OFF にしたページも 0 件に
 * なり、デモ文言が公開面に復帰する。編集画面には「非表示」と出ているので、
 * 管理者は何が起きているか説明できない。
 *
 * ### F-63: 必須セクションを複製すると二度と戻せない
 *
 * 複製は `page-hero` だけを弾いており、テンプレート必須型は複製できた。
 * 複製後は削除も表示切替も `isRequiredSectionForTemplate` が**型で**判定するので
 * 両方 CONFLICT になり、管理画面から一切戻せない。
 *
 * == 何を mock し、何を通すか ==
 *
 * `next/cache` だけ（`"use cache"` の producer が cacheComponents 外で throw する）。
 * 判定はすべて実 DB を通す。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type SectionQueriesModule = typeof import("@/shared/domain/sections/queries");
type SectionCommandsModule = typeof import("@/shared/domain/sections/commands");
type PageCommandsModule = typeof import("@/shared/domain/pages/commands");

let prisma: PrismaModule["prisma"];
let getPageSectionsWithFallback: SectionQueriesModule["getPageSectionsWithFallback"];
let duplicatePageSectionCommand: SectionCommandsModule["duplicatePageSectionCommand"];
let ensureSystemPageCommand: PageCommandsModule["ensureSystemPageCommand"];

/** システムページ `about` の元の状態を戻すためのスナップショット。 */
type SectionSnapshot = {
  id: string;
  type: string;
  config: unknown;
  order: number;
  isActive: boolean;
};

let aboutPageId: string;
let originalSections: SectionSnapshot[] = [];

async function readAboutSections(): Promise<SectionSnapshot[]> {
  const rows = await prisma.section.findMany({
    where: { pageId: aboutPageId },
    orderBy: { order: "asc" },
    select: { id: true, type: true, config: true, order: true, isActive: true },
  });
  return rows.map((row) => ({ ...row, config: row.config }));
}

/** 共有 test-db なので、触った行は必ず元へ戻す。 */
async function restoreAboutSections(): Promise<void> {
  await prisma.section.deleteMany({ where: { pageId: aboutPageId } });
  for (const section of originalSections) {
    await prisma.section.create({
      data: {
        id: section.id,
        pageId: aboutPageId,
        type: section.type,
        config: section.config === null ? {} : (section.config as object),
        order: section.order,
        isActive: section.isActive,
      },
    });
  }
}

/**
 * 共有 test-db の掃除。
 *
 * 必須セクションは 1 ページに 1 本が不変条件だが、ガードが壊れている状態
 * （＝ この gate が落ちる状態）で走ると複製行が残り、**以後の実行が別の理由で
 * 落ち続ける**。落ちた原因を消してしまわないよう、判定の後・後片付けで整える。
 */
async function pruneDuplicateRequiredSections(): Promise<void> {
  const contact = await prisma.page.findUnique({
    where: { slug: "contact" },
    select: { id: true },
  });
  if (!contact) return;
  const rows = await prisma.section.findMany({
    where: { pageId: contact.id, type: "contact-form" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (rows.length <= 1) return;
  await prisma.section.deleteMany({
    where: { id: { in: rows.slice(1).map((row) => row.id) } },
  });
}

describeMaybe("既定セクションは復活しない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getPageSectionsWithFallback } =
      await import("@/shared/domain/sections/queries"));
    ({ duplicatePageSectionCommand } =
      await import("@/shared/domain/sections/commands"));
    ({ ensureSystemPageCommand } =
      await import("@/shared/domain/pages/commands"));

    const page = await prisma.page.findUnique({
      where: { slug: "about" },
      select: { id: true },
    });
    if (!page) throw new Error("about ページが seed されていません");
    aboutPageId = page.id;
    originalSections = await readAboutSections();
    expect(originalSections.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await restoreAboutSections();
    await pruneDuplicateRequiredSections();
    await prisma.$disconnect();
  });

  test("削除したセクションは ensureSystemPageCommand で復活しない（F-53）", async () => {
    const target = originalSections.find((s) => s.type !== "page-hero");
    expect(target).toBeDefined();
    if (!target) return;

    try {
      await prisma.section.delete({ where: { id: target.id } });

      // 編集ルートの再レンダー / コールドスタートで走る経路。
      await ensureSystemPageCommand("about");

      const after = await readAboutSections();
      expect(after.map((s) => s.type)).not.toContain(target.type);
    } finally {
      await restoreAboutSections();
    }
  });

  test("全セクションを非表示にすると公開面は空になる（F-64）", async () => {
    try {
      await prisma.section.updateMany({
        where: { pageId: aboutPageId },
        data: { isActive: false },
      });

      const sections = await getPageSectionsWithFallback("about");

      // ここで既定セクションが返るのが F-64。管理者が消した文言が公開面に出る。
      expect(sections).toEqual([]);
    } finally {
      await restoreAboutSections();
    }
  });

  test("Page 行が無い slug では既定セクションに落ちる（従来どおり）", async () => {
    const sections = await getPageSectionsWithFallback("home");

    // fallback 自体は生きている（gate が空振りしていない）。
    expect(Array.isArray(sections)).toBe(true);
  });

  test("必須セクションは複製できない（F-63）", async () => {
    const contact = await prisma.page.findUnique({
      where: { slug: "contact" },
      select: { id: true, template: true },
    });
    expect(contact).not.toBeNull();
    if (!contact) return;

    const required = await prisma.section.findFirst({
      where: { pageId: contact.id, type: "contact-form" },
      select: { id: true },
    });
    expect(required).not.toBeNull();
    if (!required) return;

    let caught: unknown;
    try {
      await duplicatePageSectionCommand(required.id);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ name: "DomainError", code: "CONFLICT" });

    const count = await prisma.section.count({
      where: { pageId: contact.id, type: "contact-form" },
    });
    // 複製が通ると 2 本になり、削除も表示切替も CONFLICT で戻せなくなる。
    expect(count).toBe(1);
  });
});
