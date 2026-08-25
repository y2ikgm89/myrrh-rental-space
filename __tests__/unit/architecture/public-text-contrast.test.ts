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
 * 2. `text-muted-foreground/<alpha>` と `text-accent/<alpha>` は、その要素に
 *    フォントサイズクラス（`text-xs` / `text-sm` / `text-[0.8125rem]` 等）が
 *    同居していればテキストとみなし、`background` と `card` の**両方**で
 *    AA を要求する。下地は静的には決まらないので、悪いほう（card）に合わせる。
 * 3. トークン自身（`muted-foreground` / `muted-foreground-subtle` / `accent`）が
 *    両方の下地で AA を満たすこと。
 *
 * ## 対象外にするもの（理由は要素自身が持つ）
 *
 * - `aria-hidden="true"` **かつ英数字を描かない**要素 — アイコン・約物等の装飾。
 *   `aria-hidden` が切るのは**支援技術からの露出だけ**で、画面からは消えない。
 *   文字を描く要素に付けても 1.4.3 は掛かったままなので、`aria-hidden` 単独では
 *   免除にしない。
 *
 *   境界を「英数字」に置くのは WCAG 1.4.3 の "pure decoration" 例外に合わせる
 *   ため。章番号 `01` は視覚的な順序を伝えるので content、引用符 `“` は約物の
 *   装飾で、外しても情報は失われない。JSX 式の子（`{n}`）は静的に中身が
 *   分からないので **content 側に倒す**（fail closed）。
 *
 *   きっかけは記事内目次の章番号（`aria-hidden` の `<span>` に `text-accent/40`
 *   = 1.82:1）を axe が実ブラウザで捕まえたこと。同じ形が
 *   `LocationListSection` の乗り換え案内の連番（`text-accent/70` = 2.90〜3.13）
 *   にも残っており、そちらは axe のルートに入っていないので誰も見ていなかった。
 * - alpha クラスと**同じ文字列リテラル**に `cursor-not-allowed` / `disabled:` が
 *   ある場合 — 無効コンポーネントは WCAG の明示的な例外
 *
 * allowlist は作らない。免除の理由は対象の className そのものに書かれている。
 *
 * ## 粗いところ（承知のうえ）
 *
 * - `background` / `foreground` / `white` は見ない。ヒーローや scrim は**画像の
 *   上**に載るので、下地が静的に決まらず比率を出せない。検査できないものを
 *   検査できるように書かない。`accent` を見るのは、公開面の `text-accent/NN` が
 *   画像の上に 1 件も無いことを確認したうえでの判断。
 * - 名前付き文字実体参照（`&nbsp;` 等）は**英数字扱い**にする。実体表を持たない
 *   ための fail closed で、数値実体参照（`&#8220;` / `&#x201C;`）だけは復号する。
 * - サイズクラスは要素単位、無効マーカーはリテラル単位で見る。分岐ごとの
 *   厳密な対応は取らない。
 *
 * ## 直し方
 *
 * `muted-foreground` なら `text-muted-foreground-subtle`、`accent` なら実色の
 * `text-accent` を使う。どちらも alpha ではなく実色のトークンで、`public.css` に
 * 定義と根拠がある。
 *
 * **`aria-hidden` を付けて逃げない。** 見えている文字はそのままなので、
 * 支援技術から隠しただけでは誰も助からない。装飾として通るのは、英数字を
 * 描かない要素（アイコン・約物等）に付いている場合だけ。
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
  isJsxExpression,
  isJsxSelfClosingElement,
  isJsxText,
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

/**
 * 数値文字実体参照だけを復号する。名前付き参照（`&nbsp;` 等）は表を持たない
 * ため触らず、`&` から始まる綴りがそのまま残る ＝ 英数字として数えられる
 * （fail closed。装飾として見逃すより、余分に検査するほうを選ぶ）。
 */
function decodeNumericEntities(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|\d+);/giu, (_match, code: string) => {
    const value =
      code.startsWith("x") || code.startsWith("X")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
    return Number.isNaN(value) ? _match : String.fromCodePoint(value);
  });
}

/**
 * その要素自身が**英数字**を描くか。
 *
 * `aria-hidden` は**支援技術からの露出**を切るだけで、画面からは消えない。
 * 文字を描く要素に付けても 1.4.3 は掛かったままなので、免除の条件に
 * 「英数字を描かない」を足す。子を持たない `<Icon aria-hidden />` や
 * `<svg aria-hidden><path /></svg>`、約物だけの `<span aria-hidden>“</span>` は
 * 免除される。式の子（`{n}`）は中身が静的に分からないので content 側に倒す。
 */
function rendersOwnGlyphText(node: Node): boolean {
  if (!isJsxElement(node)) return false;
  return node.children.some(
    (child) =>
      (isJsxText(child) &&
        /[\p{L}\p{N}]/u.test(decodeNumericEntities(child.text))) ||
      isJsxExpression(child),
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

/** alpha を掛けてよいか検査する色トークン。下地が静的に決まるものだけ。 */
const ALPHA_CHECKED_TOKENS = ["muted-foreground", "accent"] as const;

/** 検査対象のクラス。トークン名は上の 1 箇所から組み立てる（綴りを写さない）。 */
const ALPHA_TEXT_PATTERN = new RegExp(
  `^(?:[a-z-]+:)*text-(${ALPHA_CHECKED_TOKENS.join("|")})\\/(\\d{1,3})$`,
  "u",
);

/** `text-accent/70` → `{ token: "accent", alpha: 0.7 }`。対象外なら null。 */
function alphaTextClass(
  className: string,
): { token: string; alpha: number } | null {
  const match = ALPHA_TEXT_PATTERN.exec(className);
  if (match === null) return null;
  const [, token, raw] = match;
  if (token === undefined || raw === undefined) return null;
  return { token, alpha: Number(raw) / 100 };
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

  const visit = (node: Node): void => {
    const attributes = isJsxSelfClosingElement(node)
      ? node.attributes
      : isJsxElement(node)
        ? node.openingElement.attributes
        : null;

    const exempt =
      attributes !== null &&
      hasAriaHidden(attributes) &&
      !rendersOwnGlyphText(node);

    if (attributes !== null && !exempt) {
      const literals = classNameLiterals(attributes);
      const classes = splitClasses(literals);
      const hasTextSize = classes.some((name) => TEXT_SIZE_PATTERN.test(name));

      for (const literal of literals) {
        const inactive = INACTIVE_MARKERS.some((marker) =>
          literal.includes(marker),
        );
        for (const className of literal.split(/\s+/u).filter(Boolean)) {
          const alphaText = alphaTextClass(className);
          const placeholder = isPlaceholderAlphaText(className);
          if (
            !placeholder &&
            (alphaText === null || !hasTextSize || inactive)
          ) {
            continue;
          }
          // 合成は `over()` に任せる。`Rgb` は 0–255 ではなく **0–1 正規化**なので、
          // チャンネルごとに自分で `Math.round` すると 0.6 が 1 になって
          // 真っ白に潰れる（実装中に踏んで比率が 1.04 と出た）。
          //
          // placeholder は ratio 0 の無条件違反として扱うので、トークンの
          // 解決自体が要らない。
          for (const ground of GROUNDS) {
            const ratio =
              alphaText === null
                ? 0
                : contrastRatio(
                    over(
                      readToken(alphaText.token),
                      ground.rgb,
                      alphaText.alpha,
                    ),
                    ground.rgb,
                  );
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

  test("実色トークンは background と card の両方で AA を満たす", () => {
    const results = GROUNDS.flatMap((ground) =>
      ["muted-foreground-subtle", ...ALPHA_CHECKED_TOKENS].map((token) => ({
        token,
        ground: ground.name,
        ok: contrastRatio(readToken(token), ground.rgb) >= AA_MIN_RATIO,
      })),
    );
    expect(results.filter((result) => !result.ok)).toEqual([]);
    // 実色トークンが直し方である以上、直し方が AA を満たすことは分母の一部。
    expect(results.length).toBe(GROUNDS.length * 3);
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

  test("落ちるべき形: aria-hidden でも文字を描いていれば見逃さない", () => {
    // 実際にこの形で AA 未達が 1 件通り抜けていた（記事内目次の章番号）。
    const source = `export const A = ({ n }: { n: string }) => (
      <span aria-hidden="true" className="text-lg text-muted-foreground/30">{n}</span>
    );`;
    expect(
      findLowContrastText("src/app/(public)/fixture.tsx", source),
    ).not.toEqual([]);
  });

  test("落ちるべき形: aria-hidden の連番に accent の alpha", () => {
    // 実際にこの形で AA 未達が残っていた（乗り換え案内の連番、実測 2.90〜3.13）。
    const source = `export const A = ({ i }: { i: number }) => (
      <span aria-hidden="true" className="text-2xl text-accent/70">{String(i).padStart(2, "0")}</span>
    );`;
    expect(
      findLowContrastText("src/app/(public)/fixture.tsx", source).map(
        (finding) => `${finding.className}@${finding.ground}`,
      ),
    ).toEqual(["text-accent/70@background", "text-accent/70@card"]);
  });

  test("落ちてはいけない形: 弱色トークン / 装飾 / 無効 / サイズなし", () => {
    const cases = [
      // 実色の弱色トークン（これが直し方）
      `export const A = () => <p className="text-xs text-muted-foreground-subtle">x</p>;`,
      // 実色の accent（accent 側の直し方）
      `export const A = ({ i }: { i: number }) => <span aria-hidden="true" className="text-2xl text-accent">{i}</span>;`,
      // 約物だけの装飾。英数字を描いていないので aria-hidden が理由になる
      `export const A = () => <span aria-hidden="true" className="text-lg text-accent/30">“</span>;`,
      `export const A = () => <span aria-hidden="true" className="text-lg text-accent/30">&#8220;</span>;`,
      // 装飾。文字を描かない要素なので aria-hidden が理由になる
      `export const A = () => <span aria-hidden="true" className="text-lg text-muted-foreground/30" />;`,
      `export const A = () => <svg aria-hidden="true" className="text-lg text-muted-foreground/30"><path d="M0 0" /></svg>;`,
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
