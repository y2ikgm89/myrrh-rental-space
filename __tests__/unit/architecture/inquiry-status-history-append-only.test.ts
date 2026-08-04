import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPlpgsqlFunction,
} from "../../support/prisma-sources";

describe("inquiry_status_history append-only boundary", () => {
  test("inquiry_status_history UPDATE/DELETE は DB trigger で拒否する", () => {
    const invariants = readDatabaseInvariants();

    expect(invariants).toContain("prevent_inquiry_status_history_mutation");
    expect(invariants).toContain(
      "BEFORE UPDATE ON public.inquiry_status_history ",
    );
    expect(invariants).toContain(
      "BEFORE DELETE ON public.inquiry_status_history ",
    );
    expect(invariants).toContain("inquiry_status_history is append-only");
    expect(invariants).toContain("integrity_constraint_violation");
  });

  test("bypass GUC は seed と data-retention purge を許可する", () => {
    const body = readPlpgsqlFunction("prevent_inquiry_status_history_mutation");

    expect(body).toContain(
      "current_setting('myrrh.inquiry_status_history_mutation_bypass', true)",
    );
    // 他テーブルの GUC を見ない（1 つの env 変数で全部の証跡が開かない）。
    expect(body).not.toContain("myrrh.audit_log_mutation_bypass");
    expect(body).not.toContain("myrrh.terms_agreement_mutation_bypass");
    expect(body).not.toContain("myrrh.refund_mutation_bypass");
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
