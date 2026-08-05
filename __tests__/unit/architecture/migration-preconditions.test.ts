/**
 * `scripts/migration-preconditions.ts` が、**この repo の migration を残らず
 * 読めている**ことの gate。
 *
 * ## 何を守っているのか
 *
 * migration は `BEGIN; … COMMIT;` で包む契約なので、既存行に当たって落ちたときの
 * 表示は `current transaction is aborted, commands ignored until end of
 * transaction block` だけになる。どの制約のどの行かは分からず、
 * `_prisma_migrations` には失敗が残って**以降のデプロイが全部止まる**。
 *
 * それを避けるための適用前チェックは、以前は「migration ヘッダに確認クエリを
 * 書く」という散文の約束だった。実測: `20260805180000` のヘッダは 23 本の制約の
 * うち 3 本しか見ておらず、`locations.special_holidays` に JSON null が残った DB で
 * 「0 件」と出たうえで migration が落ちた。**人が書く一覧は、覆うべき集合から
 * 必ず離れていく。**
 *
 * 今はチェックを migration SQL から導出している。この gate はその導出が
 * **取りこぼしていない**ことだけを見る。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: すべての migration の全文が分類済みで（`unknown` が 0）、既存
 * テーブルに対する「既存行に当たって失敗しうる文」がすべてプローブを持つ。
 *
 * **証明しない**: プローブの SQL が意味的に正しいこと。そこは
 * `__tests__/integration/prisma/migration-preconditions-detect-violations.test.ts`
 * が実 DB に違反行を置いて確かめる。
 *
 * ## EXCLUDE 制約について
 *
 * EXCLUDE にはプローブが無い。今ある 1 本は baseline が作るテーブル上にあるので
 * 対象外だが、**既存テーブルへ EXCLUDE を足す migration を書いた瞬間にこの gate が
 * 赤くなる**。deploy の夜ではなく PR の時点で止まる、という設計。
 */

import { describe, expect, test } from "bun:test";

import {
  classifyStatement,
  planPreconditions,
  readMigrations,
  splitStatements,
} from "../../../scripts/migration-preconditions";

const MIGRATIONS = readMigrations();

/** 分類器が読めなければならない文の見本（1 種につき 1 本）。 */
const FIXTURE = `
-- コメントは落ちる
CREATE TABLE "widgets" ("id" TEXT NOT NULL, "slug" TEXT);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK ("total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_code_key" UNIQUE ("code");
ALTER TABLE "orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_no_overlap" EXCLUDE USING gist ("space_id" WITH =, "period" WITH &&);
CREATE UNIQUE INDEX "orders_slug_key" ON "orders"("slug") WHERE ("deleted_at" IS NULL);
ALTER TABLE "orders" ALTER COLUMN "note" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "note" SET DATA TYPE VARCHAR(120);
ALTER TABLE "orders" ADD COLUMN "memo" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN "hint" TEXT;
CREATE INDEX "orders_created_idx" ON "orders"("created_at");
CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
UPDATE "orders" SET "note" = 'x';
`;

function classifyFixture(): ReturnType<typeof classifyStatement>[] {
  return splitStatements(FIXTURE).map(classifyStatement);
}

describe("migration 適用前チェックの導出", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // 実データ件数ではなく見本で確かめる。migration の本数が変わっても意味が変わらない。
    const statements = splitStatements(FIXTURE);
    expect(statements.length).toBe(14);

    // ドル引用符の中の `;` で割っていないこと。
    expect(
      statements.filter((s) => s.startsWith("CREATE OR REPLACE FUNCTION")),
    ).toHaveLength(1);

    // migration そのものも読めていること。
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS.map((m) => m.name)).toContain("00000000000000_init");
  });

  test("既存行に当たる文は種類ごとにプローブを持つ", () => {
    const byLabel = new Map<string, string | null>();
    for (const classified of classifyFixture()) {
      if (classified.kind !== "data-dependent") continue;
      byLabel.set(classified.detail.label, classified.detail.probe);
    }

    // 「プローブがある」だけでなく、対象の列がプローブに現れることまで見る。
    expect(byLabel.get("orders_total_check")).toContain('"total" >= 0');
    expect(byLabel.get("orders_total_check")).toContain("IS FALSE");
    expect(byLabel.get("orders_code_key")).toContain('GROUP BY "code"');
    expect(byLabel.get("orders_pkey")).toContain("IS NULL");
    expect(byLabel.get("orders_user_fkey")).toContain("NOT EXISTS");
    expect(byLabel.get("orders_slug_key")).toContain('"deleted_at" IS NULL');
    expect(byLabel.get("orders.note")).toContain("LENGTH");
    expect(byLabel.get("orders.memo")).toContain("COUNT(*)");

    // EXCLUDE は既知だがプローブ未実装。null であることを明示的に固定する
    // （後で実装したらこの行が落ちて、gate 側も更新される）。
    expect(byLabel.get("orders_no_overlap")).toBeNull();
  });

  test("既存行に当たらない文は safe / creates-table に落ちる", () => {
    const kinds = classifyFixture().map((c) => c.kind);
    expect(kinds.filter((k) => k === "creates-table")).toHaveLength(1);
    // 非 unique index / 関数定義 / UPDATE / 既定値ありでない nullable 列追加。
    expect(kinds.filter((k) => k === "safe")).toHaveLength(4);
    expect(kinds.filter((k) => k === "unknown")).toHaveLength(0);
  });

  test("知らない文は safe ではなく unknown になる", () => {
    // 「知らないものは通す」にすると、新種の DDL が黙って素通りして
    // このチェックが「確認した」という記録だけのものになる。
    const classified = classifyStatement(
      'ALTER TABLE "orders" INHERIT "legacy_orders"',
    );
    expect(classified.kind).toBe("unknown");
  });

  test("すべての migration の全文が分類できている", () => {
    const unclassified = MIGRATIONS.flatMap((migration) =>
      splitStatements(migration.sql)
        .map((statement) => classifyStatement(statement))
        .flatMap((classified) =>
          classified.kind === "unknown"
            ? [`${migration.name}: ${classified.head}`]
            : [],
        ),
    );

    expect(unclassified).toEqual([]);
  });

  test("既存テーブルに対する検査対象はすべてプローブを持つ", () => {
    // 最悪ケース: その migration より前がすべて適用済みの DB へ流す場合。
    // 自分が作るテーブルへの制約だけが対象外になる。
    const missing = MIGRATIONS.flatMap((migration, position) => {
      const applied = new Set(
        MIGRATIONS.slice(0, position).map((earlier) => earlier.name),
      );
      return planPreconditions(MIGRATIONS, applied)
        .preconditions.filter(
          (precondition) => precondition.migration === migration.name,
        )
        .filter((precondition) => precondition.detail.probe === null)
        .map(
          (precondition) =>
            `${migration.name} / ${precondition.detail.label}: ` +
            `既存テーブル ${precondition.detail.table} に対する検査なのにプローブが無い。` +
            `scripts/migration-preconditions.ts に実装を足す`,
        );
    });

    expect(missing).toEqual([]);
  });

  test("空の DB では検査対象が 0 になる（本番切替の経路）", () => {
    // baseline がテーブルを作るので、既存行が存在しえない。
    const plan = planPreconditions(MIGRATIONS, new Set());
    expect(plan.unknown).toEqual([]);
    expect(plan.preconditions).toEqual([]);
  });
});
