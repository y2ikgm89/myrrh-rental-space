#!/usr/bin/env bun

/**
 * migration 履歴を畳んだ先の **単一 baseline** を組み立てる。
 *
 * ```
 * prisma/baseline/extensions.sql        (prelude)
 * + prisma migrate diff --from-empty --to-schema   (Prisma が出す DDL)
 * + prisma/baseline/invariants.sql      (postlude)
 * = prisma/migrations/00000000000000_init/migration.sql
 * ```
 *
 * ## なぜ 3 分割なのか
 *
 * - **extension は前**。schema.prisma の GIN index が `gin_trgm_ops` を参照するので、
 *   pg_trgm が無いと `operator class "gin_trgm_ops" does not exist` で CREATE INDEX が
 *   落ちる（実測）
 * - **不変条件は後**。CHECK / EXCLUDE / plpgsql 関数 / trigger は Prisma DSL で
 *   表現できず、生成 DDL に**一切含まれない**。対象テーブルが出来てからでないと張れない
 *
 * ## 静かに壊れる経路への防御
 *
 * `prisma migrate diff` は datasource が解決できないときでも **exit 0 のまま空の
 * --script を返す**ことがある。それを検知せずに書き出すと「空の baseline」が
 * 出来上がり、適用しても何も起きないのに成功したように見える。
 * ここでは出力の非空に加え、`CREATE TABLE` / `CREATE TYPE` の件数が
 * **schema.prisma の `model` / `enum` 宣言数と一致する**ことまで検査する。
 * 件数はハードコードせず schema.prisma から数える（固定値は必ず drift する）。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const BASELINE_DIR = join("prisma", "migrations", "00000000000000_init");
export const BASELINE_FILE = join(BASELINE_DIR, "migration.sql");
const SCHEMA_PATH = join("prisma", "schema.prisma");
const PRELUDE_PATH = join("prisma", "baseline", "extensions.sql");
const POSTLUDE_PATH = join("prisma", "baseline", "invariants.sql");

/** schema.prisma の宣言数。ここが期待値の SSoT。 */
export function countDeclarations(schemaSource: string): {
  readonly models: number;
  readonly enums: number;
} {
  return {
    models: (schemaSource.match(/^model /gmu) ?? []).length,
    enums: (schemaSource.match(/^enum /gmu) ?? []).length,
  };
}

export function countGeneratedObjects(sql: string): {
  readonly tables: number;
  readonly types: number;
} {
  return {
    tables: (sql.match(/^CREATE TABLE /gmu) ?? []).length,
    types: (sql.match(/^CREATE TYPE /gmu) ?? []).length,
  };
}

export type VerdictProblem = { readonly problem: string };

/**
 * 生成 DDL が schema.prisma を丸ごと表現しているかを検査する。
 *
 * **空を通さないことが本題。** datasource 未解決時の空出力は exit 0 で返るので、
 * 呼び出し側が非ゼロ終了に変換しないと気付けない。
 */
export function verifyGeneratedSql(
  sql: string,
  schemaSource: string,
): readonly VerdictProblem[] {
  const problems: VerdictProblem[] = [];
  if (sql.trim().length === 0) {
    problems.push({
      problem:
        "prisma migrate diff の出力が空。datasource が解決できていない可能性が高い（exit 0 でも空を返す）",
    });
    return problems;
  }

  const declared = countDeclarations(schemaSource);
  const generated = countGeneratedObjects(sql);

  if (declared.models === 0 || declared.enums === 0) {
    problems.push({
      problem: `schema.prisma の宣言が読めていない (model=${declared.models} enum=${declared.enums})`,
    });
  }
  if (generated.tables !== declared.models) {
    problems.push({
      problem: `CREATE TABLE 数が model 宣言数と一致しない: 生成=${generated.tables} 宣言=${declared.models}`,
    });
  }
  if (generated.types !== declared.enums) {
    problems.push({
      problem: `CREATE TYPE 数が enum 宣言数と一致しない: 生成=${generated.types} 宣言=${declared.enums}`,
    });
  }
  return problems;
}

/**
 * 上書き対象が持っている **データ投入文**を数える。
 *
 * ## なぜ数えるのか
 *
 * 組み立てた baseline は DDL と不変条件しか含まない。上書き対象が `INSERT` を
 * 持っていた場合、素朴に上書きすると**そのデータが消え、しかも DDL は完全なので
 * 適用も起動も成功してしまう**。かつて `00000000000000_init` が
 * `INSERT INTO public.terms_documents` を持っていた頃は、これが
 * 「利用規約・プライバシーポリシーが消え、同意ゲートの必須規約が空集合になる」
 * 経路そのものだった。
 *
 * ## 今の状態（監査 A-91）
 *
 * その `INSERT` は既に seed へ移してある。規約の SSoT は
 * `prisma/seed-terms-documents.ts` + `prisma/seed.ts` の `seedTermsDocuments()`
 * で、`00000000000000_init` の `INSERT` は 0 本。
 * `__tests__/unit/scripts/build-baseline-migration.test.ts` が
 * `countDataStatements(init) === 0` を固定している。
 *
 * つまりこのガードは今は発火しない。**壊れているのではなく、目的が達成された状態。**
 * 上書き対象は毎回読み直す（`resolveOutput` は `--out` で任意パスを取れる）ので、
 * 将来 baseline が `INSERT` を得れば発火する生きたバックストップとして残す。
 */
export function countDataStatements(sql: string): number {
  return (sql.match(/^\s*INSERT\s+INTO\s/gimu) ?? []).length;
}

export function assembleBaseline(
  prelude: string,
  generated: string,
  postlude: string,
): string {
  return [
    "-- このファイルは scripts/build-baseline-migration.ts が生成する。手で編集しない。",
    "-- 中身の出どころ: prisma/baseline/extensions.sql + prisma migrate diff + prisma/baseline/invariants.sql",
    "",
    prelude.trimEnd(),
    "",
    generated.trimEnd(),
    "",
    postlude.trimEnd(),
    "",
  ].join("\n");
}

function runMigrateDiff():
  | { readonly ok: true; readonly sql: string }
  | { readonly ok: false; readonly message: string } {
  const result = spawnSync(
    "bunx",
    [
      "--bun",
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      SCHEMA_PATH,
      "--script",
    ],
    { encoding: "utf8" },
  );
  if (result.error) {
    return {
      ok: false,
      message: `prisma migrate diff の起動に失敗: ${result.error.message}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      message: `prisma migrate diff が exit ${String(result.status)}: ${result.stderr}`,
    };
  }
  return { ok: true, sql: result.stdout };
}

export function resolveOutput(args: readonly string[]): {
  readonly out: string;
  readonly force: boolean;
} {
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  return { out: out ?? BASELINE_FILE, force: args.includes("--force") };
}

function run(args: readonly string[]): number {
  for (const path of [SCHEMA_PATH, PRELUDE_PATH, POSTLUDE_PATH]) {
    if (!existsSync(path)) {
      console.error(`[baseline] 必要なファイルが無い: ${path}`);
      return 1;
    }
  }

  const { out, force } = resolveOutput(args);

  // 既存 migration の上書きは事故でしか起きない。`prisma/migrations/*/migration.sql` は
  // pre-commit（絶対規約 #7）が改変を止めるので、コミット直前まで気付けない。
  // 履歴を畳むとき（WP7）だけ --force で明示する。
  if (existsSync(out) && !force) {
    console.error(
      `[baseline] ${out} は既にある。上書きするなら --force を付けること（履歴を畳むとき以外は付けない）`,
    );
    return 1;
  }

  const diff = runMigrateDiff();
  if (!diff.ok) {
    console.error(`[baseline] ${diff.message}`);
    return 1;
  }

  const schemaSource = readFileSync(SCHEMA_PATH, "utf8");
  const problems = verifyGeneratedSql(diff.sql, schemaSource);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[baseline] ${p.problem}`);
    return 1;
  }

  const content = assembleBaseline(
    readFileSync(PRELUDE_PATH, "utf8"),
    diff.sql,
    readFileSync(POSTLUDE_PATH, "utf8"),
  );

  // 上書き先がデータ投入文を持っていて、新しい内容が持っていないなら止める。
  // DDL は完全なので適用も起動も成功し、**行が消えたことにだけ気付けない**。
  if (existsSync(out)) {
    const existingData = countDataStatements(readFileSync(out, "utf8"));
    const newData = countDataStatements(content);
    if (existingData > newData) {
      console.error(
        `[baseline] ${out} は INSERT を ${existingData} 本持つが、組み立て結果は ${newData} 本しか無い。`,
      );
      console.error(
        "[baseline] そのデータを prisma/seed.ts へ移すまで畳めない（DDL は完全なので、消えても適用は成功してしまう）。",
      );
      return 1;
    }
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content, "utf8");

  const declared = countDeclarations(schemaSource);
  console.info(
    `[baseline] ${out} を生成 (model=${declared.models} enum=${declared.enums}, ${content.split("\n").length} 行)`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
