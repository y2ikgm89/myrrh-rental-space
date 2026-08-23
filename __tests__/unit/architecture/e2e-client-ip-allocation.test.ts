import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

import {
  CLIENT_IP_HEADER,
  CLIENT_IP_PREFIX,
  FIRST_CLIENT_IP_OCTET,
  LAST_CLIENT_IP_OCTET,
  clientIpForSlot,
  clientIpLaneSize,
  nextClientIp,
} from "../../../e2e/helpers/client-ip";

/**
 * E2E の client IP（`x-forwarded-for`）割当の gate。
 *
 * ## なぜ
 *
 * サーバー側の rate limiter は IP をトークンにする。既定のままだと
 * `fullyParallel` × 2 workers の全 spec が同一 IP を共有し、狭い窓を持つ
 * limiter から順に飽和する（`formSubmitRateLimiter` は **5 req/分/IP**、
 * `apiRateLimiter` は 100 req/分/IP。E2E 免除は規約上意図的に無い）。
 * リトライも同じ窓に入るので retry では救えない。
 *
 * 実測: run 30593381788 `guest-receipt-single-use` / run 30607885778
 * `calendar-download` / run 30681869018 `inquiry-reply`（3 attempt 全滅）。
 *
 * ## 何を強制するか（構造で、heuristic ではなく）
 *
 * 旧 gate は「専用 IP が要る spec」を本文から**推定**していた。判定シグナルは
 * `request.*` → `waitForEvent("download")` → Server Action と後追いを重ねたが、
 * そのたびに漏れが CI で見つかった（推定である以上、次の漏れも必ず来る）。
 *
 * 現行は推定をやめ、**全テストに無条件で一意な IP を配る**。適用点は
 * `e2e/fixtures/e2e-test.ts` の `extraHTTPHeaders` fixture ただ 1 箇所なので、
 * gate は「その 1 箇所を迂回していないか」だけを見ればよい:
 *
 * 1. `e2e/**` から `@playwright/test` を import してよいのは共有 test 定義だけ
 * 2. spec / setup は必ずその共有 test を import する
 * 3. `extraHTTPHeaders` / `x-forwarded-for` の直書きが他所に無い
 *    （option を上書きすると fixture ごと消えて全テストが IP を共有する）
 * 4. 割当ロジック自体が範囲内かつ worker 間で衝突しない
 */

const root = process.cwd();

/** `@playwright/test` の import と client IP 割当を独占する共有 test 定義 */
const SHARED_TEST_MODULE = "e2e/fixtures/e2e-test.ts";

/** 割当ロジック本体（純粋関数のみ。Playwright に依存しない） */
const CLIENT_IP_MODULE = "e2e/helpers/client-ip.ts";

function listE2EFiles(): string[] {
  const glob = new Glob("e2e/**/*.ts");
  return [...glob.scanSync(root)].map((p) => p.split(sep).join("/")).sort();
}

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/**
 * `extraHTTPHeaders: ...` の**代入**だけを拾う。
 *
 * 行頭固定にはできない — 最も危険な形が `test.use({ extraHTTPHeaders: {...} });`
 * の 1 行書きで、行頭は `test.use({` になるため。代わりに「直前が backtick /
 * 識別子でない」+「直後が `:`」で code と散文を分ける（docstring は
 * `` `extraHTTPHeaders` `` と書くので colon が付かない）。
 */
function assignsExtraHttpHeaders(source: string): boolean {
  return /(?<![`\w.])extraHTTPHeaders\s*:/u.test(source);
}

/** `"x-forwarded-for"` の文字列リテラル（散文は backtick で囲むので当たらない） */
function quotesClientIpHeader(source: string): boolean {
  return new RegExp(`"${CLIENT_IP_HEADER}"`, "u").test(source);
}

describe("E2E client IP allocation", () => {
  /**
   * **走査集合そのもの**の下限（監査 A-24）。
   *
   * 以前の下限 assert は `clientIpLaneSize(workers)`（IP レーン幅）だけで、
   * 走査したファイル集合を見ていなかった。`e2e/` を別ディレクトリへ移すか
   * 拡張子を `.mts` に寄せると `Glob.scanSync` は throw せず `[]` を返すので、
   * 以下 3 本が全部緑になる（変異検査で実証済み）。
   */
  test("gate が空振りしていない（走査件数の下限）", () => {
    const files = listE2EFiles();
    // 実測 104 ファイル。spec / setup / helper を含む。
    expect(files.length).toBeGreaterThan(60);
    expect(files).toContain(SHARED_TEST_MODULE);
    expect(
      files.filter((rel) => rel.endsWith(".spec.ts")).length,
    ).toBeGreaterThan(30);
  });

  test("`@playwright/test` を直接 import するのは共有 test 定義だけ", () => {
    // 別の `test` オブジェクトを掴むと fixture が効かず、その spec だけ
    // 無言で IP 共有に戻る。型だけの import も共有側の re-export で足りる。
    const offenders = listE2EFiles()
      .filter((rel) => rel !== SHARED_TEST_MODULE)
      .filter((rel) => /from\s+"@playwright\/test"/u.test(read(rel)));

    expect(offenders).toEqual([]);
  });

  test("spec / setup は共有 test 定義を import する", () => {
    const missing = listE2EFiles()
      .filter((rel) => rel.endsWith(".spec.ts") || rel.endsWith(".setup.ts"))
      .filter((rel) => !read(rel).includes("fixtures/e2e-test"));

    expect(missing).toEqual([]);
  });

  test("client IP と extraHTTPHeaders の直書きが共有 test 定義の外に無い", () => {
    const allowed = new Set([SHARED_TEST_MODULE, CLIENT_IP_MODULE]);
    const offenders = listE2EFiles()
      .filter((rel) => !allowed.has(rel))
      .filter((rel) => {
        const source = read(rel);
        return assignsExtraHttpHeaders(source) || quotesClientIpHeader(source);
      });

    expect(offenders).toEqual([]);
  });

  test("playwright.config.ts が extraHTTPHeaders を設定しない", () => {
    // project / global の `use` も fixture を上書きする。管理者 identity は
    // `adminIdentity` option 経由で fixture 側が合成する。
    expect(assignsExtraHttpHeaders(read("playwright.config.ts"))).toBe(false);
  });

  test("共有 test 定義が client IP を全リクエストに載せる配線を保つ", () => {
    const fixture = read(SHARED_TEST_MODULE);

    expect(fixture).toContain("extraHTTPHeaders:");
    expect(fixture).toContain("nextClientIp(");
    expect(fixture).toContain("testInfo.parallelIndex");
    expect(fixture).toContain("testInfo.config.workers");
    // 手動生成 context 用の逃げ道（`browser.newContext()` には fixture が効かない）
    expect(fixture).toContain("primeRequestContext");
  });

  test("割当は RFC 5737 TEST-NET-3 の範囲を出ない", () => {
    for (const workers of [1, 2, 4, 8, 300]) {
      for (let parallelIndex = 0; parallelIndex < workers; parallelIndex += 1) {
        for (const sequence of [0, 1, 7, 253, 1000, 99999]) {
          const ip = clientIpForSlot(parallelIndex, workers, sequence);
          expect(ip.startsWith(`${CLIENT_IP_PREFIX}.`)).toBe(true);

          const octet = Number(ip.slice(CLIENT_IP_PREFIX.length + 1));
          expect(octet).toBeGreaterThanOrEqual(FIRST_CLIENT_IP_OCTET);
          expect(octet).toBeLessThanOrEqual(LAST_CLIENT_IP_OCTET);
        }
      }
    }
  });

  test("同時実行中の worker 同士が同じ IP を配らない", () => {
    // 採番カウンタは worker プロセスごとのモジュール状態なので、レーンを
    // 分けないと worker 0 と worker 1 が同じ値から始まる（旧実装の穴）。
    for (const workers of [2, 4, 8]) {
      const seen = new Map<string, number>();

      for (let parallelIndex = 0; parallelIndex < workers; parallelIndex += 1) {
        for (
          let sequence = 0;
          sequence < clientIpLaneSize(workers);
          sequence += 1
        ) {
          const ip = clientIpForSlot(parallelIndex, workers, sequence);
          const owner = seen.get(ip);
          expect(owner ?? parallelIndex).toBe(parallelIndex);
          seen.set(ip, parallelIndex);
        }
      }
    }
  });

  test("1 worker あたりのレーンが rate limit の窓より十分広い", () => {
    // レーンを使い切ると巡回してアドレスを再利用する。最短の窓（1 分）の間に
    // 1 worker がこの本数のテストを消化することは無い、という前提を固定する。
    for (const workers of [1, 2, 4]) {
      expect(clientIpLaneSize(workers)).toBeGreaterThanOrEqual(60);
    }
  });

  test("払い出しは呼ぶたびに進む", () => {
    const first = nextClientIp(0, 2);
    const second = nextClientIp(0, 2);

    expect(first).not.toBe(second);
  });
});
