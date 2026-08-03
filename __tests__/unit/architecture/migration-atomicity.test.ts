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
 * この規約を決めたのが 20260803130000 なので、**それ以降の migration だけ**を見る。
 * 既存 migration は絶対規約 #7 で編集禁止なので直せない。allowlist ではなく日付境界に
 * したのは、allowlist だと「古いから」という理由で新しい entry が足されて増え続けるため。
 * 境界は事実（規約の採用時点）なので動かない。
 *
 * `CREATE INDEX CONCURRENTLY` はトランザクション内で使えないので、将来使うなら
 * その migration は分離すること（本 repo は squawk の
 * `require-concurrent-index-creation` を除外しており現状ゼロ）。
 */

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/**
 * この規約を採用した時点。**これ以降に追加される migration** が検査対象。
 *
 * 20260803120000 と 20260803130000 は、この規約を書く前に merge されてしまった
 * （両方とも複数表への ADD CONSTRAINT を素で並べている）。絶対規約 #7 で編集できないので
 * 境界の外に置き、代わりに**適用前の確認クエリ**を下の PRE_DEPLOY_CHECKS に残す。
 */
const RULE_ADOPTED_AT = "20260803140000";

/**
 * 境界より前に merge された、包まれていないデータ依存 migration。
 * デプロイ前に本番で違反行 0 件を確認する必要がある。
 *
 * **この一覧は増やさない。** 境界以降は gate が機械的に止めるので、ここへ足す状況は
 * 「gate を迂回した」以外にありえない。
 */
const PRE_DEPLOY_CHECKS: ReadonlyMap<string, string> = new Map([
  [
    "20260803120000_jsonb_array_shape_checks",
    "7 列すべてで jsonb_typeof(col) = 'array' 以外の行が 0 件であること",
  ],
  [
    "20260803130000_settings_connection_status_check",
    "6 列すべてで NULL / 'connected' / 'error' 以外の行が 0 件であること",
  ],
]);

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
  test("境界より前の未包装 migration は把握されている", () => {
    // 境界を切った以上、その手前に残る未包装 migration は「知らないもの」に
    // なってはいけない。列挙と実体が一致することを固定する。
    const unwrappedBefore = migrationDirs().filter((dir) => {
      if (dir >= RULE_ADOPTED_AT) return false;
      const sql = readMigration(dir);
      if (sql === null) return false;
      return (
        DATA_DEPENDENT_DDL.test(sql) &&
        statementCount(sql) >= 2 &&
        !isWrapped(sql) &&
        // 境界直前の 2 本だけを対象にする（それ以前は規約以前の歴史なので触れない）
        dir >= "20260803120000"
      );
    });

    expect(unwrappedBefore).toEqual([...PRE_DEPLOY_CHECKS.keys()]);
  });

  test("データ依存 DDL を複数文持つ新規 migration は BEGIN/COMMIT で包む", () => {
    const offenders: string[] = [];

    for (const dir of migrationDirs()) {
      if (dir < RULE_ADOPTED_AT) continue;
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
