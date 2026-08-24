/**
 * E2E から Cloudflare Turnstile へ実際に出ていく経路が 1 つも残っていないことの gate。
 *
 * ## なぜ
 *
 * Turnstile を stub しない spec は、テストのたびに `challenges.cloudflare.com` から
 * script を取得し challenge の往復を待っていた。これが nightly の恒常的な赤の
 * 一因で、壊れ方が 2 通りある:
 *
 * - hidden input はあるが値が空（challenge iframe が来ない、run 31288341839）
 * - hidden input が存在しない（api.js の取得自体が失敗、run 32742648876）
 *
 * 1 つ目に対して「ページごと作り直して再試行する」ヘルパーを置いたが、2 回作り
 * 直しても両方失敗したのが 2 つ目の実測。**リトライは外部依存の代わりにならない。**
 *
 * 現行は `e2e/fixtures/turnstile-stub.ts` が `api.js` をローカル実装へ差し替え、
 * それ以外の同 origin リクエストを落とす。適用点は共有 fixture の
 * `context` auto fixture と `primeE2EContext` の 2 箇所だけなので、gate は
 * 「その 2 箇所を迂回していないか」を見ればよい。
 *
 * ## 何を見るか
 *
 * 1. `challenges.cloudflare.com` を **route する** コードが stub モジュール以外に無い
 *    （後から足した route が勝つので、spec ごとに挙動が割れる）
 * 2. 共有 fixture が stub を `context` と `primeE2EContext` の両方に配線している
 *    （後者は `browser.newContext()` で手動生成する context 用の入口）
 *
 * ## 直し方
 *
 * spec 側に Turnstile の配線を書かない。挙動を変えたいときは
 * `e2e/fixtures/turnstile-stub.ts` を直す。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

const ROOT = process.cwd();

/** Turnstile の差し替えを独占するモジュール。 */
const STUB_MODULE = "e2e/fixtures/turnstile-stub.ts";

/** stub を全 context へ配る共有 test 定義。 */
const SHARED_TEST_MODULE = "e2e/fixtures/e2e-test.ts";

/** Turnstile のオリジン。文字列を 2 度書かないよう host だけで持つ。 */
const TURNSTILE_HOST = "challenges.cloudflare.com";

/** `context.route(...)` / `page.route(...)` の呼び出し。 */
const ROUTE_CALL_PATTERN = /\.route\s*\(/u;

function listE2EFiles(): string[] {
  const glob = new Glob("e2e/**/*.ts");
  return [...glob.scanSync(ROOT)]
    .map((path) => path.split(sep).join("/"))
    .sort();
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * Turnstile のオリジンを **route の引数として** 書いている行。
 *
 * **行単位では見ない。** `const GLOB = "https://…/**"` と
 * `context.route(GLOB, …)` を別の行に置けば行単位の判定は素通りする。
 * ファイルの中に origin と `.route(` の両方があれば、その 2 つが繋がっていない
 * ことを静的には示せないので、違反として扱う。
 *
 * 散文だけの言及は通る（`.route(` を含まないファイルなので）。他の API を mock
 * しつつ Turnstile を散文で語るファイルは落ちるが、そのときは散文をこの gate か
 * stub の docstring へ移せばよい。
 */
export function interceptsTurnstile(source: string): boolean {
  return source.includes(TURNSTILE_HOST) && ROUTE_CALL_PATTERN.test(source);
}

describe("E2E の Turnstile 差し替えは 1 箇所が所有する", () => {
  test("走査が空振りしていない", () => {
    const files = listE2EFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(STUB_MODULE);
  });

  test("stub モジュール以外に Turnstile を横取りするファイルが無い", () => {
    const offenders = listE2EFiles()
      .filter((file) => file !== STUB_MODULE)
      .filter((file) => interceptsTurnstile(read(file)));

    expect(offenders).toEqual([]);
  });

  test("共有 fixture が stub を context と手動 context の両方へ配る", () => {
    const fixture = read(SHARED_TEST_MODULE);

    expect(fixture).toContain("installTurnstileStub");
    // auto fixture（`context` の override）と手動生成 context 用の入口。
    // 片方だけだと TOCTOU 系の `browser.newContext()` が素通りする。
    expect(fixture).toContain("context: async ({ context }, use)");
    expect(fixture).toContain("export async function primeE2EContext");
    expect(fixture).toContain('from "./turnstile-stub"');
    // 呼び出しは 2 箇所（auto fixture と手動 context）。import 行は `(` を含まない。
    expect(fixture.split("installTurnstileStub(").length - 1).toBe(2);
  });

  test("落ちるべき形: spec が自分で Turnstile を route する（定数経由でも）", () => {
    const source = [
      `const GLOB = "https://${TURNSTILE_HOST}/**";`,
      "await context.route(GLOB, (r) => r.abort());",
    ].join("\n");
    expect(interceptsTurnstile(source)).toBe(true);
  });

  test("落ちてはいけない形: 散文で origin に言及するだけ", () => {
    const source = `// trace に ${TURNSTILE_HOST} の frame snapshot が残っていた`;
    expect(interceptsTurnstile(source)).toBe(false);
  });
});
