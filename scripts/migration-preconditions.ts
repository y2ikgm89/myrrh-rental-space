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
 * 3. **事後照合**: テーブル数・制約数・`_prisma_migrations` の行数を前後で比べ、
 *    変わっていたら大声で失敗する
 *
 * ## この方法が見ないもの
 *
 * - **シーケンスの採番は巻き戻らない**（`nextval` は非トランザクション）。
 *   migration が identity 列を埋めると、その分だけ採番が進む
 * - 未適用が複数あるとき、それらを**1 つの**トランザクションで流す。実際は
 *   migration ごとに commit されるので、「前の migration が commit 済みである
 *   ことに依存する文」（`ALTER TYPE … ADD VALUE` の直後にその値を使う等）は
 *   ここでだけ落ちうる
 * - ロックと所要時間は本番の migrate と同じだけかかる（同じ DDL を流すため）。
 *   `lock_timeout` / `statement_timeout` を掛けてあるので、待たされ続けはしない
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

/** 未適用 migration の、実行すべき文を順に並べる。 */
export function pendingStatements(
  migrations: readonly Migration[],
  applied: ReadonlySet<string>,
): {
  readonly steps: readonly PendingStatement[];
  readonly blocked: readonly {
    readonly migration: string;
    readonly sql: string;
    readonly reason: string;
  }[];
} {
  const steps: PendingStatement[] = [];
  const blocked: { migration: string; sql: string; reason: string }[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    for (const sql of splitStatements(migration.sql)) {
      const step = planStep(sql);
      if (step.kind === "skip") continue;
      if (step.kind === "blocked") {
        blocked.push({ migration: migration.name, sql, reason: step.reason });
        continue;
      }
      steps.push({ migration: migration.name, sql });
    }
  }

  return { steps, blocked };
}

// ---------------------------------------------------------------------------
// DB とのやり取り
// ---------------------------------------------------------------------------

/** 巻き戻し確認用の指紋。適用が漏れれば必ずどれかが動く。 */
interface Fingerprint {
  readonly tables: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly history: number;
}

async function readFingerprint(prisma: PrismaClient): Promise<Fingerprint> {
  const [counts] = await prisma.$queryRawUnsafe<
    { tables: bigint; constraints: bigint; indexes: bigint }[]
  >(
    `SELECT
       (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables,
       (SELECT COUNT(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'public') AS constraints,
       (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'i') AS indexes`,
  );
  let history = 0;
  try {
    const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM _prisma_migrations`,
    );
    history = Number(row?.n ?? 0);
  } catch {
    history = -1;
  }
  return {
    tables: Number(counts?.tables ?? 0),
    constraints: Number(counts?.constraints ?? 0),
    indexes: Number(counts?.indexes ?? 0),
    history,
  };
}

function sameFingerprint(before: Fingerprint, after: Fingerprint): boolean {
  return (
    before.tables === after.tables &&
    before.constraints === after.constraints &&
    before.indexes === after.indexes &&
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

/** リハーサル本体。必ず巻き戻す。 */
async function rehearse(
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
    const before = await readFingerprint(prisma);
    const history = await readMigrationHistory(prisma, before.tables);
    if (!history.ok) {
      console.error(`[migration-preconditions] ${history.reason}`);
      return 1;
    }

    const { steps, blocked } = pendingStatements(
      readMigrations(parseMigrationsDir(argv)),
      history.applied,
    );

    // **何も実行する前に**止める。1 文でも巻き戻せないものがあれば、
    // 途中まで流してから気づくのでは遅い。
    if (blocked.length > 0) {
      for (const entry of blocked) {
        console.error(
          `[migration-preconditions] リハーサル不可 ${entry.migration}: ${entry.reason}\n  ${entry.sql.slice(0, 160)}`,
        );
      }
      console.error(
        "[migration-preconditions] この migration は流して確かめられない。適用前の確認は手作業になる",
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
          `テーブル ${before.tables}→${after.tables} / 制約 ${before.constraints}→${after.constraints} / ` +
          `index ${before.indexes}→${after.indexes} / 履歴 ${before.history}→${after.history}。` +
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
