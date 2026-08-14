/**
 * コマンドパレットのページ検索が、一覧経路と同じ絞り込みを掛けることの検証。
 *
 * == なぜ要るのか ==
 *
 * EDITOR は `UserPageAssignment` で割り当てられたページしか読めない。一覧
 * (`listPagesForAdmin`) と詳細 (`requireAdminResourcePermission` → `notFound()`)
 * はその契約を守っていたが、**コマンドパレットの検索だけが title / slug の
 * ILIKE しか見ていなかった**（監査 F-92 / F-115）。
 *
 * 結果:
 *
 * - 割当外ページのタイトルと slug（= 将来の公開 URL）が EDITOR に見える
 * - `isActive: false`（ゴミ箱送り）も出る
 * - `PAGES_MANAGED_ELSEWHERE`（専用画面で管理する posts / news / terms）も出る
 *
 * クリック先は 404 になるので「触れはしない」が、**存在を隠す方針**とは矛盾する。
 * 未公開ページの slug は公開前の URL そのもので、漏れると外から先回りできる。
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。Page / User / UserPageAssignment を実 DB に作り、
 * `searchByResource("page", …, scope)` の返り値を見る。**欠陥は WHERE 句に
 * あった**ので、Prisma を差し替えると何も確かめられない。
 *
 * scope の解決（`isEditorRole` → `getAssignedPageIdsForUser`）は Server Action
 * 側の責務なので、ここでは解決済みの id 集合を渡す形で固定する。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type SearchModule = typeof import("@/shared/domain/admin-search/queries");

let prisma: PrismaModule["prisma"];
let searchByResource: SearchModule["searchByResource"];

/** 他テストのページと衝突しないよう、この実行だけで使う検索語。 */
const MARKER = `zscopeprobe${crypto.randomUUID().replaceAll("-", "")}`;

type SeededPage = { id: string; slug: string };

const createdPageIds: string[] = [];

async function createPage(input: {
  suffix: string;
  isActive?: boolean;
  isPublished?: boolean;
  slug?: string;
}): Promise<SeededPage> {
  const slug = input.slug ?? `${MARKER}-${input.suffix}`;
  const row = await prisma.page.create({
    data: {
      slug,
      title: `${MARKER} ${input.suffix}`,
      template: "custom",
      isActive: input.isActive ?? true,
      isPublished: input.isPublished ?? true,
    },
    select: { id: true, slug: true },
  });
  createdPageIds.push(row.id);
  return row;
}

describeMaybe("コマンドパレットのページ検索スコープ", () => {
  let assigned: SeededPage;
  let unassignedDraft: SeededPage;
  let trashed: SeededPage;
  let managedElsewhere: SeededPage | null = null;

  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ searchByResource } =
      await import("@/shared/domain/admin-search/queries"));

    assigned = await createPage({ suffix: "assigned" });
    unassignedDraft = await createPage({
      suffix: "unassigned-draft",
      isPublished: false,
    });
    trashed = await createPage({ suffix: "trashed", isActive: false });

    // `PAGES_MANAGED_ELSEWHERE` の slug は @unique。seed 済みなら作らず既存を使う。
    const existingNews = await prisma.page.findUnique({
      where: { slug: "news" },
      select: { id: true, slug: true },
    });
    managedElsewhere =
      existingNews ?? (await createPage({ suffix: "news", slug: "news" }));
    // 検索語で引っかかるように title だけ marker を持たせる（slug は固定）。
    await prisma.page.update({
      where: { id: managedElsewhere.id },
      data: { title: `${MARKER} news` },
    });
  });

  afterAll(async () => {
    if (managedElsewhere && !createdPageIds.includes(managedElsewhere.id)) {
      // 既存 seed 行を借りていた場合は title を戻す。
      await prisma.page.update({
        where: { id: managedElsewhere.id },
        data: { title: "お知らせ" },
      });
    }
    await prisma.page.deleteMany({ where: { id: { in: createdPageIds } } });
    await prisma.$disconnect();
  });

  test("ADMIN（scope 無し）は割当に縛られない", async () => {
    const group = await searchByResource("page", MARKER, {});
    const ids = group.items.map((item) => item.id);

    expect(ids).toContain(assigned.id);
    expect(ids).toContain(unassignedDraft.id);
  });

  test("EDITOR は割当ページだけが返る", async () => {
    const group = await searchByResource("page", MARKER, {
      allowedPageIds: [assigned.id],
    });
    const ids = group.items.map((item) => item.id);

    expect(ids).toEqual([assigned.id]);
    // 未公開ドラフトの slug は公開前の URL。これが出るのが F-92 / F-115。
    expect(ids).not.toContain(unassignedDraft.id);
  });

  test("割当が 0 件の EDITOR には何も返らない", async () => {
    const group = await searchByResource("page", MARKER, {
      allowedPageIds: [],
    });

    expect(group.items).toEqual([]);
  });

  test("ゴミ箱送り（isActive: false）は誰にも返らない", async () => {
    const group = await searchByResource("page", MARKER, {});
    const ids = group.items.map((item) => item.id);

    expect(ids).not.toContain(trashed.id);
  });

  test("専用画面で管理する slug は返らない", async () => {
    const group = await searchByResource("page", MARKER, {});
    const ids = group.items.map((item) => item.id);

    expect(managedElsewhere).not.toBeNull();
    expect(ids).not.toContain(managedElsewhere?.id);
  });
});
