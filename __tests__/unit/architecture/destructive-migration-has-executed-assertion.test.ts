/**
 * 破壊的な文を持つ migration は、**実行される**前提検査を持つ gate。
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
 * 破壊的文は、次の**どちらか**を持つ。片方も無いものはここに出る。
 *
 * 1. migration 内の `DO $$ … RAISE EXCEPTION … $$`。破壊的文より**前**に置く。
 *    同じ `BEGIN … COMMIT` の中なので、raise すれば何も落ちない。リハーサルが
 *    この検査ごと流すので、**ダウンタイム窓が開く前**に止まり `_prisma_migrations`
 *    に失敗が残らない
 * 2. `scripts/migration-preconditions.ts` の `HANDOVERS` 登録。commit 済みの
 *    migration は編集できない（絶対規約 #7）ので、1 を後から足せないぶんはここへ書く。
 *    デプロイ経路が実際にその SQL を流し、0 でなければ適用しない
 *
 * 順序を見るのは、後ろに置いた検査が役に立たないから。消える列を参照する検査は
 * DROP の後では書けない。
 *
 * ## なぜ「値がまだあるか」で代替しないのか
 *
 * expand/contract では、値を別の表へ**移し終えた後も元の列は埋まったまま**で、
 * そこを DROP するのが contract そのものになる。汎用の「値があるか」で止めると、
 * 正しく移送を終えたデプロイを恒久的に止める。本当の前提は「移送先に入っているか」で、
 * それは著者にしか書けない。だから 1（著者が書く）と 2（著者が書けないぶんを
 * 登録する）に分ける。
 *
 * ## この gate が見ないもの
 *
 * - `ALTER COLUMN … TYPE … USING <式>` による切り捨て。式次第で無言に失われるが、
 *   「narrowing かどうか」は PostgreSQL の意味論の写経になり収束しない
 *   （`migration-preconditions.ts` の docstring 参照）
 * - `DO` ブロック内の `EXECUTE '…'` で組み立てた動的な破壊
 * - 検査や `countUnhandedOver` の**中身**が正しいか。空振りする SQL を書けば通る。
 *   `HANDOVERS` のぶんは実 DB で流して答えが返ることを
 *   `__tests__/integration/prisma/migration-handovers.test.ts` が確かめる
 */

import { describe, expect, test } from "bun:test";
import {
  destructionTargets,
  destructionsWithoutHandover,
  HANDOVERS,
  readMigrations,
  unassertedDestructiveStatements,
} from "../../../scripts/migration-preconditions";

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

  test("消える対象を取り違えない（fixture）", () => {
    expect(
      destructionTargets(
        `ALTER TABLE "locations" DROP COLUMN "special_holidays"`,
      ),
    ).toEqual(["locations.special_holidays"]);

    // 1 文に複数アクション。DROP CONSTRAINT は対象ではない。
    expect(
      destructionTargets(
        `ALTER TABLE "locations" DROP CONSTRAINT "c", DROP COLUMN IF EXISTS "a", DROP COLUMN "b"`,
      ),
    ).toEqual(["locations.a", "locations.b"]);

    expect(destructionTargets(`TRUNCATE TABLE "audit_logs"`)).toEqual([
      "audit_logs",
    ]);
    expect(
      destructionTargets(`DROP TABLE IF EXISTS "legacy_holidays"`),
    ).toEqual(["legacy_holidays"]);
  });

  test("引き継ぎ先の無い破壊を検出する（fixture）", () => {
    const migrations = [
      {
        // timestamp 形の名前は使わない（`gates-do-not-pin-migrations.test.ts` 参照）。
        name: "handover_fixture",
        sql: `ALTER TABLE "locations" DROP COLUMN "memo";`,
      },
    ];

    // 登録が無ければ落ちる。
    expect(destructionsWithoutHandover(migrations, [])).toEqual([
      { migration: "handover_fixture", target: "locations.memo" },
    ]);

    // 登録があれば通る。
    expect(
      destructionsWithoutHandover(migrations, [
        {
          target: "locations.memo",
          what: "メモが消える",
          countUnhandedOver: "SELECT 0 AS n",
          remedy: "bun scripts/x.ts",
        },
      ]),
    ).toEqual([]);

    // 別の対象の登録では通らない（target 一致を見ている）。
    expect(
      destructionsWithoutHandover(migrations, [
        {
          target: "locations.other",
          what: "別物",
          countUnhandedOver: "SELECT 0 AS n",
          remedy: "bun scripts/x.ts",
        },
      ]),
    ).toHaveLength(1);
  });

  test("すべての破壊に、実行される前提検査がある", () => {
    const offenders = destructionsWithoutHandover(readMigrations());

    expect(
      offenders.map(({ migration, target }) => `${migration}: ${target}`),
    ).toEqual([]);
  });

  test("HANDOVERS は実在する対象と手順だけを持つ", () => {
    // 登録が陳腐化して「もう誰も落とさない対象」を守り続けていないこと。
    const destroyed = new Set(
      readMigrations().flatMap(({ sql }) =>
        unassertedDestructiveStatements(sql).flatMap((statement) =>
          destructionTargets(statement),
        ),
      ),
    );

    expect(
      HANDOVERS.map(({ target }) => target).filter(
        (target) => !destroyed.has(target),
      ),
    ).toEqual([]);

    for (const entry of HANDOVERS) {
      // 手順は「実行できるコマンド」で書く。散文に戻さない。
      expect(entry.remedy).toMatch(/\b(?:bun|bunx|psql)\b/u);
      expect(entry.countUnhandedOver).toMatch(/\bAS n\b/u);
    }
  });
});
