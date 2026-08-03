/**
 * ゴミ箱に入れたページが slug を手放すことの統合テスト（実 DB 必須）。
 *
 * このリポジトリの既定は「論理削除された行の slug は衝突とみなさない」で、
 * Post（`deletedAt IS NULL`）と Space（`isActive = true`）が partial unique を
 * 持っている。Page だけが素の UNIQUE のまま取り残されていた。
 *
 * 検査するのは DB の制約そのもの:
 *   1. ゴミ箱の行と同じ slug で新しいページを **作れる**
 *   2. active な行どうしでは依然として重複を **拒否する**
 *   3. 復元は「slug を別ページに取られている」場合に失敗する
 *      （アプリ側は `restorePageCommand` が事前確認して CONFLICT を返すが、
 *       ここでは最後の砦である DB 制約が効いていることを確かめる）
 *
 * 3 が本命。1 だけ通して 2/3 を見ないと、「制約が消えただけ」でも緑になる。
 *
 * == 実行条件 ==
 * `bun run test:integration` が docker-compose の test-db 既定値を注入する。
 * TEST_DATABASE_URL 未設定時は describe.skip で silent skip。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
let prisma: PrismaModule["prisma"];

const SLUG = `trash-slug-${crypto.randomUUID().slice(0, 8)}`;
const createdIds: string[] = [];

async function createPage(isActive: boolean): Promise<string> {
  const page = await prisma.page.create({
    data: {
      slug: SLUG,
      title: `Trash slug ${SLUG}`,
      template: "custom",
      isActive,
    },
    select: { id: true },
  });
  createdIds.push(page.id);
  return page.id;
}

describeMaybe("pages.slug の partial unique", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.page.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  test("ゴミ箱の行と同じ slug で新しいページを作れる", async () => {
    await createPage(false);
    const activeId = await createPage(true);

    expect(activeId).toBeTruthy();
    expect(await prisma.page.count({ where: { slug: SLUG } })).toBe(2);
  });

  test("active どうしの重複は拒否される", async () => {
    let failed = false;
    try {
      await createPage(true);
    } catch {
      // `expect(...).rejects` は実 DB 統合テストでハングする既知の挙動があるため
      // try/catch で受ける
      failed = true;
    }

    expect(failed).toBe(true);
  });

  test("slug を取られたゴミ箱の行は復元できない", async () => {
    const trashed = await prisma.page.findFirst({
      where: { slug: SLUG, isActive: false },
      select: { id: true },
    });
    expect(trashed).not.toBeNull();

    let failed = false;
    try {
      await prisma.page.update({
        where: { id: trashed?.id ?? "" },
        data: { isActive: true },
      });
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
  });
});
