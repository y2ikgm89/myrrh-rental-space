/**
 * テストは **migration ディレクトリを名前で指してはいけない**（baseline を除く）。
 *
 * ## なぜ
 *
 * 「`_audit_log_hash_chain` で終わるディレクトリを探して中身を検査する」形のゲートが
 * 8 本あった。migration 履歴を 1 本の baseline へ畳むとその**ディレクトリごと消えて
 * 落ちる**。落ちること自体は良いが、直し方が「新しい migration 名を書き直す」に
 * なってしまうのが良くない。
 *
 * ゲートが見たいのは **その不変条件が今も DB に存在すること**であって、どの migration が
 * 作ったかではない。名指しは「歴史の検査」で、畳めば意味を失う。
 *
 * ## 代わりに使うもの（`__tests__/support/prisma-sources.ts`）
 *
 * | 見たいもの | 使う関数 |
 * | --- | --- |
 * | CHECK / EXCLUDE / 関数 / trigger / extension | `readDatabaseInvariants()` |
 * | 履歴のどこかに DDL があること | `readAllMigrationSql()` |
 * | 畳んだ先の baseline そのもの | `readBaselineMigration()` |
 * | モデル・列・index 宣言 | `readPrismaSchema()` |
 *
 * ## 例外
 *
 * `00000000000000_init` だけは名指してよい。畳んだ結果が書かれる先で、パスが変わらない。
 * migration 履歴そのものの性質（原子性・時刻の単調性）を検査するテストは
 * ディレクトリ一覧を走査するので、この規約の対象外（名前を**固定**していない）。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const TESTS_ROOT = join(process.cwd(), "__tests__");

/** 畳んでも残る唯一の migration 名。 */
const BASELINE_DIR_NAME = "00000000000000_init";

/** Prisma の記帳テーブル。migration ディレクトリではない。 */
const BOOKKEEPING_TABLE = "_prisma_migrations";

/**
 * `20260705000000_order_uniqueness_constraints` のような timestamp 付きの
 * migration ディレクトリ名リテラル、および `_add_reservation_series` のような
 * 接尾辞での探索。
 */
const PINNED_MIGRATION_NAME =
  /["'`](\d{14}_[a-z0-9_]+|_[a-z0-9]+(?:_[a-z0-9]+)+)["'`]/gu;

/**
 * コメントを落とす。
 *
 * **散文まで見ると必ず誤検出する。** 「この挙動は migration `_section_page_id_not_null`
 * で発生不能になった」のような由来の説明は、名指しの検査ではなく残すべき記録。
 * このゲート自身の docblock も同じ理由で自己検出してしまう。
 */
function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/(^|[^:])\/\/.*$/gmu, "$1");
}

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTestFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** migration を扱っている行だけを対象にする（無関係な文字列で誤検出しないため）。 */
function pinnedMigrationReferences(source: string): string[] {
  const found: string[] = [];
  for (const line of stripComments(source).split(/\r?\n/u)) {
    if (!/migration/iu.test(line)) continue;
    for (const match of line.matchAll(PINNED_MIGRATION_NAME)) {
      const name = match[1];
      if (name === undefined) continue;
      if (name === BASELINE_DIR_NAME) continue;
      if (name === BOOKKEEPING_TABLE) continue;
      if (name.startsWith(BOOKKEEPING_TABLE)) continue;
      found.push(name);
    }
  }
  return found;
}

describe("ゲートは migration を名指ししない", () => {
  test("走査対象のテストが実在する（gate 自体が空振りしていない）", () => {
    expect(listTestFiles(TESTS_ROOT).length).toBeGreaterThan(100);
  });

  test("baseline 以外の migration 名をリテラルで書いているテストが無い", () => {
    const offenders: string[] = [];

    for (const file of listTestFiles(TESTS_ROOT)) {
      const names = pinnedMigrationReferences(readFileSync(file, "utf8"));
      if (names.length === 0) continue;
      const rel = file.replaceAll("\\", "/").split("__tests__/")[1] ?? file;
      offenders.push(`${rel} :: ${[...new Set(names)].join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });
});
