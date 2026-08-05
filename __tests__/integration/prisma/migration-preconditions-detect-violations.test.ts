/**
 * `scripts/migration-preconditions.ts` が組み立てるプローブ SQL が、実 DB で
 * **本当に違反行を数える**ことの検査。
 *
 * ## 静的 gate では届かないところ
 *
 * `__tests__/unit/architecture/migration-preconditions.test.ts` は「全文が分類でき、
 * 既存テーブルへの検査がプローブを持つ」ことしか見ない。プローブの中身が
 * 構文エラーでも、常に 0 を返す式でも、そちらは緑のままになる。
 *
 * 安全確認の道具でそれが起きると、**「確認した」という記録だけが残って中身が無い**。
 * だからここで、種類ごとに違反行を実際に置いて数えさせる。
 *
 * ## 使い捨てのテーブルを使う
 *
 * 本物のテーブルに違反行は入れられない（制約が既にある）。専用のテーブルを作り、
 * そこへ向けた DDL を分類器に食わせて、生成されたプローブを実行する。
 * 分類器から見れば本物の migration と区別が付かない。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

import { classifyStatement } from "../../../scripts/migration-preconditions";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);

const PARENT = "precondition_probe_parent";
const CHILD = "precondition_probe_child";

let prisma: PrismaClient;

/** DDL を分類してプローブを取り出す。プローブが無ければテストを落とす。 */
function probeFor(ddl: string): string {
  const probes = classifyStatement(ddl).flatMap((classified) =>
    classified.kind === "data-dependent" && classified.detail.probe !== null
      ? [classified.detail.probe]
      : [],
  );
  if (probes.length !== 1) {
    throw new Error(`プローブが 1 本にならない (${probes.length}): ${ddl}`);
  }
  return probes[0] ?? "";
}

async function count(probe: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(probe);
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${CHILD}"`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PARENT}"`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${PARENT}" ("id" text PRIMARY KEY)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${CHILD}" (
       "id" text,
       "parent_id" text,
       "code" text,
       "note" text,
       "total" integer,
       "deleted_at" timestamptz
     )`,
  );
  await prisma.$executeRawUnsafe(`INSERT INTO "${PARENT}" VALUES ('p1')`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${CHILD}"`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PARENT}"`);
  await prisma.$disconnect();
});

async function reset(rows: string): Promise<void> {
  await prisma.$executeRawUnsafe(`DELETE FROM "${CHILD}"`);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${CHILD}" ("id", "parent_id", "code", "note", "total", "deleted_at") VALUES ${rows}`,
  );
}

describe("適用前プローブは実 DB で違反行を数える", () => {
  test("CHECK — 式が FALSE の行だけ数える（NULL は数えない）", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ADD CONSTRAINT "c_total" CHECK ("total" >= 0)`,
    );
    await reset(
      `('a','p1','a','a',-1,NULL), ('b','p1','b','b',5,NULL), ('c','p1','c','c',NULL,NULL)`,
    );
    // CHECK は式が UNKNOWN のとき通るので、NULL の行は違反ではない。
    expect(await count(probe)).toBe(1);

    await prisma.$executeRawUnsafe(
      `UPDATE "${CHILD}" SET "total" = 0 WHERE "total" < 0`,
    );
    expect(await count(probe)).toBe(0);
  });

  test("UNIQUE — 重複グループの余剰行を数え、NULL は衝突扱いしない", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ADD CONSTRAINT "c_code" UNIQUE ("code")`,
    );
    await reset(
      `('a','p1','dup','a',1,NULL), ('b','p1','dup','b',1,NULL), ('c','p1','dup','c',1,NULL),
       ('d','p1',NULL,'d',1,NULL), ('e','p1',NULL,'e',1,NULL)`,
    );
    // 3 行の重複 → 余剰 2 行。NULL 2 行は unique index では衝突しない。
    expect(await count(probe)).toBe(2);
  });

  test("部分 unique index — 述語の外の重複は数えない", async () => {
    const probe = probeFor(
      `CREATE UNIQUE INDEX "c_code_live" ON "${CHILD}"("code") WHERE ("deleted_at" IS NULL)`,
    );
    await reset(
      `('a','p1','dup','a',1,NULL), ('b','p1','dup','b',1,NULL),
       ('c','p1','gone','c',1,'2026-01-01T00:00:00Z'), ('d','p1','gone','d',1,'2026-01-01T00:00:00Z')`,
    );
    // 生存 2 行の重複だけが対象。削除済みの重複は述語の外。
    expect(await count(probe)).toBe(1);
  });

  test("PRIMARY KEY — 一意性に加えて NULL も数える", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ADD CONSTRAINT "c_pkey" PRIMARY KEY ("id")`,
    );
    await reset(
      `('x','p1','a','a',1,NULL), ('x','p1','b','b',1,NULL), (NULL,'p1','c','c',1,NULL)`,
    );
    // 重複の余剰 1 行 + NULL 1 行。
    expect(await count(probe)).toBe(2);
  });

  test("FOREIGN KEY — 参照先の無い行を数え、NULL は数えない", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ADD CONSTRAINT "c_fk" FOREIGN KEY ("parent_id") REFERENCES "${PARENT}"("id") ON DELETE RESTRICT`,
    );
    await reset(
      `('a','p1','a','a',1,NULL), ('b','missing','b','b',1,NULL), ('c',NULL,'c','c',1,NULL)`,
    );
    expect(await count(probe)).toBe(1);
  });

  test("SET NOT NULL — NULL の行を数える", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ALTER COLUMN "note" SET NOT NULL`,
    );
    await reset(`('a','p1','a',NULL,1,NULL), ('b','p1','b','ok',1,NULL)`);
    expect(await count(probe)).toBe(1);
  });

  test("VARCHAR(n) への縮小 — 溢れる行を数える", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ALTER COLUMN "note" SET DATA TYPE VARCHAR(3)`,
    );
    await reset(`('a','p1','a','abcd',1,NULL), ('b','p1','b','abc',1,NULL)`);
    expect(await count(probe)).toBe(1);
  });

  test("既定値なし NOT NULL 列の追加 — 行があれば全件が違反", async () => {
    const probe = probeFor(
      `ALTER TABLE "${CHILD}" ADD COLUMN "extra" text NOT NULL`,
    );
    await reset(`('a','p1','a','a',1,NULL), ('b','p1','b','b',1,NULL)`);
    expect(await count(probe)).toBe(2);

    await prisma.$executeRawUnsafe(`DELETE FROM "${CHILD}"`);
    expect(await count(probe)).toBe(0);
  });
});
