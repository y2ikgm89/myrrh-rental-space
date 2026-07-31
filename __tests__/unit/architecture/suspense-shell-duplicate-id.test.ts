import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Suspense の fallback と解決後の本体が同じ DOM id を持たないことの gate。
 *
 * 背景: `event-registration-section.tsx` は fallback と本体が各々
 * `<section id="event-register" aria-labelledby="event-register-heading">` を
 * 描画していた。ストリーミング中は両方が DOM に載るため id が重複し、
 * WCAG 4.1.1 / axe `duplicate-id-aria` 違反かつアンカーの飛び先が不定になる。
 * `#event-register` を strict locator で掴む TOCTOU spec が 2 要素マッチで
 * 落ちたことで発覚した（CI run 30593381788）。
 *
 * 正しい形は「安定した外殻（id + 見出し）を Suspense の外に置き、
 * 中身だけを差し替える」。この gate はその構造を固定する。
 *
 * 汎用の「1 ファイル内で id 重複禁止」は排他的な三項分岐（例:
 * `profile-form.tsx` の `profile-email-help`）で偽陽性になるため採らない。
 */

const root = process.cwd();

const SECTION_FILE =
  "src/app/(public)/events/[slug]/_components/event-registration-section.tsx";
const PAGE_FILE = "src/app/(public)/events/[slug]/page.tsx";

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/**
 * 散文でこの規約を説明するコメントを違反として数えないよう、
 * ブロック / 行コメントを落としてから走査する。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

describe("Suspense shell が DOM id を重複させない", () => {
  test("アンカー id は定数 1 箇所からのみ描画される", () => {
    const source = stripComments(read(SECTION_FILE));

    // 定数宣言 1 つのみ。JSX 側は定数参照 (`id={REGISTER_ANCHOR_ID}`) で書く。
    const literalCount = [...source.matchAll(/"event-register"/gu)].length;
    expect(literalCount).toBe(1);

    const headingIdCount = [...source.matchAll(/"event-register-heading"/gu)]
      .length;
    expect(headingIdCount).toBe(1);
  });

  test("fallback は外殻 section を描画しない", () => {
    const source = stripComments(read(SECTION_FILE));
    const fallback = /export function EventRegistrationSectionFallback[\s\S]*$/u
      .exec(source)?.[0]
      .split("\n")
      .slice(0, 20)
      .join("\n");

    expect(fallback).toBeDefined();
    expect(fallback).not.toContain("<section");
    expect(fallback).not.toContain("id=");
  });

  test("page は Suspense を外殻の内側に置く", () => {
    const source = read(PAGE_FILE);

    const shellOpen = source.indexOf("<EventRegistrationSectionShell>");
    const suspense = source.indexOf(
      "<Suspense fallback={<EventRegistrationSectionFallback />}>",
    );
    const shellClose = source.indexOf("</EventRegistrationSectionShell>");

    expect(shellOpen).toBeGreaterThan(-1);
    expect(suspense).toBeGreaterThan(shellOpen);
    expect(shellClose).toBeGreaterThan(suspense);
  });
});
