/**
 * 破壊的な文を持つ migration は、**実行される**前提検査を先に持つ gate。
 *
 * ## なぜ要るか
 *
 * 適用前の確認は `scripts/migration-preconditions.ts` のリハーサルが担う——これは
 * 半分しか本当ではない。リハーサルが証明するのは **「この SQL はエラーにならない」**
 * だけで、**破壊はエラーではない**。`DROP COLUMN` / `DROP TABLE` / `TRUNCATE` は
 * 満杯のテーブルに対しても成功する。だからリハーサルはデータ消失に対して構造的に
 * 盲目で、緑が「落として安全」と読まれる。
 *
 * 実際に起きたこと: 列の中身を別テーブルへ移してから列を落とす migration が、
 * 移送スクリプトの実行を**ヘッダの散文**で指示していた。散文は誰も実行しない。
 * 流し忘れれば列は黙って消え、顧客は保存したはずの休業日を失う（CX-3）。
 *
 * ## 何を強制するか
 *
 * 破壊的文より**前**に、`DO $$ … RAISE EXCEPTION … $$` の実行される検査を置く。
 * 同じ `BEGIN … COMMIT` の中なので、raise すれば何も落ちない。リハーサルが
 * この検査ごと流すので、**ダウンタイム窓が開く前**に止まり `_prisma_migrations` に
 * 失敗が残らない。前例は「重なった枠が残っていないことを assert するだけ」の
 * migration で、そのヘッダ自身が結論を書いている——人が読んで手で流す前提の検査は、
 * 流し忘れた瞬間に「検査したつもり」になる。**実行される形に置き換える。**
 *
 * 順序を見るのは、後ろに置いた検査が役に立たないから。消える列を参照する検査は
 * DROP の後では書けない。
 *
 * ## 検査は著者にしか書けない
 *
 * 「データの移送先が埋まっている」は authoring 時にしか存在しない知識で、
 * `migration-preconditions.ts` 側の汎用機構では代替できない。汎用の
 * 「この列にまだ値があるか」は **「まだ移していない」と「移し終えて元を消して
 * いないだけ」を区別できず**、正当なデプロイを止める。だから gate は
 * 「検査があること」だけを強制し、中身は migration の著者が書く。
 *
 * ## この gate が見ないもの
 *
 * - `ALTER COLUMN … TYPE … USING <式>` による切り捨て。式次第で無言に失われるが、
 *   「narrowing かどうか」は PostgreSQL の意味論の写経になり収束しない
 *   （`migration-preconditions.ts` の docstring 参照）
 * - `DO` ブロック内の `EXECUTE '…'` で組み立てた動的な破壊
 * - 検査の**中身**が正しいか。空振りする検査を書けば通る
 *
 * ## 既に書かれてしまったものをどう扱うか
 *
 * commit 済みの `prisma/migrations/*.sql` は編集できない（絶対規約 #7）。名前や
 * 日付で allowlist に載せることも `gates-do-not-pin-migrations.test.ts` が禁じている
 * （履歴は baseline へ畳まれるので、名前は畳んだ瞬間に嘘になる）。そこで
 * **件数だけを固定**する ratchet にする。新しく書けば増えて落ち、baseline へ
 * 畳めば減って落ちる。
 */

import { describe, expect, test } from "bun:test";
import {
  readMigrations,
  splitStatements,
} from "../../../scripts/migration-preconditions";

/**
 * 実行される検査を持たないまま破壊的文を含む migration の本数。
 *
 * 減らす方向にしか動かせない。内訳は「列の移送をヘッダの散文で指示していた 1 本」。
 */
const GRANDFATHERED_UNASSERTED_DESTRUCTIVE = 1;

/**
 * 文の**先頭の動詞**で破壊を判定する。
 *
 * 部分一致にすると `CREATE TRIGGER … BEFORE TRUNCATE ON t` が破壊に見える。
 * 実測では、TRUNCATE を禁じる trigger を定義した migration 1 本が素朴な
 * `TRUNCATE` grep に 6 回当たり、**全部が防御の定義**だった。
 */
export function isDestructiveStatement(statement: string): boolean {
  const sql = statement.replace(/\s+/gu, " ").trim();
  if (/^TRUNCATE\b/iu.test(sql)) return true;
  if (/^DROP\s+TABLE\b/iu.test(sql)) return true;
  // `ALTER TABLE` は 1 文に複数アクションを持てるので、先頭を固定したうえで
  // 文中の DROP COLUMN を見る。DROP CONSTRAINT は行を消さないので対象外。
  if (/^ALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/iu.test(sql)) return true;
  return false;
}

/**
 * **実行される**検査か。
 *
 * `DO $$ … RAISE EXCEPTION … $$` だけを数える。`CREATE FUNCTION … RAISE EXCEPTION`
 * は関数を**定義する**だけで、その migration の中では 1 度も評価されない。
 * 区別しないと、trigger 関数を定義したついでに列を落とす migration が
 * 「検査済み」に見える。
 */
export function isExecutedAssertion(statement: string): boolean {
  const sql = statement.replace(/\s+/gu, " ").trim();
  return /^DO\b/iu.test(sql) && /\bRAISE\s+EXCEPTION\b/iu.test(sql);
}

/**
 * 実行される検査より前に現れた破壊的文を返す。
 *
 * gate 本体も fixture も**この関数だけ**を呼ぶ。部品を個別に fixture して実走査で
 * 合成すると、合成部分（順序の判定）が誰にも検証されない
 * （`.claude/rules/testing-unit.md` の 4 点目）。
 */
export function unassertedDestructiveStatements(sql: string): string[] {
  const offenders: string[] = [];
  let asserted = false;

  for (const statement of splitStatements(sql)) {
    if (isExecutedAssertion(statement)) {
      asserted = true;
      continue;
    }
    if (isDestructiveStatement(statement) && !asserted) {
      offenders.push(statement.replace(/\s+/gu, " ").trim());
    }
  }

  return offenders;
}

function migrationsWithUnassertedDestruction(): string[] {
  return readMigrations()
    .filter(({ sql }) => unassertedDestructiveStatements(sql).length > 0)
    .map(({ name }) => `prisma/migrations/${name}/migration.sql`);
}

describe("破壊的 migration は実行される前提検査を伴う", () => {
  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(readMigrations().length).toBeGreaterThan(0);
  });

  test("検出できる形・できない形（fixture）", () => {
    const drop = `BEGIN;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
COMMIT;`;

    // 1. 新しく検出したい形が落ちる。
    expect(unassertedDestructiveStatements(drop)).toHaveLength(1);

    // 2. 兄弟の破壊形も落とす。
    expect(
      unassertedDestructiveStatements(`TRUNCATE TABLE "audit_logs";`),
    ).toHaveLength(1);
    expect(
      unassertedDestructiveStatements(`DROP TABLE "legacy_holidays";`),
    ).toHaveLength(1);

    // 3-a. 検査が**前**にあれば通る。
    const guarded = `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM locations WHERE special_holidays IS NOT NULL) THEN
    RAISE EXCEPTION '未移送';
  END IF;
END $$;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
COMMIT;`;
    expect(unassertedDestructiveStatements(guarded)).toEqual([]);

    // 3-b. 検査が**後**なら守っていない（消える列は後からは参照できない）。
    const guardedTooLate = `BEGIN;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
DO $$ BEGIN RAISE EXCEPTION '手遅れ'; END $$;
COMMIT;`;
    expect(unassertedDestructiveStatements(guardedTooLate)).toHaveLength(1);

    // 3-c. TRUNCATE を**禁じる** trigger の定義は破壊ではない。
    expect(
      unassertedDestructiveStatements(
        `CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
           FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();`,
      ),
    ).toEqual([]);

    // 3-d. DROP CONSTRAINT は行を消さない。
    expect(
      unassertedDestructiveStatements(
        `ALTER TABLE "locations" DROP CONSTRAINT "locations_special_holidays_array_check";`,
      ),
    ).toEqual([]);

    // 3-e. **関数の定義は検査ではない。** RAISE EXCEPTION を含んでいても、
    // その migration の中では 1 度も評価されない。
    const definesButDoesNotRun = `CREATE FUNCTION guard() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'nope';
END;
$function$;
ALTER TABLE "locations" DROP COLUMN "special_holidays";`;
    expect(unassertedDestructiveStatements(definesButDoesNotRun)).toHaveLength(
      1,
    );
  });

  test("実行される検査を伴わない破壊的 migration は増えていない", () => {
    const offenders = migrationsWithUnassertedDestruction();

    expect(
      offenders.length,
      offenders.length > GRANDFATHERED_UNASSERTED_DESTRUCTIVE
        ? `破壊的文の前に DO $$ … RAISE EXCEPTION … $$ を置くこと:\n  ${offenders.join("\n  ")}`
        : `baseline へ畳んだなら ${GRANDFATHERED_UNASSERTED_DESTRUCTIVE} を下げる:\n  ${offenders.join("\n  ")}`,
    ).toBe(GRANDFATHERED_UNASSERTED_DESTRUCTIVE);
  });
});
