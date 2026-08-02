import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Glob } from "bun";
import { describe, expect, test } from "bun:test";

/**
 * E2E fixture の「入口 purge」が、**同時実行中の行に触れない**ことを強制する gate。
 *
 * ## なぜ prefix 一致だけでは足りないのか
 *
 * `playwright.config.ts` は `fullyParallel: true`、CI は `workers: 2`。1 つの
 * `test.describe` に複数テストがあると、それらは別 worker に分かれうる。
 * `beforeAll` は **worker ごとに 1 回**走るので、後発 worker の入口 purge が
 * 先発 worker の**生きている fixture** を消す。消された側はサインインや
 * リダイレクトで落ち、原因が fixture 側にあるとは見えない形で flake する。
 *
 * 実測: `create-blacklist-test-user.ts` を 2 回続けて実行すると、
 * 旧実装では 1 回目の User / Account / Session / Customer が消えていた。
 *
 * ## なぜ worker 固有の prefix にしないのか
 *
 * それだと「別 worker が落とした残骸」を誰も回収しなくなる。作成から一定時間が
 * 経った行だけを消せば、同時実行中の行には構造的に触れず、残骸は次回以降に
 * 必ず回収される。spec 側に `afterAll` を足す案が採れない理由は
 * `.claude/rules/testing-e2e.md`（本体 timeout で page ごと閉じられる）にある。
 *
 * ## 走査範囲
 *
 * `User` は run 全体で共有される identity 行なので、prefix で消す実装は必ず
 * 他 worker と衝突しうる。予約 fixture は所有分割された専用スペースに閉じている
 * ため（`e2e-fixture-space-ownership.test.ts`）ここでは対象にしない。
 */

const FIXTURE_DIR = join(process.cwd(), "scripts/e2e");

function fixtureScripts(): string[] {
  return [...new Glob("*.ts").scanSync(FIXTURE_DIR)].map((name) =>
    join(FIXTURE_DIR, name),
  );
}

describe("E2E fixture の入口 purge", () => {
  test("User を prefix で消す fixture は経過時間でも絞る", () => {
    const violations: string[] = [];

    for (const file of fixtureScripts()) {
      const source = readFileSync(file, "utf8");

      // `prisma.user.deleteMany` / `tx.user.deleteMany` を持つものだけが対象。
      if (!/\.user\.deleteMany\(/u.test(source)) continue;
      // 対象行を email prefix で集めているか（= 全 run 共有の identity を狙う形）。
      if (!/email:\s*\{\s*startsWith:/u.test(source)) continue;

      if (!/createdAt:\s*\{\s*lt:/u.test(source)) {
        violations.push(
          `${file}: email prefix だけで User を purge している。fullyParallel + workers:2 で別 worker の生きた fixture を消す。createdAt の下限で古い行だけに絞ること`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("gate が対象を 1 件も見ていない、という空振りをしない", () => {
    const matched = fixtureScripts().filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /\.user\.deleteMany\(/u.test(source) &&
        /email:\s*\{\s*startsWith:/u.test(source)
      );
    });

    // 該当ファイルが 0 件になったら、この gate は何も守っていない。
    expect(matched.length).toBeGreaterThan(0);
  });
});
