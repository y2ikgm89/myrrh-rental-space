import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `feature-module-off-gate.spec.ts` が検証するルートは **未認証で到達できる**もの
 * だけに限る、という gate。
 *
 * ## なぜ
 *
 * この spec は `chromium` project で走り、`playwright.config.ts` の同 project は
 * `storageState` を持たない ＝ **未認証の訪問者**として実行される。
 *
 * 一方 `(public)/mypage/layout.tsx` は `requireMypageSession()` を呼び、**layout は
 * page より先に評価される**。したがって `/mypage/**` を対象に入れると、layout の
 * 認証が先に `/login` へ送り、page 本体の `requireFeatureEnabled(...)` に
 * **構造的に到達できない**。feature gate の可否とは無関係に必ず失敗する。
 *
 * さらにストリーミング下の `redirect()` は client-side redirect へ劣化するため、
 * 初期 HTML は mypage layout のもの（`<title>マイページ | …`）のまま残り、
 * 「gate は効いているのに title が変わらない」という**誤診を誘発**する。
 *
 * 実測 (CI run 30670082842): #1760 が soft assertion 化して全 9 ルートの結果が
 * 揃った結果、落ちたのは `/mypage/inquiries` のみ。他の 8 本（`/contact` `/blog`
 * `/reservation` `/reservation/complete` `/claim/reservation` `/events`
 * `/claim/event-registration` `/spaces`）は全て通過した。**認証が要る唯一の
 * ルートだけが落ちていた**。
 *
 * ## 何がカバーを失うか（失わない）
 *
 * gate 呼び出しが存在することは `public-route-gates.test.ts` が静的に守る。
 * 認証付き route のランタイム検証が必要になったら、storageState を持つ
 * `chromium-customer` project 側の spec に置くこと。この gate はそれを
 * 「public spec に混ぜない」ためのもので、検証をやめる口実ではない。
 */

const root = process.cwd();

const SPEC_PATH = "e2e/public/feature-module-off-gate.spec.ts";

/**
 * 未認証では到達できない URL 接頭辞（layout / proxy が先に認証する）。
 *
 * `/reservation/complete?token=` や `/claim/*?token=` は **token 認可**であって
 * セッション認証ではないため対象外。実際に CI で通過している。
 */
const SESSION_AUTHENTICATED_PREFIXES = [
  "/mypage",
  "/admin",
  "/preview",
] as const;

function readSpec(): string {
  return readFileSync(join(root, ...SPEC_PATH.split("/")), "utf8");
}

/** `MODULE_CASES` の `routes: [...]` に現れるルート指定を集める。 */
function collectModuleCaseRoutes(source: string): string[] {
  const start = source.indexOf("const MODULE_CASES");
  expect(start).toBeGreaterThan(-1);

  const end = source.indexOf("\n];", start);
  expect(end).toBeGreaterThan(start);

  const block = source.slice(start, end);
  return [...block.matchAll(/routes:\s*\[([\s\S]*?)\]/gu)].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && !entry.startsWith("//")),
  );
}

/**
 * `urls.foo` 表記を `e2e/fixtures/test-data.ts` の実 path へ解決する。
 * テンプレートリテラル（`/claim/reservation?token=...`）はそのまま返す。
 */
function resolveRoute(entry: string, urlsSource: string): string {
  const named = /^urls\.(?<key>\w+)$/u.exec(entry)?.groups?.["key"];
  if (named === undefined) return entry;

  const value = new RegExp(`\\b${named}:\\s*"(?<path>[^"]+)"`, "u").exec(
    urlsSource,
  )?.groups?.["path"];
  expect(value).toBeDefined();
  return value ?? entry;
}

describe("feature-module OFF gate は未認証で到達できるルートだけを検証する", () => {
  test("MODULE_CASES にセッション認証が要るルートが混ざっていない", () => {
    const source = readSpec();
    const urlsSource = readFileSync(
      join(root, "e2e", "fixtures", "test-data.ts"),
      "utf8",
    );

    const entries = collectModuleCaseRoutes(source);
    // gate が空振りしていないことの sanity check
    expect(entries.length).toBeGreaterThan(0);

    const offenders = entries
      .map((entry) => ({ entry, path: resolveRoute(entry, urlsSource) }))
      .filter(({ path }) =>
        SESSION_AUTHENTICATED_PREFIXES.some((prefix) => path.includes(prefix)),
      )
      .map(
        ({ entry, path }) =>
          `${entry} (${path}) は layout の認証が先に走るため未認証 project では検証できない`,
      );

    expect(offenders).toEqual([]);
  });

  test("この spec が未認証 project で走っている前提が保たれている", () => {
    // `chromium` project に storageState が付いたらこの gate の前提が崩れる。
    const config = readFileSync(join(root, "playwright.config.ts"), "utf8");
    const chromium = /name:\s*"chromium",([\s\S]{0,300}?)\},/u.exec(
      config,
    )?.[1];

    expect(chromium).toBeDefined();
    expect(chromium ?? "").not.toContain("storageState");
  });
});
