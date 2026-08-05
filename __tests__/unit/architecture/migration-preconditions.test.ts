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
 * ## 取りこぼしは静かに起きる
 *
 * 分類が誤ると exit 0 が返る。それは道具が無いより悪い（あると思って見なくなる）。
 * 実際に見つかった取りこぼしを、ここで見本として固定してある:
 *
 * | 形 | かつての扱い |
 * | --- | --- |
 * | `ALTER TABLE t ADD COLUMN a …, ADD COLUMN b …` | 先頭 1 つだけ分類（Prisma が普通に出す形） |
 * | `UPDATE` / `DELETE` / `INSERT` | safe（append-only trigger や FK で落ちる） |
 * | `ALTER TABLE … VALIDATE CONSTRAINT` | safe（全行走査そのもの） |
 * | `ADD COLUMN … UNIQUE` | safe（既定値が全行に入るので必ず衝突） |
 * | `UNIQUE NULLS NOT DISTINCT` | NULL 行を母集合から外していた |
 * | 式 index | safe（式が評価できない行で落ちる） |
 * | `E'…\\'…'` | 文の切れ目を誤り、以降が 1 文に飲まれる |
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: すべての migration の全文が分類済みで（`unknown` が 0）、既存
 * テーブルに対する「既存行に当たって失敗しうる文」がすべてプローブを持つ。
 *
 * **証明しない**: プローブの SQL が意味的に正しいこと。そこは
 * `__tests__/integration/prisma/migration-preconditions-detect-violations.test.ts`
 * が実 DB に違反行を置いて確かめ、`migration-preconditions-fail-closed.test.ts` が
 * 終了コードそのものを確かめる。
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
COMMENT ON TABLE "orders" IS 'x';
`;

function classifyFixture(): ReturnType<typeof classifyStatement> {
  return splitStatements(FIXTURE).flatMap((statement) =>
    classifyStatement(statement),
  );
}

/** 1 文を分類して、得られた `label → probe` を引けるようにする。 */
function probesOf(statement: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const classified of classifyStatement(statement)) {
    if (classified.kind !== "data-dependent") continue;
    out.set(classified.detail.label, classified.detail.probe);
  }
  return out;
}

function kindsOf(statement: string): string[] {
  return classifyStatement(statement).map((classified) => classified.kind);
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
    // 非 unique index / 関数定義 / COMMENT / nullable 列追加。
    expect(kinds.filter((k) => k === "safe")).toHaveLength(4);
    expect(kinds.filter((k) => k === "unknown")).toHaveLength(0);
  });

  test("知らない文は safe ではなく unknown になる", () => {
    // 「知らないものは通す」にすると、新種の DDL が黙って素通りして
    // このチェックが「確認した」という記録だけのものになる。
    expect(kindsOf('ALTER TABLE "orders" OF "order_type"')).toEqual([
      "unknown",
    ]);
  });

  describe("実際に取りこぼしていた形", () => {
    test("1 文に複数アクションがあれば全部分類する", () => {
      // Prisma が 2 列同時追加で出す形。先頭だけ見ると 2 列目が消える。
      const probes = probesOf(
        'ALTER TABLE "orders" ADD COLUMN "a" TEXT NOT NULL DEFAULT \'v\', ADD COLUMN "b" TEXT NOT NULL',
      );
      expect([...probes.keys()]).toEqual(["orders.b"]);

      // 属性変更が先に来ても、後ろの SET NOT NULL を見落とさない。
      const mixed = probesOf(
        'ALTER TABLE "orders" ALTER COLUMN "a" DROP DEFAULT, ALTER COLUMN "code" SET NOT NULL',
      );
      expect([...mixed.keys()]).toEqual(["orders.code"]);

      // 制約 2 本も両方。
      const both = probesOf(
        'ALTER TABLE "orders" ADD CONSTRAINT "a" CHECK ("x" >= 0), ADD CONSTRAINT "b" CHECK ("y" >= 0)',
      );
      expect([...both.keys()]).toEqual(["a", "b"]);
    });

    test("同じ文の後続アクションは前のアクションが足した列を見る", () => {
      // `ADD COLUMN … DEFAULT 0, ADD CONSTRAINT … CHECK ("score" >= 0)` は
      // 通る migration。後半が前半を見ないと「列が無い」でプローブが落ち、
      // 未評価として deploy を止めてしまう（誤検知だが実害は同じ）。
      const probe = probesOf(
        'ALTER TABLE "orders" ADD COLUMN "score" int NOT NULL DEFAULT 0, ADD CONSTRAINT "orders_score_check" CHECK ("score" >= 0)',
      ).get("orders_score_check");

      expect(probe).toContain('0 AS "score"');
    });

    test("兄弟句の DEFAULT を自分のものとして読まない", () => {
      // `a` に既定値があるからといって `b` が安全になるわけではない。
      const probes = probesOf(
        'ALTER TABLE "orders" ADD COLUMN "b" TEXT NOT NULL, ADD COLUMN "a" TEXT NOT NULL DEFAULT \'\'',
      );
      expect([...probes.keys()]).toEqual(["orders.b"]);
    });

    test("DML は safe ではない", () => {
      // append-only trigger（audit_logs / terms_agreements）や onDelete: Restrict の
      // FK に当たって落ちる。実 DB で再現済み。
      expect(
        kindsOf(`UPDATE "audit_logs" SET "metadata" = '{}'::jsonb`),
      ).toEqual(["unknown"]);
      expect(kindsOf('DELETE FROM "reservations" WHERE "id" = \'x\'')).toEqual([
        "unknown",
      ]);
      expect(
        kindsOf('INSERT INTO "post_categories" ("slug") VALUES (\'news\')'),
      ).toEqual(["unknown"]);
    });

    test("VALIDATE CONSTRAINT は safe ではない", () => {
      // `NOT VALID` で足した制約を全行走査して検証する文。まさに対象。
      expect(
        kindsOf(
          'ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_total_check"',
        ),
      ).toEqual(["unknown"]);
    });

    test("列内制約つきの ADD COLUMN は通さない", () => {
      // 既定値が全行に入るので UNIQUE は必ず衝突する。
      expect(
        kindsOf(
          'ALTER TABLE "orders" ADD COLUMN "code" TEXT NOT NULL DEFAULT \'\' UNIQUE',
        ),
      ).toEqual(["unknown"]);
      expect(
        kindsOf(
          'ALTER TABLE "orders" ADD COLUMN "user_id" TEXT REFERENCES "users"("id")',
        ),
      ).toEqual(["unknown"]);
    });

    test("NULLS NOT DISTINCT は NULL 行を母集合から外さない", () => {
      const strict = probesOf(
        'ALTER TABLE "orders" ADD CONSTRAINT "orders_code_key" UNIQUE NULLS NOT DISTINCT ("code")',
      ).get("orders_code_key");
      const normal = probesOf(
        'ALTER TABLE "orders" ADD CONSTRAINT "orders_code_key" UNIQUE ("code")',
      ).get("orders_code_key");

      expect(normal).toContain("IS NOT NULL");
      expect(strict).not.toContain("IS NOT NULL");
    });

    test("式 index は式を全行で評価するプローブを持つ", () => {
      // 一意でなくても、式が評価できない行があると index build が落ちる。
      const probes = probesOf(
        `CREATE INDEX "orders_priority_idx" ON "orders" ((("amenities"->>'priority')::int))`,
      );
      const [label] = [...probes.keys()];
      expect(label).toContain("式の評価");
      expect(probes.get(label ?? "")).toContain("COUNT(");
    });

    test("E'' のバックスラッシュ退避で文の切れ目を誤らない", () => {
      // 誤ると以降の DDL が 1 文に飲まれて分類から消える。
      const statements = splitStatements(
        `UPDATE "locations" SET "note" = E'it\\'s fine';
ALTER TABLE "locations" ADD CONSTRAINT "c" CHECK ("x" >= 0);`,
      );
      expect(statements).toHaveLength(2);
      expect(statements[1]).toStartWith("ALTER TABLE");
    });
  });

  test("すべての migration の全文が分類できている", () => {
    const unclassified = MIGRATIONS.flatMap((migration) =>
      splitStatements(migration.sql)
        .flatMap((statement) => classifyStatement(statement))
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
    const plan = planPreconditions(MIGRATIONS, new Set(), new Set());
    expect(plan.unknown).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.preconditions).toEqual([]);
  });

  test("作るはずのテーブルが既にあると免除が取り消される", () => {
    // baseline を migrate 済み DB へ当てた状態。ここを「これから作る＝既存行なし」と
    // 読むと検査対象が丸ごと消え、何も確かめずに通ってしまう。
    const existing = new Set(["locations", "reservations"]);
    const plan = planPreconditions(MIGRATIONS, new Set(), existing);

    expect(plan.conflicts.map((entry) => entry.table).sort()).toEqual([
      "locations",
      "reservations",
    ]);
    // 免除が外れた分、そのテーブルへの制約が検査対象に戻る。
    expect(
      plan.preconditions.some(
        (precondition) => precondition.detail.table === "locations",
      ),
    ).toBe(true);
  });

  test("同じ migration が足す列は既定値つきで検査対象になる", () => {
    // 「列を足してから制約を付ける」を、既存行が持つことになる値で評価できること。
    const fixture = [
      {
        name: "20260806000000_add_and_constrain",
        sql: `ALTER TABLE "orders" ADD COLUMN "score" integer NOT NULL DEFAULT -1;
ALTER TABLE "orders" ADD CONSTRAINT "orders_score_check" CHECK ("score" >= 0);`,
      },
    ];
    const plan = planPreconditions(fixture, new Set(), new Set(["orders"]));
    const check = plan.preconditions.find(
      (precondition) => precondition.detail.label === "orders_score_check",
    );

    expect(plan.unknown).toEqual([]);
    // 既定値 -1 が合成されていること（合成しないと「列が無い」で評価できない）。
    expect(check?.detail.probe).toContain('-1 AS "score"');
  });
});
