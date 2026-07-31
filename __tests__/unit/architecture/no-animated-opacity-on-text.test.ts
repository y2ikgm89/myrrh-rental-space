import { readFileSync } from "node:fs";
import { sep } from "node:path";

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * テキストに opacity アニメーション（`animate-pulse`）を掛けないことの gate。
 *
 * ## なぜ
 *
 * `animate-pulse` は `opacity: 1 → .5 → 1` を繰り返す。テキスト要素に掛けると
 * **周期の半分で実効コントラストが半減**し、WCAG 2.1 SC 1.4.3（通常テキスト 4.5:1）を割る。
 *
 * 実測（CI run 30635688437 / axe `color-contrast` serious）:
 *
 * | 要素                                            | 実効色      | 比       |
 * | ----------------------------------------------- | ----------- | -------- |
 * | `text-muted-foreground` (opacity 1)             | `#5b646f`   | **5.65** |
 * | 同上 + `animate-pulse` の最小 opacity (0.5)     | `#a8afb5`   | **2.10** |
 *
 * axe は測定タイミングが周期のどこに当たるかで 2.2 / 3.25 / 3.89 / 4.3 とばらつき、
 * `lexical-toolbar-roving-tabindex` と `axe-admin-pages`（投稿新規作成）の 2 spec で
 * 断続的に落ちていた。**flaky に見えるが実体は恒常的な a11y 違反**。
 *
 * ## 対処方針
 *
 * ローディングの合図は「テキストを点滅させる」のではなく、
 * 文言（"読み込み中..."）と非テキストの `Skeleton` ブロックで表現する。
 * `animate-pulse` を使うのは**テキスト色を持たない矩形**に限る。
 *
 * この gate は「同一要素に `animate-pulse` と前景色ユーティリティが同居する」形だけを
 * 禁止する。祖先に `animate-pulse` を置いて子孫にテキストを含む形（settings の
 * skeleton 群）は、子孫が `Skeleton` の矩形のみなら適法なので対象にしない。
 */

const SOURCE_GLOB = "src/**/*.tsx";

/** 同一 className 内に `animate-pulse` と `text-<色>` が同居するか。 */
const PULSING_TEXT =
  /className=\{?"[^"]*\banimate-pulse\b[^"]*\btext-(?:muted-)?foreground\b[^"]*"|className=\{?"[^"]*\btext-(?:muted-)?foreground\b[^"]*\banimate-pulse\b[^"]*"/u;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

function listSourceFiles(): string[] {
  return [...new Glob(SOURCE_GLOB).scanSync(process.cwd())]
    .map((path) => path.split(sep).join("/"))
    .sort();
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const file of listSourceFiles()) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = PULSING_TEXT.exec(line);
      if (!match) return;
      violations.push({
        file,
        line: index + 1,
        snippet: match[0].slice(0, 90),
      });
    });
  }

  return violations;
}

describe("テキストに opacity アニメーションを掛けない (WCAG 2.1 SC 1.4.3)", () => {
  test("animate-pulse と前景色ユーティリティが同一要素に同居しない", () => {
    const violations = findViolations().map(
      ({ file, line, snippet }) => `${file}:${String(line)} ${snippet}`,
    );

    expect(violations).toEqual([]);
  });
});
