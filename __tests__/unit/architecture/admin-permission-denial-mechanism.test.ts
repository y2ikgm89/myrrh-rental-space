import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 管理画面の権限拒否は `notFound()` で「その場に描画」する（`redirect()` 禁止）。
 *
 * ## なぜ
 *
 * `(dashboard)/layout.tsx` は `children` を `<Suspense>` の内側に置き、
 * `DashboardChromeResolved` が `connection()` で suspend する。fallback が
 * 描画された時点で公式定義上ストリーミングが開始するため、その後の `redirect()` は
 * HTTP 3xx を返せず meta タグに劣化する:
 *
 * > When used in a streaming context, this will insert a meta tag to emit the
 * > redirect on the client side. — redirect API リファレンス (v16.2.12)
 *
 * 劣化した meta refresh は axe の `meta-refresh` critical (WCAG 2.2.1 / 2.2.4)。
 * **ページ本体のどこにガードを置いても layout の境界は越えられない**ので、
 * redirect である限りこの劣化は避けられない（PR #1704 に対する Codex P1 指摘）。
 *
 * `notFound()` は遷移ではなく最寄りの `not-found.tsx` をその場に描画するため
 * meta タグ自体が出ない。ストリーミング下でも公式に成立する経路。
 *
 * `forbidden()` は採らない — v16.2.12 でも `experimental.authInterrupts` 必須の
 * experimental で「本番非推奨」と明記され、公式ガイドも一切言及しないため。
 *
 * E2E 側の実測は
 * `e2e/authenticated/admin-viewer/axe-admin-viewer-pages.spec.ts` が担う。
 */

const root = process.cwd();

const HELPERS_FILE =
  "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts";
const NOT_FOUND_BOUNDARY = "src/app/(admin)/admin/(dashboard)/not-found.tsx";

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/** 散文の言及を違反に数えないようコメントを落とす */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

describe("管理画面の権限拒否は notFound() で表現する", () => {
  test("_helpers.ts は redirect を使わない", () => {
    const source = stripComments(read(HELPERS_FILE));

    expect(source).not.toMatch(/\bredirect\s*\(/u);
    expect(source).not.toMatch(/from\s+"next\/navigation"[\s\S]*redirect/u);
  });

  test("_helpers.ts は notFound を import して拒否経路で呼ぶ", () => {
    const source = stripComments(read(HELPERS_FILE));

    expect(source).toMatch(
      /import\s*\{\s*notFound\s*\}\s*from\s+"next\/navigation"/u,
    );
    expect(source).toMatch(
      /function denyAdminAccess\(\)\s*:\s*never\s*\{\s*notFound\(\);/u,
    );

    // hasPermission / userHasResourceAccess の両拒否分岐が経由すること
    const calls = [...source.matchAll(/denyAdminAccess\(\)/gu)].length;
    expect(calls).toBeGreaterThanOrEqual(3); // 定義 1 + 呼び出し 2
  });

  test("拒否時に描画される not-found 境界が存在し、権限不足に言及する", () => {
    // `notFound()` は最寄りの not-found.tsx を描画する。dashboard 配下に無いと
    // global-not-found へ落ち、管理画面 chrome の外に飛ぶ。
    const boundary = read(NOT_FOUND_BOUNDARY);

    expect(boundary).toContain("アクセス権限がない可能性があります");
  });
});
