import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function readAuditLogHashChainMigration(): string {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationDir = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_audit_log_hash_chain"),
  );

  expect(migrationDir).toBeDefined();
  if (migrationDir === undefined) {
    throw new Error("audit log hash chain migration is missing");
  }

  return readFileSync(join(migrationsDir, migrationDir, "migration.sql"), {
    encoding: "utf8",
  });
}

describe("audit log append-only boundary", () => {
  test("audit_logs UPDATE/DELETE は DB trigger で拒否する", () => {
    const migration = readAuditLogHashChainMigration();

    expect(migration).toContain("prevent_audit_logs_mutation");
    expect(migration).toContain('BEFORE UPDATE ON "audit_logs"');
    expect(migration).toContain('BEFORE DELETE ON "audit_logs"');
    expect(migration).toContain("audit_logs is append-only");
  });

  test("seed reset は transaction-local bypass を明示してから audit_logs を削除する", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), {
      encoding: "utf8",
    });

    expect(seed).toContain(
      "set_config('myrrh.audit_log_mutation_bypass', 'seed', true)",
    );
    expect(seed.indexOf("set_config(")).toBeLessThan(
      seed.indexOf("tx.auditLog.deleteMany()"),
    );
  });

  test("hash chain migration は旧 audit_logs を残さず必須ハッシュ列を追加する", () => {
    const migration = readAuditLogHashChainMigration();

    expect(migration).toContain('TRUNCATE TABLE "audit_logs"');
    expect(migration).toContain("squawk-ignore-file adding-required-field");
    expect(migration).toContain('"sequence" BIGINT NOT NULL');
    expect(migration).toContain('"previousHash" CHAR(64) NOT NULL');
    expect(migration).toContain('"entryHash" CHAR(64) NOT NULL');
    expect(migration).toContain('"audit_logs_sequence_key" UNIQUE');
    expect(migration).toContain("audit_logs_entry_hash_hex_check");
    expect(migration).toContain("audit_logs_chain_version_check");
  });

  test("AuditLog schema は sequence/hash を nullable にしない", () => {
    const schema = readFileSync(
      join(process.cwd(), "prisma", "schema.prisma"),
      {
        encoding: "utf8",
      },
    );

    expect(schema).toContain("sequence      BigInt      @unique");
    expect(schema).toContain("previousHash  String      @db.Char(64)");
    expect(schema).toContain("entryHash     String      @db.Char(64)");
    expect(schema).toContain("chainVersion  Int         @default(1)");
  });

  test("audit log HMAC は後方互換 legacy key env を持たない", () => {
    const files = [
      "src/shared/lib/env/server.ts",
      "src/shared/domain/audit-log/hash-chain.ts",
      "cloudbuild.yaml",
      "docs/gcp-production-setup.md",
    ];

    for (const file of files) {
      const content = readFileSync(join(process.cwd(), file), {
        encoding: "utf8",
      });
      expect(content).not.toContain("AUDIT_LOG_HMAC_KEYS_LEGACY");
    }
  });
});
