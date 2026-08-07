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
 * 判定は `planMigration` ただ 1 つで、**この gate もデプロイ経路もそれを呼ぶ**。
 * 破壊が許されるのは次のいずれかで、どれでもなければ `refusals` に出る。
 *
 * 1. 同じ migration の中で**確実に**作った表・列を消す（失うものが無い）。
 *    `IF NOT EXISTS` 付き・public 以外の schema は「作った」に数えない
 * 2. 先行する `DO $$ … RAISE EXCEPTION … $$` が**表名と列名の両方**を名指ししている
 * 3. `HANDOVERS` に対象の登録がある（リハーサル中に SQL を流して 0 を確かめる）
 *
 * ## 分けて書かない理由
 *
 * 前身は静的 gate（`destructionsWithoutHandover`）とデプロイ経路
 * （`pendingHandoverGaps`）が別々に判定していた。多角監査で
 * `ALTER TABLE public.locations DROP COLUMN "special_holidays"` が
 * **両方の関門から同時に消える**ことが実測で出た（対象が読めず、対象ループが
 * 1 周も回らない）。判定を 1 つにすれば、この種の乖離は構造的に起こらない
 * （`.claude/rules/testing-unit.md` の 4 点目）。
 *
 * ## この gate が見ないもの
 *
 * - 検査や `countUnhandedOver` の**中身**。対象を名指ししつつ何も確かめない
 *   検査を書けば通る。`HANDOVERS` のぶんは実 DB で答えが状態に応じて変わることを
 *   `__tests__/integration/prisma/migration-handovers.test.ts` が固定する
 * - `WHERE` 付きの `DELETE` / `UPDATE` による値の消失（条件が失うものを決める）
 * - `ALTER COLUMN … TYPE … USING <式>` による切り捨て
 */

import { describe, expect, test } from "bun:test";
import {
  destructionTargets,
  HANDOVERS,
  isDestructiveStatement,
  planMigration,
  readMigrations,
  stripNoise,
} from "../../../scripts/migration-preconditions";

/** その migration が拒否される理由（引き継ぎ関係のみ）。 */
function handoverRefusals(sql: string, handovers = HANDOVERS): string[] {
  return planMigration(sql, handovers)
    .refusals.filter((refusal) => refusal.kind === "handover")
    .map((refusal) => refusal.reason);
}

const NO_HANDOVERS: typeof HANDOVERS = [];

describe("破壊的 migration は実行される前提検査を伴う", () => {
  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(readMigrations().length).toBeGreaterThan(0);
  });

  test("1. 素の破壊形を落とす", () => {
    for (const sql of [
      `ALTER TABLE "locations" DROP COLUMN "special_holidays";`,
      `TRUNCATE TABLE "audit_logs";`,
      `DROP TABLE "legacy_holidays";`,
      // WHERE の無い DELETE は表を空にする。
      `DELETE FROM "locations";`,
      // DROP SCHEMA は対象を読み取れないので「読めない」で落ちる。
      `DROP SCHEMA "public" CASCADE;`,
    ]) {
      expect(handoverRefusals(sql, NO_HANDOVERS), sql).toHaveLength(1);
    }
  });

  test("1. 対象を取り違える／見落とす形を落とす（監査で実測された穴）", () => {
    // schema 修飾。前身は「破壊的」と判定しながら対象が空になり、静的 gate も
    // デプロイ経路も同時に素通しした。
    expect(
      destructionTargets(
        `ALTER TABLE public.locations DROP COLUMN "special_holidays"`,
      ),
    ).toEqual(["locations.special_holidays"]);
    expect(
      destructionTargets(
        `ALTER TABLE "public"."locations" DROP COLUMN "special_holidays"`,
      ),
    ).toEqual(["locations.special_holidays"]);

    // IF EXISTS / ONLY を表名と読まない。
    expect(
      destructionTargets(
        `ALTER TABLE IF EXISTS "locations" DROP COLUMN "memo"`,
      ),
    ).toEqual(["locations.memo"]);
    expect(destructionTargets(`TRUNCATE ONLY "audit_logs"`)).toEqual([
      "audit_logs",
    ]);

    // 複数対象。前身は先頭 1 つしか見ていなかった。
    expect(
      destructionTargets(`TRUNCATE "audit_logs", "terms_agreements"`),
    ).toEqual(["audit_logs", "terms_agreements"]);
    expect(destructionTargets(`DROP TABLE "legacy_a", "legacy_b"`)).toEqual([
      "legacy_a",
      "legacy_b",
    ]);
    expect(
      destructionTargets(
        `ALTER TABLE "locations" DROP CONSTRAINT "c", DROP COLUMN IF EXISTS "a", DROP COLUMN "b"`,
      ),
    ).toEqual(["locations.a", "locations.b"]);

    // `COLUMN` は省略できる。
    expect(destructionTargets(`ALTER TABLE "locations" DROP "memo"`)).toEqual([
      "locations.memo",
    ]);

    // 裸の識別子は PostgreSQL が小文字へ畳む。
    expect(
      destructionTargets(`ALTER TABLE Locations DROP COLUMN Memo`),
    ).toEqual(["locations.memo"]);

    // 引用識別子は [A-Za-z_] に収まらなくてよい。
    expect(
      destructionTargets(`ALTER TABLE "locations" DROP COLUMN "特別休業日"`),
    ).toEqual(["locations.特別休業日"]);
    expect(
      destructionTargets(`ALTER TABLE "locations" DROP COLUMN "2fa_secret"`),
    ).toEqual(["locations.2fa_secret"]);

    // public 以外の schema は読めない扱い（存在確認が public しか見ていない）。
    expect(
      destructionTargets(`ALTER TABLE other.locations DROP COLUMN "memo"`),
    ).toEqual([]);

    // どれも「破壊的」と判定されること自体は変わらない。
    for (const sql of [
      `ALTER TABLE public.locations DROP COLUMN "special_holidays"`,
      `ALTER TABLE other.locations DROP COLUMN "memo"`,
      `TRUNCATE ONLY "audit_logs"`,
      `ALTER TABLE "locations" DROP "memo"`,
    ]) {
      expect(isDestructiveStatement(sql), sql).toBe(true);
    }
  });

  test("1. DO ブロックの中に隠した破壊も落とす", () => {
    const hidden = `DO $$ BEGIN ALTER TABLE "locations" DROP COLUMN "memo"; END $$;`;
    expect(isDestructiveStatement(hidden)).toBe(true);
    // 中は plpgsql なので対象を読み切れない。読めないものは拒否に倒す。
    expect(destructionTargets(hidden)).toEqual([]);
    expect(handoverRefusals(hidden, NO_HANDOVERS)).toHaveLength(1);

    // **動的 SQL は中身が文字列なので stripNoise が潰す。** 潰した結果
    // 「何も破壊しない DO ブロック」に見えるので、EXECUTE があれば読めない扱い。
    const dynamic = `DO $$ BEGIN EXECUTE 'TRUNCATE audit_logs'; END $$;`;
    expect(isDestructiveStatement(dynamic)).toBe(true);
    expect(destructionTargets(dynamic)).toEqual([]);
    expect(handoverRefusals(dynamic, NO_HANDOVERS)).toHaveLength(1);

    // 破壊を含まない DO ブロックは通る（EXECUTE も破壊語も無い）。
    expect(
      handoverRefusals(`DO $$ BEGIN PERFORM 1; END $$;`, NO_HANDOVERS),
    ).toEqual([]);
  });

  test("2. 検査は対象を名指ししていなければ効かない", () => {
    // 前に置かれ、対象を名指ししていれば通る。
    const guarded = `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM locations WHERE special_holidays IS NOT NULL) THEN
    RAISE EXCEPTION '未移送';
  END IF;
END $$;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
COMMIT;`;
    expect(handoverRefusals(guarded, NO_HANDOVERS)).toEqual([]);

    // **無関係な表の検査では免除されない。** 前身は「検査が 1 つあれば以降すべて
    // 免除」で、同じ migration の別の表の破壊まで通していた。
    const unrelated = `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM events WHERE 1 = 0) THEN
    RAISE EXCEPTION '別の話';
  END IF;
END $$;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
COMMIT;`;
    expect(handoverRefusals(unrelated, NO_HANDOVERS)).toHaveLength(1);

    // **別の表の同名列を見た検査では免除されない。** 列名だけで照合していた頃は、
    // `events.memo` を見た検査が `locations.memo` の DROP を通していた。
    const sameColumnOtherTable = `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM events WHERE memo IS NOT NULL) THEN
    RAISE EXCEPTION 'events.memo が残っている';
  END IF;
END $$;
ALTER TABLE "locations" DROP COLUMN "memo";
COMMIT;`;
    expect(handoverRefusals(sameColumnOtherTable, NO_HANDOVERS)).toHaveLength(
      1,
    );

    // 検査が**後**なら守っていない（消える列は後からは参照できない）。
    const tooLate = `BEGIN;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
DO $$ BEGIN RAISE EXCEPTION 'special_holidays が手遅れ'; END $$;
COMMIT;`;
    expect(handoverRefusals(tooLate, NO_HANDOVERS)).toHaveLength(1);

    // **関数の定義は検査ではない。** RAISE EXCEPTION を含んでいても、
    // その migration の中では 1 度も評価されない。
    const definesOnly = `CREATE FUNCTION guard() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'special_holidays';
END;
$function$;
ALTER TABLE "locations" DROP COLUMN "special_holidays";`;
    expect(handoverRefusals(definesOnly, NO_HANDOVERS)).toHaveLength(1);

    // **コメントの中の RAISE EXCEPTION は検査ではない。**
    const commentedOut = `BEGIN;
DO $$
BEGIN
  -- RAISE EXCEPTION 'special_holidays の移送確認をあとで書く';
  PERFORM 1;
END $$;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
COMMIT;`;
    expect(handoverRefusals(commentedOut, NO_HANDOVERS)).toHaveLength(1);
  });

  test("3. 正当な形は通る", () => {
    // TRUNCATE を**禁じる** trigger の定義は破壊ではない。
    expect(
      handoverRefusals(
        `CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
           FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();`,
        NO_HANDOVERS,
      ),
    ).toEqual([]);

    // DROP CONSTRAINT / DROP DEFAULT / DROP NOT NULL は行も値も消さない。
    expect(
      handoverRefusals(
        `ALTER TABLE "locations" DROP CONSTRAINT "locations_special_holidays_array_check";
ALTER TABLE "locations" ALTER COLUMN "memo" DROP DEFAULT;
ALTER TABLE "locations" ALTER COLUMN "memo" DROP NOT NULL;`,
        NO_HANDOVERS,
      ),
    ).toEqual([]);

    // **文字列リテラルの中の DROP COLUMN は破壊ではない。** 追加しかしない
    // migration が恒久的に止まると、編集できないので復旧できない。
    expect(
      handoverRefusals(
        `ALTER TABLE "spaces" ADD COLUMN "note" text DEFAULT 'do not DROP COLUMN hourly_price';`,
        NO_HANDOVERS,
      ),
    ).toEqual([]);

    // 条件付きの DELETE は対象外（条件が失うものを決めるので著者の領分）。
    expect(
      handoverRefusals(
        `DELETE FROM "locations" WHERE "is_active" = false;`,
        NO_HANDOVERS,
      ),
    ).toEqual([]);

    // 同じ migration の中で作った表・列は、消しても失うものが無い。
    expect(
      handoverRefusals(
        `CREATE TABLE "tmp_move" ("id" uuid);
DROP TABLE "tmp_move";`,
        NO_HANDOVERS,
      ),
    ).toEqual([]);
    expect(
      handoverRefusals(
        `ALTER TABLE "locations" ADD COLUMN "tmp" text;
ALTER TABLE "locations" DROP COLUMN "tmp";`,
        NO_HANDOVERS,
      ),
    ).toEqual([]);
    // ただし `IF NOT EXISTS` は既存を温存するので「作った」とは言えない。
    expect(
      handoverRefusals(
        `CREATE TABLE IF NOT EXISTS "tmp_move" ("id" uuid);
DROP TABLE "tmp_move";`,
        NO_HANDOVERS,
      ),
    ).toHaveLength(1);
    expect(
      handoverRefusals(
        `ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "memo" text;
ALTER TABLE "locations" DROP COLUMN "memo";`,
        NO_HANDOVERS,
      ),
    ).toHaveLength(1);
    // `IF NOT EXISTS` は**アクションごと**に付く。同じ文の別アクションに
    // 付いた 1 つが、他の列まで免除しない。
    expect(
      handoverRefusals(
        `ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "a" text, ADD COLUMN "b" text;
ALTER TABLE "locations" DROP COLUMN "a", DROP COLUMN "b";`,
        NO_HANDOVERS,
      ),
    ).toHaveLength(1);

    // **別 schema に作った表は、public の同名表の免除にならない。**
    expect(
      handoverRefusals(
        `CREATE TABLE archive.audit_logs ("id" uuid);
DROP TABLE public.audit_logs;`,
        NO_HANDOVERS,
      ),
    ).toHaveLength(1);
  });

  test("HANDOVERS の登録は対象が一致したときだけ効く（fixture）", () => {
    const sql = `ALTER TABLE "locations" DROP COLUMN "memo";`;

    expect(
      handoverRefusals(sql, [
        {
          target: "locations.memo",
          what: "メモが消える",
          countUnhandedOver: "SELECT 0 AS n",
          remedy: "bun scripts/x.ts",
        },
      ]),
    ).toEqual([]);

    expect(
      handoverRefusals(sql, [
        {
          target: "locations.other",
          what: "別物",
          countUnhandedOver: "SELECT 0 AS n",
          remedy: "bun scripts/x.ts",
        },
      ]),
    ).toHaveLength(1);

    // 登録が当たった文には、リハーサルで流す SQL が付く。
    const planned = planMigration(sql, [
      {
        target: "locations.memo",
        what: "メモが消える",
        countUnhandedOver: "SELECT 0 AS n",
        remedy: "bun scripts/x.ts",
      },
    ]);
    expect(planned.steps.map((step) => step.handovers.length)).toEqual([1]);
  });

  test("stripNoise はコメント・文字列だけを潰し、識別子を残す", () => {
    expect(stripNoise(`SELECT 'a -- b' FROM "t--u"`)).toBe(
      `SELECT '' FROM "t--u"`,
    );
    expect(stripNoise(`SELECT 1 /* /* 入れ子 */ まだコメント */ , 2`)).toBe(
      "SELECT 1   , 2",
    );
    expect(stripNoise(`SELECT E'\\'' , 'x'`)).toBe("SELECT E'' , ''");
    // ドル引用符の中身は残す（中の DDL を見る）が、中のコメントは潰す。
    expect(stripNoise(`DO $$ BEGIN -- x\n TRUNCATE t; END $$`)).toBe(
      "DO $$ BEGIN  \n TRUNCATE t; END $$",
    );
  });

  test("実在するすべての migration で、破壊に引き継ぎの確認がある", () => {
    const offenders = readMigrations().flatMap(({ name, sql }) =>
      planMigration(sql)
        .refusals.filter((refusal) => refusal.kind === "handover")
        .map((refusal) => `${name}: ${refusal.reason}`),
    );

    expect(offenders).toEqual([]);
  });

  test("HANDOVERS は実在する対象と手順だけを持つ", () => {
    // 登録が陳腐化して「もう誰も落とさない対象」を守り続けていないこと。
    const destroyed = new Set(
      readMigrations().flatMap(({ sql }) =>
        planMigration(sql).steps.flatMap((step) =>
          step.handovers.map((handover) => handover.target),
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
