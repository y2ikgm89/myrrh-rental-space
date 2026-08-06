/**
 * migration ヘッダに「適用前確認」の手書き SELECT を置かない gate。
 *
 * ## なぜ要るか
 *
 * 包んだ migration が失敗すると Prisma の表示は
 * `current transaction is aborted` だけになる。以前はヘッダに確認 SELECT を書いて
 * 運用者が手で流す運用だったが、`20260805180000` のヘッダは 23 本の制約のうち
 * 3 本しか見ておらず、JSON null が残った DB で「0 件」と出たうえで migration が
 * 落ちた。**人が書く一覧は覆うべき集合から必ず離れる。**
 *
 * 適用前の既存行チェックは `scripts/migration-preconditions.ts` のリハーサルが担う
 * （未適用 DDL を実際に流して必ず巻き戻す）。ヘッダのコメントは誰も実行しない。
 *
 * ## 適用範囲
 *
 * - **origin/main に既にある migration** は pre-commit が編集をブロックする不変物。
 *   `git ls-tree origin/main -- prisma/migrations` に載る `migration.sql` は除外する
 *   （日付やディレクトリ名の allowlist は置かない）。
 * - **main にまだ無い新規 migration** だけを走査し、ヘッダコメント内の
 *   「適用前確認 SELECT」パターンがあれば fail する。
 *
 * ヘッダ = 最初の非コメント SQL 行の手前まで（`BEGIN;` より前）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

/** origin/main 上の `prisma/migrations/…/migration.sql` パス（repo 相対）。 */
function mainBranchMigrationSqlPaths(): Set<string> {
  const stdout = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", "origin/main", "--", "prisma/migrations"],
    { cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  return new Set(
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("/migration.sql")),
  );
}

function localMigrationSqlPaths(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      try {
        return statSync(join(MIGRATIONS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((dir) => `prisma/migrations/${dir}/migration.sql`);
}

/**
 * 最初の非コメント行の手前までをヘッダとして返す。
 * migration は `--` 行コメントが主で、ブロックコメントは現状ほぼ無い。
 */
export function extractHeaderCommentText(sql: string): string {
  const headerLines: string[] = [];

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      headerLines.push(line);
      continue;
    }
    if (trimmed.startsWith("--")) {
      headerLines.push(line);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      headerLines.push(line);
      if (!trimmed.includes("*/")) {
        // 閉じるまでヘッダに含める（baseline 等で稀）
        continue;
      }
    }
    break;
  }

  return headerLines.join("\n");
}

/**
 * ヘッダコメント内の手書き「適用前確認 SELECT」。
 *
 * - 節見出し `適用前…確認クエリ`（`20260805170000` 等の旧パターン）
 * - コメント行先頭が `SELECT` / `UNION ALL SELECT` の実行例
 *   （本文中に SELECT と書くだけの説明は対象外）
 */
export function hasManualPrecheckInHeader(header: string): boolean {
  if (/適用前.*確認クエリ/u.test(header)) return true;

  for (const line of header.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("--")) continue;
    const body = trimmed.replace(/^--\s?/u, "").trimStart();
    if (/^SELECT\b/iu.test(body)) return true;
    if (/^UNION\s+ALL\s+SELECT\b/iu.test(body)) return true;
  }

  return false;
}

describe("migration ヘッダに手書きの適用前確認 SELECT を置かない", () => {
  test("gate が空振りしていない（git ls-tree の自己検査）", () => {
    const onMain = mainBranchMigrationSqlPaths();
    const local = localMigrationSqlPaths();

    expect(onMain.size).toBeGreaterThan(0);
    expect(local.length).toBeGreaterThan(0);
    // baseline 以降の migration は main に載っている前提（除外ロジックの健全性）。
    expect([...onMain].some((path) => path.includes("00000000000000_init"))).toBe(
      true,
    );
  });

  test("検出ロジックの自己検査（悪いヘッダは fail、rehearsal 参照は pass）", () => {
    const bad = `-- 説明
-- ## 適用前に本番で流す確認クエリ
--
--   SELECT count(*) FROM space_rate_plans WHERE start_time >= end_time;
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
`;

    expect(hasManualPrecheckInHeader(extractHeaderCommentText(bad))).toBe(true);

    const good = `-- 既存行の違反は rehearsal（migration-preconditions.ts）が migrate 前に落とす。
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
`;

    expect(hasManualPrecheckInHeader(extractHeaderCommentText(good))).toBe(false);

    const mentionsSelectInProse = `-- 前の migration のヘッダには同じ内容の SELECT がコメントとして書いてあったが、
-- 本番では誰も流さない。
BEGIN;
DO $$ BEGIN NULL; END $$;
`;

    expect(
      hasManualPrecheckInHeader(extractHeaderCommentText(mentionsSelectInProse)),
    ).toBe(false);
  });

  test("origin/main 以外の migration ヘッダに手書きの適用前確認 SELECT が無い", () => {
    const onMain = mainBranchMigrationSqlPaths();
    const offenders: { path: string; reason: string }[] = [];

    for (const path of localMigrationSqlPaths()) {
      if (onMain.has(path)) {
        // pre-commit が既存 migration.sql の改変をブロックする不変物。日付 allowlist は置かない。
        continue;
      }

      const sql = readFileSync(join(ROOT, path), "utf8");
      const header = extractHeaderCommentText(sql);
      if (!hasManualPrecheckInHeader(header)) continue;

      offenders.push({
        path,
        reason:
          "ヘッダに手書きの適用前確認 SELECT を置かない。既存行チェックは bun scripts/migration-preconditions.ts のリハーサルで行う",
      });
    }

    expect(offenders).toEqual([]);
  });
});
