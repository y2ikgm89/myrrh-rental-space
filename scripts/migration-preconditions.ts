/**
 * 未適用 migration を**本当に流してから巻き戻す**ことで、既存の行に当たって
 * 落ちるかどうかを適用前に確かめる。
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
 * だけで、どの文のどの行が違反したのかは分からない。しかも
 * `_prisma_migrations` には失敗が記録されるので、**以降のデプロイが全部止まる**。
 * 復旧は本番 DB への手作業になる。予約サイトから見れば「原因不明のまま修正が
 * 何も出せない」状態が続く。
 *
 * ## なぜ「静的に調べる」のをやめたか
 *
 * 最初は migration SQL を分類してプローブ SQL を組み立てていた。多角レビューを
 * 2 巡回したところ、**毎回 10 件規模で取りこぼしが出た**（合計 21 件確定。うち
 * 素通り 9 件・通る migration を止める誤検知 12 件）。原因は全部同じで、
 * PostgreSQL の意味論を手で書き写していたこと:
 *
 *   - `ALTER TABLE` は 1 文に複数アクションを持ち、順に効く
 *   - `NOT VALID` を付けた制約は既存行を走査しない
 *   - `ALTER COLUMN … TYPE … USING <式>` は長さではなく式で落ちる
 *   - `ATTACH PARTITION` は付ける側を全走査する
 *   - `CREATE TABLE … AS SELECT` は行を持って生まれる
 *   - `varchar(n)` への縮小は末尾空白なら通る
 *   - 合成した既定値に型注釈が無いと `'10' <= '9'` が文字列比較になる
 *   - `SELECT 0 FROM (SELECT COUNT(<式>) FROM t)` は最適化されて**式を評価しない**
 *
 * 最後の 1 つは私が書いたプローブそのものが空振りしていた例で、道具が
 * 「確認した」と言いながら何も見ていなかった。**この写経は収束しない。**
 *
 * だから写すのをやめて、**PostgreSQL に評価させる**。未適用の文を 1 つの
 * トランザクションで順に流し、最後に必ず巻き戻す。判定は PostgreSQL の実挙動
 * そのもので、失敗した文と**本当のエラーメッセージ**が出る。
 *
 * ## 使い方
 *
 * ```sh
 * bun scripts/migration-preconditions.ts
 * bun scripts/migration-preconditions.ts --url postgresql://...
 * ```
 *
 * 接続先の解決は `prisma.config.ts` と同じ（`DIRECT_URL` → `DATABASE_URL`）。
 * migrate と別の DB を見ていたら意味が無い。
 *
 * ## 巻き戻しの担保
 *
 * 1. **事前検査**: トランザクション制御（`ROLLBACK` / `SAVEPOINT` / `COMMIT
 *    PREPARED` 等）と `CONCURRENTLY` が 1 つでもあれば、**何も実行せずに**止める。
 *    包み用の `BEGIN` / `COMMIT` / `END` だけは読み飛ばす
 * 2. 実行は Prisma の interactive transaction（単一コネクション）内だけ。
 *    最後に必ず例外を投げて巻き戻す
 * 3. **事後照合**: `information_schema.columns`（列の型・長さ・既定値・NULL 許可）と
 *    `pg_get_constraintdef` / `pg_indexes.indexdef`（制約・index の定義そのもの）を
 *    それぞれ md5 に畳んだ構造ハッシュ、および `_prisma_migrations` の行数を前後で比べ、
 *    変わっていたら大声で失敗する。**件数だけの比較では「本数は同じだが定義が
 *    入れ替わった」drift（例: CHECK を 1 本 DROP して別の CHECK を 1 本 ADD）を
 *    見逃す**ので、定義の中身まで畳んだハッシュにしている
 *
 * ## この方法が見ないもの
 *
 * - **リハーサル自体はデータの消失を見ない。** 流して確かめられるのは
 *   「この SQL はエラーにならない」ことだけで、**破壊はエラーではない**。
 *   `DROP COLUMN` / `DROP TABLE` / `TRUNCATE` は満杯のテーブルに対しても成功する。
 *
 *   ここを**この道具で**見ようとするのはやめた。以前は SQL を静的に分類して
 *   「破壊的文には引き継ぎの確認が要る」を強制していたが、それは上で「収束しない」
 *   と結論した写経そのもので、実際 5 回の連続レビューで塞ぎ続けることになった
 *   （schema 修飾・一時表・`EXECUTE`・`IF NOT EXISTS`・検査スコープ）。しかも
 *   分類器自身が「対象を名指ししつつ何も確かめない検査を書けば通る」と認めていた。
 *
 *   破壊的変更は代わりに 2 つの既存の仕組みが見る。どちらも自前の SQL 解析を
 *   持たない:
 *
 *   1. **squawk**（`.squawk.toml`）— `ban-drop-column` / `ban-drop-table` /
 *      `renaming-*` / `changing-column-type` を error にする。通すには SQL に
 *      `-- squawk-ignore <rule>` を明示する必要があり、それは人のレビュー対象になる
 *   2. **デプロイの計画ダウンタイムモード**（`deploy-production.yml`）— 破壊的 DDL を
 *      検出すると両サービスを停止してから migrate する
 *
 *   移送先へ入ったことを確かめたいなら、**migration 自身が
 *   `DO $$ … RAISE EXCEPTION … $$` を持つ**。リハーサルはそれごと流すので、
 *   検査は実行される。書いてあるだけの検査にはならない。
 * - **シーケンスの採番は巻き戻らない**（`nextval` は非トランザクション）。
 *   migration が identity 列を埋めると、その分だけ採番が進む
 * - 未適用が複数あるとき、それらを**1 つの**トランザクションで流す。実際は
 *   migration ごとに commit されるので、「前の migration が commit 済みである
 *   ことに依存する文」（`ALTER TYPE … ADD VALUE` の直後にその値を使う等）は
 *   ここでだけ落ちうる
 * - ロックと所要時間は本番の migrate と同じだけかかる（同じ DDL を流すため）。
 *   `lock_timeout` / `statement_timeout` を掛けてあるので、無期限に待たされ続けは
 *   しない。ただし `statement_timeout` はリハーサル全体の上限
 *   （`REHEARSAL_TIMEOUT_MS`）と同じ値にしているので、正当に長時間かかる DDL
 *   （大テーブルの書換等）を artificial に短く切ることはしない。ここで
 *   `statement_timeout` が発火するなら、**本番の `prisma migrate deploy` も同じ SQL を
 *   同じデータに対して流す以上、同じだけ時間が掛かる**（リハーサル固有の制限ではない）
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/** リハーサル 1 回の上限。本番の migrate と同じだけ掛かりうる。 */
const REHEARSAL_TIMEOUT_MS = 600_000;
/** ロック待ちの上限。本番のトラフィックを長く止めない。 */
const LOCK_TIMEOUT = "10s";
/**
 * 1 文あたりの上限。`REHEARSAL_TIMEOUT_MS` と同じ値にしてあるので、正当に
 * 長時間かかる DDL を artificial に短く切ることはない。発火するなら本番の
 * `prisma migrate deploy` も同じだけ時間が掛かる（リハーサル固有の制限ではない）。
 */
const STATEMENT_TIMEOUT = `${Math.floor(REHEARSAL_TIMEOUT_MS / 1000)}s`;

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
      // 以降の文が丸ごと 1 文に飲まれる。
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

// ---------------------------------------------------------------------------
// リハーサルで扱えない文
// ---------------------------------------------------------------------------

/** 包み用のトランザクション制御。リハーサルでは読み飛ばす。 */
const TRANSACTION_WRAPPER =
  /^(BEGIN|START\s+TRANSACTION|COMMIT|END)\s*(WORK|TRANSACTION)?\s*$/iu;

/**
 * 実行してはいけない文。
 *
 * `COMMIT PREPARED` や `SAVEPOINT` はこちらのトランザクション境界を壊し、
 * 巻き戻せなくなる（＝ migration を**本当に適用してしまう**）。
 * `CONCURRENTLY` はトランザクション内で実行できない。
 * どれも 1 つでもあれば**何も実行せずに**止める。
 */
export function rehearsalBlocker(statement: string): string | null {
  const sql = statement.replace(/\s+/gu, " ").trim();
  if (/^(ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE TRANSACTION)\b/iu.test(sql)) {
    return "トランザクション制御。リハーサルの巻き戻しを壊す";
  }
  if (/^(COMMIT|ROLLBACK) PREPARED\b/iu.test(sql)) {
    return "二相コミット。リハーサルの巻き戻しを壊す";
  }
  if (/^SET\s+TRANSACTION\b/iu.test(sql)) {
    return "トランザクション属性の変更。リハーサルの前提を壊す";
  }
  if (/\bCONCURRENTLY\b/iu.test(sql)) {
    return "CONCURRENTLY はトランザクション内で実行できない";
  }
  if (/^VACUUM\b/iu.test(sql)) {
    return "VACUUM はトランザクション内で実行できない";
  }
  return null;
}

export type RehearsalStep =
  | { readonly kind: "skip" }
  | { readonly kind: "run" }
  | { readonly kind: "blocked"; readonly reason: string };

export function planStep(statement: string): RehearsalStep {
  const sql = statement.replace(/\s+/gu, " ").trim();
  if (TRANSACTION_WRAPPER.test(sql)) return { kind: "skip" };
  const blocker = rehearsalBlocker(sql);
  if (blocker !== null) return { kind: "blocked", reason: blocker };
  return { kind: "run" };
}

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

export interface PendingStatement {
  readonly migration: string;
  readonly sql: string;
}

export interface Refusal {
  readonly migration: string;
  readonly sql: string;
  readonly reason: string;
}

/**
 * 未適用 migration の、実行すべき文を順に並べる。
 *
 * 巻き戻せない文（トランザクション制御・`CONCURRENTLY`）が 1 つでもあれば
 * `blocked` に出す。呼び出し側は **1 文も実行せずに**止める。
 */
export function pendingStatements(
  migrations: readonly Migration[],
  applied: ReadonlySet<string>,
): {
  readonly steps: readonly PendingStatement[];
  readonly blocked: readonly Refusal[];
} {
  const steps: PendingStatement[] = [];
  const blocked: Refusal[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    for (const sql of splitStatements(migration.sql)) {
      const step = planStep(sql);
      if (step.kind === "blocked") {
        blocked.push({ migration: migration.name, sql, reason: step.reason });
      } else if (step.kind === "run") {
        steps.push({ migration: migration.name, sql });
      }
    }
  }

  return { steps, blocked };
}

// ---------------------------------------------------------------------------
// DB とのやり取り
// ---------------------------------------------------------------------------

/**
 * 巻き戻し確認用の指紋。適用が漏れれば必ずどれかが動く。
 *
 * 以前はテーブル数・制約数・index 数の**件数**だけを比べていた。件数一致は
 * 「CHECK を 1 本 DROP して別の CHECK を 1 本 ADD」のような**本数が変わらない
 * drift を見逃す**。列・制約・index の**定義そのもの**を畳んだ md5 に置き換えて、
 * 内容が 1 バイトでも変われば必ずハッシュが変わるようにした。
 */
interface Fingerprint {
  /** `information_schema.columns` の (table, column, type, length, precision, default, nullable) を畳んだ md5。 */
  readonly columnsHash: string;
  /** 制約ごとの `<table>.<constraint>|pg_get_constraintdef(...)` を畳んだ md5。 */
  readonly constraintsHash: string;
  /** index ごとの `<table>.<index>|indexdef` を畳んだ md5。 */
  readonly indexesHash: string;
  readonly history: number;
}

/** `public` スキーマのユーザーテーブル数。空 DB 判定にだけ使う（指紋そのものではない）。 */
async function countPublicTables(prisma: PrismaClient): Promise<number> {
  const [row] = await prisma.$queryRawUnsafe<{ tables: bigint }[]>(
    `SELECT COUNT(*) AS tables FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  );
  return Number(row?.tables ?? 0);
}

async function readFingerprint(prisma: PrismaClient): Promise<Fingerprint> {
  const [row] = await prisma.$queryRawUnsafe<
    {
      columns_hash: string;
      constraints_hash: string;
      indexes_hash: string;
    }[]
  >(
    `WITH col_agg AS (
       SELECT coalesce(string_agg(
         table_name || '|' || column_name || '|' || data_type || '|' ||
         coalesce(character_maximum_length::text, '') || '|' ||
         coalesce(numeric_precision::text, '') || '|' ||
         coalesce(column_default, '') || '|' || is_nullable,
         E'\n' ORDER BY table_name, column_name
       ), '') AS agg
       FROM information_schema.columns
       WHERE table_schema = 'public'
     ),
     constraint_agg AS (
       -- pg_get_constraintdef は制約の本文しか返さない（表名・制約名を含まない）ので、
       -- 中身が同じ制約を別の表へ付け替える drift を見分けるために表名・制約名を前置する。
       SELECT coalesce(string_agg(
         t.relname || '.' || c.conname || '|' || pg_get_constraintdef(c.oid),
         E'\n' ORDER BY t.relname || '.' || c.conname
       ), '') AS agg
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE n.nspname = 'public'
     ),
     index_agg AS (
       SELECT coalesce(string_agg(
         tablename || '.' || indexname || '|' || indexdef,
         E'\n' ORDER BY tablename || '.' || indexname
       ), '') AS agg
       FROM pg_indexes
       WHERE schemaname = 'public'
     )
     SELECT
       md5((SELECT agg FROM col_agg)) AS columns_hash,
       md5((SELECT agg FROM constraint_agg)) AS constraints_hash,
       md5((SELECT agg FROM index_agg)) AS indexes_hash`,
  );
  let history = 0;
  try {
    const [historyRow] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM _prisma_migrations`,
    );
    history = Number(historyRow?.n ?? 0);
  } catch {
    history = -1;
  }
  return {
    columnsHash: row?.columns_hash ?? "",
    constraintsHash: row?.constraints_hash ?? "",
    indexesHash: row?.indexes_hash ?? "",
    history,
  };
}

function sameFingerprint(before: Fingerprint, after: Fingerprint): boolean {
  return (
    before.columnsHash === after.columnsHash &&
    before.constraintsHash === after.constraintsHash &&
    before.indexesHash === after.indexesHash &&
    before.history === after.history
  );
}

type History =
  | { readonly ok: true; readonly applied: ReadonlySet<string> }
  | { readonly ok: false; readonly reason: string };

/**
 * 適用済み migration の名前。
 *
 * `_prisma_migrations` が無いことを「空の DB」と読んでよいのは、**ユーザー
 * テーブルが 1 つも無いとき**だけ。テーブルはあるのに履歴が無い DB を空扱いすると、
 * baseline を丸ごと未適用として流すことになり、実態と噛み合わない。
 */
async function readMigrationHistory(
  prisma: PrismaClient,
  tables: number,
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
    if (tables > 0) {
      return {
        ok: false,
        reason:
          `migration 履歴を読めないのにテーブルが ${tables} 個ある` +
          `（${describeError(error)}）。何が未適用なのか決められない`,
      };
    }
    console.info(
      "[migration-preconditions] 空の DB（テーブルも履歴も無い）— 全 migration を対象にする",
    );
    return { ok: true, applied: new Set() };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * エラーから、**PostgreSQL が言ったこと**を取り出す。
 *
 * Prisma は本当のメッセージを ``Invalid `prisma.$executeRawUnsafe()`
 * invocation:`` という前口上で包む。素朴に先頭行を取ると、デプロイを止められた
 * 運用者に出るのがその前口上だけになり、原因が分からない
 * ——`current transaction is aborted` しか出ないのを直すための道具なのに、
 * 同じことをやってしまう。実値は `meta.driverAdapterError.cause` にある。
 */
export function describeError(error: unknown): string {
  const cause = asRecord(
    asRecord(asRecord(asRecord(error)?.["meta"])?.["driverAdapterError"])?.[
      "cause"
    ],
  );
  const driverMessage = cause?.["message"];
  if (typeof driverMessage === "string" && driverMessage.length > 0) {
    const code = cause?.["code"];
    return typeof code === "string" && code.length > 0
      ? `${code}: ${driverMessage}`
      : driverMessage;
  }

  // Error 以外が投げられたら、中身を推測せず型だけ言う（`[object Object]` を
  // 運用者に見せない）。
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : `${typeof error} が投げられた`;
  const lines = message
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  // 前口上は先頭に来るので、最後の行のほうが原因に近い。
  return lines.at(-1) ?? "（エラーメッセージなし）";
}

export interface RehearsalFailure {
  readonly migration: string;
  readonly sql: string;
  readonly error: string;
}

/**
 * `lock_timeout` / `statement_timeout` が発火したエラーか。
 *
 * どちらも「このリハーサルだから遅い」わけではなく、本番の `prisma migrate deploy`
 * が同じ SQL を同じデータに対して流せば同じだけ時間が掛かる（`statement_timeout` は
 * `REHEARSAL_TIMEOUT_MS` と同じ値）。運用者がリハーサルの不具合だと誤解しないよう、
 * その旨を追記する。
 */
export function isTimeoutError(message: string): boolean {
  return (
    /\b(55P03|57014)\b/u.test(message) ||
    /canceling statement due to (lock|statement) timeout/iu.test(message)
  );
}

/**
 * リハーサル本体。必ず巻き戻す。
 *
 * migration 自身が持つ `DO $$ … RAISE EXCEPTION … $$` もここで流れる。つまり
 * 「移送先へ入っているか」のような著者の検査は、書いてあれば必ず実行される。
 */
export async function rehearse(
  prisma: PrismaClient,
  steps: readonly PendingStatement[],
): Promise<RehearsalFailure | null> {
  if (steps.length === 0) return null;

  // `erasableSyntaxOnly` のため parameter property は使えない。
  class Done extends Error {
    readonly failure: RehearsalFailure | null;
    constructor(failure: RehearsalFailure | null) {
      super("rehearsal finished");
      this.failure = failure;
    }
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`,
        );
        await tx.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`,
        );
        for (const step of steps) {
          try {
            await tx.$executeRawUnsafe(step.sql);
          } catch (error) {
            throw new Done({
              migration: step.migration,
              sql: step.sql,
              error: describeError(error),
            });
          }
        }
        // 成功しても**必ず**投げる。commit させない。
        throw new Done(null);
      },
      { timeout: REHEARSAL_TIMEOUT_MS, maxWait: 30_000 },
    );
  } catch (error) {
    if (error instanceof Done) return error.failure;
    throw error;
  }
  // ここには来ない（必ず投げる）。来たら commit された可能性がある。
  throw new Error(
    "リハーサルが巻き戻されずに終了した。適用されている可能性がある",
  );
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

/** `prisma.config.ts` と同じ解決順。migrate と別の DB を見ないため。 */
export function resolveUrl(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): string | null {
  const at = argv.indexOf("--url");
  if (at !== -1) return argv[at + 1] ?? null;
  const direct = env["DIRECT_URL"]?.trim();
  if (direct !== undefined && direct.length > 0) return direct;
  const database = env["DATABASE_URL"]?.trim();
  return database !== undefined && database.length > 0 ? database : null;
}

function parseMigrationsDir(argv: readonly string[]): string {
  const at = argv.indexOf("--migrations");
  return at === -1 ? MIGRATIONS_DIR : (argv[at + 1] ?? MIGRATIONS_DIR);
}

export async function run(argv: readonly string[]): Promise<number> {
  const url = resolveUrl(argv, process.env);
  if (url === null) {
    console.error(
      "[migration-preconditions] DIRECT_URL / DATABASE_URL / --url <url> のいずれかが要る",
    );
    return 2;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const tablesBefore = await countPublicTables(prisma);
    const before = await readFingerprint(prisma);
    const history = await readMigrationHistory(prisma, tablesBefore);
    if (!history.ok) {
      console.error(`[migration-preconditions] ${history.reason}`);
      return 1;
    }

    const { steps, blocked } = pendingStatements(
      readMigrations(parseMigrationsDir(argv)),
      history.applied,
    );

    // **何も実行する前に**止める。巻き戻せない文が 1 つでもあれば、途中まで
    // 流してから気づくのでは遅い（そこまでの変更が commit されうる）。
    if (blocked.length > 0) {
      for (const entry of blocked) {
        console.error(
          `[migration-preconditions] リハーサル不可 ${entry.migration}: ${entry.reason}\n  ${entry.sql.slice(0, 160)}`,
        );
      }
      console.error(
        "[migration-preconditions] この migration は適用前に確かめられない。適用しない",
      );
      return 1;
    }

    if (steps.length === 0) {
      console.info("[migration-preconditions] 未適用の migration は無い");
      return 0;
    }

    console.info(
      `[migration-preconditions] ${steps.length} 文をリハーサルする（適用はしない）`,
    );
    const failure = await rehearse(prisma, steps);

    const after = await readFingerprint(prisma);
    if (!sameFingerprint(before, after)) {
      console.error(
        "[migration-preconditions] 巻き戻しが効いていない。" +
          `列定義ハッシュ ${before.columnsHash}→${after.columnsHash} / ` +
          `制約定義ハッシュ ${before.constraintsHash}→${after.constraintsHash} / ` +
          `index 定義ハッシュ ${before.indexesHash}→${after.indexesHash} / ` +
          `履歴 ${before.history}→${after.history}。` +
          "DB の状態を確認すること",
      );
      return 1;
    }

    if (failure !== null) {
      console.error(
        `[migration-preconditions] ${failure.migration} が落ちる:\n` +
          `  ${failure.sql.slice(0, 400)}\n` +
          `  → ${failure.error}`,
      );
      if (isTimeoutError(failure.error)) {
        console.error(
          "[migration-preconditions] lock_timeout / statement_timeout の発火は" +
            "このリハーサル固有の制限ではない。本番の prisma migrate deploy も" +
            "同じ SQL を同じデータに対して流す以上、同じだけ時間が掛かる",
        );
      }
      console.error(
        "[migration-preconditions] データの是正は正規のドメインコマンド経由で行う" +
          "（migration 内で直さない）",
      );
      return 1;
    }

    console.info(
      "[migration-preconditions] 全文が通った（変更は巻き戻し済み）",
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
