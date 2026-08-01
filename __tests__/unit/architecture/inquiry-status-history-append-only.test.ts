import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, test } from "bun:test";

function readInquiryStatusHistoryNoMutationMigration(): string {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationDir = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_inquiry_status_history_no_mutation"),
  );

  expect(migrationDir).toBeDefined();
  if (migrationDir === undefined) {
    throw new Error("inquiry_status_history no mutation migration is missing");
  }

  return readFileSync(join(migrationsDir, migrationDir, "migration.sql"), {
    encoding: "utf8",
  });
}

describe("inquiry_status_history append-only boundary", () => {
  test("inquiry_status_history UPDATE/DELETE は DB trigger で拒否する", () => {
    const migration = readInquiryStatusHistoryNoMutationMigration();

    expect(migration).toContain("prevent_inquiry_status_history_mutation");
    expect(migration).toContain('BEFORE UPDATE ON "inquiry_status_history"');
    expect(migration).toContain('BEFORE DELETE ON "inquiry_status_history"');
    expect(migration).toContain("inquiry_status_history is append-only");
    expect(migration).toContain("integrity_constraint_violation");
  });

  test("bypass GUC は seed と data-retention purge を許可する", () => {
    const migration = readInquiryStatusHistoryNoMutationMigration();

    expect(migration).toContain(
      "current_setting('myrrh.inquiry_status_history_mutation_bypass', true)",
    );
    expect(migration).toContain("'purge'");
    expect(migration).not.toContain("terms_agreement_mutation_bypass");
    expect(migration).not.toContain("audit_log_mutation_bypass");
  });

  test("E2E helper が inquiry_status_history を mutate しない", () => {
    // #1772 の restore helper が `inquiryStatusHistory.deleteMany` を呼び、
    // trigger に弾かれて `inquiry-reply` spec が落ちた（run 30682539184）。
    // 履歴は積み上がるのが正しく、bypass GUC は seed / purge 専用。
    const glob = new Bun.Glob("e2e/**/*.ts");
    const offenders = [...glob.scanSync(process.cwd())]
      .filter((rel) =>
        /inquiryStatusHistory\s*\.\s*(delete|deleteMany|update|updateMany|upsert)\s*\(/u.test(
          readFileSync(join(process.cwd(), rel), { encoding: "utf8" }),
        ),
      )
      .map(
        (rel) =>
          `${rel.split(sep).join("/")}: inquiry_status_history は append-only。trigger が UPDATE/DELETE を拒否するので E2E からも mutate しない`,
      );

    expect(offenders).toEqual([]);
  });

  test("data-retention purge が inquiry delete 前に purge bypass を設定する", () => {
    const commands = readFileSync(
      join(
        process.cwd(),
        "src",
        "shared",
        "domain",
        "data-retention",
        "commands.ts",
      ),
      { encoding: "utf8" },
    );

    expect(commands).toContain("myrrh.inquiry_status_history_mutation_bypass");
    expect(commands).toContain("'purge'");
  });
});
