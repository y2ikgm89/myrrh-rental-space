/**
 * 列を狭める migration が、**狭めるすべての列**について適用前の確認クエリを
 * 持っていることの gate。
 *
 * ## なぜ要るのか
 *
 * `text → varchar(n)` や `varchar(m) → varchar(n)` は、既存値が n を超えていれば
 * **その migration が落ちる**。このリポジトリでは migration 内でデータを黙って
 * 切り詰めるのを禁じている（連絡先・会計の証跡を壊すため）ので、落ちるのが正しい。
 *
 * ただし落ちるのは**デプロイの最中**で、しかも BEGIN/COMMIT で包んでいると
 * PostgreSQL のエラーは実際の違反ではなく
 * `current transaction is aborted...` になる（`.claude/rules/migrations.md` の実測）。
 * つまり**どの列のどの行が原因か、その場では分からない**。
 *
 * だから狭める migration は「適用前に本番で流す確認クエリ」をヘッダに書く。
 * 問題は、それが**手書きの散文**だったこと。20260805160000 は 45 列を狭めながら
 * 確認クエリは 5 列ぶんしか無く、しかも `inquiries.name` を新しい上限 101 ではなく
 * `> 100` で数えていた（Codex が PR #1947 で指摘）。
 * **「確認しました」と書いてあるのに 11% しか見ていない。**
 *
 * 散文の主張を検査に変える。**狭めた列は 1 本残らず確認クエリに現れる。**
 *
 * ## 契約（migration の書き手が守る形）
 *
 * 狭める列ごとに、コメント行に `<table>.<column>` と `> <新しい上限>` を
 * **同じ行に**書く。実際の確認クエリがその形になる:
 *
 *   -- SELECT 'locations.email' AS col, count(*) FROM locations WHERE length(email) > 254
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: 狭めた列がすべて、正しい上限つきで確認クエリに現れる。
 *
 * **証明しない**: そのクエリを実際に流したかどうか。それは運用側の話。
 */

import { describe, expect, test } from "bun:test";

import { migrationDirs, readMigrationSql } from "../../support/prisma-sources";

/** baseline は空 DB に走るので既存値が無い。狭める概念が存在しない。 */
const BASELINE_DIR = "00000000000000_init";

/**
 * `ALTER TABLE "t" ... ALTER COLUMN "c" SET DATA TYPE VARCHAR(n)` を拾う。
 *
 * Prisma の生成 DDL は 1 つの `ALTER TABLE` に複数の `ALTER COLUMN` をぶら下げる
 * ので、表名は直前の `ALTER TABLE` から引き継ぐ。
 */
interface NarrowedColumn {
  readonly table: string;
  readonly column: string;
  readonly limit: number;
}

function narrowedColumnsIn(sql: string): NarrowedColumn[] {
  const out: NarrowedColumn[] = [];
  let table: string | null = null;

  for (const raw of sql.split(/\r?\n/u)) {
    // コメント行は対象外（確認クエリ自体が ALTER を含みうる）。
    if (/^\s*--/u.test(raw)) continue;

    const alterTable = /ALTER\s+TABLE\s+"([a-z_]+)"/iu.exec(raw);
    if (alterTable?.[1]) table = alterTable[1];

    const alterColumn =
      /ALTER\s+COLUMN\s+"([a-z_]+)"\s+(?:SET\s+DATA\s+)?TYPE\s+VARCHAR\((\d+)\)/iu.exec(
        raw,
      );
    if (!alterColumn?.[1] || !alterColumn[2] || !table) continue;

    out.push({
      table,
      column: alterColumn[1],
      limit: Number(alterColumn[2]),
    });
  }
  return out;
}

/** その列が、正しい上限つきで確認クエリに現れているか。 */
function isCoveredByPreflight(sql: string, target: NarrowedColumn): boolean {
  const qualified = `${target.table}.${target.column}`;
  return sql
    .split(/\r?\n/u)
    .filter((line) => /^\s*--/u.test(line))
    .some(
      (line) =>
        line.includes(qualified) &&
        new RegExp(`>\\s*${target.limit}\\b`, "u").test(line),
    );
}

// ---------------------------------------------------------------------------
// 見本（自己検査用）
//
// 実データの件数に依存する自己検査は、正しい状態変化で落ちる。履歴を 1 本の
// baseline へ畳めば狭める migration は 0 本になるので、「1 本以上ある」を
// 前提にすると畳んだ瞬間に赤くなる。見本で走査と判定の両方向を固定する。
// ---------------------------------------------------------------------------

const SAMPLE_COVERED = [
  "-- 適用前に本番で流す確認クエリ:",
  "--   SELECT 'locations.email' AS col, count(*) FROM locations WHERE length(email) > 254;",
  "",
  'ALTER TABLE "locations" ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);',
].join("\n");

const SAMPLE_MISSING = [
  "-- 確認クエリを書き忘れた migration",
  'ALTER TABLE "locations" ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);',
].join("\n");

/** 20260805160000 が実際に踏んだ形: 上限だけが古い。 */
const SAMPLE_WRONG_LIMIT = [
  "--   SELECT 'inquiries.name' AS col, count(*) FROM inquiries WHERE length(name) > 100;",
  'ALTER TABLE "inquiries" ALTER COLUMN "name" SET DATA TYPE VARCHAR(101);',
].join("\n");

/** 複数列をぶら下げる Prisma の生成形。表名は直前の ALTER TABLE から引き継ぐ。 */
const SAMPLE_MULTI = [
  'ALTER TABLE "customers" ALTER COLUMN "last_name" SET DATA TYPE VARCHAR(50),',
  'ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);',
].join("\n");

describe("列を狭める migration の適用前確認", () => {
  test("走査が空振りしていない（見本での自己検査）", () => {
    // migration を 1 本も読めていない状態で「違反ゼロ」と報告しない。
    expect(migrationDirs().length).toBeGreaterThan(0);

    // 狭める列を拾う / 拾わない
    expect(narrowedColumnsIn(SAMPLE_COVERED)).toEqual([
      { table: "locations", column: "email", limit: 254 },
    ]);
    expect(narrowedColumnsIn('CREATE INDEX "x_y_idx" ON "x" ("y");')).toEqual(
      [],
    );

    // 複数列をぶら下げた形でも表名を取り違えない
    expect(narrowedColumnsIn(SAMPLE_MULTI)).toEqual([
      { table: "customers", column: "last_name", limit: 50 },
      { table: "customers", column: "email", limit: 254 },
    ]);
  });

  test("確認クエリの有無と上限のずれを見分ける（見本での自己検査）", () => {
    const covered = narrowedColumnsIn(SAMPLE_COVERED).map((t) =>
      isCoveredByPreflight(SAMPLE_COVERED, t),
    );
    const missing = narrowedColumnsIn(SAMPLE_MISSING).map((t) =>
      isCoveredByPreflight(SAMPLE_MISSING, t),
    );
    // 上限が古いものは「書いてあるが数えていない」— 通してはいけない。
    const wrongLimit = narrowedColumnsIn(SAMPLE_WRONG_LIMIT).map((t) =>
      isCoveredByPreflight(SAMPLE_WRONG_LIMIT, t),
    );

    expect({ covered, missing, wrongLimit }).toEqual({
      covered: [true],
      missing: [false],
      wrongLimit: [false],
    });
  });

  test("狭めた列がすべて確認クエリに現れる", () => {
    const violations = migrationDirs()
      .filter((dir) => dir !== BASELINE_DIR)
      .flatMap((dir) => {
        const sql = readMigrationSql(dir);
        return narrowedColumnsIn(sql)
          .filter((target) => !isCoveredByPreflight(sql, target))
          .map(
            (target) =>
              `${dir}: ${target.table}.${target.column} を VARCHAR(${target.limit}) へ狭めているのに、` +
              `適用前の確認クエリに「${target.table}.${target.column}」と「> ${target.limit}」を同じ行で書いていない。` +
              `本番に長い値があるとデプロイ中に落ち、しかも原因の列が分からない`,
          );
      });

    expect(violations).toEqual([]);
  });
});
