/**
 * ゲートが読む Prisma 側ソースの単一入口。
 *
 * ## なぜ集約するのか
 *
 * 多くのゲートが `prisma/schema.prisma` や **特定の migration ファイル**を
 * literal path で開いていた。後者が問題で、たとえば
 * 「`_audit_log_hash_chain` で終わるディレクトリを探して中身を検査する」形は、
 * migration 履歴を 1 本の baseline へ畳んだ瞬間に**そのディレクトリごと消えて落ちる**。
 *
 * 落ちること自体は良い（気付ける）が、直し方が「新しい migration 名を書き直す」に
 * なるのが良くない。ゲートが見たいのは**その不変条件が今も DB に存在すること**で
 * あって、どの migration が作ったかではない。
 *
 * そこで、Prisma DSL で表現できない不変条件（CHECK / EXCLUDE / plpgsql 関数 /
 * trigger / extension）の SSoT である `prisma/baseline/*.sql` を読ませる。
 * これは `scripts/build-baseline-migration.ts` が baseline に連結する当のファイルなので、
 * 履歴を畳んでも指す先が変わらない。
 *
 * ## 使い分け
 *
 * | 見たいもの | 使う関数 |
 * | --- | --- |
 * | モデル・列・index・`@@map` 等 Prisma DSL で書ける宣言 | `readPrismaSchema()` |
 * | CHECK / EXCLUDE / 関数 / trigger / extension | `readDatabaseInvariants()` |
 * | migration 履歴そのものの性質（原子性・時刻の単調性） | `migrationDirs()` / `readMigrationSql()` |
 *
 * **migration を名前で探す関数は置いていない。** 置くと元の壊れ方に戻る。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PRISMA_DIR = join(process.cwd(), "prisma");
const MIGRATIONS_DIR = join(PRISMA_DIR, "migrations");
const BASELINE_DIR = join(PRISMA_DIR, "baseline");

/** `prisma/schema.prisma` の中身。 */
export function readPrismaSchema(): string {
  return readFileSync(join(PRISMA_DIR, "schema.prisma"), "utf8");
}

/** `prisma/seed.ts` の中身。 */
export function readSeedSource(): string {
  return readFileSync(join(PRISMA_DIR, "seed.ts"), "utf8");
}

/**
 * Prisma DSL で表現できない不変条件の SSoT。
 *
 * extension（prelude）と CHECK / EXCLUDE / 関数 / trigger（postlude）を連結して返す。
 * 文字列は `pg_get_constraintdef` / `pg_get_triggerdef` / `pg_get_functiondef` が
 * 出す**正規化された形**なので、`BEFORE UPDATE ON public.audit_logs` のように
 * スキーマ修飾・クォート無しで書かれている点に注意（手書き migration の
 * `BEFORE UPDATE ON "audit_logs"` とは表記が違う）。
 */
export function readDatabaseInvariants(): string {
  return [
    readFileSync(join(BASELINE_DIR, "extensions.sql"), "utf8"),
    readFileSync(join(BASELINE_DIR, "invariants.sql"), "utf8"),
  ].join("\n");
}

/**
 * 不変条件 SQL から plpgsql 関数 1 本の本体を切り出す。
 *
 * 「この関数は自分の GUC しか見ない」のような**関数単位の性質**を検査するために要る。
 * 全不変条件を 1 ファイルにまとめた結果、ファイル全体に対する `not.toContain` は
 * 意味を失った（4 つの append-only 関数が同居するので、他テーブルの GUC 名は必ず出る）。
 */
export function readPlpgsqlFunction(name: string): string {
  const source = readDatabaseInvariants();
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) {
    throw new Error(`plpgsql 関数が見つからない: ${name}`);
  }
  const end = source.indexOf("$function$;", start);
  if (end === -1) {
    throw new Error(`plpgsql 関数の終端が見つからない: ${name}`);
  }
  return source.slice(start, end + "$function$;".length);
}

/**
 * baseline migration（`00000000000000_init`）の SQL。
 *
 * 履歴を畳んでもこのパスは変わらない（畳んだ結果がここへ書かれる）。
 * **他の migration を名前で指さないこと** — 畳んだ瞬間に消える。
 */
export function readBaselineMigration(): string {
  return readMigrationSql("00000000000000_init");
}

/** migration ディレクトリ名（昇順）。`migration.sql` を持つものだけ。 */
export function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .filter((name) => {
      try {
        statSync(join(MIGRATIONS_DIR, name, "migration.sql"));
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}

/** 指定 migration の SQL。 */
export function readMigrationSql(dirName: string): string {
  return readFileSync(join(MIGRATIONS_DIR, dirName, "migration.sql"), "utf8");
}

/** 全 migration の SQL を連結したもの（履歴横断で文字列を探す用）。 */
export function readAllMigrationSql(): string {
  return migrationDirs().map(readMigrationSql).join("\n");
}
