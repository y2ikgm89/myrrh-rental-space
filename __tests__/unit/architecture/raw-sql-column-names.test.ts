/**
 * 生 SQL の列参照が、変換済みテーブルの**現在の**物理名と食い違っていないか。
 *
 * ## なぜ要るのか
 *
 * 721 列を snake_case へ寄せる作業は 7 本の PR に割れていて、その途中は
 * **変換済みのテーブルと未変換のテーブルが同居する**。`"createdAt"` は 60 表以上に
 * あるので、`users` を変換した後の生 SQL は `users.created_at` と
 * `posts."createdAt"` を同時に書くことになる。取り違えても:
 *
 * - Prisma client 経由の型検査には出ない（生 SQL は素の文字列）
 * - unit テストは Prisma を mock するので走らない
 * - 実 DB に当たったときだけ `column "createdAt" does not exist` で落ちる
 *
 * つまり **統合テストか E2E が偶然その文を通らない限り本番まで生き残る**。
 *
 * ## 判定
 *
 * SQL リテラルが言及するテーブルを拾い、**それが全部変換済みなら**、その中の
 * camelCase の引用識別子（`"createdAt"`）を違反とする。1 つでも未変換テーブルが
 * 混ざる文（JOIN など）は判定を保留する — その camelCase が未変換側の列である
 * 可能性を否定できないため。**曖昧なら黙る**方に倒している。
 *
 * 「変換済み」は schema.prisma から導く（全列の物理名が snake_case）。
 * 変換の進捗を別リストで持たないので、リストの更新漏れで検査が止まる余地が無い。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOTS = ["src", "prisma", "scripts", "e2e", "__tests__"] as const;

const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const schema = readPrismaSchema();

type Table = {
  readonly model: string;
  readonly table: string;
  readonly converted: boolean;
};

function parseTables(): Map<string, Table> {
  const modelNames = new Set(
    [...schema.matchAll(/^model (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const enumNames = new Set(
    [...schema.matchAll(/^enum (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const out = new Map<string, Table>();

  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    const model = match[1];
    const body = match[2];
    if (model === undefined || body === undefined) continue;
    const table = /@@map\("([^"]+)"\)/u.exec(body)?.[1];
    if (table === undefined) continue;

    let converted = true;
    for (const line of body.split(/\r?\n/u)) {
      const column = /^ {2}(\w+)\s+(\w+)/u.exec(line);
      if (!column) continue;
      const [, field, type] = column;
      if (field === undefined || type === undefined) continue;
      if (modelNames.has(type)) continue;
      if (!SCALAR_TYPES.has(type) && !enumNames.has(type)) continue;
      const physical = /@map\("([^"]+)"\)/u.exec(line)?.[1] ?? field;
      if (/[A-Z]/u.test(physical)) converted = false;
    }
    out.set(table, { model, table, converted });
  }
  return out;
}

const tables = parseTables();

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

/** 生 SQL のタグ。`$queryRawUnsafe` は文字列が別所で組まれるので静的には見ない。 */
const SQL_TAG =
  /(?:\$queryRaw|\$executeRaw|Prisma\.sql)(?:<[^>]*>)?\s*`|\.query\(\s*`/gu;

function extractSql(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(SQL_TAG)) {
    const backtick = source.indexOf("`", match.index);
    if (backtick === -1) continue;
    const body = readTemplate(source, backtick);
    if (body !== undefined) out.push(body);
  }
  return out;
}

const TABLE_MENTION =
  /\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/giu;
const CAMEL_IDENTIFIER = /"([a-z]+(?:[A-Z][a-zA-Z0-9]*)+)"/gu;

const files = ROOTS.flatMap((root) => walk(root));
const literals = files.flatMap((file) =>
  extractSql(readFileSync(file, "utf8")).map((sql) => ({ file, sql })),
);

function violations(): string[] {
  const out: string[] = [];
  for (const { file, sql } of literals) {
    const mentioned = [...sql.matchAll(TABLE_MENTION)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined)
      .map((name) => tables.get(name));

    if (mentioned.length === 0) continue;
    if (mentioned.some((t) => t === undefined || !t.converted)) continue;

    const stale = [
      ...new Set([...sql.matchAll(CAMEL_IDENTIFIER)].map((m) => m[1])),
    ];
    for (const name of stale) {
      out.push(
        `${file.replaceAll("\\", "/")}: "${name}" — ` +
          `この文が触る表（${[...new Set(mentioned.map((t) => t?.table))].join(", ")}）は` +
          `変換済みなので物理名は snake_case のはず`,
      );
    }
  }
  return out;
}

describe("生 SQL の列名", () => {
  test("SQL リテラルの抽出が機能している", () => {
    // 抽出器が壊れると違反ゼロで緑になる。「見つからなかった」と
    // 「見に行っていない」を取り違えないため、実際に取れた数を確かめる。
    expect(files.length).toBeGreaterThan(500);
    expect(literals.length).toBeGreaterThan(100);
  });

  test("schema の解析が機能している", () => {
    expect(tables.size).toBeGreaterThan(50);
  });

  test("変換済みテーブルを触る生 SQL に camelCase の列参照が残っていない", () => {
    expect(violations()).toEqual([]);
  });
});
