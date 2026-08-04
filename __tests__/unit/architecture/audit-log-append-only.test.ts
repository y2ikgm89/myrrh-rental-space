import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { readDatabaseInvariants } from "../../support/prisma-sources";

describe("audit log append-only boundary", () => {
  test("audit_logs UPDATE/DELETE は DB trigger で拒否する", () => {
    const invariants = readDatabaseInvariants();

    expect(invariants).toContain("prevent_audit_logs_mutation");
    expect(invariants).toContain("BEFORE UPDATE ON public.audit_logs ");
    expect(invariants).toContain("BEFORE DELETE ON public.audit_logs ");
    expect(invariants).toContain("audit_logs is append-only");
  });

  test("seed は audit_logs を削除しない", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), {
      encoding: "utf8",
    });

    // かつては `--reset` の `clearAllData` が transaction-local bypass GUC を
    // 立ててから削除していた。そのモードは廃止した（削除順が `onDelete: Restrict`
    // の FK と append-only trigger に追随できておらず、3 系統で壊れていた）。
    // 破壊的な作り直しは `bun run db:reset` = `prisma migrate reset --force`
    // が担う。seed 側に append-only 行を消す経路は**残さない**。
    expect(seed).not.toContain("auditLog.deleteMany(");
    expect(seed).not.toContain("audit_log_mutation_bypass");
  });

  test("Prisma seed は Next server-only audit command を import しない", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), {
      encoding: "utf8",
    });

    expect(seed).not.toContain("../src/shared/domain/audit-log/commands");
    expect(seed).not.toContain("createAuditLogRecord");
  });

  test("hash chain の形式が DB CHECK で強制される", () => {
    const invariants = readDatabaseInvariants();

    // 16 進 64 文字であること・アルゴリズム名・chainVersion を DB 側で固定する。
    // アプリが壊れても不正な形の chain 行が入らない最後の壁。
    expect(invariants).toContain("audit_logs_previous_hash_hex_check");
    expect(invariants).toContain("audit_logs_entry_hash_hex_check");
    expect(invariants).toContain("audit_logs_hash_algorithm_check");
    expect(invariants).toContain("audit_logs_hash_key_id_check");
    expect(invariants).toContain("audit_logs_chain_version_check");
  });

  // NOTE: かつてここには「hash chain migration が旧 audit_logs を TRUNCATE して
  // 必須列を足す」ことを検査するテストがあった。**一度きりの移行操作**であって
  // 不変条件ではないので、履歴を 1 本の baseline へ畳んだ時点で意味を失う
  // （まっさらな DB に「消すべき旧行」は無い）。列が NOT NULL であることは
  // 下の schema テストが、CHECK 制約は上のテストが引き継いでいる。

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
