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
 *   だから破壊的文は別立てで扱う（`planMigration`）。対象を名指しする
 *   `DO $$ … RAISE EXCEPTION … $$` を migration 自身が持つか、`HANDOVERS` に
 *   登録があること。登録があるぶんは**リハーサルの途中で**その SQL を流し、
 *   0 でなければそこで止める。どちらも無い破壊は 1 文も実行せずに拒否する
 * - 検査や `countUnhandedOver` の**中身**が正しいかは見ない。対象を名指ししつつ
 *   何も確かめない検査を書けば通る（静的には判定できない）
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
  /**
   * この文を実行する**前に**確かめる引き継ぎ。
   *
   * リハーサルの途中で評価する。適用前のスナップショットで評価すると、
   * 先行する未適用 migration が表を作った／列名を変えた後の状態を見られず、
   * 「まだ無い」として黙って飛ばすことになる。
   */
  readonly handovers: readonly Handover[];
}

export interface Refusal {
  readonly migration: string;
  readonly sql: string;
  readonly kind: "rehearsal" | "handover";
  readonly reason: string;
}

/** 未適用 migration の、実行すべき文を順に並べる。 */
export function pendingStatements(
  migrations: readonly Migration[],
  applied: ReadonlySet<string>,
  handovers: readonly Handover[] = HANDOVERS,
): {
  readonly steps: readonly PendingStatement[];
  readonly blocked: readonly Refusal[];
} {
  const steps: PendingStatement[] = [];
  const blocked: Refusal[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const plan = planMigration(migration.sql, handovers);
    for (const step of plan.steps) {
      steps.push({ migration: migration.name, ...step });
    }
    for (const refusal of plan.refusals) {
      blocked.push({ migration: migration.name, ...refusal });
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
 * 破壊的文の**直前**に、その文に紐づいた引き継ぎを評価する。ここで評価するのは、
 * 適用前のスナップショットでは答えが出ないから。移送先の表を作るのが同じ未適用の
 * 束に入っていれば「まだ無い」となり、先行 migration が列名を変えていれば
 * 「その名前の列は無い」となって、どちらも黙って飛ばすことになる。
 * リハーサルの途中なら、その文が実際に走る直前と同じ状態を見られる。
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
          for (const handover of step.handovers) {
            let gap: number;
            try {
              gap = readGapCount(
                await tx.$queryRawUnsafe<Record<string, unknown>[]>(
                  handover.countUnhandedOver,
                ),
              );
            } catch (error) {
              // 確かめられなかったことと、確かめて 0 だったことは違う。
              throw new Done({
                migration: step.migration,
                sql: step.sql,
                error:
                  `${handover.target} の引き継ぎを確かめられない（${describeError(error)}）。` +
                  `HANDOVERS の countUnhandedOver を直す`,
              });
            }
            if (gap > 0) {
              throw new Done({
                migration: step.migration,
                sql: step.sql,
                error: `${handover.what}（${gap} 件）→ ${handover.remedy}`,
              });
            }
          }
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

/**
 * 破壊の**引き継ぎ先**。
 *
 * ## なぜ登録制なのか
 *
 * 破壊的文が安全かどうかは「その列にまだ値があるか」では決まらない。
 * expand/contract では、値を別の表へ**移し終えた後も元の列は埋まったまま**で、
 * そこを DROP するのが contract そのものだからだ（`special_holidays` →
 * `blocked_dates` がまさにそれで、移送スクリプトは元列を空にしない）。
 * 汎用の「値があるか」を使うと、正しく移送を終えたデプロイを恒久的に止める。
 *
 * 本当の前提は「**移送先に入っているか**」で、これは migration の著者にしか
 * 書けない。著者が `DO $$ … RAISE EXCEPTION … $$` を migration 内に置いた場合は
 * それが答えになる（リハーサルがその検査ごと流す）。置けなかった場合——
 * commit 済みの migration は編集できない（絶対規約 #7）——ぶんを、ここに書く。
 *
 * ## 何が起きたか
 *
 * 移送の実行を **migration ヘッダの散文**で指示したまま `DROP COLUMN` する
 * migration が 1 本あり、本番に未適用だった。散文は誰も実行しないので、
 * 流せば移し損ねた休業日が黙って消える（CX-3）。ヘッダに書いたことは
 * 「書いた」以上の意味を持たない。実行される形に移す。
 *
 * ## 書き方
 *
 * `countUnhandedOver` は **1 行 1 列 `n`** を返す SQL。0 でなければデプロイを
 * 止める。数えるのは「引き継がれていない件数」であって「残っている件数」ではない。
 */
export interface Handover {
  /** 破壊の対象。表なら `t`、列なら `t.c`。 */
  readonly target: string;
  /** 引き継がれていない件数を数える SQL（1 行 1 列 `n`）。 */
  readonly countUnhandedOver: string;
  /** 0 でなかったとき、顧客が何を失うか。 */
  readonly what: string;
  /** 直す手順。**実行できるコマンド**で書く。 */
  readonly remedy: string;
}

export const HANDOVERS: readonly Handover[] = [
  {
    target: "locations.special_holidays",
    what: "拠点の特別休業日が BlockedDate に無いまま消える",
    // jsonb_array_elements_text は配列以外で落ちるので、CASE で空配列に寄せる
    // （CASE は選ばれた枝しか評価しない）。日付として読めない値は
    // `start_date = NULL` になり、どの行にも一致せず「未引き継ぎ」に数える——
    // 移送スクリプトもそれを飛ばすので、消える側の値であることは変わらない。
    // `String.raw` は必須。素のテンプレートリテラルだと `\d` が `d` に潰れ、
    // 日付が 1 件も読めなくなって全件を「未引き継ぎ」と報告する。
    countUnhandedOver: String.raw`
      WITH entries AS (
        SELECT l.id AS location_id, d.day AS day
        FROM locations l
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(l.special_holidays) = 'array'
               THEN l.special_holidays ELSE '[]'::jsonb END
        ) AS d(day)
      )
      SELECT count(*) AS n
      FROM entries e
      WHERE NOT EXISTS (
        SELECT 1 FROM blocked_dates b
        WHERE b.scope = 'LOCATION'
          AND b.location_id = e.location_id
          AND b.start_date = (CASE WHEN e.day ~ '^\d{4}-\d{2}-\d{2}$'
                                   THEN e.day::date ELSE NULL END)
          AND b.end_date = (CASE WHEN e.day ~ '^\d{4}-\d{2}-\d{2}$'
                                 THEN e.day::date ELSE NULL END)
      )`,
    remedy:
      "bun scripts/backfill-special-holidays-to-blocked-dates.ts --actor <userId> --apply",
  },
];

// ---------------------------------------------------------------------------
// 破壊的な文
// ---------------------------------------------------------------------------

/**
 * コメントと文字列リテラルを潰す。
 *
 * 潰さないと両方向に壊れる。`ADD COLUMN note text DEFAULT 'do not DROP COLUMN x'`
 * が破壊に見え（編集できない migration でデプロイが恒久停止する）、
 * `DO $$ BEGIN -- RAISE EXCEPTION 'あとで書く' … END $$` が検査に見える
 * （以降の破壊が全部免許される）。どちらも実測で確認した。
 *
 * ドル引用符の中身は**保持したうえで再帰的に潰す**。中の DDL を見たいからで、
 * 中のコメントに騙されたくないからでもある。引用識別子はそのまま残す（名前なので要る）。
 */
export function stripNoise(sql: string): string {
  let out = "";
  let index = 0;

  while (index < sql.length) {
    const pair = sql.slice(index, index + 2);

    if (pair === "--") {
      const newline = sql.indexOf("\n", index);
      out += " ";
      index = newline === -1 ? sql.length : newline;
      continue;
    }

    if (pair === "/*") {
      // PostgreSQL の block comment は入れ子になる。
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      out += " ";
      continue;
    }

    const char = sql.charAt(index);

    if (char === "'") {
      const escapeString = /[Ee]$/u.test(out);
      index += 1;
      while (index < sql.length) {
        const inner = sql.charAt(index);
        if (escapeString && inner === "\\") {
          index += 2;
          continue;
        }
        if (inner === "'") {
          if (sql.charAt(index + 1) === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      out += "''";
      continue;
    }

    if (char === '"') {
      out += char;
      index += 1;
      while (index < sql.length) {
        const inner = sql.charAt(index);
        out += inner;
        index += 1;
        if (inner === '"') {
          if (sql.charAt(index) === '"') {
            out += '"';
            index += 1;
            continue;
          }
          break;
        }
      }
      continue;
    }

    const dollar = /^\$[A-Za-z_]*\$/u.exec(sql.slice(index));
    const tag = dollar?.[0];
    if (tag !== undefined) {
      const close = sql.indexOf(tag, index + tag.length);
      const end = close === -1 ? sql.length : close;
      out += tag + stripNoise(sql.slice(index + tag.length, end)) + tag;
      index = close === -1 ? sql.length : close + tag.length;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/** 1 行に潰した、コメント・文字列抜きの SQL。判定はすべてこれに対して行う。 */
function normalize(statement: string): string {
  return stripNoise(statement).replace(/\s+/gu, " ").trim();
}

/**
 * 識別子。引用符つき（内部に空白・ドット・非 ASCII を含みうる）と裸の両方。
 *
 * PostgreSQL は**裸の識別子を小文字に畳む**。`ALTER TABLE Locations` が消すのは
 * `locations` で、`pg_class.relname` もそう返す。畳まないと名前が一致しない。
 */
const IDENT = String.raw`(?:"(?:[^"]|"")*"|[\p{L}_][\p{L}\p{N}_$]*)`;

function bareIdent(raw: string): string {
  return raw.startsWith('"')
    ? raw.slice(1, -1).replace(/""/gu, '"')
    : raw.toLowerCase();
}

/**
 * `[ONLY] [schema.]name [*]` の並びから表名を取り出す。読めなければ**空**。
 *
 * public 以外の schema 修飾は読めない扱いにする。この道具は public schema しか
 * 相手にしていないので、修飾つきを素通しすると別 schema の表を同名の public 表と
 * 取り違える。読めないものは呼び出し側が拒否に倒す。
 */
export function parseTableList(list: string): string[] {
  const names: string[] = [];
  for (const item of list.split(",")) {
    const match = new RegExp(
      String.raw`^\s*(?:ONLY\s+)?(?:(${IDENT})\s*\.\s*)?(${IDENT})\s*\*?\s*$`,
      "iu",
    ).exec(item);
    const schema = match?.[1];
    const name = match?.[2];
    if (name === undefined) return [];
    if (schema !== undefined && bareIdent(schema) !== "public") return [];
    names.push(bareIdent(name));
  }
  return names;
}

/**
 * `ALTER TABLE` の DROP アクションのうち、**列**を落とすもの。
 *
 * `COLUMN` は省略できる（`ALTER TABLE t DROP c` は有効な SQL）。`DROP` で始まる
 * 他のアクション（CONSTRAINT / DEFAULT / NOT NULL / EXPRESSION / IDENTITY）は
 * 行も値も消さないので除く。
 */
function dropColumnNames(normalized: string): string[] {
  return [
    ...normalized.matchAll(
      new RegExp(
        String.raw`\bDROP\s+(?!CONSTRAINT\b|DEFAULT\b|NOT\b|EXPRESSION\b|IDENTITY\b)(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(${IDENT})`,
        "giu",
      ),
    ),
  ].flatMap((match) => (match[1] === undefined ? [] : [bareIdent(match[1])]));
}

/**
 * 行や値を失わせる文か。
 *
 * 文の**先頭の動詞**で見る。部分一致にすると `CREATE TRIGGER … BEFORE TRUNCATE ON t`
 * が破壊に見える（実測: TRUNCATE を禁じる trigger を定義した migration 1 本が
 * 素朴な grep に 6 回当たり、全部が防御の定義だった）。
 *
 * `DO $$ … $$` の中に静的に書いた破壊も数える。中は plpgsql なので対象を
 * 読み切れないが、「見えないから無い」にはしない——`destructionTargets` が空を
 * 返し、呼び出し側が拒否に倒す。
 *
 * `DO` ブロックの `EXECUTE` は**中身を見ずに**破壊として扱う。動的 SQL の本体は
 * 文字列リテラルなので `stripNoise` が潰し、`EXECUTE 'TRUNCATE audit_logs'` が
 * 「何も破壊しない DO ブロック」に見える。潰さない選択肢は取れない——潰さないと
 * 今度は無害な文字列が破壊に化ける。読めないものは読めないと認めて拒否に倒す。
 */
export function isDestructiveStatement(statement: string): boolean {
  const sql = normalize(statement);
  if (/^TRUNCATE\b/iu.test(sql)) return true;
  if (/^DROP\s+(?:TABLE|SCHEMA)\b/iu.test(sql)) return true;
  // WHERE の無い DELETE は表を空にする。条件付きは著者の検査の領分。
  if (/^DELETE\s+FROM\b/iu.test(sql) && !/\bWHERE\b/iu.test(sql)) return true;
  if (/^ALTER\s+TABLE\b/iu.test(sql) && dropColumnNames(sql).length > 0) {
    return true;
  }
  if (/^DO\b/iu.test(sql)) {
    return (
      /\bEXECUTE\b/iu.test(sql) ||
      /\bTRUNCATE\b/iu.test(sql) ||
      /\bDROP\s+(?:TABLE|SCHEMA)\b/iu.test(sql) ||
      dropColumnNames(sql).length > 0
    );
  }
  return false;
}

/**
 * 破壊的文が消す対象（表なら `t`、列なら `t.c`）。
 *
 * **空を返したら「破壊ではない」ではない。** `isDestructiveStatement` が真なのに
 * ここが空なら「消すのは分かるが何を消すか読めない」で、呼び出し側は拒否に倒す。
 * 2 つのパーサが食い違ったとき黙って通す道を残さないための約束で、実際に
 * `ALTER TABLE public.t DROP COLUMN c` がその形で両方の関門から消えていた。
 */
export function destructionTargets(statement: string): string[] {
  const sql = normalize(statement);

  const truncate = new RegExp(
    String.raw`^TRUNCATE\s+(?:TABLE\s+)?(.*?)(?:\s+(?:RESTART|CONTINUE)\s+IDENTITY)?(?:\s+(?:CASCADE|RESTRICT))?$`,
    "iu",
  ).exec(sql);
  if (truncate?.[1] !== undefined) return parseTableList(truncate[1]);

  const dropTable = new RegExp(
    String.raw`^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(.*?)(?:\s+(?:CASCADE|RESTRICT))?$`,
    "iu",
  ).exec(sql);
  if (dropTable?.[1] !== undefined) return parseTableList(dropTable[1]);

  if (/^DELETE\s+FROM\b/iu.test(sql) && !/\bWHERE\b/iu.test(sql)) {
    const deleteAll = new RegExp(
      String.raw`^DELETE\s+FROM\s+(?:ONLY\s+)?(.*?)\s*$`,
      "iu",
    ).exec(sql);
    if (deleteAll?.[1] !== undefined) return parseTableList(deleteAll[1]);
  }

  const alter = new RegExp(
    String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(${IDENT})\s*\.\s*)?(${IDENT})\s*\*?\s`,
    "iu",
  ).exec(sql);
  const schema = alter?.[1];
  const table = alter?.[2];
  if (table === undefined) return [];
  if (schema !== undefined && bareIdent(schema) !== "public") return [];

  return dropColumnNames(sql).map((column) => `${bareIdent(table)}.${column}`);
}

/**
 * **実行される**検査か。
 *
 * `DO $$ … RAISE EXCEPTION … $$` だけを数える。`CREATE FUNCTION … RAISE EXCEPTION`
 * は関数を**定義する**だけで、その migration の中では 1 度も評価されない。
 */
export function isExecutedAssertion(statement: string): boolean {
  const sql = normalize(statement);
  return /^DO\b/iu.test(sql) && /\bRAISE\s+EXCEPTION\b/iu.test(sql);
}

/** 文が名指ししている識別子（小文字化・引用符外し済み）。 */
export function namedIdentifiers(statement: string): Set<string> {
  const names = new Set<string>();
  for (const match of normalize(statement).matchAll(new RegExp(IDENT, "gu"))) {
    names.add(bareIdent(match[0]));
  }
  return names;
}

/**
 * その migration 内で**確実に新しく作られた**表・列を覚える（消しても失うものが無い）。
 *
 * `IF NOT EXISTS` が付いたものは覚えない。既存があれば何もしない構文なので、
 * 「作った」と「元からあった」を区別できない。区別できないものを「作った」側に
 * 倒すと、既存の本番データを持つ列がそのまま免除される。
 *
 * public 以外の schema 修飾も覚えない。この道具は public schema しか相手にして
 * いないので、`CREATE TABLE archive.audit_logs` を覚えると、後から
 * `DROP TABLE public.audit_logs` した時に「さっき作ったやつ」と取り違える。
 */
function rememberCreated(statement: string, into: Set<string>): void {
  const sql = normalize(statement);

  const created = new RegExp(
    // 末尾に `\b` は置かない。引用識別子は `"` で終わるので、直後が `(` だと
    // 語境界にならず 1 件も当たらない（`CREATE TABLE "t" (…)` がまさにその形）。
    String.raw`^CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:(${IDENT})\s*\.\s*)?(${IDENT})`,
    "iu",
  ).exec(sql);
  const table = created?.[2];
  if (table !== undefined) {
    const schema = created?.[1];
    if (
      !/\bIF\s+NOT\s+EXISTS\b/iu.test(sql) &&
      (schema === undefined || bareIdent(schema) === "public")
    ) {
      into.add(bareIdent(table));
    }
    return;
  }

  const altered = new RegExp(
    String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(${IDENT})\s*\.\s*)?(${IDENT})\s`,
    "iu",
  ).exec(sql);
  const alteredSchema = altered?.[1];
  const alteredTable = altered?.[2];
  if (alteredTable === undefined) return;
  if (alteredSchema !== undefined && bareIdent(alteredSchema) !== "public") {
    return;
  }
  // `IF NOT EXISTS` は**アクションごと**に付く。文全体で見ると、同じ
  // `ALTER TABLE` の別のアクションに付いた 1 つが全部を免除してしまう。
  for (const match of sql.matchAll(
    new RegExp(
      String.raw`\bADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?(${IDENT})`,
      "giu",
    ),
  )) {
    const column = match[2];
    if (match[1] === undefined && column !== undefined) {
      into.add(`${bareIdent(alteredTable)}.${bareIdent(column)}`);
    }
  }
}

export interface PlannedStatement {
  readonly sql: string;
  readonly handovers: readonly Handover[];
}

export interface PlannedRefusal {
  readonly sql: string;
  readonly kind: "rehearsal" | "handover";
  readonly reason: string;
}

/**
 * 1 本の migration を読み、各文に「実行前に確かめる引き継ぎ」を付ける。
 *
 * **CI の gate も、デプロイ経路も、fixture もこの関数だけを呼ぶ。** 以前は
 * 静的 gate とデプロイ経路が別々に判定していて、`ALTER TABLE public.t DROP COLUMN c`
 * のように片方だけが見落とす形が実在した（`.claude/rules/testing-unit.md` の 4 点目）。
 *
 * 破壊が許されるのは次のいずれか。どれでもなければ `refusals` に出る。
 *
 * 1. **同じ migration の中で作った**表・列を消す（失うものが無い）
 * 2. **先行する検査が対象を名指ししている**。`DO $$ … RAISE EXCEPTION … $$` が
 *    表名と列名の**両方**に触れていること。単に「検査が 1 つある」では足りず、
 *    列名だけでも足りない——前者は無関係な表の破壊を全部免許し、後者は
 *    `events.memo` を見た検査が `locations.memo` の DROP を通した
 * 3. `HANDOVERS` に対象の登録がある。リハーサル中にその SQL を流して 0 を確かめる
 *
 * ## この関数が見ないもの
 *
 * - 検査や `countUnhandedOver` の**中身**が正しいか。対象を名指ししつつ何も
 *   確かめない検査を書けば通る（静的には判定できない）
 * - `WHERE` 付きの `DELETE` / `UPDATE` による値の消失。条件次第で失われるかが
 *   決まるので、そこは著者の検査の領分
 * - `ALTER COLUMN … TYPE … USING <式>` による切り捨て
 * - `EXECUTE '…'` で組み立てた動的な破壊（`DO` ブロックごと拒否に倒す）
 */
export function planMigration(
  migrationSql: string,
  handovers: readonly Handover[] = HANDOVERS,
): { steps: PlannedStatement[]; refusals: PlannedRefusal[] } {
  const steps: PlannedStatement[] = [];
  const refusals: PlannedRefusal[] = [];

  const guarded = new Set<string>();
  const created = new Set<string>();

  for (const sql of splitStatements(migrationSql)) {
    const step = planStep(sql);
    if (step.kind === "blocked") {
      refusals.push({ sql, kind: "rehearsal", reason: step.reason });
      continue;
    }

    if (isDestructiveStatement(sql)) {
      const targets = destructionTargets(sql);
      if (targets.length === 0) {
        refusals.push({
          sql,
          kind: "handover",
          reason:
            "破壊的だが何を消すか読み取れない。素の表名で書く" +
            "（schema 修飾・DO ブロック内の破壊・動的 SQL は読めない）",
        });
        continue;
      }

      const needed: Handover[] = [];
      let refused = false;
      for (const target of targets) {
        const [table = target, column = target] = target.includes(".")
          ? target.split(".")
          : [target, target];
        // 表ごと同じ migration で作ったなら、その列を消しても失うものが無い。
        if (created.has(target) || created.has(table)) continue;
        // 検査は**表と列の両方**を名指ししていること。列名だけで照合すると、
        // 別の表の同名列を見た検査が無関係な破壊を免除する（`events.memo` を
        // 見た検査が `locations.memo` の DROP を通していた）。
        if (guarded.has(table) && guarded.has(column)) continue;
        const handover = handovers.find((entry) => entry.target === target);
        if (handover === undefined) {
          refusals.push({
            sql,
            kind: "handover",
            reason:
              `${target} を消すが引き継ぎの確認が無い。` +
              "対象を名指しする DO $$ … RAISE EXCEPTION … $$ を前に置くか、HANDOVERS に登録する",
          });
          refused = true;
          continue;
        }
        needed.push(handover);
      }
      if (refused) continue;
      if (step.kind === "run") steps.push({ sql, handovers: needed });
      continue;
    }

    if (isExecutedAssertion(sql)) {
      for (const name of namedIdentifiers(sql)) guarded.add(name);
    }
    rememberCreated(sql, created);

    if (step.kind === "run") steps.push({ sql, handovers: [] });
  }

  return { steps, refusals };
}

/**
 * 引き継がれていない件数。**読み取れなければ投げる。**
 *
 * `row?.n ?? 0` で済ませると、0 行・NULL・非数値を返す SQL が「0 件＝安全」に
 * 化けて破壊を通す。確かめられなかったことと、確かめて 0 だったことは違う。
 */
export function readGapCount(rows: readonly Record<string, unknown>[]): number {
  if (rows.length !== 1) {
    throw new Error(`1 行を返していない（${rows.length} 行）`);
  }
  const value = rows[0]?.["n"];
  const parsed =
    typeof value === "bigint" || typeof value === "number"
      ? Number(value)
      : typeof value === "string" && /^\d+$/u.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`n が有限の非負数でない（${String(value)}）`);
  }
  return parsed;
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

    // **何も実行する前に**止める。1 文でも巻き戻せないもの・引き継ぎの確認が
    // 無い破壊があれば、途中まで流してから気づくのでは遅い。
    if (blocked.length > 0) {
      for (const entry of blocked) {
        const label =
          entry.kind === "rehearsal" ? "リハーサル不可" : "引き継ぎ未定義";
        console.error(
          `[migration-preconditions] ${label} ${entry.migration}: ${entry.reason}\n  ${entry.sql.slice(0, 160)}`,
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
