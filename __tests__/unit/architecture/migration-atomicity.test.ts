import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { splitStatements } from "../../../scripts/migration-preconditions";
import { definite } from "../../support/definite";

/**
 * baseline 以外で 2 文以上を持つ migration は `BEGIN` / `COMMIT` で包むことの gate。
 *
 * ## なぜ要るか
 *
 * **Prisma は PostgreSQL の migration をトランザクションで包まない**（公式:
 * 「By default, Migrate does not wrap migrations in a transaction」。実測でも
 * 失敗した migration の CREATE TABLE が残った）。2 文以上を素で並べると、**どの文でも**
 * 途中で落ちれば前半だけ適用された状態で止まる。`_prisma_migrations` に失敗が記録されて
 * 以降のデプロイが全部ブロックされ、本番 DB の手作業復旧が要る。
 *
 * `BEGIN` / `COMMIT` を自分で書くのは Prisma 公式が案内している opt-in で、
 * 実測でも完全にロールバックされることを確認済み。
 *
 * ## 「既存データに依存する DDL だけ」の分類はやめた
 *
 * 以前は `ADD CONSTRAINT` / `CREATE UNIQUE INDEX` / `ALTER COLUMN ... TYPE` /
 * `SET NOT NULL` を正規表現で分類し、それらを含む場合だけ包むことを要求していた。
 * この分類は「既存行を検証する DDL かどうか」を人間が正規表現で判定するもので、
 * `scripts/migration-preconditions.ts` の前身（プローブ方式）と同じ失敗モードを持つ
 * ——PostgreSQL の意味論を手で書き写す限り、分類漏れが必ず出る。**分類をやめて
 * 「2 文以上なら常に包む」という文数だけで判定できる契約に一本化した。**
 * 文の切り出しは `scripts/migration-preconditions.ts` の `splitStatements`
 * （plpgsql 本体の `$$ … $$` や `E'…'` を壊さない）を共有する。
 *
 * ## 代償（承知のうえ）
 *
 * 包むと、失敗時に Prisma が出すのは実際の違反ではなく
 * 「current transaction is aborted, commands ignored until end of transaction block」
 * になる（実測）。原因の特定は `bun scripts/migration-preconditions.ts` のリハーサルで行う
 * （ヘッダに手書きの確認クエリを書くのは禁止）。
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

/** BEGIN/COMMIT の包み文自体を、他の DDL と混同せず判定する。 */
type StatementKind = "BEGIN" | "COMMIT" | "END" | "OTHER";

function statementKind(statement: string): StatementKind {
  const normalized = statement.replace(/\s+/gu, " ").trim().toUpperCase();
  if (/^(BEGIN|START TRANSACTION)(\s+(WORK|TRANSACTION))?$/u.test(normalized)) {
    return "BEGIN";
  }
  if (/^COMMIT(\s+WORK)?$/u.test(normalized)) return "COMMIT";
  if (/^END(\s+WORK)?$/u.test(normalized)) return "END";
  return "OTHER";
}

/**
 * 契約: 最初の文が `BEGIN`、最後の文が `COMMIT`、その間に
 * `BEGIN` / `COMMIT` / `END` が無い（1 つの包みで完結している）。
 */
export function isWrapped(statements: readonly string[]): boolean {
  if (statements.length < 2) return false;
  if (statementKind(definite(statements[0], "statements[0]")) !== "BEGIN")
    return false;
  if (statementKind(definite(statements.at(-1), "最後の文")) !== "COMMIT") {
    return false;
  }
  return statements.slice(1, -1).every((s) => statementKind(s) === "OTHER");
}

describe("migration の原子性", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    // 収集が黙って 0 件になると offenders も必ず空になり、緑が「違反なし」を
    // 意味しなくなる（local/gate-scan-must-not-be-silently-empty が強制）。
    expect(migrationDirs().length).toBeGreaterThan(0);
  });

  test("免除は baseline だけ（空の DB に走るので既存行が無い）", () => {
    // 免除を「古い migration」へ広げないための固定。baseline 以外に免除は無い。
    const dirs = migrationDirs();

    expect(dirs).toContain(BASELINE_DIR);
    expect(dirs.filter((dir) => dir < BASELINE_DIR)).toEqual([]);
  });

  test("BEGIN/COMMIT の判定が見本で正しく動く（自己検査）", () => {
    expect(isWrapped(["BEGIN", 'CREATE TABLE "t" ("id" text)', "COMMIT"])).toBe(
      true,
    );
    // 包んでいない 2 文以上
    expect(
      isWrapped([
        'CREATE TABLE "t" ("id" text)',
        'CREATE INDEX "i" ON "t"("id")',
      ]),
    ).toBe(false);
    // BEGIN はあるが COMMIT が無い
    expect(isWrapped(["BEGIN", 'CREATE TABLE "t" ("id" text)'])).toBe(false);
    // 間に余計な BEGIN/COMMIT/END を挟んだ二重包み
    expect(
      isWrapped([
        "BEGIN",
        'CREATE TABLE "t" ("id" text)',
        "COMMIT",
        "BEGIN",
        'CREATE INDEX "i" ON "t"("id")',
        "COMMIT",
      ]),
    ).toBe(false);
    // 1 文だけは包む対象外（途中で止まりようがない）
    expect(isWrapped(['CREATE TABLE "t" ("id" text)'])).toBe(false);
  });

  test("baseline 以外の、2 文以上を持つ migration は BEGIN/COMMIT で包む", () => {
    const offenders: string[] = [];

    for (const dir of migrationDirs()) {
      if (dir === BASELINE_DIR) continue;
      const sql = readMigration(dir);
      if (sql === null) continue;
      const statements = splitStatements(sql);
      // 1 文だけなら途中で止まりようがない
      if (statements.length < 2) continue;
      if (isWrapped(statements)) continue;
      offenders.push(dir);
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? "2 文以上を持つ migration は BEGIN; … COMMIT; で包む。包まないと、どの文でも本番データ次第で部分適用のまま止まり、以降のデプロイが全部ブロックされる（『既存データに依存する DDL かどうか』の人力分類は分類漏れが必ず出るのでやめた）"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
