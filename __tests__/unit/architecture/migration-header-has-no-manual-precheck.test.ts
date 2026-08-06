/**
 * migration ヘッダに「適用前に本番で流す確認 SELECT」を手で書かない gate。
 *
 * ## なぜ要るか
 *
 * 包んだ migration が失敗すると Prisma の表示は
 * `current transaction is aborted` だけになる。以前はヘッダに確認 SELECT を書いて
 * 運用者が手で流す運用だったが、実際に書かれた一覧は 23 本の制約のうち 3 本しか
 * 見ておらず、JSON null が残った DB で「0 件」と出たうえで migration が落ちた。
 * **人が書く一覧は覆うべき集合から必ず離れる。**
 *
 * しかもコメントの SELECT は誰も実行しない。書いた側は「確認手段を用意した」と
 * 思い、読んだ側は「確認済みだろう」と思う。実体の無い仕組みへの参照そのもの。
 *
 * 適用前の既存行チェックは `scripts/migration-preconditions.ts` のリハーサルが担う
 * （未適用 DDL を実際に流して必ず巻き戻す）。本番デプロイでは
 * `prisma migrate deploy` の**前**に走る。
 *
 * ## 既に書かれてしまったものをどう扱うか
 *
 * commit 済みの `prisma/migrations/*.sql` は編集できない（絶対規約 #7、
 * `scripts/check-protected-files.sh` が pre-commit でブロックする）。つまり既存分は
 * **直せない**。
 *
 * 除外の方法は 2 つとも塞がっている:
 *
 * - **名前で allowlist に載せる** → `gates-do-not-pin-migrations.test.ts` が禁じている。
 *   migration 履歴は baseline へ畳まれるので、名前は畳んだ瞬間に嘘になる
 * - **日付で線を引く** → 同じ理由で、畳んだ後は意味を失う数字が残るだけ
 *
 * そこで**件数だけを固定する**。これは ratchet として働く:
 *
 * - 新しく書けば件数が増えて落ちる（防ぎたいのはこれ）
 * - 履歴を baseline へ畳めば件数が減って落ちる → 定数を下げる 1 行が要る。
 *   黙って枠が空くことはない
 *
 * 落ちたときは違反ファイルのパスを実行時に組み立ててメッセージへ出す
 * （ソースにリテラルで持たないので、上記 gate と両立する）。
 *
 * ヘッダ = 最初の非コメント SQL 行の手前まで（`BEGIN;` より前）。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

/**
 * ヘッダに手書きの確認 SELECT を持ったまま**直せない** migration の本数。
 *
 * 減らす方向にしか動かせない。増えたらそれは新しく書かれたということ。
 */
const GRANDFATHERED_MANUAL_PRECHECKS = 4;

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
 * - 節見出し `適用前…確認クエリ`
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

function migrationsWithManualPrecheck(): string[] {
  const offenders: string[] = [];

  for (const path of localMigrationSqlPaths()) {
    let sql: string;
    try {
      sql = readFileSync(join(ROOT, path), "utf8");
    } catch {
      continue;
    }
    if (!hasManualPrecheckInHeader(extractHeaderCommentText(sql))) continue;
    offenders.push(path);
  }

  return offenders;
}

describe("migration ヘッダに手書きの適用前確認 SELECT を置かない", () => {
  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(localMigrationSqlPaths().length).toBeGreaterThan(0);
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

    // 見出しが無く SELECT 行だけの形も落とす。
    const bareSelect = `-- 既存行を数える:
--   SELECT count(*) FROM coupons WHERE valid_from > valid_until;
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
`;

    expect(
      hasManualPrecheckInHeader(extractHeaderCommentText(bareSelect)),
    ).toBe(true);

    const good = `-- 既存行の違反は rehearsal（migration-preconditions.ts）が migrate 前に落とす。
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
`;

    expect(hasManualPrecheckInHeader(extractHeaderCommentText(good))).toBe(
      false,
    );

    const mentionsSelectInProse = `-- 前の migration のヘッダには同じ内容の SELECT がコメントとして書いてあったが、
-- 本番では誰も流さない。
BEGIN;
DO $$ BEGIN NULL; END $$;
`;

    expect(
      hasManualPrecheckInHeader(
        extractHeaderCommentText(mentionsSelectInProse),
      ),
    ).toBe(false);

    // ヘッダの外（DDL より後ろのコメント）は見ない。
    const afterBody = `-- 説明だけ
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
--   SELECT count(*) FROM t;
COMMIT;
`;

    expect(hasManualPrecheckInHeader(extractHeaderCommentText(afterBody))).toBe(
      false,
    );
  });

  test("手書きの適用前確認 SELECT を持つ migration が増えていない", () => {
    const offenders = migrationsWithManualPrecheck();

    expect(
      offenders.length,
      [
        `ヘッダに手書きの適用前確認 SELECT を持つ migration が ${GRANDFATHERED_MANUAL_PRECHECKS} 本から ${offenders.length} 本に変わった:`,
        ...offenders.map((path) => `  ${path}`),
        "",
        "増えた場合: ヘッダに確認クエリを書かない。適用前の既存行チェックは",
        "  bun scripts/migration-preconditions.ts",
        "のリハーサルが担う（未適用 DDL を実際に流して必ず巻き戻す）。",
        "",
        "減った場合（履歴を baseline へ畳んだ等）: この gate の定数を実際の本数へ下げる。",
      ].join("\n"),
    ).toBe(GRANDFATHERED_MANUAL_PRECHECKS);
  });
});
