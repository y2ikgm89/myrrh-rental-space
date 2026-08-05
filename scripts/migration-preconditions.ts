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
 * ## 確かめられなかったものは通さない
 *
 * exit 0 を返すのは「全部評価して、違反が 0 件だった」ときだけ。次はすべて exit 1:
 *
 *   - 違反行が 1 件でもある
 *   - 分類できない文が残っている
 *   - プローブ未実装の制約がある（EXCLUDE）
 *   - **プローブを実行できなかった**
 *   - migration 履歴を読めない / 履歴が無いのにテーブルがある
 *
 * 4 番目はかつて `SKIP` のログだけ出して素通りさせていた（PR #1956 のレビュー指摘）。
 * 「列が無いのは既存行がその列を持たないからで、だから違反しえない」と考えたのが
 * 誤りで、**既存行はその列に `DEFAULT` の値を持つことになる**。既定値が制約に
 * 違反する migration は実際に落ちる。
 *
 * そこで `relationSource` が、この migration 群が足す列を既定値（無ければ NULL）で
 * 合成した副問い合わせを組み、プローブが評価できるようにしている。**評価できる
 * ようにしたうえで**、それでも実行できないものは通さない。
 *
 * 5 番目は baseline を migrate 済み DB へ当てた状態。`CREATE TABLE` を「これから
 * 作る＝既存行なし」と読むと検査対象が丸ごと消えるので、DB の実テーブルと突き合わせる。
 *
 * ## 分類の取りこぼしは静かに起きる
 *
 * 多角レビューで 8 種の取りこぼしが出た（いずれも exit 0 を返していた）。
 * 何を直したかは `migration-preconditions.test.ts` の「実際に取りこぼしていた形」に
 * 見本つきで固定してある。要点だけ:
 *
 *   - **1 文は複数のアクションを持つ**（`ADD COLUMN a …, ADD COLUMN b …`）。
 *     先頭だけ見ると 2 番目以降が消える。Prisma が普通に出す形
 *   - `INSERT` / `UPDATE` / `DELETE` は safe ではない。append-only trigger や
 *     `onDelete: Restrict` の FK に当たって落ちる
 *   - `VALIDATE CONSTRAINT` は safe ではない。全行走査そのもの
 *   - 列内制約つきの `ADD COLUMN`（`… DEFAULT '' UNIQUE`）は既定値が全行に入るので必ず衝突する
 *   - `NULLS NOT DISTINCT` では NULL 行を母集合から外せない
 *   - 式 index は一意でなくても、式が評価できない行があると落ちる
 *
 * ## 覆う範囲と、覆わないもの
 *
 * 既存行に当たって失敗しうる DDL のうち、プローブを持つのは CHECK / UNIQUE /
 * PRIMARY KEY / FOREIGN KEY / unique index / 式 index / `SET NOT NULL` /
 * `ALTER COLUMN … TYPE VARCHAR(n)` / 既定値なし NOT NULL 列の追加。
 *
 * **EXCLUDE 制約と `VALIDATE CONSTRAINT` にはプローブが無い。** どちらも
 * 既存テーブルに対して現れた瞬間に `migration-preconditions.test.ts` が
 * PR の時点で赤くなる。deploy の夜に初めて分かることにはならない。
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
  let escapeString = false;

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
      // `E'…'` はバックスラッシュ退避が効く。見落とすと閉じ位置を誤り、
      // 以降の文が丸ごと 1 文に飲まれて分類から消える。
      if (escapeString && char === "\\") {
        buffer += sql.charAt(index + 1);
        index += 2;
        continue;
      }
      if (char === "'") {
        if (sql.charAt(index + 1) === "'") {
          buffer += "'";
          index += 2;
          continue;
        }
        inSingleQuote = false;
        escapeString = false;
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
      escapeString = /[Ee]$/u.test(buffer);
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

/** 未適用 migration が既存テーブルへ足す列。プローブから見える形にするために要る。 */
export interface AddedColumn {
  readonly table: string;
  readonly column: string;
  /** 列の型（`NULL::<type>` を組み立てるのに使う）。 */
  readonly type: string;
  /** `DEFAULT` 式。無ければ `null`（既存行はその列が NULL になる）。 */
  readonly defaultSql: string | null;
}

export type Classified =
  | { readonly kind: "safe"; readonly adds: AddedColumn | null }
  | { readonly kind: "creates-table"; readonly table: string }
  | {
      readonly kind: "data-dependent";
      readonly detail: DataDependentStatement;
      readonly adds: AddedColumn | null;
    }
  | { readonly kind: "unknown"; readonly head: string };

/** 未適用 migration が足す列（テーブル物理名 → 列）。 */
export type PendingColumns = ReadonlyMap<string, readonly AddedColumn[]>;

const NO_PENDING_COLUMNS: PendingColumns = new Map();

const IDENT = '"?([A-Za-z_][A-Za-z0-9_]*)"?';

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * プローブの `FROM` に置く関係式。
 *
 * この migration 群がそのテーブルへ列を足すなら、**既存行がその列に持つことに
 * なる値**（`DEFAULT` 式、無ければ NULL）を合成した副問い合わせを返す。
 * こうしないと「列を足してから、その列に制約を付ける」migration のプローブが
 * 「列が無い」で落ち、評価できないまま素通りする。既存行が `DEFAULT` のせいで
 * 制約に違反するのは実際に起こる。
 */
function relationSource(table: string, pending: PendingColumns): string {
  const added = pending.get(table) ?? [];
  if (added.length === 0) return quote(table);
  const synthesized = added
    .map(
      (column) =>
        `${column.defaultSql ?? `NULL::${column.type}`} AS ${quote(column.column)}`,
    )
    .join(", ");
  return `(SELECT __base.*, ${synthesized} FROM ${quote(table)} AS __base)`;
}

/** `FROM <source> AS <alias>`。別名を明示すると自己参照 FK でも曖昧にならない。 */
function fromClause(
  table: string,
  pending: PendingColumns,
  alias: string = table,
): string {
  return `${relationSource(table, pending)} AS ${quote(alias)}`;
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
  pending: PendingColumns,
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
    `SELECT COUNT(*) - 1 AS extra FROM ${fromClause(table, pending)}${filter} ` +
    `GROUP BY ${keys} HAVING COUNT(*) > 1) AS duplicates`
  );
}

/** 一意性の違反行数を 1 列 1 行で返す SQL。 */
function uniquenessProbe(
  table: string,
  columns: readonly string[],
  predicate: string | null,
  countNulls: boolean,
  pending: PendingColumns,
): string {
  return `SELECT (${duplicateCountScalar(table, columns, predicate, countNulls, pending)})::int AS n`;
}

/** 列定義（`ADD COLUMN "c" <ここ>`）から型と DEFAULT を取り出す。 */
function parseAddedColumn(
  table: string,
  column: string,
  definition: string,
): AddedColumn | null {
  // 型は先頭から、列制約が始まるまで。
  const boundary =
    /\s+(?:DEFAULT|NOT\s+NULL|NULL|CONSTRAINT|GENERATED|REFERENCES|COLLATE|CHECK|UNIQUE|PRIMARY)\b/iu;
  const cut = boundary.exec(definition);
  const type = (cut === null ? definition : definition.slice(0, cut.index))
    .trim()
    .replace(/,$/u, "");
  if (type.length === 0) return null;

  const defaultAt = /\bDEFAULT\s+/iu.exec(definition);
  let defaultSql: string | null = null;
  if (defaultAt !== null) {
    const rest = definition.slice(defaultAt.index + defaultAt[0].length);
    const end =
      /\s+(?:NOT\s+NULL|NULL|CONSTRAINT|GENERATED|REFERENCES|COLLATE|CHECK|UNIQUE|PRIMARY)\b/iu.exec(
        rest,
      );
    defaultSql = (end === null ? rest : rest.slice(0, end.index))
      .trim()
      .replace(/,$/u, "");
    if (defaultSql.length === 0) return null;
  }

  return { table, column, type, defaultSql };
}

/**
 * 1 文を分類する。**1 文が複数のアクションを持つ**ので配列を返す。
 *
 * `ALTER TABLE "t" ADD COLUMN "a" …, ADD COLUMN "b" …` は Prisma が普通に出す形で、
 * 先頭だけ見ると 2 番目以降が丸ごと検査から消える。実測で 9 通りの取りこぼしが
 * ここから出た。
 *
 * 判定できないものは `unknown` にする。「知らないものは安全」にすると、
 * 新しい種類の DDL が黙って素通りして、この道具が「確認した」という記録だけの
 * ものになる。
 */
export function classifyStatement(
  statement: string,
  pending: PendingColumns = NO_PENDING_COLUMNS,
): readonly Classified[] {
  const sql = statement.replace(/\s+/gu, " ").trim();
  const head = sql.slice(0, 90);

  const createTable = new RegExp(
    `^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?${IDENT}`,
    "iu",
  ).exec(sql);
  const createdTable = createTable?.[1];
  if (createdTable !== undefined) {
    return [{ kind: "creates-table", table: createdTable }];
  }

  const index = classifyCreateIndex(sql, head, pending);
  if (index !== null) return index;

  const alterTable = new RegExp(
    `^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?${IDENT} (.*)$`,
    "iu",
  ).exec(sql);
  const table = alterTable?.[1];
  const actions = alterTable?.[2];
  if (table !== undefined && actions !== undefined) {
    return topLevelSplit(actions).flatMap((action) =>
      classifyAlterAction(table, action, head, pending),
    );
  }

  if (SAFE_STATEMENT.test(sql)) return [{ kind: "safe", adds: null }];
  return [{ kind: "unknown", head }];
}

/**
 * `CREATE [UNIQUE] INDEX`。
 *
 * 一意でない index でも**式 index は既存行に当たって落ちる**（`(x->>'k')::int` の
 * ような式が評価できない行があると build が失敗する）。式を含むなら、その式を
 * 全行に対して評価するだけのプローブを置く。評価が通れば index も張れる。
 */
function classifyCreateIndex(
  sql: string,
  head: string,
  pending: PendingColumns,
): readonly Classified[] | null {
  const match = new RegExp(
    // Prisma は `ON "t"("col")` と空白なしで出す。人が書く SQL は空ける。
    `^CREATE (UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?${IDENT} ON (?:ONLY )?${IDENT}(?: USING [A-Za-z]+)? ?(\\(.*)$`,
    "iu",
  ).exec(sql);
  if (match === null) return null;

  const unique = match[1] !== undefined;
  const name = match[2];
  const table = match[3];
  const rest = match[4];
  if (name === undefined || table === undefined || rest === undefined) {
    return [{ kind: "unknown", head }];
  }

  const columns = balanced(rest, 0);
  if (columns === null) return [{ kind: "unknown", head }];
  const tail = rest.slice(columns.length + 2);
  const wherePos = tail.search(/\bWHERE\b/iu);
  const predicate = wherePos === -1 ? null : tail.slice(wherePos + 5).trim();
  const list = columnList(columns);

  const out: Classified[] = [];
  const evaluation = expressionEvaluationProbe(table, list, pending);
  if (evaluation !== null) {
    out.push({
      kind: "data-dependent",
      adds: null,
      detail: {
        table,
        label: `${name}（式の評価）`,
        requirement: "全行で index 式を評価できる",
        probe: evaluation,
      },
    });
  }
  if (unique) {
    // `NULLS NOT DISTINCT` は NULL どうしも衝突させる。既定（DISTINCT）の
    // 「NULL 行を母集合から外す」を続けると、その形の重複を数えられない。
    const nullsNotDistinct = /\bNULLS NOT DISTINCT\b/iu.test(tail);
    out.push({
      kind: "data-dependent",
      adds: null,
      detail: {
        table,
        label: name,
        requirement: `${list.join(", ")} が一意${nullsNotDistinct ? "（NULL も衝突）" : ""}`,
        probe: uniquenessProbe(
          table,
          list,
          predicate,
          nullsNotDistinct,
          pending,
        ),
      },
    });
  }
  return out.length > 0 ? out : [{ kind: "safe", adds: null }];
}

/** 式を含む index 要素があれば、その式を全行で評価するだけの SQL を返す。 */
function expressionEvaluationProbe(
  table: string,
  elements: readonly string[],
  pending: PendingColumns,
): string | null {
  const expressions = elements.filter((element) => element.includes("("));
  if (expressions.length === 0) return null;
  const counted = expressions
    .map((expression) => `COUNT(${expression})`)
    .join(", ");
  return (
    `SELECT 0::int AS n FROM ` +
    `(SELECT ${counted} FROM ${fromClause(table, pending)}) AS __eval`
  );
}

/** `ALTER TABLE "t"` の 1 アクション。 */
function classifyAlterAction(
  table: string,
  rawAction: string,
  head: string,
  pending: PendingColumns,
): readonly Classified[] {
  const action = rawAction.trim();
  const where = `${head} …[${action.slice(0, 60)}]`;

  const addColumn = new RegExp(
    `^ADD COLUMN (?:IF NOT EXISTS )?${IDENT} (.*)$`,
    "iu",
  ).exec(action);
  const addedName = addColumn?.[1];
  const definition = addColumn?.[2];
  if (addedName !== undefined && definition !== undefined) {
    return classifyAddColumn(table, addedName, definition, where, pending);
  }

  const alterColumn = new RegExp(`^ALTER COLUMN ${IDENT} (.*)$`, "iu").exec(
    action,
  );
  const alteredName = alterColumn?.[1];
  const alterRest = alterColumn?.[2];
  if (alteredName !== undefined && alterRest !== undefined) {
    return [classifyAlterColumn(table, alteredName, alterRest, where, pending)];
  }

  const addConstraint = new RegExp(
    `^ADD (?:CONSTRAINT ${IDENT} )?(CHECK|UNIQUE|PRIMARY KEY|FOREIGN KEY|EXCLUDE)\\b(.*)$`,
    "iu",
  ).exec(action);
  const constraintName = addConstraint?.[1];
  const constraintKind = addConstraint?.[2];
  const constraintRest = addConstraint?.[3];
  if (constraintKind !== undefined && constraintRest !== undefined) {
    const fallbackName = `${table}_${constraintKind.replace(/\s+/gu, "_").toLowerCase()}`;
    return [
      classifyConstraint(
        table,
        constraintName ?? fallbackName,
        `${constraintKind}${constraintRest}`,
        where,
        pending,
      ),
    ];
  }

  if (SAFE_ALTER_ACTION.test(action)) return [{ kind: "safe", adds: null }];
  return [{ kind: "unknown", head: where }];
}

/**
 * `ADD COLUMN`。
 *
 * 列内制約（`UNIQUE` / `REFERENCES` / `CHECK` / `PRIMARY KEY` / `GENERATED … AS`）は
 * **既存行に当たって落ちる**（既定値が全行に入るので `UNIQUE` は必ず衝突する）。
 * ここでは解かず `unknown` にする — 別の `ADD CONSTRAINT` に分ければ検査できる。
 */
function classifyAddColumn(
  table: string,
  column: string,
  definition: string,
  head: string,
  pending: PendingColumns,
): readonly Classified[] {
  if (
    /\b(UNIQUE|REFERENCES|CHECK|PRIMARY KEY|GENERATED)\b/iu.test(definition)
  ) {
    return [
      {
        kind: "unknown",
        head: `${head} — 列内制約つきの ADD COLUMN は ADD CONSTRAINT に分ける`,
      },
    ];
  }

  const added = parseAddedColumn(table, column, definition);
  if (added === null) return [{ kind: "unknown", head }];
  if (/\bNOT NULL\b/iu.test(definition) && added.defaultSql === null) {
    return [
      {
        kind: "data-dependent",
        adds: added,
        detail: {
          table,
          label: `${table}.${column}`,
          requirement:
            "既定値なしの NOT NULL 列を足すので、行が 0 件であること",
          probe: `SELECT COUNT(*)::int AS n FROM ${fromClause(table, pending)}`,
        },
      },
    ];
  }
  return [{ kind: "safe", adds: added }];
}

/**
 * 既存行を検査しない `ALTER TABLE` のアクション。
 *
 * **`VALIDATE CONSTRAINT` は入れない。** `NOT VALID` で足した制約を全行走査して
 * 検証する文で、まさにこの道具が対象にすべきもの。
 */
const SAFE_ALTER_ACTION =
  /^(DROP COLUMN\b|DROP CONSTRAINT\b|RENAME\b|OWNER TO\b|SET SCHEMA\b|SET TABLESPACE\b|SET \(|RESET \(|SET WITHOUT\b|ENABLE\b|DISABLE\b|CLUSTER ON\b|SET WITH\b|ALTER CONSTRAINT\b|REPLICA IDENTITY\b|INHERIT\b|NO INHERIT\b|ATTACH PARTITION\b|DETACH PARTITION\b)/iu;

function classifyConstraint(
  table: string,
  name: string,
  body: string,
  head: string,
  pending: PendingColumns,
): Classified {
  if (/^CHECK\b/iu.test(body)) {
    const expression = balanced(body, body.indexOf("("));
    if (expression === null) return { kind: "unknown", head };
    return {
      kind: "data-dependent",
      adds: null,
      detail: {
        table,
        label: name,
        requirement: expression.trim(),
        // CHECK は式が UNKNOWN のとき通る。違反は FALSE のときだけ。
        probe: `SELECT COUNT(*)::int AS n FROM ${fromClause(table, pending)} WHERE (${expression}) IS FALSE`,
      },
    };
  }

  if (/^(UNIQUE|PRIMARY KEY)\b/iu.test(body)) {
    const columns = balanced(body, body.indexOf("("));
    if (columns === null) return { kind: "unknown", head };
    const isPrimaryKey = /^PRIMARY KEY\b/iu.test(body);
    const list = columnList(columns);
    if (!isPrimaryKey) {
      // `UNIQUE NULLS NOT DISTINCT` は NULL どうしも衝突させる。既定の
      // 「NULL 行を母集合から外す」を続けると、その形の重複を数えられない。
      const nullsNotDistinct = /\bNULLS NOT DISTINCT\b/iu.test(body);
      return {
        kind: "data-dependent",
        adds: null,
        detail: {
          table,
          label: name,
          requirement: `${list.join(", ")} が一意${nullsNotDistinct ? "（NULL も衝突）" : ""}`,
          probe: uniquenessProbe(table, list, null, nullsNotDistinct, pending),
        },
      };
    }
    // PRIMARY KEY は一意性に加えて NOT NULL も要る。NULL を除外せずに数え、
    // NULL の行数を足す。
    const nulls = list
      .map(
        (column) =>
          `(SELECT COUNT(*) FROM ${fromClause(table, pending)} WHERE (${column}) IS NULL)`,
      )
      .join(" + ");
    return {
      kind: "data-dependent",
      adds: null,
      detail: {
        table,
        label: name,
        requirement: `${list.join(", ")} が一意かつ NOT NULL`,
        probe:
          `SELECT ((${nulls}) + ` +
          `(${duplicateCountScalar(table, list, null, true, pending)}))::int AS n`,
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
        return target === undefined
          ? null
          : `__parent.${target} = __child.${column}`;
      })
      .filter((clause): clause is string => clause !== null)
      .join(" AND ");
    const notNull = child
      .map((column) => `__child.${column} IS NOT NULL`)
      .join(" AND ");
    return {
      kind: "data-dependent",
      adds: null,
      detail: {
        table,
        label: name,
        requirement: `${child.join(", ")} の参照先が ${parent} に実在する`,
        probe:
          `SELECT COUNT(*)::int AS n FROM ${fromClause(table, pending, "__child")} ` +
          `WHERE ${notNull} AND NOT EXISTS (` +
          `SELECT 1 FROM ${fromClause(parent, pending, "__parent")} WHERE ${join})`,
      },
    };
  }

  if (/^EXCLUDE\b/iu.test(body)) {
    return {
      kind: "data-dependent",
      adds: null,
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
  pending: PendingColumns,
): Classified {
  if (/^SET NOT NULL$/iu.test(rest.trim())) {
    return {
      kind: "data-dependent",
      adds: null,
      detail: {
        table,
        label: `${table}.${column}`,
        requirement: "NULL の行が無い",
        probe: `SELECT COUNT(*)::int AS n FROM ${fromClause(table, pending)} WHERE ${quote(column)} IS NULL`,
      },
    };
  }

  if (
    /^(DROP NOT NULL|SET DEFAULT\b|DROP DEFAULT|SET STATISTICS\b|SET STORAGE\b)/iu.test(
      rest.trim(),
    )
  ) {
    return { kind: "safe", adds: null };
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
        adds: null,
        detail: {
          table,
          label: `${table}.${column}`,
          requirement: `${limit} 文字以下`,
          probe:
            `SELECT COUNT(*)::int AS n FROM ${fromClause(table, pending)} ` +
            `WHERE LENGTH(${quote(column)}::text) > ${limit}`,
        },
      };
    }
    return {
      kind: "data-dependent",
      adds: null,
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
  /^(BEGIN\b|COMMIT\b|ROLLBACK\b|SET\b|SELECT\b|COMMENT\b|GRANT\b|REVOKE\b|ANALYZE\b|VACUUM\b|CREATE (SCHEMA|TYPE|EXTENSION|SEQUENCE|OR REPLACE FUNCTION|FUNCTION|OR REPLACE TRIGGER|TRIGGER|CONSTRAINT TRIGGER|OR REPLACE VIEW|VIEW)\b|ALTER (TYPE|SEQUENCE|SCHEMA|EXTENSION|FUNCTION|INDEX)\b|DROP\b)/iu;

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
    .map((name) => {
      // 読めなかったものを黙って外すと、その migration が丸ごと未検査のまま
      // 通ってしまう。読めないなら止める。
      const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
      return { name, sql };
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
  /** この migration が作るはずのテーブルが既に DB にある（履歴と実体の食い違い）。 */
  readonly conflicts: readonly {
    readonly migration: string;
    readonly table: string;
  }[];
}

/**
 * 未適用 migration から検査対象を組み立てる。
 *
 * **その migration 群が作るテーブルは除く。** 既存行が存在しえないので調べる
 * ものが無い（baseline が丸ごとここに入る）。
 *
 * ただしその判断は **DB に実在しないこと**が前提。`existingTables` を渡すと、
 * 「この migration が CREATE するはずのテーブルが既にある」状態
 * （履歴と実スキーマの食い違い。baseline を migrate 済み DB へ当てると起きる）を
 * `conflicts` として報告し、免除も取り消す。渡さない場合は免除がそのまま効くので、
 * **実行時は必ず渡す**（渡さないのはテストから純粋関数として呼ぶときだけ）。
 */
export function planPreconditions(
  migrations: readonly Migration[],
  applied: ReadonlySet<string>,
  existingTables: ReadonlySet<string> | null = null,
): PlanResult {
  const preconditions: Precondition[] = [];
  const unknown: { migration: string; head: string }[] = [];
  const conflicts: { migration: string; table: string }[] = [];
  const created = new Set<string>();
  const pending = new Map<string, AddedColumn[]>();

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    for (const statement of splitStatements(migration.sql)) {
      for (const classified of classifyStatement(statement, pending)) {
        if (classified.kind === "creates-table") {
          if (existingTables?.has(classified.table) === true) {
            conflicts.push({
              migration: migration.name,
              table: classified.table,
            });
          } else {
            created.add(classified.table);
          }
          continue;
        }
        if (classified.kind === "unknown") {
          unknown.push({ migration: migration.name, head: classified.head });
          continue;
        }
        if (classified.adds !== null) {
          const bucket = pending.get(classified.adds.table) ?? [];
          bucket.push(classified.adds);
          pending.set(classified.adds.table, bucket);
        }
        if (classified.kind === "safe") continue;
        if (created.has(classified.detail.table)) continue;
        preconditions.push({
          migration: migration.name,
          detail: classified.detail,
        });
      }
    }
  }

  return { preconditions, unknown, conflicts };
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

function parseUrl(argv: readonly string[]): string | null {
  const at = argv.indexOf("--url");
  if (at !== -1) return argv[at + 1] ?? null;
  return process.env["DATABASE_URL"] ?? null;
}

/** `--migrations <dir>`。検査そのものを実 DB で試すテストから使う。 */
function parseMigrationsDir(argv: readonly string[]): string {
  const at = argv.indexOf("--migrations");
  return at === -1 ? MIGRATIONS_DIR : (argv[at + 1] ?? MIGRATIONS_DIR);
}

type CountRow = { readonly n: number };

/** public スキーマに実在するテーブル。 */
async function readExistingTables(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT c.relname AS table_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  );
  return new Set(rows.map((row) => row.table_name));
}

type History =
  | { readonly ok: true; readonly applied: ReadonlySet<string> }
  | { readonly ok: false; readonly reason: string };

/**
 * 適用済み migration の名前。
 *
 * `_prisma_migrations` が無いことを「空の DB」と読んでよいのは、**ユーザー
 * テーブルが 1 つも無いとき**だけ。テーブルはあるのに履歴が無い DB を空扱いすると、
 * baseline の `CREATE TABLE` を「これから作る＝既存行なし」と見なして
 * 検査対象が丸ごと消え、何も確かめずに exit 0 する。
 *
 * 読み取りが別の理由（権限・接続）で失敗した場合も同じで、通してはいけない。
 */
async function readMigrationHistory(
  prisma: PrismaClient,
  existingTables: ReadonlySet<string>,
): Promise<History> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return {
      ok: true,
      applied: new Set(rows.map((row) => row.migration_name)),
    };
  } catch (error) {
    if (existingTables.has("_prisma_migrations")) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: `_prisma_migrations を読めない（${message.split("\n")[0] ?? ""}）— 適用済み migration が分からないので検査できない`,
      };
    }
    if (existingTables.size > 0) {
      return {
        ok: false,
        reason:
          `migration 履歴が無いのにテーブルが ${existingTables.size} 個ある。` +
          "履歴と実スキーマが食い違っており、何が未適用なのか決められない",
      };
    }
    console.info(
      "[migration-preconditions] 空の DB（テーブルも履歴も無い）— 全 migration を対象にする",
    );
    return { ok: true, applied: new Set() };
  }
}

type CountResult =
  | { readonly ok: true; readonly rows: number }
  | { readonly ok: false; readonly reason: string };

/** プローブを実行して違反行数を得る。数として読めなければ失敗を返す。 */
async function countViolations(
  prisma: PrismaClient,
  probe: string,
): Promise<CountResult> {
  try {
    const rows = await prisma.$queryRawUnsafe<CountRow[]>(probe);
    if (rows.length !== 1) {
      return { ok: false, reason: `${rows.length} 行返った（1 行のはず）` };
    }
    const value = Number(rows[0]?.n);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: "件数が数として読めない" };
    }
    return { ok: true, rows: value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message.split("\n")[0] ?? "不明なエラー" };
  }
}

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
    const existingTables = await readExistingTables(prisma);
    const history = await readMigrationHistory(prisma, existingTables);
    if (!history.ok) {
      console.error(`[migration-preconditions] ${history.reason}`);
      return 1;
    }

    const { preconditions, unknown, conflicts } = planPreconditions(
      readMigrations(parseMigrationsDir(argv)),
      history.applied,
      existingTables,
    );

    const violations: string[] = [];
    const unevaluated: string[] = [
      ...unknown.map(
        (entry) => `${entry.migration}: 分類できない文 — ${entry.head}`,
      ),
      ...conflicts.map(
        (entry) =>
          `${entry.migration}: CREATE TABLE ${entry.table} だがそのテーブルは既にある。` +
          `migration 履歴と実スキーマが食い違っている（baseline を migrate 済み DB へ当てた等）`,
      ),
    ];

    for (const { migration, detail } of preconditions) {
      if (detail.probe === null) {
        unevaluated.push(
          `${migration} / ${detail.label}: プローブ未実装 — ${detail.requirement}`,
        );
        continue;
      }
      const count = await countViolations(prisma, detail.probe);
      if (count.ok) {
        if (count.rows > 0) {
          violations.push(
            `${migration} / ${detail.label}: ${count.rows} 行が違反 — ${detail.requirement}`,
          );
        } else {
          console.info(`[migration-preconditions] OK  ${detail.label}`);
        }
        continue;
      }
      // **評価できなかったものを通さない。** ここを握り潰すと、この道具は
      // 「確認した」という記録だけになる。列を足してから制約を付ける migration は
      // `relationSource` が既定値を合成して評価できるようにしてあるので、
      // ここに来るのは想定外の形だけ。
      unevaluated.push(
        `${migration} / ${detail.label}: プローブを実行できない（${count.reason}）— ${detail.requirement}`,
      );
    }

    for (const line of unevaluated) {
      console.error(`[migration-preconditions] 未評価 ${line}`);
    }
    for (const line of violations) {
      console.error(`[migration-preconditions] 違反 ${line}`);
    }

    if (violations.length > 0 || unevaluated.length > 0) {
      console.error(
        "[migration-preconditions] このまま適用すると migration が落ちるか、" +
          "落ちないことを確かめられない。データの是正は正規のドメインコマンド経由で行う" +
          "（migration 内で直さない）",
      );
      return 1;
    }

    console.info(
      preconditions.length === 0
        ? "[migration-preconditions] 既存行を検査する未適用 DDL は無い"
        : `[migration-preconditions] ${preconditions.length} 件すべて違反なし`,
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
