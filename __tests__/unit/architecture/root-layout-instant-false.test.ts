/**
 * 両 root layout が `export const instant = false` を持つことを固定する。
 *
 * ## なぜ
 *
 * nonce CSP (`strict-dynamic`) + `cacheComponents` のため、両 root layout の
 * `generateViewport()` は `await connection()` で route を完全動的(ƒ)にする。
 * Next.js 16.3 Instant Navigations の static-shell 検証は、この uncached
 * access を E1440 (`blocking-prerender-dynamic`) として診断する。
 *
 * 公式の blocking-route 宣言は `export const instant = false`
 * （https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant ）。
 * root に置くと static-shell 検証が route 全体で免除される。ページ単位の暗黙
 * instant 検証（E1438）は `experimental.instantInsights.validationLevel:
 * 'manual-warning'` が担当する（別 gate）。
 *
 * `<html>` を `<Suspense>` で包む公式 viewport opt-in は nonce 注入の必要十分条件
 * だが、dev の static-shell 検証を黙らせる公式入口は `instant = false` である。
 *
 * ## 何を見るか
 *
 * 両 root layout のソース（コメント除去後）に
 * `export const instant = false` があること。
 *
 * ## 直し方
 *
 * 落ちたら該当 layout から `export const instant = false` が消えている。
 * 消したくなった理由が「静的シェルを出荷して instant navigation を採用する」
 * なら、`generateViewport` の `connection()` も一緒に外してこの gate を削除する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT_LAYOUTS = [
  "src/app/(admin)/layout.tsx",
  "src/app/(public)/layout.tsx",
] as const;

function read(rel: string): string {
  return readFileSync(join(process.cwd(), ...rel.split("/")), "utf8");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

describe("root layouts opt out of instant static-shell validation", () => {
  test("both root layouts export instant = false", () => {
    for (const rel of ROOT_LAYOUTS) {
      const source = stripComments(read(rel));
      expect(source, rel).toMatch(/export\s+const\s+instant\s*=\s*false\b/u);
    }
  });

  test("fixture: a layout without instant = false fails the predicate", () => {
    const without =
      "export async function generateViewport() { await connection(); }";
    expect(without).not.toMatch(/export\s+const\s+instant\s*=\s*false\b/u);
  });
});
