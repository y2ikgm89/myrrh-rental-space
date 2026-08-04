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
 *   20260804085847_enum_naming_conventions は `ALTER TYPE ... RENAME VALUE` だけを
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

const SQUAWK_IGNORE = /^\s*--\s*squawk-ignore(?:-file)?\s+(\S+)/gmu;

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

describe("squawk を免除した migration", () => {
  test("走査が空振りしていない", () => {
    // migration が 1 本も読めていない状態で「違反ゼロ」と報告しない。
    expect(migrationDirs().length).toBeGreaterThan(1);
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

  test("免除していない migration まで巻き込んで検査していない", () => {
    // 全 migration が免除扱いになっていたら、上の test は「全部 breaking」を
    // 要求するだけの別物になる。実際に免除されているのは一部であることを固定する。
    expect(exempted.length).toBeGreaterThan(0);
    expect(exempted.length).toBeLessThan(migrationDirs().length);
  });
});
