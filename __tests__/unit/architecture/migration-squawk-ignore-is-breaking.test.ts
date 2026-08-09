/**
 * squawk を免除した migration が、**本当に計画ダウンタイム付きでデプロイされる**ことを
 * 機械強制する。
 *
 * ## なぜ要るのか
 *
 * `-- squawk-ignore-file <rule>` は Cloud Run のローリング切替窓で旧 revision が
 * 壊れたスキーマを叩く事故（Risk 1）を検出する linter を、そのファイルだけ黙らせる。
 * 黙らせてよいのは **その窓が別の仕組みで塞がれているとき**だけで、この repo では
 * 「deploy-production.yml が破壊的 DDL を検出して両サービスを scaling=0 で止める」
 * のがその仕組み。
 *
 * ところが**その対応関係は今まで散文でしか書かれていなかった**。migration の冒頭に
 * 「3 条件を満たす」と書けば通る＝**書けば通る**状態で、実際に条件 2
 * （破壊的 DDL grep に合致する）が成立していない migration が 1 本すり抜けた:
 *
 *   enum の値名を揃える migration は `ALTER TYPE ... RENAME VALUE` だけを
 *   含む。当時の grep は `ALTER TABLE ...` と `DROP TABLE|DROP TYPE` しか見ていない
 *   ので**ダウンタイム無しでデプロイされる**。旧 revision は生成済み client が持つ
 *   旧値 `'none'` を送り続け、`invalid input value for enum` で落ちる。
 *
 * 散文の主張を検査に変える。**squawk を免除するなら、その SQL は必ず
 * deploy-production.yml の破壊的 DDL 判定に引っかかる**。
 *
 * ## この gate が主張しないこと
 *
 * `.squawk.toml` が挙げる残り 2 条件（単一インスタンスの atomic switch / アプリ側の
 * 型が更新済み）は静的には確かめられない。**確かめられないものを「確かめた」と
 * 書かない**ため、ここでは条件 2 だけを検査する。
 */

import { describe, expect, test } from "bun:test";

import { loadBreakingMigrationDetector } from "../../support/breaking-migration-pattern";
import { migrationDirs, readMigrationSql } from "../../support/prisma-sources";

/**
 * baseline はまっさらな空の DB に走る最初の 1 本。旧 revision も既存行も無いので
 * Risk 1 の窓が原理的に存在せず、ダウンタイムを要求する意味が無い。
 * （`scripts/lint-migrations.ts` の `isBaseline` と同じ理由付け）
 */
const BASELINE_DIR = "00000000000000_init";

/**
 * 免除の検出。**文単位（`-- squawk-ignore`）とファイル単位（`-- squawk-ignore-file`）の
 * 両方を拾う。** 片方しか見ないと、見ていない形の免除が下の破壊的 DDL 判定を
 * すり抜けて計画ダウンタイム無しでデプロイされる。
 */
const SQUAWK_IGNORE = /^\s*--\s*squawk-ignore(?:-file)?\s+(\S+)/gmu;

/** 文単位の免除（`-file` が付かない形）。この repo では禁止。 */
const STATEMENT_SCOPED_IGNORE = /^\s*--\s*squawk-ignore(?!-file)\s+\S+/gmu;

const detector = loadBreakingMigrationDetector();

type Exempted = {
  readonly dir: string;
  readonly rules: readonly string[];
  readonly sql: string;
};

const exempted: Exempted[] = migrationDirs()
  .filter((dir) => dir !== BASELINE_DIR)
  .map((dir) => {
    const sql = readMigrationSql(dir);
    const rules = [...sql.matchAll(SQUAWK_IGNORE)]
      .map((m) => m[1])
      .filter((rule): rule is string => rule !== undefined);
    return { dir, rules, sql };
  })
  .filter((entry) => entry.rules.length > 0);

/**
 * 走査と判定が生きていることを、**実データではなく見本で**確かめるための SQL。
 *
 * 履歴を 1 本の baseline へ畳むと免除つき migration は 0 本になる。以前の
 * 自己検査は「免除が 1 本以上ある」ことを要求しており、畳んだ瞬間に落ちた。
 * **実データの件数に依存する自己検査は、正しい状態でも落ちる。**
 *
 * ここでは「見本を食わせて期待どおりに分類できるか」を見る。0 本でも成立し、
 * 走査や判定が壊れれば落ちる。
 */
const SAMPLE_EXEMPTED_BREAKING = [
  "-- squawk-ignore-file changing-column-type",
  'ALTER TABLE "x" ALTER COLUMN "y" TYPE uuid;',
].join("\n");
const SAMPLE_EXEMPTED_NON_BREAKING = [
  "-- squawk-ignore-file prefer-robust-stmts",
  'CREATE INDEX "x_y_idx" ON "x" ("y");',
].join("\n");
const SAMPLE_PLAIN = 'CREATE INDEX "x_y_idx" ON "x" ("y");';

function rulesIn(sql: string): string[] {
  return [...sql.matchAll(SQUAWK_IGNORE)]
    .map((m) => m[1])
    .filter((rule): rule is string => rule !== undefined);
}

describe("squawk を免除した migration", () => {
  test("走査が空振りしていない（見本での自己検査）", () => {
    // migration を 1 本も読めていない状態で「違反ゼロ」と報告しない。
    expect(migrationDirs().length).toBeGreaterThan(0);

    // 免除の検出: 書いてあれば拾い、書いていなければ拾わない。
    expect(rulesIn(SAMPLE_EXEMPTED_BREAKING)).toEqual(["changing-column-type"]);
    expect(rulesIn(SAMPLE_PLAIN)).toEqual([]);

    // 破壊的判定: 合致する SQL と、しない SQL を取り違えない。
    expect(detector.detects(SAMPLE_EXEMPTED_BREAKING)).toBe(true);
    expect(detector.detects(SAMPLE_EXEMPTED_NON_BREAKING)).toBe(false);
  });

  test("免除していて破壊的でない migration を見逃さない（見本での自己検査）", () => {
    // 実データが 0 件でも、判定そのものが機能していることを固定する。
    // 以前はここを「免除が 1 本以上ある」で代用しており、畳むと落ちた。
    const wouldViolate = [SAMPLE_EXEMPTED_NON_BREAKING]
      .filter((sql) => rulesIn(sql).length > 0)
      .filter((sql) => !detector.detects(sql));

    expect(wouldViolate).toEqual([SAMPLE_EXEMPTED_NON_BREAKING]);
  });

  test("破壊的 DDL 判定に必ず引っかかる（＝計画ダウンタイムが付く）", () => {
    const violations = exempted
      .filter((entry) => !detector.detects(entry.sql))
      .map(
        (entry) =>
          `${entry.dir}: squawk-ignore [${entry.rules.join(", ")}] を書いているのに ` +
          `deploy-production.yml の破壊的 DDL 判定に一致しない。` +
          `ダウンタイム無しでデプロイされ、旧 revision が壊れたスキーマを叩く`,
      );
    expect(violations).toEqual([]);
  });

  test("免除はファイル単位の形だけ（文単位は使わない）", () => {
    // ルート指示の契約は `-- squawk-ignore-file <rule>` **だけ**。散文がそう
    // 言っているのに gate が両形を通していたので、詳細ルール側には
    // 「免除は 2 形」と書かれていた——**強制されない規約が 2 つに割れていた**。
    //
    // ファイル単位に寄せる理由は可視性。SQL の冒頭に出るので、レビューで
    // 「この migration は意図的に破壊的だ」が最初に目に入る。文単位は本文中に
    // 紛れる。安全性の差ではないので、**どちらかに決めて強制する**ことが要点。
    //
    // 検出（`SQUAWK_IGNORE`）は両形のままにしてある。文単位を検出から外すと、
    // 書かれたときに下の破壊的 DDL 判定をすり抜けてしまう。
    const offenders = migrationDirs()
      .filter((dir) => dir !== BASELINE_DIR)
      .filter(
        (dir) =>
          [...readMigrationSql(dir).matchAll(STATEMENT_SCOPED_IGNORE)].length >
          0,
      );

    expect(offenders).toEqual([]);
  });

  test("文単位の形を実際に検出できる（見本での自己検査）", () => {
    const statementScoped = `-- squawk-ignore ban-drop-column
ALTER TABLE "t" DROP COLUMN "c";`;
    const fileScoped = `-- squawk-ignore-file ban-drop-column
ALTER TABLE "t" DROP COLUMN "c";`;

    expect([...statementScoped.matchAll(STATEMENT_SCOPED_IGNORE)]).toHaveLength(
      1,
    );
    expect([...fileScoped.matchAll(STATEMENT_SCOPED_IGNORE)]).toHaveLength(0);
    // 検出側はどちらも拾う（すり抜けさせない）
    expect([...statementScoped.matchAll(SQUAWK_IGNORE)]).toHaveLength(1);
    expect([...fileScoped.matchAll(SQUAWK_IGNORE)]).toHaveLength(1);
  });

  test("baseline を免除の対象に数えない", () => {
    // baseline は空 DB に走る最初の 1 本で Risk 1 の窓が原理的に無い。
    // ここに混ざると「全部 breaking であれ」という別の要求に化ける。
    expect(exempted.map((entry) => entry.dir)).not.toContain(BASELINE_DIR);
  });
});
