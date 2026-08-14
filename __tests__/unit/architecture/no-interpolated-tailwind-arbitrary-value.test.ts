import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Tailwind の arbitrary value を**実行時に組み立てない**ことの gate。
 *
 * ## なぜ
 *
 * `` `max-w-[${px}px]` `` はソース上にテンプレートリテラルとしてしか現れない。
 * Tailwind v4 のスキャナは実行時の値を知り得ないので、**対応する CSS ルールが
 * 1 つも生成されない**。クラス名は DOM に付くのに効かないので、
 * ビルドも lint も型検査も通り、**壊れているのは公開画面だけ**になる。
 *
 * 実測（監査 F-75）: 記事本文の `contentWidth` が
 * `` className: `mx-auto max-w-[${preset.px}px]` `` を返していた。ビルド成果物に
 * 含まれる arbitrary な `max-w` は無関係な値だけで、プリセットの
 * 640/720/800/900/1024 も SITE 側の 900〜1400 も 1 つも無かった。結果、XS〜XL の
 * どれを選んでも、CUSTOM で任意 px を入れても本文幅が変わらない。
 *
 * admin 側のエディタは同じ SSoT の `.px` をインラインで適用するので、
 * **エディタでは変わるのに公開ページは変わらない**という WYSIWYG 乖離になっていた。
 *
 * 同じ罠は z-index でも既に踏まれており、`admin/lib/styles/z-index.ts` の JSDoc が
 * 「❌ `` className={`z-[${Z_INDEX.dropdown}]`} `` — Tailwind JIT 未生成で silent
 * bug」と明記している。2 度目なので gate にする。
 *
 * ## 何を見るか
 *
 * コメントを落としたうえで `<utility>-[${…}]` の形を探す。JSDoc の「❌ こう書くな」
 * という**例示は対象外**にしたいので、コメント除去が要る。
 *
 * ## 直し方
 *
 * 解決済みの値は `style`（または CSS 変数）で渡す。
 * `resolveWidthStyles` / `getContainerSiteCss` が見本。
 */

const SRC_DIR = join(process.cwd(), "src");

/** `foo-[${expr}]` — arbitrary value の中に補間があるもの。 */
const INTERPOLATED_ARBITRARY = /[a-z][\w-]*-\[[^\]\n]*\$\{/gu;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|\s)\/\/.*$/gmu, "");
}

function listSourceFiles(): string[] {
  return [...new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: SRC_DIR })].sort();
}

describe("Tailwind の arbitrary value を実行時に組み立てない", () => {
  const files = listSourceFiles();

  test("gate が空振りしていない", () => {
    // 走査規模の下限。`src/` は 4 桁ファイルある。
    expect(files.length).toBeGreaterThan(500);

    // 判定の見本。**元の欠陥そのものの形**が違反と判定されること。
    const original = "className: `mx-auto max-w-[${preset.px}px]`";
    const zIndex = "className={`z-[${Z_INDEX.dropdown}]`}";
    expect(INTERPOLATED_ARBITRARY.test(stripComments(original))).toBe(true);
    INTERPOLATED_ARBITRARY.lastIndex = 0;
    expect(INTERPOLATED_ARBITRARY.test(stripComments(zIndex))).toBe(true);
    INTERPOLATED_ARBITRARY.lastIndex = 0;

    // 落ちてはいけない形: 静的な arbitrary value と、style での指定。
    const staticClass = 'className="max-w-[640px] z-[60]"';
    const inlineStyle = "style={{ maxWidth: `${px}px` }}";
    expect(INTERPOLATED_ARBITRARY.test(stripComments(staticClass))).toBe(false);
    INTERPOLATED_ARBITRARY.lastIndex = 0;
    expect(INTERPOLATED_ARBITRARY.test(stripComments(inlineStyle))).toBe(false);
    INTERPOLATED_ARBITRARY.lastIndex = 0;

    // コメント内の「❌ こう書くな」は対象外（z-index.ts の JSDoc が実在する）。
    const inComment = "// ❌ className={`z-[${Z_INDEX.dropdown}]`}";
    expect(INTERPOLATED_ARBITRARY.test(stripComments(inComment))).toBe(false);
    INTERPOLATED_ARBITRARY.lastIndex = 0;
  });

  test("補間された arbitrary value が無い", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(join(SRC_DIR, file), "utf8"));
      for (const match of source.matchAll(INTERPOLATED_ARBITRARY)) {
        offenders.push(
          `src/${file}: ${match[0]}…] — Tailwind は実行時の値を知らないので CSS が生成されない。解決済みの値を style か CSS 変数で渡すこと`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });
});
