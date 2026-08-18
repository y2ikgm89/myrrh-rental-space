import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  EMPTY_STYLE_HASH,
  SONNER_STYLE_HASH,
  STYLE_ELEMENT_HASHES,
} from "@/shared/lib/csp/inline-style-hashes";

/**
 * `style-src` の hash-source drift gate。
 *
 * `sonner` は module 評価時に `__insertCSS(...)` で `<style>` を注入し、nonce を受け取る
 * API を持たない。そのため CSP は内容一致 hash で通しているが、**sonner を上げると
 * CSS 本体が変わって hash がずれ、本番で toast のスタイルが全部落ちる**（CSP block）。
 *
 * この gate はインストール済みの `sonner` から hash を再計算して突き合わせる。
 * 落ちたら `src/shared/lib/csp/inline-style-hashes.ts` の値を出力どおりに更新すること。
 *
 * SSoT: `src/shared/lib/csp/inline-style-hashes.ts` / `src/proxy.ts` の `buildCsp`
 */

const QUOTES = new Set(["'", '"', "`"]);

function sha256Base64(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64");
}

function toCspHash(value: string): string {
  return `'sha256-${sha256Base64(value)}'`;
}

/**
 * `__insertCSS("…")` に渡される文字列リテラルを 1 つ取り出す。
 * dist は minify されていないため、素直なスキャンで十分。
 *
 * **エスケープの解釈は行わない。** 現行 sonner の CSS リテラルは backslash を 1 つも
 * 含まないため、生の slice がそのまま実際に注入される文字列と一致する（hash 一致で実証済み）。
 * 自前で unescape すると取りこぼしが silent な hash ずれになるので、backslash を見つけたら
 * 解釈せずに throw して「sonner 側の表現が変わった」ことを気付かせる。
 */
function readSonnerInjectedCss(): string {
  const source = readFileSync(
    join(process.cwd(), "node_modules", "sonner", "dist", "index.mjs"),
    "utf8",
  );

  const marker = "__insertCSS(";
  let index = source.indexOf(marker);
  while (index !== -1) {
    const start = index + marker.length;
    const quote = source[start];
    if (quote !== undefined && QUOTES.has(quote)) {
      const end = source.indexOf(quote, start + 1);
      if (end === -1) {
        throw new Error("sonner dist の文字列リテラルが閉じていません");
      }
      const literal = source.slice(start + 1, end);
      if (literal.includes("\\")) {
        throw new Error(
          "sonner の CSS リテラルに escape が入りました。生 slice では hash が合わなくなるため、抽出方法を見直してください",
        );
      }
      return literal;
    }
    index = source.indexOf(marker, start);
  }

  throw new Error(
    "sonner dist から __insertCSS の文字列リテラルを見つけられませんでした",
  );
}

describe("style-src hash-source が sonner の実体と一致する", () => {
  test("空 <style>（sonner が中身を入れる前に挿入する）の hash", () => {
    expect(toCspHash("")).toBe(EMPTY_STYLE_HASH);
  });

  test("sonner が注入する CSS の hash", () => {
    const css = readSonnerInjectedCss();
    expect(css.length).toBeGreaterThan(1000);
    expect(toCspHash(css)).toBe(SONNER_STYLE_HASH);
  });

  test("CSP に載せる hash は 2 つだけ", () => {
    expect([...STYLE_ELEMENT_HASHES]).toEqual([
      EMPTY_STYLE_HASH,
      SONNER_STYLE_HASH,
    ]);
  });
});

describe("proxy の CSP directive", () => {
  const proxySource = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");

  test("style-src は dev で 'unsafe-inline'、本番で nonce + hash（同居させない）", () => {
    // Next.js 公式 CSP guide「Development vs Production Considerations」:
    // next-devtools は nonce を受け取らないので、dev だけ 'unsafe-inline'。
    // CSP3 では nonce/hash と 'unsafe-inline' が同居すると後者が無視されるため、
    // 三項の両枝に混ぜてはいけない。
    expect(proxySource).toContain(
      "style-src 'self' ${isDev ? \"'unsafe-inline'\" : `'nonce-${nonce}' ${STYLE_ELEMENT_HASHES.join(\" \")}`};",
    );
  });

  test("style-src-attr は 'unsafe-inline' 単独（hash を混ぜると無視される）", () => {
    expect(proxySource).toContain("style-src-attr 'unsafe-inline';");
    expect(proxySource).not.toContain("style-src-attr 'unsafe-hashes'");
  });
});
