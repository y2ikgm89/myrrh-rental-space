import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readDatabaseInvariants } from "../../support/prisma-sources";

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

  test("emailCanonical は空文字を DB が拒む", () => {
    // かつてここでは「既存行を lower(btrim(email)) で backfill してから NOT NULL に
    // した migration」を検査していた。**一度きりの移行操作**なので、履歴を 1 本の
    // baseline へ畳めば意味を失う（まっさらな DB に埋めるべき既存行は無い）。
    // 残すべき保証は「空文字が入らないこと」で、それは CHECK 制約が担う。
    const invariants = readDatabaseInvariants();

    expect(invariants).toContain(
      'CONSTRAINT "customers_email_canonical_not_empty_check"',
    );
    // **式の綴りは列の型に従う。** `email_canonical` が text だった頃は
    // `btrim(email_canonical)` だったが、varchar(254) へ寄せた結果、
    // PostgreSQL は `btrim((email_canonical)::text)` と正規化して返すようになった。
    // ここが陳腐化していても census は気づかない（PostgreSQL が parse 時に正規化する
    // ので、どちらの綴りで CREATE しても保存される式は同じ）。気づけるのは
    // `invariants-are-regenerated.test.ts` が実 DB と突き合わせたときだけ。
    expect(invariants).toContain(
      `CHECK ((btrim((email_canonical)::text) <> ''::text))`,
    );
  });

  test("suppression lookup no longer handles null canonical email rows", () => {
    const queries = read("src/shared/domain/customers/queries.ts");

    expect(queries).not.toContain("row.emailCanonical === null");
  });
});
