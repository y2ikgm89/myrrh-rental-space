/**
 * migration が**既存の行**に当たって落ちるかを、適用する前に調べる。
 *
 * ## 何を防ぐのか
 *
 * この repo の migration は `BEGIN; … COMMIT;` で包む契約になっている
 * （`.claude/rules/migrations.md`）。包まないと部分適用のまま止まるからだが、
 * 包むと**失敗の表示が原因を指さなくなる**。実際に出るのは
 *
 *   ERROR: current transaction is aborted, commands ignored until end of
 *          transaction block
 *
 * だけで、どの制約のどの行が違反したのかは分からない。しかも
 * `_prisma_migrations` には失敗が記録されるので、**以降のデプロイが全部止まる**。
 * 復旧は本番 DB への手作業になる。予約サイトから見れば「原因不明のまま修正が
 * 何も出せない」状態が続く。
 *
 * ## 手起こしの確認クエリでは足りない
 *
 * これまでの守りは「migration ヘッダに適用前の確認クエリを書く」という散文の
 * 約束だけだった。実測: `20260805180000` のヘッダは **23 本の制約のうち 3 本**しか
 * 見ておらず、`locations.special_holidays` に JSON null が残った DB で
 * 「0 件」と出たうえで migration が落ちた。人が書く一覧は、それが覆うべき
 * 制約の集合から必ず離れていく。
 *
 * だからここでは **migration SQL からプローブを導出する**。覆う範囲は
 * migration 自身が持つ文の集合なので、少なくなりようがない。
 *
 * ## 使い方
 *
 * ```sh
 * # 未適用の migration を対象に、DATABASE_URL の DB を調べる
 * bun scripts/migration-preconditions.ts
 * bun scripts/migration-preconditions.ts --url postgresql://...
 * ```
 *
 * 違反行が 1 件でもあれば exit 1。**評価できない文が残っていても exit 1**
 * （黙って飛ばすと「確認した」という記録だけが残る）。
 *
 * ## 覆う範囲と、覆わないもの
 *
 * 既存行に当たって失敗しうる DDL のうち、プローブを持つのは CHECK / UNIQUE /
 * PRIMARY KEY / FOREIGN KEY / unique index / `SET NOT NULL` /
 * `ALTER COLUMN … TYPE VARCHAR(n)` / 既定値なし NOT NULL 列の追加。
 *
 * **EXCLUDE 制約にはプローブが無い。** 既存テーブルへ EXCLUDE を足す migration が
 * 現れたら `migration-preconditions.test.ts` が PR の時点で赤くなるので、
 * その時にここへ実装を足す。deploy の夜に初めて分かることにはならない。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

// ---------------------------------------------------------------------------
// SQL の分割
// ---------------------------------------------------------------------------

/**
 * SQL を文へ分割する。
 *
 * `;` で単純に切ると plpgsql 関数本体（`$$ … $$`）が途中で割れる。baseline には
 * trigger 関数が入っているので、ドル引用符と文字列リテラルを追ってから切る。
 * コメントは落とす。
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let index = 0;
  let dollarTag: string | null = null;
  let inSingleQuote = false;

  while (index < sql.length) {
    const char = sql.charAt(index);
    const pair = sql.slice(index, index + 2);

    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, index)) {
        buffer += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
      } else {
        buffer += char;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      buffer += char;
      if (char === "'") {
        if (sql.charAt(index + 1) === "'") {
          buffer += "'";
          index += 2;
          continue;
        }
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (pair === "--") {
      const newline = sql.indexOf("\n", index);
      index = newline === -1 ? sql.length : newline;
      continue;
    }
    if (pair === "/*") {
      const close = sql.indexOf("*/", index + 2);
      index = close === -1 ? sql.length : close + 2;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      buffer += char;
      index += 1;
      continue;
    }

    const dollar = /^\$[A-Za-z_]*\$/u.exec(sql.slice(index));
    const opened = dollar?.[0];
    if (opened !== undefined) {
      dollarTag = opened;
      buffer += opened;
      index += opened.length;
      continue;
    }

    if (char === ";") {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buffer = "";
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  const tail = buffer.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/** `open` の直後から始まる括弧組の中身を返す（`open` は `(` の位置）。 */
function balanced(source: string, open: number): string | null {
  if (source.charAt(open) !== "(") return null;
  let depth = 0;
  let inSingleQuote = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (inSingleQuote) {
      if (char === "'") inSingleQuote = false;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** 括弧の深さ 0 のカンマで割る（`tstzrange(a, b)` を割らない）。 */
function topLevelSplit(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buffer = "";
  let inSingleQuote = false;
  for (const char of list) {
    if (inSingleQuote) {
      buffer += char;
      if (char === "'") inSingleQuote = false;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      buffer += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }
  const tail = buffer.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

// ---------------------------------------------------------------------------
// 分類
// ---------------------------------------------------------------------------

/** 既存行に当たって失敗しうる 1 文。 */
export interface DataDependentStatement {
  /** 検査対象のテーブル（物理名）。 */
  readonly table: string;
  /** 制約名、または `table.column` 形式の識別子。 */
  readonly label: string;
  /** 何が満たされていなければならないか（人が読む用）。 */
  readonly requirement: string;
  /**
   * 違反行数を 1 列 1 行で返す SQL。`null` は**プローブ未実装**を意味し、
   * 呼び出し側は成功として扱ってはいけない。
   */
  readonly probe: string | null;
}

export type Classified =
  | { readonly kind: "safe" }
  | { readonly kind: "creates-table"; readonly table: string }
  | { readonly kind: "data-dependent"; readonly detail: DataDependentStatement }
  | { readonly kind: "unknown"; readonly head: string };

const IDENT = '"?([A-Za-z_][A-Za-z0-9_]*)"?';

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** `"a", "b"` → `["a", "b"]`（式もそのまま返す）。 */
function columnList(raw: string): string[] {
  return topLevelSplit(raw).map((entry) =>
    entry.replace(/\s+(ASC|DESC)$/iu, "").trim(),
  );
}

/**
 * 重複によって余る行数を返すスカラー副問い合わせ。
 *
 * `countNulls` が false のときは NULL を持つ行を母集合から外す。unique index は
 * NULL どうしを衝突と見なさないため（PRIMARY KEY だけが例外）。
 */
function duplicateCountScalar(
  table: string,
  columns: readonly string[],
  predicate: string | null,
  countNulls: boolean,
): string {
  const keys = columns.join(", ");
  const notNull = columns
    .map((column) => `(${column}) IS NOT NULL`)
    .join(" AND ");
  const where = [countNulls ? null : notNull, predicate]
    .filter((clause): clause is string => clause !== null && clause.length > 0)
    .map((clause) => `(${clause})`)
    .join(" AND ");
  const filter = where.length > 0 ? ` WHERE ${where}` : "";
  return (
    `SELECT COALESCE(SUM(extra), 0) FROM (` +
    `SELECT COUNT(*) - 1 AS extra FROM ${quote(table)}${filter} ` +
    `GROUP BY ${keys} HAVING COUNT(*) > 1) AS duplicates`
  );
}

/** 一意性の違反行数を 1 列 1 行で返す SQL。 */
function uniquenessProbe(
  table: string,
  columns: readonly string[],
  predicate: string | null,
  countNulls: boolean,
): string {
  return `SELECT (${duplicateCountScalar(table, columns, predicate, countNulls)})::int AS n`;
}

/**
 * 1 文を分類する。
 *
 * 判定できない文は `unknown` にする。「知らないものは安全」にすると、
 * 新しい種類の DDL が黙って素通りして、この道具が「確認した」という記録だけの
 * ものになる。
 */
export function classifyStatement(statement: string): Classified {
  const sql = statement.replace(/\s+/gu, " ").trim();
  const head = sql.slice(0, 90);

  const createTable = new RegExp(
    `^CREATE TABLE (?:IF NOT EXISTS )?${IDENT}`,
    "iu",
  ).exec(sql);
  const createdTable = createTable?.[1];
  if (createdTable !== undefined) {
    return { kind: "creates-table", table: createdTable };
  }

  // --- ALTER TABLE ... ADD CONSTRAINT ------------------------------------
  const addConstraint = new RegExp(
    `^ALTER TABLE (?:ONLY )?${IDENT} ADD CONSTRAINT ${IDENT} (.*)$`,
    "iu",
  ).exec(sql);
  const constraintTable = addConstraint?.[1];
  const constraintName = addConstraint?.[2];
  const body = addConstraint?.[3];
  if (
    constraintTable !== undefined &&
    constraintName !== undefined &&
    body !== undefined
  ) {
    return classifyConstraint(constraintTable, constraintName, body, head);
  }

  // --- CREATE UNIQUE INDEX ------------------------------------------------
  const uniqueIndex = new RegExp(
    // Prisma は `ON "t"("col")` と空白なしで出す。人が書く SQL は空ける。
    `^CREATE UNIQUE INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?${IDENT} ON (?:ONLY )?${IDENT}(?: USING [A-Za-z]+)? ?(\\(.*)$`,
    "iu",
  ).exec(sql);
  const indexName = uniqueIndex?.[1];
  const indexTable = uniqueIndex?.[2];
  const indexRest = uniqueIndex?.[3];
  if (
    indexName !== undefined &&
    indexTable !== undefined &&
    indexRest !== undefined
  ) {
    const columns = balanced(indexRest, 0);
    if (columns === null) return { kind: "unknown", head };
    const wherePos = indexRest.search(/\bWHERE\b/iu);
    const predicate =
      wherePos === -1 ? null : indexRest.slice(wherePos + 5).trim();
    return {
      kind: "data-dependent",
      detail: {
        table: indexTable,
        label: indexName,
        requirement: `${columnList(columns).join(", ")} が一意`,
        probe: uniquenessProbe(
          indexTable,
          columnList(columns),
          predicate,
          false,
        ),
      },
    };
  }

  // --- ALTER TABLE ... ALTER COLUMN --------------------------------------
  const alterColumn = new RegExp(
    `^ALTER TABLE (?:ONLY )?${IDENT} ALTER COLUMN ${IDENT} (.*)$`,
    "iu",
  ).exec(sql);
  const alterTable = alterColumn?.[1];
  const alterCol = alterColumn?.[2];
  const alterRest = alterColumn?.[3];
  if (
    alterTable !== undefined &&
    alterCol !== undefined &&
    alterRest !== undefined
  ) {
    return classifyAlterColumn(alterTable, alterCol, alterRest, head);
  }

  // --- ALTER TABLE ... ADD COLUMN ----------------------------------------
  const addColumn = new RegExp(
    `^ALTER TABLE (?:ONLY )?${IDENT} ADD COLUMN (?:IF NOT EXISTS )?${IDENT} (.*)$`,
    "iu",
  ).exec(sql);
  const addTable = addColumn?.[1];
  const addCol = addColumn?.[2];
  const addRest = addColumn?.[3];
  if (addTable !== undefined && addCol !== undefined && addRest !== undefined) {
    const notNull = /\bNOT NULL\b/iu.test(addRest);
    const hasDefault = /\bDEFAULT\b/iu.test(addRest);
    if (notNull && !hasDefault) {
      return {
        kind: "data-dependent",
        detail: {
          table: addTable,
          label: `${addTable}.${addCol}`,
          requirement:
            "既定値なしの NOT NULL 列を足すので、行が 0 件であること",
          probe: `SELECT COUNT(*)::int AS n FROM ${quote(addTable)}`,
        },
      };
    }
    return { kind: "safe" };
  }

  if (SAFE_STATEMENT.test(sql)) return { kind: "safe" };
  return { kind: "unknown", head };
}

function classifyConstraint(
  table: string,
  name: string,
  body: string,
  head: string,
): Classified {
  if (/^CHECK\b/iu.test(body)) {
    const expression = balanced(body, body.indexOf("("));
    if (expression === null) return { kind: "unknown", head };
    return {
      kind: "data-dependent",
      detail: {
        table,
        label: name,
        requirement: expression.trim(),
        // CHECK は式が UNKNOWN のとき通る。違反は FALSE のときだけ。
        probe: `SELECT COUNT(*)::int AS n FROM ${quote(table)} WHERE (${expression}) IS FALSE`,
      },
    };
  }

  if (/^(UNIQUE|PRIMARY KEY)\b/iu.test(body)) {
    const columns = balanced(body, body.indexOf("("));
    if (columns === null) return { kind: "unknown", head };
    const isPrimaryKey = /^PRIMARY KEY\b/iu.test(body);
    const list = columnList(columns);
    if (!isPrimaryKey) {
      return {
        kind: "data-dependent",
        detail: {
          table,
          label: name,
          requirement: `${list.join(", ")} が一意`,
          probe: uniquenessProbe(table, list, null, false),
        },
      };
    }
    // PRIMARY KEY は一意性に加えて NOT NULL も要る。NULL を除外せずに数え、
    // NULL の行数を足す。
    const nulls = list
      .map(
        (column) =>
          `(SELECT COUNT(*) FROM ${quote(table)} WHERE (${column}) IS NULL)`,
      )
      .join(" + ");
    return {
      kind: "data-dependent",
      detail: {
        table,
        label: name,
        requirement: `${list.join(", ")} が一意かつ NOT NULL`,
        probe:
          `SELECT ((${nulls}) + ` +
          `(${duplicateCountScalar(table, list, null, true)}))::int AS n`,
      },
    };
  }

  if (/^FOREIGN KEY\b/iu.test(body)) {
    const localColumns = balanced(body, body.indexOf("("));
    const referencesAt = body.search(/\bREFERENCES\b/iu);
    if (localColumns === null || referencesAt === -1) {
      return { kind: "unknown", head };
    }
    const rest = body.slice(referencesAt + "REFERENCES".length).trim();
    const parent = new RegExp(`^${IDENT}`, "u").exec(rest)?.[1];
    const parenAt = rest.indexOf("(");
    const parentColumns = parenAt === -1 ? null : balanced(rest, parenAt);
    if (parent === undefined || parentColumns === null) {
      return { kind: "unknown", head };
    }
    const child = columnList(localColumns);
    const parentList = columnList(parentColumns);
    // 列名は DDL の綴りをそのまま使う（既に `"col"` と引用されている）。
    // ここで `quote()` を重ねると `"""col"""` になって実行時に落ちる。
    const join = child
      .map((column, position) => {
        const target = parentList[position];
        return target === undefined ? null : `p.${target} = c.${column}`;
      })
      .filter((clause): clause is string => clause !== null)
      .join(" AND ");
    const notNull = child
      .map((column) => `c.${column} IS NOT NULL`)
      .join(" AND ");
    return {
      kind: "data-dependent",
      detail: {
        table,
        label: name,
        requirement: `${child.join(", ")} の参照先が ${parent} に実在する`,
        probe:
          `SELECT COUNT(*)::int AS n FROM ${quote(table)} AS c ` +
          `WHERE ${notNull} AND NOT EXISTS (` +
          `SELECT 1 FROM ${quote(parent)} AS p WHERE ${join})`,
      },
    };
  }

  if (/^EXCLUDE\b/iu.test(body)) {
    return {
      kind: "data-dependent",
      detail: {
        table,
        label: name,
        requirement: body.trim(),
        // プローブ未実装。gate が PR の時点で赤くする（docblock 参照）。
        probe: null,
      },
    };
  }

  return { kind: "unknown", head };
}

function classifyAlterColumn(
  table: string,
  column: string,
  rest: string,
  head: string,
): Classified {
  if (/^SET NOT NULL$/iu.test(rest.trim())) {
    return {
      kind: "data-dependent",
      detail: {
        table,
        label: `${table}.${column}`,
        requirement: "NULL の行が無い",
        probe: `SELECT COUNT(*)::int AS n FROM ${quote(table)} WHERE ${quote(column)} IS NULL`,
      },
    };
  }

  if (
    /^(DROP NOT NULL|SET DEFAULT\b|DROP DEFAULT|SET STATISTICS\b|SET STORAGE\b)/iu.test(
      rest.trim(),
    )
  ) {
    return { kind: "safe" };
  }

  const retype = /^(?:SET DATA )?TYPE\s+(.+)$/iu.exec(rest.trim());
  const target = retype?.[1];
  if (target !== undefined) {
    const varchar = /^(?:CHARACTER VARYING|VARCHAR)\s*\((\d+)\)/iu.exec(
      target.trim(),
    );
    const limit = varchar?.[1];
    if (limit !== undefined) {
      return {
        kind: "data-dependent",
        detail: {
          table,
          label: `${table}.${column}`,
          requirement: `${limit} 文字以下`,
          probe:
            `SELECT COUNT(*)::int AS n FROM ${quote(table)} ` +
            `WHERE LENGTH(${quote(column)}::text) > ${limit}`,
        },
      };
    }
    return {
      kind: "data-dependent",
      detail: {
        table,
        label: `${table}.${column}`,
        requirement: `${target.trim()} へ変換できる`,
        probe: null,
      },
    };
  }

  return { kind: "unknown", head };
}

/**
 * 既存行を検査しない文。
 *
 * ここに足すのは「既存の行がどうであっても成功する」文だけ。迷ったら足さずに
 * `unknown` のままにする（赤くなって気づける方が安い）。
 */
const SAFE_STATEMENT =
  /^(BEGIN|COMMIT|ROLLBACK|SET\b|SELECT\b|INSERT\b|UPDATE\b|DELETE\b|COMMENT\b|GRANT\b|REVOKE\b|ANALYZE\b|VACUUM\b|CREATE (SCHEMA|TYPE|EXTENSION|SEQUENCE|INDEX|OR REPLACE FUNCTION|FUNCTION|OR REPLACE TRIGGER|TRIGGER|CONSTRAINT TRIGGER|OR REPLACE VIEW|VIEW)\b|ALTER (TYPE|SEQUENCE|SCHEMA|EXTENSION|FUNCTION|INDEX)\b|DROP\b|ALTER TABLE (?:ONLY )?"?[A-Za-z_][A-Za-z0-9_]*"? (DROP|RENAME|ENABLE|DISABLE|OWNER|SET|CLUSTER|VALIDATE)\b)/iu;

// ---------------------------------------------------------------------------
// migration の読み取り
// ---------------------------------------------------------------------------

export interface Migration {
  readonly name: string;
  readonly sql: string;
}

export function readMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .flatMap((name) => {
      try {
        return [
          { name, sql: readFileSync(join(dir, name, "migration.sql"), "utf8") },
        ];
      } catch {
        return [];
      }
    });
}

export interface Precondition {
  readonly migration: string;
  readonly detail: DataDependentStatement;
}

export interface PlanResult {
  readonly preconditions: readonly Precondition[];
  readonly unknown: readonly {
    readonly migration: string;
    readonly head: string;
  }[];
}

/**
 * 未適用 migration から検査対象を組み立てる。
 *
 * **その migration 群が作るテーブルは除く。** 既存行が存在しえないので調べる
 * ものが無い（baseline が丸ごとここに入る）。
 */
export function planPreconditions(
  migrations: readonly Migration[],
  applied: ReadonlySet<string>,
): PlanResult {
  const preconditions: Precondition[] = [];
  const unknown: { migration: string; head: string }[] = [];
  const created = new Set<string>();

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    for (const statement of splitStatements(migration.sql)) {
      const classified = classifyStatement(statement);
      if (classified.kind === "creates-table") {
        created.add(classified.table);
        continue;
      }
      if (classified.kind === "safe") continue;
      if (classified.kind === "unknown") {
        unknown.push({ migration: migration.name, head: classified.head });
        continue;
      }
      if (created.has(classified.detail.table)) continue;
      preconditions.push({
        migration: migration.name,
        detail: classified.detail,
      });
    }
  }

  return { preconditions, unknown };
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

function parseUrl(argv: readonly string[]): string | null {
  const at = argv.indexOf("--url");
  if (at !== -1) return argv[at + 1] ?? null;
  return process.env["DATABASE_URL"] ?? null;
}

type CountRow = { readonly n: number };

export async function run(argv: readonly string[]): Promise<number> {
  const url = parseUrl(argv);
  if (url === null || url.length === 0) {
    console.error(
      "[migration-preconditions] DATABASE_URL か --url <url> が要る",
    );
    return 2;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const applied = new Set<string>();
    try {
      const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT migration_name FROM _prisma_migrations
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      for (const row of rows) applied.add(row.migration_name);
    } catch {
      console.info(
        "[migration-preconditions] _prisma_migrations が無い（空の DB）— 全 migration を対象にする",
      );
    }

    const { preconditions, unknown } = planPreconditions(
      readMigrations(),
      applied,
    );

    if (preconditions.length === 0 && unknown.length === 0) {
      console.info(
        "[migration-preconditions] 既存行を検査する未適用 DDL は無い",
      );
      return 0;
    }

    const violations: string[] = [];
    const unevaluated: string[] = [...unknown].map(
      (entry) => `${entry.migration}: 分類できない文 — ${entry.head}`,
    );

    for (const { migration, detail } of preconditions) {
      if (detail.probe === null) {
        unevaluated.push(
          `${migration} / ${detail.label}: プローブ未実装 — ${detail.requirement}`,
        );
        continue;
      }
      try {
        const rows = await prisma.$queryRawUnsafe<CountRow[]>(detail.probe);
        const count = Number(rows[0]?.n ?? 0);
        if (count > 0) {
          violations.push(
            `${migration} / ${detail.label}: ${count} 行が違反 — ${detail.requirement}`,
          );
        } else {
          console.info(`[migration-preconditions] OK  ${detail.label}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // この migration 群が足す列を参照している場合はここに来る。
        // 既存行はその列を持たないので違反しえないが、黙って通さず表示する。
        console.info(
          `[migration-preconditions] SKIP ${detail.label} — 評価できない（${message.split("\n")[0] ?? ""}）`,
        );
      }
    }

    for (const line of unevaluated) {
      console.error(`[migration-preconditions] 未評価 ${line}`);
    }
    for (const line of violations) {
      console.error(`[migration-preconditions] 違反 ${line}`);
    }

    if (violations.length > 0 || unevaluated.length > 0) {
      console.error(
        "[migration-preconditions] 適用すると migration が落ちる。" +
          "データの是正は正規のドメインコマンド経由で行う（migration 内で直さない）",
      );
      return 1;
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
