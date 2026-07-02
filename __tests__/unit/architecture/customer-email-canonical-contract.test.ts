import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("customer email canonical contract", () => {
  test("Prisma schema stores emailCanonical as a required customer identity key", () => {
    const schema = read("prisma/schema.prisma");

    expect(schema).toMatch(/emailCanonical\s+String\b/u);
    expect(schema).not.toMatch(/emailCanonical\s+String\?/u);
    expect(schema).not.toContain("Expand phase");
    expect(schema).not.toContain("Contract phase should");
  });

  test("migration backfills emailCanonical before enforcing NOT NULL", () => {
    const migration = read(
      "prisma/migrations/20260702000001_customer_email_canonical_not_null/migration.sql",
    );

    expect(migration).toContain(
      'UPDATE "customers" SET "emailCanonical" = lower(btrim("email"))',
    );
    expect(migration).toContain('ALTER COLUMN "emailCanonical" SET NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "customers_emailCanonical_not_empty_check"',
    );
  });

  test("suppression lookup no longer handles null canonical email rows", () => {
    const queries = read("src/shared/domain/customers/queries.ts");

    expect(queries).not.toContain("row.emailCanonical === null");
  });
});
