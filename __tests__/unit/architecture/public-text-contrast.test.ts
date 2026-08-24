/**
 * **公開面の補助テキストに alpha 修飾子を付けない。**
 *
 * ## なぜ
 *
 * 管理画面にはコントラスト gate が 4 本ある（`admin-dimmed-control-contrast` /
 * `admin-overlay-surface-contrast` / `admin-feature-disabled-contrast` /
 * `admin-editor-header-contrast`）が、どれも走査根が `src/app/(admin)` 固定で
 * **公開面を 1 行も見ていない**。その空白地帯に実際の WCAG 1.4.3 AA 未達が
 * 5 箇所あった:
 *
 * | 箇所 | クラス | 実測 |
 * | --- | --- | --- |
 * | 記事目次の h3 項目 | `text-muted-foreground/70` | 3.95 |
 * | イベント詳細の補足 | `text-muted-foreground/70` | 3.95 |
 * | メンテナンス告知 | `text-muted-foreground/60` | 3.11 |
 * | input の placeholder | `placeholder:text-muted-foreground/60` | 3.11 |
 * | textarea の placeholder | 同上 | 3.11 |
 *
 * alpha は**下地を畳み込む**ので、同じクラスでも card の上ではさらに下がる
 * （`/70` は 3.80、`/60` は 3.02）。placeholder は擬似要素なので
 * **axe-core でも検出できない** — 静的に見るしかない。
 *
 * ## 何を見るか
 *
 * TypeScript の AST で JSX 要素を走査し、`className` の下にある文字列リテラルを
 * その要素の class 集合として集める（`cn("a", cond ? "b" : "c")` を含む）。
 *
 * 1. `placeholder:text-<token>/<alpha>` は**無条件に違反**。placeholder は常に
 *    テキストで、alpha を付ける正当な理由がない。
 * 2. `text-muted-foreground/<alpha>` は、その要素にフォントサイズクラス
 *    （`text-xs` / `text-sm` / `text-[0.8125rem]` 等）が同居していれば
 *    テキストとみなし、`background` と `card` の**両方**で AA を要求する。
 *    下地は静的には決まらないので、悪いほう（card）に合わせる。
 * 3. トークン自身（`muted-foreground` / `muted-foreground-subtle`）が
 *    両方の下地で AA を満たすこと。
 *
 * ## 対象外にするもの（理由は要素自身が持つ）
 *
 * - `aria-hidden="true"` の要素 — 装飾。1.4.3 の対象外
 * - alpha クラスと**同じ文字列リテラル**に `cursor-not-allowed` / `disabled:` が
 *   ある場合 — 無効コンポーネントは WCAG の明示的な例外
 *
 * allowlist は作らない。免除の理由は対象の className そのものに書かれている。
 *
 * ## 粗いところ（承知のうえ）
 *
 * - `muted-foreground` 以外の色（`accent` / `background` / `foreground` / `white`）は
 *   見ない。ヒーローや scrim は**画像の上**に載るので、下地が静的に決まらず
 *   比率を出せない。検査できないものを検査できるように書かない。
 * - サイズクラスは要素単位、無効マーカーはリテラル単位で見る。分岐ごとの
 *   厳密な対応は取らない。
 *
 * ## 直し方
 *
 * `text-muted-foreground-subtle` を使う。alpha ではなく実色のトークンで、
 * `public.css` に定義と根拠がある。装飾なら `aria-hidden` を付ける。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isJsxAttribute,
  isJsxElement,
  isJsxSelfClosingElement,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  type JsxAttributes,
  type Node,
} from "typescript";

import {
  AA_MIN_RATIO,
  contrastRatio,
  createOklchTokenReader,
  over,
} from "../../helpers/color-contrast";
import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();
const PUBLIC_CSS = join(ROOT, "src/app/(public)/_styles/public.css");

const readToken = createOklchTokenReader(readFileSync(PUBLIC_CSS, "utf8"));

/** 公開面でテキストが載りうる下地。悪いほうに合わせるので両方見る。 */
const GROUNDS = [
  { name: "background", rgb: readToken("background") },
  { name: "card", rgb: readToken("card") },
] as const;

/** フォントサイズを与えるクラス。`text-left` のような非サイズ utility は除く。 */
const TEXT_SIZE_PATTERN =
  /(?:^|:)text-(?:xs|sm|base|lg|[2-9]?xl|\[[\d.]+(?:rem|px|em)\])$/u;

/** 無効コンポーネントの印。WCAG 1.4.3 の対象外。 */
const INACTIVE_MARKERS = ["cursor-not-allowed", "disabled:"] as const;

type Finding = {
  readonly file: string;
  readonly className: string;
  readonly ratio: number;
  readonly ground: string;
};

function parse(file: string, source: string) {
  return createSourceFile(
    file,
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  );
}

/** 部分木のすべての文字列リテラル（テンプレートリテラルの素の形も拾う）。 */
function stringLiteralsIn(node: Node): string[] {
  const out: string[] = [];
  const visit = (current: Node): void => {
    if (isStringLiteral(current) || isNoSubstitutionTemplateLiteral(current)) {
      out.push(current.text);
    }
    forEachChild(current, visit);
  };
  visit(node);
  return out;
}

function hasAriaHidden(attributes: JsxAttributes): boolean {
  return attributes.properties.some(
    (property) =>
      isJsxAttribute(property) &&
      property.name.getText() === "aria-hidden" &&
      property.initializer !== undefined,
  );
}

function classNameLiterals(attributes: JsxAttributes): string[] {
  for (const property of attributes.properties) {
    if (!isJsxAttribute(property)) continue;
    const name = property.name.getText();
    if (name !== "className" || property.initializer === undefined) continue;
    return stringLiteralsIn(property.initializer);
  }
  return [];
}

/** `text-muted-foreground/70` → 0.7。alpha が無ければ null。 */
function mutedAlpha(className: string): number | null {
  const match = /^(?:[a-z-]+:)*text-muted-foreground\/(\d{1,3})$/u.exec(
    className,
  );
  if (match === null) return null;
  const raw = match[1];
  if (raw === undefined) return null;
  return Number(raw) / 100;
}

function isPlaceholderAlphaText(className: string): boolean {
  return /^placeholder:text-[a-z][a-z0-9-]*\/\d{1,3}$/u.test(className);
}

function splitClasses(literals: readonly string[]): string[] {
  return literals.flatMap((literal) => literal.split(/\s+/u)).filter(Boolean);
}

/** 1 ファイル分の違反。 */
export function findLowContrastText(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const sourceFile = parse(file, source);
  const mutedRgb = readToken("muted-foreground");

  const visit = (node: Node): void => {
    const attributes = isJsxSelfClosingElement(node)
      ? node.attributes
      : isJsxElement(node)
        ? node.openingElement.attributes
        : null;

    if (attributes !== null && !hasAriaHidden(attributes)) {
      const literals = classNameLiterals(attributes);
      const classes = splitClasses(literals);
      const hasTextSize = classes.some((name) => TEXT_SIZE_PATTERN.test(name));

      for (const literal of literals) {
        const inactive = INACTIVE_MARKERS.some((marker) =>
          literal.includes(marker),
        );
        for (const className of literal.split(/\s+/u).filter(Boolean)) {
          const alpha = mutedAlpha(className);
          const placeholder = isPlaceholderAlphaText(className);
          if (!placeholder && (alpha === null || !hasTextSize || inactive)) {
            continue;
          }
          // 合成は `over()` に任せる。`Rgb` は 0–255 ではなく **0–1 正規化**なので、
          // チャンネルごとに自分で `Math.round` すると 0.6 が 1 になって
          // 真っ白に潰れる（実装中に踏んで比率が 1.04 と出た）。
          //
          // placeholder に muted 以外の色を使う実装は今は無い。将来出たら
          // ここで muted として計算してしまうので、そのときは token 名を
          // クラスから取るように広げる。
          for (const ground of GROUNDS) {
            const ratio =
              alpha === null
                ? 0
                : contrastRatio(over(mutedRgb, ground.rgb, alpha), ground.rgb);
            if (ratio < AA_MIN_RATIO) {
              findings.push({
                file,
                className,
                ratio: Number(ratio.toFixed(2)),
                ground: ground.name,
              });
            }
          }
        }
      }
    }
    forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

const publicTsxFiles = trackedTextFiles(ROOT).filter(
  (file) => file.startsWith("src/app/(public)/") && file.endsWith(".tsx"),
);

describe("公開面のテキストコントラスト", () => {
  test("走査が空振りしていない", () => {
    expect(publicTsxFiles.length).toBeGreaterThan(100);
  });

  test("弱色トークンは background と card の両方で AA を満たす", () => {
    const subtle = readToken("muted-foreground-subtle");
    const muted = readToken("muted-foreground");
    const results = GROUNDS.flatMap((ground) => [
      {
        token: "muted-foreground-subtle",
        ground: ground.name,
        ok: contrastRatio(subtle, ground.rgb) >= AA_MIN_RATIO,
      },
      {
        token: "muted-foreground",
        ground: ground.name,
        ok: contrastRatio(muted, ground.rgb) >= AA_MIN_RATIO,
      },
    ]);
    expect(results.filter((result) => !result.ok)).toEqual([]);
  });

  test("落ちるべき形: サイズクラスと同居する muted の alpha", () => {
    const source = `export const A = () => (
      <p className="text-xs text-muted-foreground/60">ご不便をおかけします</p>
    );`;
    expect(
      findLowContrastText("src/app/(public)/fixture.tsx", source).map(
        (finding) => `${finding.className}@${finding.ground}`,
      ),
    ).toEqual([
      "text-muted-foreground/60@background",
      "text-muted-foreground/60@card",
    ]);
  });

  test("落ちるべき形: placeholder の alpha", () => {
    const source = `export const A = () => (
      <input className="text-sm placeholder:text-muted-foreground/60" />
    );`;
    expect(
      findLowContrastText("src/app/(public)/fixture.tsx", source),
    ).not.toEqual([]);
  });

  test("落ちるべき形: cn() の分岐の中でも見つける", () => {
    const source = `export const A = ({ on }: { on: boolean }) => (
      <span className={cn("text-sm", on ? "text-foreground" : "text-muted-foreground/70")} />
    );`;
    expect(
      findLowContrastText("src/app/(public)/fixture.tsx", source),
    ).not.toEqual([]);
  });

  test("落ちてはいけない形: 弱色トークン / 装飾 / 無効 / サイズなし", () => {
    const cases = [
      // 実色の弱色トークン（これが直し方）
      `export const A = () => <p className="text-xs text-muted-foreground-subtle">x</p>;`,
      // 装飾。理由は要素自身の aria-hidden が持つ
      `export const A = () => <span aria-hidden="true" className="text-lg text-muted-foreground/30">·</span>;`,
      // 無効コンポーネント。同じリテラルに理由がある
      `export const A = () => <button className={cn("text-sm", "cursor-not-allowed text-muted-foreground/30 line-through")} />;`,
      // アイコン。サイズクラスが無いのでテキストではない
      `export const A = () => <Icon className="h-4 w-4 text-muted-foreground/40" />;`,
      // text-left はサイズではない
      `export const A = () => <td className="p-2 text-left text-muted-foreground/30" />;`,
    ];
    expect(
      cases.flatMap((source) =>
        findLowContrastText("src/app/(public)/fixture.tsx", source),
      ),
    ).toEqual([]);
  });

  test("公開面に AA 未達のテキストが無い", () => {
    const findings = publicTsxFiles.flatMap((file) =>
      findLowContrastText(file, readFileSync(join(ROOT, file), "utf8")),
    );
    expect(findings).toEqual([]);
  });
});
