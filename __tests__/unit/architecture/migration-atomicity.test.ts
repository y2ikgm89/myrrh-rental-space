import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * 既存データに依存して失敗しうる DDL を複数文含む migration は `BEGIN` / `COMMIT` で
 * 包むことの gate。
 *
 * ## なぜ要るか
 *
 * **Prisma は PostgreSQL の migration をトランザクションで包まない**（公式:
 * 「By default, Migrate does not wrap migrations in a transaction」。実測でも
 * 失敗した migration の CREATE TABLE が残った）。ADD CONSTRAINT / CREATE UNIQUE INDEX /
 * ALTER COLUMN TYPE / SET NOT NULL は既存行を検証するので、**本番のデータ次第で
 * 途中の文が落ちる**。素で並べると前半だけ適用された状態で止まり、
 * `_prisma_migrations` に失敗が記録されて以降のデプロイが全部ブロックされ、
 * 本番 DB の手作業復旧が要る。
 *
 * `BEGIN` / `COMMIT` を自分で書くのは Prisma 公式が案内している opt-in で、
 * 実測でも完全にロールバックされることを確認済み。
 *
 * ## 代償（承知のうえ）
 *
 * 包むと、失敗時に Prisma が出すのは実際の違反ではなく
 * 「current transaction is aborted, commands ignored until end of transaction block」
 * になる（実測）。原因は migration ヘッダに書いた事前確認クエリを本番で流して調べる。
 * 「部分適用を残さない」方が「エラーメッセージが親切」より価値が高いという判断。
 *
 * ## 適用範囲
 *
 * baseline (`00000000000000_init`) 以外のすべての migration を見る。baseline を免除するのは
 * **空の DB に対して走るので既存行が無い**から（「古いから」ではない）。日付境界や
 * allowlist は置かない — 置くと「古いから」を理由に entry が増え続ける。
 *
 * `CREATE INDEX CONCURRENTLY` はトランザクション内で使えないので、将来使うなら
 * その migration は分離すること（本 repo は squawk の
 * `require-concurrent-index-creation` を除外しており現状ゼロ）。
 */

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/**
 * baseline migration。**唯一の免除対象**。
 *
 * baseline は必ず**空の DB** に対して走る。既存行が無いので、CHECK / UNIQUE の追加が
 * データ違反で落ちることが原理的に起こらない。包む必要が無いのはそのため
 * （「古いから」ではなく「対象データが存在しないから」の免除）。
 *
 * 中身は `scripts/build-baseline-migration.ts` が生成するので手編集もされない。
 */
const BASELINE_DIR = "00000000000000_init";

/** 既存行を検証するため、本番のデータ次第で失敗しうる DDL。 */
const DATA_DEPENDENT_DDL =
  /(ADD\s+CONSTRAINT[\s\S]*?(CHECK|UNIQUE|FOREIGN\s+KEY)|CREATE\s+UNIQUE\s+INDEX|ALTER\s+COLUMN\s+[\s\S]*?(TYPE|SET\s+NOT\s+NULL))/iu;

function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      try {
        return statSync(join(MIGRATIONS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function readMigration(dir: string): string | null {
  try {
    return readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
  } catch {
    return null;
  }
}

/** `--` 行コメントを落として `;` で分割した文の数。 */
function statementCount(sql: string): number {
  return sql
    .replace(/--.*$/gmu, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function isWrapped(sql: string): boolean {
  const withoutComments = sql.replace(/--.*$/gmu, "");
  return (
    /^\s*BEGIN\s*;/imu.test(withoutComments) &&
    /^\s*COMMIT\s*;/imu.test(withoutComments)
  );
}

describe("migration の原子性", () => {
  test("免除は baseline だけ（空の DB に走るので既存行が無い）", () => {
    // 免除を「古い migration」へ広げないための固定。baseline 以外に免除は無い。
    const dirs = migrationDirs();

    expect(dirs).toContain(BASELINE_DIR);
    expect(dirs.filter((dir) => dir < BASELINE_DIR)).toEqual([]);
  });

  test("データ依存 DDL を複数文持つ migration は BEGIN/COMMIT で包む", () => {
    const offenders: string[] = [];

    for (const dir of migrationDirs()) {
      if (dir === BASELINE_DIR) continue;
      const sql = readMigration(dir);
      if (sql === null) continue;
      if (!DATA_DEPENDENT_DDL.test(sql)) continue;
      // 1 文だけなら途中で止まりようがない
      if (statementCount(sql) < 2) continue;
      if (isWrapped(sql)) continue;
      offenders.push(dir);
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? "既存行を検証する DDL（ADD CONSTRAINT / CREATE UNIQUE INDEX / ALTER COLUMN TYPE / SET NOT NULL）を複数文含む migration は BEGIN; … COMMIT; で包む。包まないと本番データ次第で部分適用のまま止まり、以降のデプロイが全部ブロックされる"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
