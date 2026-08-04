#!/usr/bin/env bun

/**
 * PostgreSQL スキーマの**構造センサス**。
 *
 * migration 履歴を 1 本の baseline へ畳む作業は、「畳んだ結果が本当に同じ DB を
 * 作るか」を証明できなければ実行してはいけない。`prisma migrate diff` は
 * schema.prisma で表現できる範囲しか見ないため、CHECK 制約・EXCLUDE 制約・
 * CONSTRAINT TRIGGER・plpgsql 関数・partial index という**この repo の不変条件の
 * 大半**を素通りする。`prisma db pull` に至っては黙って落とす
 * （.claude/rules/migrations.md）。
 *
 * そこで pg_catalog を直接読み、両 DB のセンサスを突き合わせる。
 *
 * ## 使い方
 *
 * ```sh
 * bun scripts/db-census.ts --url postgresql://... --out /tmp/before.json
 * bun scripts/db-census.ts --url postgresql://... --out /tmp/after.json
 * bun scripts/db-census.ts --diff /tmp/before.json /tmp/after.json   # 差分ゼロで exit 0
 * ```
 *
 * ## 何を見て、何を見ないか
 *
 * - 見る: テーブル / 列（型・NOT NULL・DEFAULT）/ 全制約の定義 / 全 index の定義 /
 *   trigger の定義 / 関数の定義 / enum 型と**宣言順の値** / extension / sequence
 * - 見ない: `_prisma_migrations`（履歴そのものなので当然中身が違う）、
 *   extension が所有するオブジェクト（pg_trgm / btree_gist の内部関数・演算子。
 *   `pg_depend.deptype = 'e'` で除外する。これを入れるとセンサスが数百行の
 *   ノイズで埋まる）
 *
 * enum の**値の順序**を見るのが重要。PostgreSQL は enum を宣言順でソートするので、
 * 順序が変わると `ORDER BY <enum列>` の結果が黙って変わる。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

/** セクション名 → 正規化済み 1 行文字列の配列（ソート済み）。 */
export type Census = Record<string, readonly string[]>;

export type CensusDiff = {
  readonly section: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
};

/**
 * 2 つのセンサスを突き合わせる。
 *
 * 行は正規化済みの文字列なので、変更は「removed + added」として現れる。
 * わざわざ「変更」を検出しないのは、部分一致で寄せると**別物を同一視する**
 * 危険があるため（畳んだ baseline の検証でそれをやると意味がない）。
 */
export function diffCensus(before: Census, after: Census): CensusDiff[] {
  const sections = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();

  const diffs: CensusDiff[] = [];
  for (const section of sections) {
    const beforeSet = new Set(before[section] ?? []);
    const afterSet = new Set(after[section] ?? []);
    const removed = [...beforeSet].filter((row) => !afterSet.has(row)).sort();
    const added = [...afterSet].filter((row) => !beforeSet.has(row)).sort();
    if (removed.length > 0 || added.length > 0) {
      diffs.push({ section, added, removed });
    }
  }
  return diffs;
}

export function formatCensusDiff(diffs: readonly CensusDiff[]): string {
  if (diffs.length === 0) return "センサス差分なし（構造は完全に一致）";

  const lines: string[] = [];
  for (const diff of diffs) {
    lines.push(
      `\n== ${diff.section} (-${diff.removed.length} / +${diff.added.length})`,
    );
    for (const row of diff.removed) lines.push(`  - ${row}`);
    for (const row of diff.added) lines.push(`  + ${row}`);
  }
  return lines.join("\n");
}

/** `_prisma_migrations` は履歴そのもの。畳めば当然変わるので比較対象から外す。 */
const EXCLUDED_TABLES = new Set(["_prisma_migrations"]);

type NamedRow = { readonly entry: string | null };

/**
 * 各セクションの SQL。**すべて `ORDER BY` を持つ**こと — 並びが変わると
 * 差分が偽陽性になる（Set 比較なので実害は無いが、出力の可読性が落ちる）。
 *
 * extension 所有オブジェクトの除外述語はセクションごとに書く。共通化すると
 * 対象カタログごとの `classid` の違いを吸収できない。
 */
const CENSUS_QUERIES: Readonly<Record<string, string>> = {
  tables: `
    SELECT c.relname AS entry
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY 1`,

  columns: `
    SELECT c.relname || '.' || a.attname
           || ' ' || format_type(a.atttypid, a.atttypmod)
           || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
           || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') AS entry
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1`,

  constraints: `
    SELECT c.conrelid::regclass::text || ' ' || c.conname
           || ' ' || pg_get_constraintdef(c.oid) AS entry
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    ORDER BY 1`,

  indexes: `
    SELECT i.indexname || ' :: ' || i.indexdef AS entry
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
    ORDER BY 1`,

  triggers: `
    SELECT pg_get_triggerdef(t.oid) AS entry
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY 1`,

  functions: `
    SELECT pg_get_functiondef(p.oid) AS entry
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )
    ORDER BY 1`,

  enums: `
    SELECT t.typname || ' = ' || string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS entry
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY 1`,

  extensions: `
    SELECT e.extname AS entry
    FROM pg_extension e
    ORDER BY 1`,

  sequences: `
    SELECT c.relname AS entry
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    ORDER BY 1`,
};

/**
 * 行から除外テーブル由来のものを落とし、重複を潰して安定ソートする。
 *
 * `_prisma_migrations` は「先頭一致」ではなく**識別子の境界**で判定する
 * （`_prisma_migrations_x` のような別テーブルを巻き込まないため）。
 */
export function normalizeCensusRows(
  rows: readonly (string | null)[],
): readonly string[] {
  const excluded = [...EXCLUDED_TABLES];
  const kept = rows
    .filter((row): row is string => typeof row === "string")
    .filter(
      (row) =>
        !excluded.some((table) =>
          new RegExp(`(^|[^A-Za-z0-9_])${table}([^A-Za-z0-9_]|$)`, "u").test(
            row,
          ),
        ),
    );
  return [...new Set(kept)].sort();
}

export async function buildCensus(
  query: (sql: string) => Promise<readonly NamedRow[]>,
): Promise<Census> {
  const census: Record<string, readonly string[]> = {};
  for (const [section, sql] of Object.entries(CENSUS_QUERIES)) {
    const rows = await query(sql);
    census[section] = normalizeCensusRows(rows.map((row) => row.entry));
  }
  return census;
}

export type ParsedArgs =
  | { readonly mode: "capture"; readonly url: string; readonly out: string }
  | { readonly mode: "diff"; readonly before: string; readonly after: string }
  | { readonly mode: "error"; readonly message: string };

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const diffIndex = argv.indexOf("--diff");
  if (diffIndex >= 0) {
    const before = argv[diffIndex + 1];
    const after = argv[diffIndex + 2];
    if (!before || !after) {
      return { mode: "error", message: "--diff は 2 つのファイルを要求する" };
    }
    return { mode: "diff", before, after };
  }

  const urlIndex = argv.indexOf("--url");
  const outIndex = argv.indexOf("--out");
  const url = urlIndex >= 0 ? argv[urlIndex + 1] : undefined;
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  if (!url || !out) {
    return {
      mode: "error",
      message:
        "使い方: db-census.ts --url <connection> --out <file> | --diff <before> <after>",
    };
  }
  return { mode: "capture", url, out };
}

async function capture(url: string, out: string): Promise<number> {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  try {
    const census = await buildCensus((sql) =>
      prisma.$queryRawUnsafe<NamedRow[]>(sql),
    );
    await Bun.write(out, `${JSON.stringify(census, null, 2)}\n`);
    const total = Object.values(census).reduce(
      (sum, rows) => sum + rows.length,
      0,
    );
    console.info(`[db-census] ${total} entries -> ${out}`);
    for (const [section, rows] of Object.entries(census)) {
      console.info(`[db-census]   ${section}: ${rows.length}`);
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

function isCensus(value: unknown): value is Census {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(
    (rows) =>
      Array.isArray(rows) && rows.every((row) => typeof row === "string"),
  );
}

async function readCensus(path: string): Promise<Census> {
  const parsed: unknown = JSON.parse(await Bun.file(path).text());
  if (!isCensus(parsed)) {
    throw new Error(`${path} はセンサス JSON ではない`);
  }
  return parsed;
}

async function diff(beforePath: string, afterPath: string): Promise<number> {
  const diffs = diffCensus(
    await readCensus(beforePath),
    await readCensus(afterPath),
  );
  console.info(formatCensusDiff(diffs));
  return diffs.length === 0 ? 0 : 1;
}

async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  switch (args.mode) {
    case "capture":
      return capture(args.url, args.out);
    case "diff":
      return diff(args.before, args.after);
    case "error":
      console.error(`[db-census] ${args.message}`);
      return 2;
    default: {
      const exhaustive: never = args;
      throw new Error(`unreachable: ${String(exhaustive)}`);
    }
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
