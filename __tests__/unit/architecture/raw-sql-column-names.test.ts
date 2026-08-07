/**
 * 生 SQL の列参照が、schema.prisma が導く**現在の**物理名と食い違っていないか。
 *
 * ## なぜ要るのか
 *
 * 721 列を snake_case へ寄せる作業は完了しているが、生 SQL は Prisma client の型検査を
 * 通らない。`"createdAt"` のような camelCase 引用識別子が残ると、実 DB に当たったときだけ
 * `column "createdAt" does not exist` で落ちる — unit テスト（Prisma mock）や E2E が
 * その文を通らない限り本番まで生き残る。
 *
 * ## 判定
 *
 * SQL リテラルが言及するテーブルを拾い、**schema.prisma に存在する表**なら、その中の
 * camelCase 引用識別子（`"createdAt"`）を違反とする。
 * システムカタログ（`pg_*` / `information_schema.*` / `_prisma_migrations`）だけを
 * 触る文は schema 外テーブルとして許可する。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOTS = ["src", "prisma", "scripts", "e2e", "__tests__"] as const;

/** schema 外テーブル参照として許可する接頭辞 / 名前。 */
const UNKNOWN_TABLE_ALLOWLIST = [
  /^pg_/u,
  /^information_schema\./u,
  /^_prisma_migrations$/u,
] as const;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const schema = readPrismaSchema();

function parseKnownTables(): Set<string> {
  const out = new Set<string>();
  for (const match of schema.matchAll(/^model \w+ \{([\s\S]*?)^\}/gmu)) {
    const body = match[1];
    if (body === undefined) continue;
    const table = /@@map\("([^"]+)"\)/u.exec(body)?.[1];
    if (table !== undefined) out.add(table);
  }
  return out;
}

const knownTables = parseKnownTables();

function isAllowedUnknownTable(name: string): boolean {
  return UNKNOWN_TABLE_ALLOWLIST.some((pattern) => pattern.test(name));
}

/**
 * テンプレートリテラルを 1 つ読み切る。`${...}` の中は SQL ではないので飛ばす
 * （中に backtick が出ても終端と誤認しない）。
 */
function readTemplate(source: string, openIndex: number): string | undefined {
  let depth = 0;
  for (let i = openIndex + 1; i < source.length; i += 1) {
    const c = source[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === "$" && source[i + 1] === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (depth > 0) {
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      continue;
    }
    if (c === "`") return source.slice(openIndex + 1, i);
  }
  return undefined;
}

/**
 * 文そのものに見えるリテラルだけを拾う。
 *
 * **タグ（`$executeRaw` 等）を目印にしない。** 目印にしていた版は、ヘルパー関数が
 * 組み立てて返すリテラルを丸ごと取り逃した。実例:
 * `value-domain-constraints.test.ts` の `spaceInsert()` は `INSERT INTO "spaces" (...)`
 * を `return` するだけで、実行は呼び出し側。WP11 で `"descriptionJson"` 等が
 * 旧名のまま残り、ゲートは緑・統合テストだけが落ちた。
 *
 * 代わりに **中身が文の形をしているか**で判定する。組み立て方に依存しない。
 *
 * **残る限界**: `',"discountType","discountValue"'` のような**断片**は、
 * どの表のものか静的には決まらない（表名を含まないため）。断片まで追うには
 * 実行時の連結を再現するしかないので、ここは統合テストに任せる。
 */
// **末尾に `\b` を置かない。** `UPDATE\s+"?\w` は語の途中（`UPDATE "e`）で終わるため、
// 全体を `\b(?:…)\b` で包むと語境界が成立せず **UPDATE 文が丸ごと検査対象外になる**。
// 実測: `event-slot-sync-commands.ts` の `UPDATE "event_tickets" SET "sortOrder" = …` が
// 素通りし、統合テストだけが `column "eventId" does not exist` で落ちた。
// 語境界が要る分岐には、その分岐の中で `\b` を書く。
const SQL_SHAPE =
  /\b(?:INSERT\s+INTO\b|UPDATE\s+(?:public\.)?"?\w|DELETE\s+FROM\b|SELECT\b[\s\S]*?\bFROM\b|ALTER\s+TABLE\b)/iu;

/** 文字列・コメント・テンプレートを状態遷移で読み分け、リテラルだけを取り出す。 */
function extractLiterals(source: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (c === "`") {
      const body = readTemplate(source, i);
      // 閉じない backtick は文字列内・正規表現内の見間違い。**そこで走査を
      // 打ち切るとファイルの残り全部が検査対象から消える**ので 1 文字進めるだけにする。
      if (body === undefined) continue;
      out.push(body);
      i += body.length + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < source.length; j += 1) {
        if (source[j] === "\\") {
          j += 1;
          continue;
        }
        if (source[j] === c || source[j] === "\n") break;
      }
      out.push(source.slice(i + 1, j));
      i = j;
    }
  }
  return out;
}

function extractSql(source: string): string[] {
  return extractLiterals(source).filter((literal) => SQL_SHAPE.test(literal));
}

const TABLE_MENTION =
  /\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/giu;
const CAMEL_IDENTIFIER = /"([a-z]+(?:[A-Z][a-zA-Z0-9]*)+)"/gu;

/**
 * SQL の**値**を落として、識別子だけを残す。
 *
 * SQL では `'...'` が値で `"..."` が識別子。jsonb リテラルを書くと
 * `'{"schemaVersion": 1}'::jsonb` のように**値の中に二重引用符が入る**ので、
 * 素通しすると JSON のキーを列名と読み違える（実測: `db-invariants.test.ts` の
 * `rateBreakdownJson` の中身 4 件が偽陽性になった）。
 */
function stripSqlValues(sql: string): string {
  return sql.replaceAll(/'(?:[^']|'')*'/gu, "''");
}

const files = ROOTS.flatMap((root) => walk(root));
const literals = files.flatMap((file) =>
  extractSql(readFileSync(file, "utf8")).map((sql) => ({ file, sql })),
);

function violations(): string[] {
  const out: string[] = [];
  for (const { file, sql: raw } of literals) {
    const sql = stripSqlValues(raw);
    const mentioned = [
      ...new Set(
        [...sql.matchAll(TABLE_MENTION)]
          .map((m) => m[1])
          .filter((name): name is string => name !== undefined),
      ),
    ];

    if (mentioned.length === 0) continue;

    if (
      mentioned.some(
        (name) => !knownTables.has(name) && !isAllowedUnknownTable(name),
      )
    ) {
      // 表名が特定できない（JOIN 先の alias / 誤検出 / 文字列中の断片）は判定保留。
      continue;
    }

    const schemaTables = mentioned.filter((name) => knownTables.has(name));
    if (schemaTables.length === 0) continue;

    const stale = [
      ...new Set([...sql.matchAll(CAMEL_IDENTIFIER)].map((m) => m[1])),
    ];
    for (const name of stale) {
      out.push(
        `${file.replaceAll("\\", "/")}: "${name}" — ` +
          `この文が触る表（${schemaTables.join(", ")}）は snake_case 物理名のはず`,
      );
    }
  }
  return out;
}

describe("生 SQL の列名", () => {
  test("SQL リテラルの抽出が機能している", () => {
    // 抽出器が壊れると違反ゼロで緑になる。「見つからなかった」と
    // 「見に行っていない」を取り違えないため、実際に取れた数を確かめる。
    // 実測 3378 ファイル / 文の形をしたリテラル 67 本。
    expect(files.length).toBeGreaterThan(500);
    expect(literals.length).toBeGreaterThan(40);
  });

  test("schema の解析が機能している", () => {
    expect(knownTables.size).toBeGreaterThan(50);
  });

  test("schema 上の表を触る生 SQL に camelCase の列参照が残っていない", () => {
    expect(violations()).toEqual([]);
  });
});
