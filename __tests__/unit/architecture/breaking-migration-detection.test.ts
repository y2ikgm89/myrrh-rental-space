import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

// Regression gate for MIG-EXPAND-01
// (deploy-safety finding, PR fix/breaking-migration-detection-regex).
//
// .github/workflows/deploy-production.yml greps migration SQL for destructive
// patterns to enable "breaking migration deploy mode" (scale both services to 0
// + 310 s drain = planned downtime). If a destructive pattern is missed here,
// the migration ships live and users hit locks in production.
//
// The 5 destructive families this suite pins:
//   1. DROP     — DROP COLUMN / DROP TABLE / DROP TYPE / DROP CONSTRAINT
//   2. RENAME   — RENAME COLUMN / RENAME TO
//   3. TYPE     — ALTER COLUMN ... TYPE (full table rewrite + AccessExclusiveLock)
//   4. NOT NULL — ALTER COLUMN ... SET NOT NULL (full table scan under lock)

const workflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
  "utf8",
);

/**
 * Extract the POSIX ERE pattern from the `grep -Eiq '...'` invocation in
 * deploy-production.yml so the test always reflects what the workflow will
 * actually run. Fails loudly if the pattern moves or the extraction breaks.
 */
function extractBreakingMigrationPattern(): string {
  const match = workflow.match(/grep -Eiq '(?<pattern>[^']+)'/u);
  const pattern = match?.groups?.["pattern"];
  if (!pattern) {
    throw new Error(
      "Could not extract breaking-migration grep pattern from deploy-production.yml. " +
        "If the grep call moved or its quoting changed, update this test.",
    );
  }
  return pattern;
}

/**
 * Translate the POSIX ERE pattern to a JavaScript RegExp so bun test can
 * evaluate fixtures the same way `grep -Ei` would on Cloud Build.
 * Only `[[:space:]]` is used in the source pattern; expand more classes if
 * new ones are added.
 */
function posixEreToJsRegExp(pattern: string): RegExp {
  const translated = pattern.replaceAll("[[:space:]]", "\\s");
  return new RegExp(translated, "i");
}

const breakingPattern = extractBreakingMigrationPattern();
const breakingRegex = posixEreToJsRegExp(breakingPattern);

/**
 * Mirror the workflow's pre-grep normalization:
 *
 *     sed 's/--.*$//' file | tr '\n' ' ' | tr ';' '\n'
 *
 * grep matches **line by line**, so a statement wrapped across lines —
 *
 *     ALTER TABLE "terms_agreements"
 *       ALTER COLUMN "resourceId" SET DATA TYPE TEXT;
 *
 * — satisfies the pattern on neither line and slips through entirely. That is
 * not hypothetical: the merged
 * `20260726030000_admin_notification_resource_id_varchar` is written this way
 * and returned rc=1 against the old single-`grep` call, so it would have
 * deployed without downtime mode.
 *
 * Splitting on `;` matters just as much as joining lines: without it, two
 * unrelated adjacent statements get bridged by `.*` and produce false
 * positives (e.g. `ALTER TABLE a ADD COLUMN b;` followed by anything
 * containing `TYPE`).
 */
function normalizeMigrationSql(sql: string): string[] {
  return sql.replace(/--.*$/gmu, "").replaceAll("\n", " ").split(";");
}

/** grep が行ごとに評価するのと同じく、正規化後の各文に対して照合する。 */
function detectsBreaking(sql: string): boolean {
  return normalizeMigrationSql(sql).some((statement) =>
    breakingRegex.test(statement),
  );
}

const breakingFixtures: ReadonlyArray<{
  readonly name: string;
  readonly sql: string;
}> = [
  {
    name: "DROP COLUMN",
    sql: 'ALTER TABLE "users" DROP COLUMN "foo";',
  },
  {
    name: "RENAME COLUMN",
    sql: 'ALTER TABLE "users" RENAME COLUMN "foo" TO "bar";',
  },
  {
    name: "RENAME TO (table rename)",
    sql: 'ALTER TABLE "users" RENAME TO "customers";',
  },
  {
    name: "ALTER COLUMN ... TYPE (Postgres shorthand)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" TYPE integer;',
  },
  {
    name: "ALTER COLUMN ... SET DATA TYPE (Prisma output)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" SET DATA TYPE INTEGER;',
  },
  {
    name: "ALTER COLUMN ... SET NOT NULL",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" SET NOT NULL;',
  },
  {
    // 以前は safeFixtures 側に「DROP DEFAULT (metadata-only)」として置かれていた。
    // その判断は **ロック/rewrite コスト**の話で、この gate が守っている Risk 1
    // （旧 revision が新スキーマを叩いて 500）とは別の軸だった。
    //
    // `@default(dbgenerated(...))` から生成された旧 revision の Prisma Client は
    // その列を INSERT に含めない。cloudbuild は migrate を新 revision のデプロイより
    // **先**に走らせるので、DEFAULT が消えた瞬間から新 revision が出るまでの窓で
    // 旧 revision の INSERT が NOT NULL 違反になる。まさに Risk 1。
    //
    // grep では「旧コードがその DEFAULT に依存しているか」を判別できないので、
    // 依存していない DROP DEFAULT も巻き込んで停止モードに入る。単一インスタンス・
    // 低トラフィックで手動デプロイのこの構成では、過剰検知の代償（310 秒の計画停止）
    // より見逃しの代償（本番 500）の方がはるかに大きい。
    name: "ALTER COLUMN ... DROP DEFAULT",
    sql: 'ALTER TABLE "receipts" ALTER COLUMN "id" DROP DEFAULT;',
  },
  {
    name: "DROP CONSTRAINT",
    sql: 'ALTER TABLE "users" DROP CONSTRAINT "users_foo_key";',
  },
  {
    name: "DROP TABLE",
    sql: 'DROP TABLE "users";',
  },
  {
    name: "DROP TYPE",
    sql: 'DROP TYPE "TaxInputMode";',
  },
  {
    name: "case-insensitive lowercase drop column",
    sql: 'alter table "users" drop column "foo";',
  },
  // 以下は改行を挟む実在の書き方。単一行 fixture しか無かったため、この抜けが
  // 長期間見えていなかった（マージ済み migration が 1 件すり抜けている）。
  {
    name: "multi-line ALTER COLUMN ... SET DATA TYPE (Prisma の折返し出力)",
    sql: 'ALTER TABLE "terms_agreements"\n  ALTER COLUMN "resourceId" SET DATA TYPE TEXT USING "resourceId"::TEXT;',
  },
  {
    name: "multi-line DROP COLUMN",
    sql: 'ALTER TABLE "users"\n  DROP COLUMN "foo";',
  },
  {
    name: "multi-line ALTER COLUMN ... SET NOT NULL",
    sql: 'ALTER TABLE "users"\n  ALTER COLUMN "foo"\n  SET NOT NULL;',
  },
  {
    name: "先行コメントがあっても本文は検出する",
    sql: '-- 意図的な破壊的変更。理由は PR 参照。\nALTER TABLE "users"\n  DROP COLUMN "foo";',
  },
];

const safeFixtures: ReadonlyArray<{
  readonly name: string;
  readonly sql: string;
}> = [
  {
    name: "CREATE TABLE (new table)",
    sql: 'CREATE TABLE "users" ("id" TEXT NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id"));',
  },
  {
    name: "ADD COLUMN (expand)",
    sql: 'ALTER TABLE "users" ADD COLUMN "foo" TEXT;',
  },
  {
    name: "DROP NOT NULL (nullable relaxation, safe)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" DROP NOT NULL;',
  },
  {
    name: "SET DEFAULT (metadata-only)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" SET DEFAULT \'bar\';',
  },
  {
    name: "CREATE INDEX CONCURRENTLY (expand, no rewrite)",
    sql: 'CREATE INDEX CONCURRENTLY "users_foo_idx" ON "users" ("foo");',
  },
  {
    name: "CREATE TYPE (new enum)",
    sql: "CREATE TYPE \"Role\" AS ENUM ('ADMIN', 'USER');",
  },
  {
    name: "COMMENT ON COLUMN",
    sql: 'COMMENT ON COLUMN "users"."foo" IS \'note\';',
  },
  // 正規化で誤検知を作っていないことの確認。改行を潰すだけで `;` 分割を
  // 怠ると、この 2 文が `.*` で橋渡しされて breaking と誤判定される。
  {
    name: "隣接する安全な 2 文が繋がって誤検知しない",
    sql: 'ALTER TABLE "users" ADD COLUMN "foo" TEXT;\nCREATE TYPE "Role" AS ENUM (\'ADMIN\');',
  },
  {
    name: "コメント中の散文は検出しない",
    sql: '-- Prisma の diff は DROP COLUMN "legacy" も提案してきたが意図的に外した。\nALTER TABLE "users" ADD COLUMN "foo" TEXT;',
  },
];

/**
 * breaking mode を発動させる DDL の一覧。**運用者向けドキュメントとの drift を防ぐ
 * ための SSoT**（判定そのものの SSoT は deploy-production.yml の正規表現で、上の
 * fixture 群がそれを固定している）。
 *
 * この一覧は 2 度 drift している: `DROP CONSTRAINT` と `ALTER COLUMN ... TYPE` は
 * workflow では長期間検出されていたのに、rules / skill の散文には載っていなかった。
 * 運用者はその散文を読んで「今回は停止しない」と判断するので、抜けは
 * **両サービスが予告なく scaling=0 になる**形で表面化する。
 *
 * `pattern` は workflow 正規表現に含まれるべき断片、`prose` は各ドキュメントに
 * 現れるべき人間向け表記。
 */
const BREAKING_TRIGGERS: ReadonlyArray<{
  readonly pattern: string;
  readonly prose: string;
}> = [
  { pattern: "DROP[[:space:]]+COLUMN", prose: "DROP COLUMN" },
  { pattern: "DROP[[:space:]]+CONSTRAINT", prose: "DROP CONSTRAINT" },
  { pattern: "RENAME[[:space:]]+COLUMN", prose: "RENAME COLUMN" },
  { pattern: "RENAME[[:space:]]+TO", prose: "RENAME TO" },
  { pattern: "SET[[:space:]]+NOT[[:space:]]+NULL", prose: "SET NOT NULL" },
  { pattern: "DROP[[:space:]]+DEFAULT", prose: "DROP DEFAULT" },
  { pattern: "DROP[[:space:]]+TABLE", prose: "DROP TABLE" },
  { pattern: "DROP[[:space:]]+TYPE", prose: "DROP TYPE" },
];

/** 発動条件を「網羅的な一覧」として書いている運用者向けドキュメント。 */
const TRIGGER_LIST_DOCS: readonly string[] = [
  ".claude/rules/deploy-infra.md",
  ".claude/rules/migrations.md",
  ".claude/skills/deploy-debug/SKILL.md",
];

describe("breaking migration detection regex (MIG-EXPAND-01)", () => {
  test("pattern is present in deploy-production.yml", () => {
    expect(breakingPattern.length).toBeGreaterThan(0);
  });

  test("workflow pattern covers the 5 destructive families in one grep", () => {
    // These substrings encode each destructive family. Losing any one of them
    // would silently ship the corresponding change without downtime mode.
    expect(breakingPattern).toContain("DROP[[:space:]]+COLUMN");
    expect(breakingPattern).toContain("DROP[[:space:]]+CONSTRAINT");
    expect(breakingPattern).toContain("RENAME[[:space:]]+COLUMN");
    expect(breakingPattern).toContain("RENAME[[:space:]]+TO");
    expect(breakingPattern).toContain(
      "ALTER[[:space:]]+COLUMN[[:space:]]+.*(SET[[:space:]]+NOT[[:space:]]+NULL|DROP[[:space:]]+DEFAULT|TYPE)",
    );
    expect(breakingPattern).toContain("DROP[[:space:]]+CONSTRAINT");
    expect(breakingPattern).toContain("DROP[[:space:]]+TABLE");
    expect(breakingPattern).toContain("DROP[[:space:]]+TYPE");
  });

  test("workflow は grep の前に 1 文 1 行へ正規化する", () => {
    // これが無いと改行を挟んだ文が丸ごと判定をすり抜ける。上の
    // multi-line fixture 群はこの正規化を前提に評価している。
    expect(workflow).toContain("sed 's/--.*$//' \"${migration_file}\"");
    expect(workflow).toContain("tr '\\n' ' '");
    expect(workflow).toContain("tr ';' '\\n'");
  });

  for (const fixture of breakingFixtures) {
    test(`detects breaking: ${fixture.name}`, () => {
      expect(detectsBreaking(fixture.sql)).toBe(true);
    });
  }

  for (const fixture of safeFixtures) {
    test(`does not flag safe: ${fixture.name}`, () => {
      expect(detectsBreaking(fixture.sql)).toBe(false);
    });
  }
  test("運用者向けドキュメントの発動条件一覧が workflow と一致する", () => {
    // 一覧が workflow 側に実在することを先に確かめる（prose だけ直して
    // 正規表現を直し忘れる／その逆を両方向で検出する）
    const missingFromWorkflow = BREAKING_TRIGGERS.filter(
      (trigger) => !breakingPattern.includes(trigger.pattern),
    ).map((trigger) => trigger.prose);
    expect(missingFromWorkflow).toEqual([]);

    const missingFromDocs: string[] = [];
    for (const relativePath of TRIGGER_LIST_DOCS) {
      const doc = readFileSync(join(process.cwd(), relativePath), "utf8");
      // ドキュメント側は行幅の都合で語の途中に改行が入る。空白を 1 個に潰してから
      // 照合し、折返しの有無で判定が変わらないようにする。
      const flattened = doc.replace(/\s+/gu, " ");
      for (const trigger of BREAKING_TRIGGERS) {
        if (!flattened.includes(trigger.prose)) {
          missingFromDocs.push(`${relativePath}: ${trigger.prose}`);
        }
      }
    }

    expect({
      missingFromDocs,
      hint:
        missingFromDocs.length > 0
          ? "breaking mode の発動条件を workflow に足したら、運用者向けの一覧にも同じ語を書く。書かないと「今回は停止しない」と誤読され、両サービスが予告なく scaling=0 になる"
          : "",
    }).toEqual({ missingFromDocs: [], hint: "" });
  });
});
