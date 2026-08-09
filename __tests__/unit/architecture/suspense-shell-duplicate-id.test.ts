import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Suspense の fallback と解決後の本体が同じ DOM id を持たないことの gate。
 *
 * 背景: `event-registration-section.tsx` は fallback と本体が各々
 * `<section id="event-register" aria-labelledby="event-register-heading">` を
 * 描画していた。fallback → 本体の差し替え前後で **アンカーの飛び先が別要素に
 * すり替わる**（片方しか存在しない瞬間もある）ため、`#event-register` への
 * ページ内リンクが不定になる。
 *
 * 正しい形は「安定した外殻（id + 見出し）を Suspense の外に置き、
 * 中身だけを差し替える」。この gate はその構造を固定する。
 *
 * **この gate はストリーミング中の DOM 二重化を解決しない**（当初はそう書いていたが
 * 誤り）。React は完了した boundary の HTML を hidden な staging container に流し込み、
 * stylesheet 待ち + バッチで in-place と差し替えるため、boundary の内側にある DOM は
 * 一時的に 2 箇所へ同時に存在する。ページ本体は `loading.tsx` と root layout の
 * `<Suspense>`（`generateViewport` 公式 opt-in）の内側にあるので、外殻をどこに
 * 置いても二重化そのものは消えない。E2E 側の対処が SSoT:「id セレクタ禁止」
 * （eslint.config.mjs の no-restricted-syntax が強制）。
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
