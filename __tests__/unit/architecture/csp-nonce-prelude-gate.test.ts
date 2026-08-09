import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * CSP nonce の prelude gate が build から外れていないことの drift gate。
 *
 * `src/proxy.ts` の CSP は `script-src 'self' 'nonce-…' 'strict-dynamic'`。CSP3 では
 * `'strict-dynamic'` があると host-source（`'self'`）は無視されるため、nonce の無い
 * `<script src="/_next/…">` はブロックされる。Next.js は **request の CSP ヘッダーから**
 * nonce を取り出すので、ビルド時に prerender された HTML には nonce を付けられない
 * （公式 CSP ガイド: nonce 利用時は全ページ動的レンダリングが必要。PPR も
 * *static shell scripts cannot access the nonce* のため非互換）。
 *
 * 実害: `global-not-found.tsx` が `○ (Static)` だった間、`/_not-found` は nonce 無しの
 * `<script>` を 13 本抱えた静的 HTML を配信していた（本番 404 ページの JS が全ブロック）。
 * route 表の `ƒ/◐/○` を目視する旧運用ではこれを 1 度も検出できなかった
 * （◐ は 45 route あるが prelude が空なので無害 = 目視では区別が付かない）。
 *
 * そのため gate は **ビルド成果物を直接検査する** `scripts/check-static-prelude-empty.ts`
 * に一本化した。このテストは、その gate が build スクリプトから外れていないことだけを
 * 見る（gate 本体は build 時に実行される）。
 *
 * 契約: cacheComponents + strict-dynamic CSP 下で static prelude は空であること。
 */

const GATE_SCRIPT = "bun scripts/check-static-prelude-empty.ts";

/** `next build` を実行するすべての entry point。ここを増やしたら gate も足す。 */
const BUILD_SCRIPTS = ["build", "build:skip-env:next"] as const;

function readScripts(): Record<string, string> {
  const parsed: unknown = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  );
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("package.json did not parse to an object");
  }
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (typeof scripts !== "object" || scripts === null) {
    throw new Error("package.json has no scripts object");
  }
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value === "string") result[name] = value;
  }
  return result;
}

describe("CSP nonce prelude gate", () => {
  const scripts = readScripts();

  for (const name of BUILD_SCRIPTS) {
    test(`${name} が prelude gate を実行する`, () => {
      const command = scripts[name];
      expect(command).toBeDefined();
      expect(command).toContain("next build");
      expect(command).toContain(GATE_SCRIPT);
    });
  }

  test("gate を通す build entry point を数え漏らしていない", () => {
    const runsNextBuild = Object.entries(scripts)
      .filter(([, command]) => / next build(\s|$)/u.test(command))
      .map(([name]) => name)
      .sort();

    // `next experimental-analyze` は bundle 解析専用で prerender 成果物を作らないため対象外。
    expect(runsNextBuild).toEqual([...BUILD_SCRIPTS].sort());
  });
});
