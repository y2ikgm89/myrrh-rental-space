import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function readTermsAgreementNoMutationMigration(): string {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationDir = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_terms_agreements_no_mutation"),
  );

  expect(migrationDir).toBeDefined();
  if (migrationDir === undefined) {
    throw new Error("terms_agreements no mutation migration is missing");
  }

  return readFileSync(join(migrationsDir, migrationDir, "migration.sql"), {
    encoding: "utf8",
  });
}

describe("terms_agreements append-only boundary", () => {
  test("terms_agreements UPDATE/DELETE は DB trigger で拒否する", () => {
    const migration = readTermsAgreementNoMutationMigration();

    expect(migration).toContain("prevent_terms_agreements_mutation");
    expect(migration).toContain('BEFORE UPDATE ON "terms_agreements"');
    expect(migration).toContain('BEFORE DELETE ON "terms_agreements"');
    expect(migration).toContain("terms_agreements is append-only");
    expect(migration).toContain("integrity_constraint_violation");
  });

  test("bypass GUC は audit_logs と衝突しない別名を使う", () => {
    const migration = readTermsAgreementNoMutationMigration();

    // audit_logs 側は `myrrh.audit_log_mutation_bypass`。terms 側は独立した
    // `myrrh.terms_agreement_mutation_bypass` を使い、seed が片方だけを bypass
    // したいケース (通常運用) を隠さないようにする。
    expect(migration).toContain(
      "current_setting('myrrh.terms_agreement_mutation_bypass', true)",
    );
    expect(migration).not.toContain("audit_log_mutation_bypass");
  });

  test("TermsAgreement schema にビジネスロジックが update/delete を呼び出す痕跡がない", () => {
    const commands = readFileSync(
      join(process.cwd(), "src", "shared", "domain", "terms", "commands.ts"),
      { encoding: "utf8" },
    );

    // findMany / count / createMany のみが期待通り。update / delete / upsert が
    // 忍び込むと trigger で fail するため、compile-time にも検出できるように
    // 静的 gate として突合する。
    expect(commands).not.toMatch(/prisma\.termsAgreement\.update\b/);
    expect(commands).not.toMatch(/prisma\.termsAgreement\.updateMany\b/);
    expect(commands).not.toMatch(/prisma\.termsAgreement\.delete\b/);
    expect(commands).not.toMatch(/prisma\.termsAgreement\.deleteMany\b/);
    expect(commands).not.toMatch(/prisma\.termsAgreement\.upsert\b/);
  });
});
