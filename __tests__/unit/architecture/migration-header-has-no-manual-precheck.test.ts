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
 * ただしリハーサルが証明するのは **「この SQL はエラーにならない」だけ**で、
 * 破壊はエラーではない（`DROP COLUMN` は満杯のテーブルにも成功する）。破壊的文の
 * 前提は `destructive-migration-has-executed-assertion.test.ts` が別に強制する。
 *
 * ## SELECT 形だけでなくコマンド形も禁じる
 *
 * 初版は**手書きの確認 SELECT** だけを見ていた。実測すると、破壊的 migration の
 * ヘッダに書かれた `適用前: bun scripts/…--apply`（移送スクリプトを流せという指示）は
 * 判定 `false` ですり抜けていた。**コマンド形のほうが悪質**で、SELECT なら少なくとも
 * 「何を見るか」が残るのに対し、コマンドは流し忘れがそのまま無言の破壊になる。
 * どちらも「人が読んで手で流す前提の検査」であり、同じ欠陥。
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
 * ヘッダに手書きの「適用前にこれを流せ」を持ったまま**直せない** migration の本数。
 *
 * 減らす方向にしか動かせない。増えたらそれは新しく書かれたということ。
 *
 * **4 → 5 は新しく書かれたからではなく、検出側を広げたから。** SELECT 形しか
 * 見ていなかった判定にコマンド形を足した結果、前から存在していた 1 本
 * （移送スクリプトの実行を散文で指示していた破壊的 migration）が新たに見えた。
 * 定数を上げるのはこの一度きりで、以降は減らす方向にしか動かさない。
 */
const GRANDFATHERED_MANUAL_PRECHECKS = 5;

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
 *
 * 現状の migration は `--` 行コメントだけを使っているが、**ブロックコメント
 * （スラッシュ + アスタリスクで開き、閉じるまで）も最後まで読む**。初版は開始行
 * だけを積んで次の行で break していたため、ブロックコメントで書いた確認クエリを
 * 1 文字も見ずに緑を返していた
 * （Codex が PR #1998 で指摘、実測で再現）。「稀だから」で片方だけ扱うと、
 * その書き方に切り替えた瞬間に gate が黙って空振りする。
 */
export function extractHeaderCommentText(sql: string): string {
  const headerLines: string[] = [];
  let inBlockComment = false;

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();

    if (inBlockComment) {
      headerLines.push(line);
      const close = trimmed.indexOf("*/");
      if (close === -1) continue;
      inBlockComment = false;
      // 閉じた後ろに SQL が続いていれば、そこがヘッダの終わり。
      if (trimmed.slice(close + 2).trim().length > 0) break;
      continue;
    }

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
      const close = trimmed.indexOf("*/");
      if (close === -1) {
        inBlockComment = true;
        continue;
      }
      if (trimmed.slice(close + 2).trim().length > 0) break;
      continue;
    }
    break;
  }

  return headerLines.join("\n");
}

/**
 * ヘッダの各行から、コメント記号を落とした本文を取り出す。
 *
 * `--` 行コメントとブロックコメントの両方を扱う。ブロック内の装飾アスタリスク
 * （JSDoc 風）も落とすので、どちらの書き方でも同じ判定になる。
 */
export function headerCommentBodyLines(header: string): string[] {
  const bodies: string[] = [];
  let inBlockComment = false;

  for (const raw of header.split("\n")) {
    let line = raw.trim();

    if (inBlockComment) {
      const close = line.indexOf("*/");
      if (close !== -1) {
        line = line.slice(0, close);
        inBlockComment = false;
      }
      bodies.push(line.replace(/^\*+\s?/u, "").trim());
      continue;
    }

    if (line.startsWith("--")) {
      bodies.push(line.replace(/^--\s?/u, "").trim());
      continue;
    }

    if (line.startsWith("/*")) {
      const close = line.indexOf("*/");
      if (close === -1) {
        inBlockComment = true;
        bodies.push(line.slice(2).trim());
        continue;
      }
      bodies.push(line.slice(2, close).trim());
      continue;
    }

    // ヘッダ抽出済みなので、ここに来るのは空行だけ。
  }

  return bodies;
}

/**
 * 実行できるコマンドの名前。
 *
 * `bunx` は `\bbun\b` に当たらないので、長いものから明示的に並べる。
 */
const RUNNABLE_COMMAND = /\b(?:bunx|bun|npx|npm|pnpm|yarn|psql|prisma)\b/u;

/**
 * ヘッダコメント内の手書き「適用前にこれを流せ」。
 *
 * - 節見出し `適用前…確認クエリ`
 * - コメント行**本文の先頭**が `SELECT` / `UNION ALL SELECT` の実行例
 *   （本文中に SELECT と書くだけの説明は対象外）
 * - コメント行**本文の先頭**が `適用前` で、かつ実行できるコマンド名を含む
 *   （`適用前: bun scripts/…`）。散文の途中に出る「適用前」は対象外——実測で、
 *   「違反行があれば次の書込まで残る。適用前…」のように折返しで現れる説明が
 *   2 本あり、これらは指示ではない
 */
export function hasManualPrecheckInHeader(header: string): boolean {
  const bodies = headerCommentBodyLines(header);

  if (/適用前.*確認クエリ/u.test(bodies.join("\n"))) return true;

  for (const body of bodies) {
    if (/^SELECT\b/iu.test(body)) return true;
    if (/^UNION\s+ALL\s+SELECT\b/iu.test(body)) return true;
    if (/^適用前/u.test(body) && RUNNABLE_COMMAND.test(body)) return true;
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

    // **コマンド形**（初版がすり抜けさせていた形）。SELECT を 1 文字も含まない。
    const preApplyCommand = `-- P9: 計画ダウンタイム付き schema 契約
--
-- 適用前: bun scripts/backfill-special-holidays-to-blocked-dates.ts --apply
BEGIN;
ALTER TABLE "locations" DROP COLUMN "special_holidays";
`;

    expect(
      hasManualPrecheckInHeader(extractHeaderCommentText(preApplyCommand)),
    ).toBe(true);

    // 自動で走る仕組みへの**参照**は指示ではない（リハーサルは pipeline が流す）。
    const refersToAutomatedStep = `-- リハーサル: bun scripts/migration-preconditions.ts
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
`;

    expect(
      hasManualPrecheckInHeader(
        extractHeaderCommentText(refersToAutomatedStep),
      ),
    ).toBe(false);

    // 散文の途中に出る「適用前」も指示ではない（実在ヘッダに 2 本ある折返し）。
    const proseMentionsPreApply = `-- 違反行があれば次の書込まで残る。適用前に bun で流す運用に戻さないこと。
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
`;

    expect(
      hasManualPrecheckInHeader(
        extractHeaderCommentText(proseMentionsPreApply),
      ),
    ).toBe(false);

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

  test("ブロックコメントのヘッダも最後まで読む（初版はここが空振りしていた）", () => {
    const blockBad = `/*
 * 説明
 *
 * ## 適用前に本番で流す確認クエリ
 *
 *   SELECT count(*) FROM t WHERE a > b;
 */
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
COMMIT;
`;

    // 初版は開始行だけを積んで次の行で break していたため "/*" しか残らなかった。
    const header = extractHeaderCommentText(blockBad);
    expect(header.split("\n").length).toBeGreaterThan(1);
    expect(header).toContain("SELECT count(*)");
    expect(hasManualPrecheckInHeader(header)).toBe(true);

    // 見出しが無く SELECT 行だけのブロックコメントも落とす（装飾 `*` を剥がす）。
    const blockBareSelect = `/*
 * 既存行を数える:
 *   SELECT count(*) FROM coupons WHERE valid_from > valid_until;
 */
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
COMMIT;
`;

    expect(
      hasManualPrecheckInHeader(extractHeaderCommentText(blockBareSelect)),
    ).toBe(true);

    // `*` を付けない書き方でも同じ。
    const blockNoStars = `/*
  適用前に流す確認クエリ:
    SELECT count(*) FROM t;
*/
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
COMMIT;
`;

    expect(
      hasManualPrecheckInHeader(extractHeaderCommentText(blockNoStars)),
    ).toBe(true);

    // 正しく rehearsal を指しているブロックコメントは通す。
    const blockGood = `/*
 * 既存行の違反は rehearsal（migration-preconditions.ts）が migrate 前に落とす。
 */
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
COMMIT;
`;

    expect(hasManualPrecheckInHeader(extractHeaderCommentText(blockGood))).toBe(
      false,
    );

    // ブロックが閉じた後ろに SQL が続く場合、そこでヘッダは終わる。
    const inlineBlock = `/* 説明 */ CREATE TABLE "t" ("id" text);
--   SELECT count(*) FROM t;
`;

    expect(
      hasManualPrecheckInHeader(extractHeaderCommentText(inlineBlock)),
    ).toBe(false);

    // `--` とブロックコメントが混在するヘッダも両方読む。
    const mixed = `-- 先頭は行コメント
/*
 *   SELECT count(*) FROM t;
 */
BEGIN;
ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (true);
COMMIT;
`;

    expect(hasManualPrecheckInHeader(extractHeaderCommentText(mixed))).toBe(
      true,
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
