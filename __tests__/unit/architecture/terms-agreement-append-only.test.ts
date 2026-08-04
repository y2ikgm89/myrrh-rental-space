import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPlpgsqlFunction,
} from "../../support/prisma-sources";

describe("terms_agreements append-only boundary", () => {
  test("terms_agreements UPDATE/DELETE は DB trigger で拒否する", () => {
    const invariants = readDatabaseInvariants();

    expect(invariants).toContain("prevent_terms_agreements_mutation");
    expect(invariants).toContain("BEFORE UPDATE ON public.terms_agreements ");
    expect(invariants).toContain("BEFORE DELETE ON public.terms_agreements ");
    expect(invariants).toContain("terms_agreements is append-only");
    expect(invariants).toContain("integrity_constraint_violation");
  });

  test("bypass GUC は audit_logs と衝突しない別名を使う", () => {
    const body = readPlpgsqlFunction("prevent_terms_agreements_mutation");

    expect(body).toContain(
      "current_setting('myrrh.terms_agreement_mutation_bypass', true)",
    );
    // 他テーブルの GUC を見ない（1 つの env 変数で全部の証跡が開かない）。
    expect(body).not.toContain("myrrh.audit_log_mutation_bypass");
    expect(body).not.toContain("myrrh.refund_mutation_bypass");
    expect(body).not.toContain("myrrh.inquiry_status_history_mutation_bypass");
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
