import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function readRefundsNoMutationMigration(): string {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationDir = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_refunds_no_mutation"),
  );

  expect(migrationDir).toBeDefined();
  if (migrationDir === undefined) {
    throw new Error("refunds no mutation migration is missing");
  }

  return readFileSync(join(migrationsDir, migrationDir, "migration.sql"), {
    encoding: "utf8",
  });
}

describe("refunds append-only boundary", () => {
  test("refunds UPDATE/DELETE は DB trigger で拒否する", () => {
    const migration = readRefundsNoMutationMigration();

    expect(migration).toContain("prevent_refunds_mutation");
    expect(migration).toContain('BEFORE UPDATE ON "refunds"');
    expect(migration).toContain('BEFORE DELETE ON "refunds"');
    expect(migration).toContain("refunds is append-only");
    expect(migration).toContain("integrity_constraint_violation");
  });

  test("bypass GUC は audit_logs / terms_agreements と衝突しない別名を使う", () => {
    const migration = readRefundsNoMutationMigration();

    expect(migration).toContain(
      "current_setting('myrrh.refund_mutation_bypass', true)",
    );
    expect(migration).not.toContain("audit_log_mutation_bypass");
    expect(migration).not.toContain("terms_agreement_mutation_bypass");
  });

  test("Refund domain commands は update/delete/upsert を呼び出さない", () => {
    const eventPaymentDir = join(
      process.cwd(),
      "src/shared/domain/events/payment",
    );
    const eventPaymentModules = readdirSync(eventPaymentDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `src/shared/domain/events/payment/${name}`);

    const files = [
      ...eventPaymentModules,
      "src/shared/domain/reservations/payment-commands.ts",
      "src/shared/domain/reservations/payment-queries.ts",
    ];

    for (const file of files) {
      const content = readFileSync(join(process.cwd(), file), {
        encoding: "utf8",
      });

      expect(content).not.toMatch(/prisma\.refund\.update\b/);
      expect(content).not.toMatch(/prisma\.refund\.updateMany\b/);
      expect(content).not.toMatch(/prisma\.refund\.delete\b/);
      expect(content).not.toMatch(/prisma\.refund\.deleteMany\b/);
      expect(content).not.toMatch(/prisma\.refund\.upsert\b/);
      expect(content).not.toMatch(/tx\.refund\.update\b/);
      expect(content).not.toMatch(/tx\.refund\.updateMany\b/);
      expect(content).not.toMatch(/tx\.refund\.delete\b/);
      expect(content).not.toMatch(/tx\.refund\.deleteMany\b/);
      expect(content).not.toMatch(/tx\.refund\.upsert\b/);
    }
  });
});
