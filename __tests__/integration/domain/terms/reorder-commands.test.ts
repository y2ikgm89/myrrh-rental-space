/**
 * terms/commands の reorderTermsCommand 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `displayOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/terms/commands");

let prisma: PrismaModule["prisma"];
let reorderTermsCommand: CommandsModule["reorderTermsCommand"];

describeMaybe("terms/commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ reorderTermsCommand } = await import("@/shared/domain/terms/commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("reorderTermsCommand は displayOrder を並び替える（既存規約は保持したまま自分の2件を入れ替える）", async () => {
    // reorderTermsCommand は「全 TermsDocument（未削除）が過不足なく揃っていること」を
    // 検証するため、対象スコープは全件。ただし TermsDocument は TermsAgreement から
    // 参照される想定の永続レコードで、seed 済みの本物の規約が既に存在しうる。
    // deleteMany({}) はその既存行を巻き込むため使わず、既存行は保持したまま
    // 自分の2行だけ追加して入れ替える。
    const suffix = crypto.randomUUID();
    const existing = await prisma.termsDocument.findMany({
      where: { deletedAt: null },
      orderBy: { displayOrder: "asc" },
      select: { id: true },
    });
    // displayOrder は非削除行間の partial unique。過去の soft-delete で欠番が
    // 生じている可能性があるため existing.length ではなく既存最大値の次を使う
    // （0..N-1 への詰め直しは reorderTermsCommand 自体が行う）。
    const maxOrder = await prisma.termsDocument.aggregate({
      where: { deletedAt: null },
      _max: { displayOrder: true },
    });
    const baseOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const a = await prisma.termsDocument.create({
      data: {
        type: "GENERAL",
        slug: `repro-terms-a-${suffix}`,
        title: "規約A",
        contentJson: {},
        contentHtml: "<p>A</p>",
        scopes: [],
        displayOrder: baseOrder,
      },
    });
    const b = await prisma.termsDocument.create({
      data: {
        type: "GENERAL",
        slug: `repro-terms-b-${suffix}`,
        title: "規約B",
        contentJson: {},
        contentHtml: "<p>B</p>",
        scopes: [],
        displayOrder: baseOrder + 1,
      },
    });

    try {
      await reorderTermsCommand([...existing.map((e) => e.id), b.id, a.id]);

      const rows = await prisma.termsDocument.findMany({
        where: { deletedAt: null },
        orderBy: { displayOrder: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.termsDocument.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
