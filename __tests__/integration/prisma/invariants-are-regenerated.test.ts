/**
 * `prisma/baseline/invariants.sql` が**実 DB の現在の姿と一致している**ことの検査。
 *
 * ## なぜ要るのか
 *
 * このファイルは `scripts/build-baseline-invariants.ts` の**生成物**で、5 つのゲートが
 * 「DB の不変条件はこうなっている」として読む。ところが再生成を強制する仕組みが
 * 無かったため、**静かに古くなる**。
 *
 * 実際に起きたこと: `customers.email_canonical` を text から
 * varchar(254) へ寄せた。CHECK の中身は変えていないが、PostgreSQL が返す式は
 * `btrim(email_canonical)` から `btrim((email_canonical)::text)` に変わる。
 * `invariants.sql` は再生成されず、4 つの PR をまたいで古い綴りのまま残った。
 *
 * **census では気づけない。** PostgreSQL は CREATE 時に式を正規化するので、
 * どちらの綴りで作っても保存される式は同じになる。つまり
 * 「baseline から作った DB」と「履歴から作った DB」は一致し続ける。
 * 食い違うのは**ファイルの中身**だけで、それを読むゲートが古い綴りを検査し続ける。
 *
 * ## 何を比べるか
 *
 * 生成器を実 DB に対して走らせ、その出力とコミット済みのファイルを**そのまま**比べる。
 * 差があれば「再生成してコミットせよ」と言う。生成器そのものが壊れた場合も
 * ここで落ちる（出力が空・件数が減る等）。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "invariants-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("baseline の不変条件は再生成済み", () => {
  test("invariants.sql が実 DB から生成し直したものと一致する", () => {
    const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
    const out = join(workDir, "invariants.sql");

    const result = spawnSync(
      "bun",
      [
        "scripts/build-baseline-invariants.ts",
        "--url",
        url,
        "--out",
        out,
        "--force",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    // 生成器が落ちたら「差分なし」と報告しない。**stderr の中身は見ない** —
    // 生成器は進捗（`[invariants] … CHECK=129 …`）を stderr に出すので、
    // 空であることを求めると正常系で落ちる。失敗したときだけ中身を見せる。
    expect({
      status: result.status,
      stderr: result.status === 0 ? "" : (result.stderr?.slice(0, 400) ?? ""),
    }).toEqual({ status: 0, stderr: "" });

    const regenerated = readFileSync(out, "utf8");
    const committed = readFileSync(
      join(process.cwd(), "prisma/baseline/invariants.sql"),
      "utf8",
    );

    // 空の生成物と一致して緑になるのを防ぐ。
    expect(regenerated.length).toBeGreaterThan(1000);

    // 行単位で比べて、食い違った最初の数行を見せる（全文 diff は読めない）。
    const a = regenerated.split(/\r?\n/u);
    const b = committed.split(/\r?\n/u);
    const differences = a
      .map((line, i) => ({ line, i, other: b[i] ?? "(行が足りない)" }))
      .filter((d) => d.line !== d.other)
      .slice(0, 5)
      .map(
        (d) =>
          `${d.i + 1} 行目:\n  生成: ${d.line}\n  現物: ${d.other}\n` +
          `  → bun scripts/build-baseline-invariants.ts --url <test-db> --force で作り直す`,
      );

    expect(differences).toEqual([]);
    expect(a.length).toBe(b.length);
  }, 60_000);
});
