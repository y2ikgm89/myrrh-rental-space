/**
 * `prisma/baseline/invariants.sql` を**実 DB から生成する**。
 *
 * ## なぜ生成物にするのか
 *
 * このファイルは「Prisma DSL で表現できない不変条件」の SSoT で、`build-baseline-migration.ts`
 * が生成 DDL の後ろに連結し、5 つのゲートが `readDatabaseInvariants()` で読む。
 *
 * 初版は pg_catalog センサス差分から**手で起こした**。その結果、物理列名を
 * snake_case へ寄せた後も旧名
 * （`"spaceId"` / `"startAt"` / `"EventScheduleMode"` …）を抱えたまま残り、
 *
 *   - それを読むゲートは**存在しない列名**を検査する空の検査になった
 *   - 次に baseline を畳むと、作れない CHECK / trigger / 関数を含む baseline ができる
 *
 * という二重の壊れ方をした。**手で起こした SSoT は必ず現実からずれる。**
 * 生成すれば、ずれたときは再生成すれば直る。
 *
 * ## 何を出すか
 *
 * `prisma migrate diff --from-empty --to-schema` が**出さないもの**だけ:
 *
 * | 種類 | 出どころ | 理由 |
 * | --- | --- | --- |
 * | スカラー配列列の NOT NULL | `information_schema.columns` | Prisma は `String[]` に NOT NULL を出さない |
 * | CHECK 制約 | `pg_constraint` contype='c' | Prisma DSL に CHECK が無い |
 * | plpgsql 関数 | `pg_proc` | 同上 |
 * | EXCLUDE 制約 | `pg_constraint` contype='x' | 同上 |
 * | trigger | `pg_trigger` | 同上 |
 *
 * 順序は NOT NULL → CHECK → 関数 → EXCLUDE → trigger。trigger は関数が先に無いと作れない。
 *
 * ## 使い方
 *
 *   bun scripts/build-baseline-invariants.ts --url <postgres-url> [--out <path>] [--force]
 *
 * `--url` には**全 migration を適用済みの DB** を渡す。生成結果を採用する前に
 * `scripts/db-census.ts` で「生成 DDL + このファイル」を流した DB と突き合わせること。
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_OUT = join("prisma", "baseline", "invariants.sql");

type Row = Record<string, string | null>;

/**
 * 生成する SQL に "undefined" / "null" を埋めないための取り出し。
 *
 * `Row` は `Record<string, string | null>` かつ `noUncheckedIndexedAccess` なので
 * 各列は `string | null | undefined`。そのままテンプレートに埋めると、クエリの
 * 列名を変えた日に `ALTER TABLE "undefined"` を含む baseline が**静かに**生成される。
 * 欠けているなら生成物は使い物にならないので、その場で止める。
 */
function required(row: Row, key: string): string {
  const value = row[key];
  if (value == null || value === "") {
    throw new Error(
      `build-baseline-invariants: 行に ${key} がありません: ${JSON.stringify(row)}`,
    );
  }
  return value;
}

async function query(url: string, sql: string): Promise<Row[]> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<Row>(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}

/**
 * Prisma が NOT NULL を出さない列 = **配列型でありながら NOT NULL** の列。
 * 通常のスカラーは Prisma 側が出すので、ここで重複させない。
 */
const ARRAY_NOT_NULL_SQL = `
SELECT c.relname AS table_name, a.attname AS column_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND a.attnotnull
  AND t.typcategory = 'A'
ORDER BY c.relname, a.attname`;

const CONSTRAINT_SQL = (contype: string) => `
SELECT c.relname AS table_name,
       con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = '${contype}'
ORDER BY c.relname, con.conname`;

/**
 * **拡張が持ち込んだ関数を除く。** `pg_trgm` / `btree_gist` は public スキーマへ
 * 200 本以上の関数を入れる。それらは `extensions.sql` の `CREATE EXTENSION` が
 * 作るので、ここで重複して出すと baseline が二重定義で落ちる。
 * 所有関係は `pg_depend.deptype = 'e'`（extension member）で判定する。
 */
const FUNCTION_SQL = `
SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.classid = 'pg_proc'::regclass
      AND d.objid = p.oid
      AND d.deptype = 'e'
  )
ORDER BY p.proname, p.oid`;

const TRIGGER_SQL = `
SELECT t.tgname AS name, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname`;

const HEADER = `-- ============================================================================
-- baseline invariants — Prisma DSL で表現できない不変条件
-- ============================================================================
--
-- **このファイルは生成物。手で編集しない。**
--   bun scripts/build-baseline-invariants.ts --url <全 migration 適用済み DB> --force
--
-- \`prisma migrate diff --from-empty --to-schema\` が出す DDL には CHECK 制約・
-- EXCLUDE 制約・plpgsql 関数・trigger が一切含まれない（Prisma のスキーマ言語が
-- それらを表現できないため）。migration 履歴を 1 本の baseline へ畳むと黙って消える。
--
-- \`scripts/build-baseline-migration.ts\` が生成 DDL の**後ろ**に連結する。extension だけは
-- GIN index より前に要るので別ファイル（\`extensions.sql\`）で prelude として先に流す。
--
-- ## 順序
--
-- NOT NULL → CHECK → 関数 → EXCLUDE → trigger。trigger は関数が先に無いと作れない。
-- ============================================================================
`;

function section(title: string, count: number, note?: string): string {
  const lines = ["", `-- ===== ${title} (${count}) =====`];
  if (note) lines.push("--", ...note.split("\n").map((l) => `-- ${l}`));
  lines.push("");
  return lines.join("\n");
}

export async function buildInvariants(url: string): Promise<string> {
  const [arrayNotNull, checks, exclusions, functions, triggers] =
    await Promise.all([
      query(url, ARRAY_NOT_NULL_SQL),
      query(url, CONSTRAINT_SQL("c")),
      query(url, CONSTRAINT_SQL("x")),
      query(url, FUNCTION_SQL),
      query(url, TRIGGER_SQL),
    ]);

  const parts: string[] = [HEADER];

  parts.push(
    section(
      "スカラー配列列の NOT NULL",
      arrayNotNull.length,
      "Prisma は `String[]` に NOT NULL を出さない（Prisma 側の型が非 null なので\nクライアントが null を書かない前提）。落とすと Prisma 経由以外の書込で null が\n入る余地が開く。",
    ),
  );
  for (const row of arrayNotNull) {
    parts.push(
      `ALTER TABLE "${required(row, "table_name")}" ALTER COLUMN "${required(row, "column_name")}" SET NOT NULL;`,
    );
  }

  parts.push(section("CHECK 制約", checks.length));
  for (const row of checks) {
    parts.push(
      `ALTER TABLE "${required(row, "table_name")}" ADD CONSTRAINT "${required(row, "constraint_name")}" ${required(row, "definition")};`,
    );
  }

  parts.push(
    section(
      "plpgsql 関数",
      functions.length,
      "trigger 関数と、その本体から呼ばれる検査関数。**本体はテキスト**なので、\n列や型を rename しても自動追随しない（rename する migration 側で作り直す）。",
    ),
  );
  for (const row of functions) {
    // `pg_get_functiondef` は末尾に改行を付ける。そのまま `;` を足すと
    // `$function$\n;` になり、`$function$;` を終端とみなす読み手
    // （`__tests__/support/prisma-sources.ts` の `readPlpgsqlFunction`）が
    // 関数を切り出せなくなる。**生成物の形は読み手の契約**なので揃える。
    parts.push(`${(row["definition"] ?? "").trimEnd()};`, "");
  }

  parts.push(section("EXCLUDE 制約", exclusions.length));
  for (const row of exclusions) {
    parts.push(
      `ALTER TABLE "${required(row, "table_name")}" ADD CONSTRAINT "${required(row, "constraint_name")}" ${required(row, "definition")};`,
    );
  }

  parts.push(section("trigger", triggers.length));
  for (const row of triggers) {
    parts.push(`${required(row, "definition")};`);
  }

  parts.push("");
  return parts.join("\n");
}

function parseArgs(argv: readonly string[]): {
  url: string | undefined;
  out: string;
  force: boolean;
} {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    url: get("--url") ?? process.env["DATABASE_URL"],
    out: get("--out") ?? DEFAULT_OUT,
    force: argv.includes("--force"),
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const { url, out, force } = parseArgs(argv);
  if (!url) {
    console.error(
      "[invariants] --url または DATABASE_URL が要る（全 migration 適用済みの DB を指すこと）",
    );
    return 1;
  }
  if (existsSync(out) && !force) {
    console.error(
      `[invariants] ${out} は既にある。上書きするなら --force を付ける`,
    );
    return 1;
  }

  const sql = await buildInvariants(url);

  // 生成が空振りしていないことを確かめる。空のファイルを書くと、baseline から
  // 不変条件が丸ごと消えたまま「生成できた」と report してしまう。
  // `ADD CONSTRAINT` は CHECK だけでなく EXCLUDE も含む。**`CHECK=` と名乗ると
  // 生成物の CHECK 見出し件数と 1 ずれる**（EXCLUDE 制約が 1 本ある）。
  // 名前が数えているものと違うことを言わないよう `constraints` にする。
  const constraints = (sql.match(/^ALTER TABLE .* ADD CONSTRAINT/gmu) ?? [])
    .length;
  const functions = (sql.match(/^CREATE OR REPLACE FUNCTION/gmu) ?? []).length;
  const triggers = (sql.match(/^CREATE (?:CONSTRAINT )?TRIGGER/gmu) ?? [])
    .length;
  if (constraints < 50 || functions < 5 || triggers < 5) {
    console.error(
      `[invariants] 生成結果が少なすぎる（制約=${constraints} 関数=${functions} trigger=${triggers}）。` +
        "空の DB を指していないか確認すること",
    );
    return 1;
  }

  writeFileSync(out, sql, { encoding: "utf8" });
  console.error(
    `[invariants] ${out} を生成: 制約=${constraints} 関数=${functions} trigger=${triggers}`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
