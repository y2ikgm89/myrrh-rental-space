import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPlpgsqlFunction,
} from "../../support/prisma-sources";

describe("refunds append-only boundary", () => {
  test("refunds UPDATE/DELETE は DB trigger で拒否する", () => {
    const invariants = readDatabaseInvariants();

    expect(invariants).toContain("prevent_refunds_mutation");
    expect(invariants).toContain("BEFORE UPDATE ON public.refunds ");
    expect(invariants).toContain("BEFORE DELETE ON public.refunds ");
    expect(invariants).toContain("refunds is append-only");
    expect(invariants).toContain("integrity_constraint_violation");
  });

  test("bypass GUC は audit_logs / terms_agreements と衝突しない別名を使う", () => {
    const body = readPlpgsqlFunction("prevent_refunds_mutation");

    expect(body).toContain(
      "current_setting('myrrh.refund_mutation_bypass', true)",
    );
    // 他テーブルの GUC を見ない（1 つの env 変数で全部の証跡が開かない）。
    expect(body).not.toContain("myrrh.audit_log_mutation_bypass");
    expect(body).not.toContain("myrrh.terms_agreement_mutation_bypass");
    expect(body).not.toContain("myrrh.inquiry_status_history_mutation_bypass");
  });

  test("Refund domain commands は update/delete/upsert を呼び出さない", () => {
    // src/shared/domain/{events,reservations}/payment/ は PR#1601/#1607 の分割
    // 成果だったが実際にはどこからも import されない fork で、実稼働は
    // payment-commands.ts の monolith 側だった（module-reachability.test.ts の
    // 監査で判明・Phase B1 で fork を削除済み）。この gate は fork だけを見て
    // 実稼働コードを検査していなかったため、対象を monolith に差し替える。
    const files = [
      "src/shared/domain/events/payment-commands.ts",
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
