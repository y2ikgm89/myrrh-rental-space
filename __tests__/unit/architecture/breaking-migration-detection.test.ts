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
// The 4 destructive families this suite pins:
//   1. DROP     — DROP COLUMN / DROP TABLE / DROP TYPE
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
  const match = workflow.match(
    /grep -Eiq '(?<pattern>[^']+)' "\$\{changed_migrations\[@\]\}"/,
  );
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
    name: "DROP DEFAULT (metadata-only)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" DROP DEFAULT;',
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
];

describe("breaking migration detection regex (MIG-EXPAND-01)", () => {
  test("pattern is present in deploy-production.yml", () => {
    expect(breakingPattern.length).toBeGreaterThan(0);
  });

  test("workflow pattern covers the 4 destructive families in one grep", () => {
    // These substrings encode each destructive family. Losing any one of them
    // would silently ship the corresponding change without downtime mode.
    expect(breakingPattern).toContain("DROP[[:space:]]+COLUMN");
    expect(breakingPattern).toContain("RENAME[[:space:]]+COLUMN");
    expect(breakingPattern).toContain("RENAME[[:space:]]+TO");
    expect(breakingPattern).toContain(
      "ALTER[[:space:]]+COLUMN[[:space:]]+.*(SET[[:space:]]+NOT[[:space:]]+NULL|TYPE)",
    );
    expect(breakingPattern).toContain("DROP[[:space:]]+TABLE");
    expect(breakingPattern).toContain("DROP[[:space:]]+TYPE");
  });

  for (const fixture of breakingFixtures) {
    test(`detects breaking: ${fixture.name}`, () => {
      expect(breakingRegex.test(fixture.sql)).toBe(true);
    });
  }

  for (const fixture of safeFixtures) {
    test(`does not flag safe: ${fixture.name}`, () => {
      expect(breakingRegex.test(fixture.sql)).toBe(false);
    });
  }
});
