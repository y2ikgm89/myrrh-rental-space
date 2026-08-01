import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

import {
  AA_MIN_RATIO,
  contrastRatio,
  createOklchTokenReader,
  over,
  toHex,
  type Rgb,
} from "../../helpers/color-contrast";

/**
 * 管理画面: **半透明の重なり面**に載るテキストの WCAG 2.1 AA
 * (SC 1.4.3 Contrast Minimum = 4.5:1) drift gate。
 *
 * ## なぜ「重なり面」だけ特別扱いなのか
 *
 * `bg-background/50` のような半透明色は、実効背景が**下に何があるか**で決まる。
 * 通常のフローに置かれた要素なら下地は親（管理画面では明色）で確定するので
 * 計算できる。ところが `fixed` / `sticky` / `absolute` な面は
 * **スクロール位置や他レイヤー次第で任意のものの上に重なる**ため、下地を選べない。
 * 下地が選べない以上、AA を保証するには「**最悪の下地（真っ黒）でも 4.5:1**」が
 * 唯一の健全な条件になる。
 *
 * ## 実際に踏んだ事故（run 30679156212）
 *
 * `EditorHeader` は `fixed top-0 left-0 right-0` かつ
 * `Z_INDEX.editorToolbar`(65) > `Z_INDEX.sidebar`(10) なので、**サイドバーの上に
 * 被さる**。背景が `supports-[backdrop-filter]:bg-background/60` だったため、
 * ヘッダー左側では `--color-sidebar-bg` (#0a121f) が 40% 透けて実効背景が
 * #989da4 になり、`text-muted-foreground` (#5b646f) のコントラストが **2.2:1** に落ちた。
 *
 * | 背景                          | 実効背景  | 比       |
 * | ----------------------------- | --------- | -------- |
 * | `bg-background/60` on sidebar | `#989da4` | **2.2**  |
 * | `bg-background/95` on sidebar | `#f3f3f4` | **5.40** |
 * | `bg-background/95` on 真っ黒  | `#f2f2f2` | **5.36** |
 *
 * `backdrop-blur` は救いにならない。ぼかしは背景の**輝度を変えない**ので、
 * 暗い下地の上では暗いまま透ける。
 *
 * axe は測定位置がサイドバー帯に重なるかどうか（＝タイトルの長さ）でぶれるため
 * **flaky に見えるが実体は恒常的な AA 違反**。`axe-admin-pages` と
 * `lexical-toolbar-roving-tabindex` の 2 spec が同一ノード
 * (`<span class="text-sm text-muted-foreground">/posts/</span>`) で断続的に落ちていた。
 *
 * ## 対象の絞り方
 *
 * 判定は **1 つの class 文字列リテラル単位**で行う。同じリテラルに位置指定
 * (`fixed` / `sticky` / `absolute`) と半透明背景の両方があるものだけを見る。
 * これにより:
 *
 * - `EditorHeader` / `CheckInClient` の bar、`CodeBlockPlugin` の浮遊ツールバーは**対象**
 * - `tabs.tsx` の `hover:bg-background/50`（タブ内のホバー、下地は確定した明色）や
 *   `DesignPreview` の `bg-card/10`（公開側の装飾スタイル見本）は**対象外**
 *
 * になる。位置指定を持たない半透明面は下地が確定するので、この gate の前提が
 * そもそも当てはまらない。
 */

const ADMIN_CSS = "src/app/(admin)/_styles/admin.css";
const SOURCE_GLOB = "src/app/(admin)/**/*.tsx";

const readOklchToken = createOklchTokenReader(
  readFileSync(join(process.cwd(), ADMIN_CSS), "utf8"),
);

const BACKGROUND = readOklchToken("background");
const CARD = readOklchToken("card");
const MUTED_FOREGROUND = readOklchToken("muted-foreground");
const SIDEBAR_BG = readOklchToken("sidebar-bg");

/** 選べない下地の最悪値。これより暗い背景は存在しない。 */
const WORST_BACKDROP: Rgb = [0, 0, 0];

/** 位置指定 = 「下に何が来るか選べない」面。 */
const POSITIONED = /\b(?:fixed|sticky|absolute)\b/u;

/** `bg-background/60` / `supports-[backdrop-filter]:bg-background/60` の両方を拾う。 */
const TRANSLUCENT_SURFACE = /\bbg-(background|card)\/(\d{1,3})\b/gu;

/** tsx 中の二重引用符文字列リテラル（class 文字列はこの形で書かれる）。 */
const STRING_LITERAL = /"([^"\\\n]*)"/gu;

const SURFACE_TOKENS: Readonly<Record<string, Rgb>> = {
  background: BACKGROUND,
  card: CARD,
};

interface Surface {
  readonly file: string;
  readonly line: number;
  readonly utility: string;
  readonly token: string;
  readonly alpha: number;
}

function listSourceFiles(): string[] {
  return [...new Glob(SOURCE_GLOB).scanSync(process.cwd())]
    .map((path) => path.split(sep).join("/"))
    .sort();
}

/** 位置指定と半透明背景が同居する class 文字列を集める。 */
function collectPositionedTranslucentSurfaces(): Surface[] {
  const surfaces: Surface[] = [];

  for (const file of listSourceFiles()) {
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((line, index) => {
      for (const literal of line.matchAll(new RegExp(STRING_LITERAL, "gu"))) {
        const classes = literal[1] ?? "";
        if (!POSITIONED.test(classes)) continue;

        for (const match of classes.matchAll(
          new RegExp(TRANSLUCENT_SURFACE, "gu"),
        )) {
          surfaces.push({
            file,
            line: index + 1,
            utility: match[0],
            token: String(match[1]),
            alpha: Number(match[2]) / 100,
          });
        }
      }
    });
  }

  return surfaces;
}

/** 最悪の下地に載せたときの実効コントラスト比。 */
function worstCaseRatio(surface: Surface): number {
  const base = SURFACE_TOKENS[surface.token];
  if (!base) throw new Error(`未知の背景トークン: ${surface.token}`);
  return contrastRatio(
    MUTED_FOREGROUND,
    over(base, WORST_BACKDROP, surface.alpha),
  );
}

describe("管理画面の半透明な重なり面は最悪の下地でも AA を満たす", () => {
  test("トークンの変換が axe の実測値と一致する", () => {
    // 変換が壊れたまま緑になるのを防ぐ anchor。いずれも axe が独立に測った値。
    expect(toHex(MUTED_FOREGROUND)).toBe("#5b646f");
    expect(toHex(SIDEBAR_BG)).toBe("#0a121f");

    // 事故当時の実効背景と比率（axe: bgColor #989da4 / contrastRatio 2.2）。
    const editorHeaderAt60 = over(BACKGROUND, SIDEBAR_BG, 0.6);
    expect(contrastRatio(MUTED_FOREGROUND, editorHeaderAt60)).toBeCloseTo(
      2.2,
      1,
    );
  });

  test("gate が空振りしていない", () => {
    // リテラル抽出や正規表現が腐ると 0 件になり、以降の検査が素通りする。
    const surfaces = collectPositionedTranslucentSurfaces();
    expect(surfaces.length).toBeGreaterThan(0);
  });

  test("位置指定された半透明面はすべて最悪の下地で 4.5:1 以上", () => {
    const violations = collectPositionedTranslucentSurfaces()
      .filter((surface) => worstCaseRatio(surface) < AA_MIN_RATIO)
      .map((surface) => {
        const effective = over(
          SURFACE_TOKENS[surface.token] ?? BACKGROUND,
          WORST_BACKDROP,
          surface.alpha,
        );
        return `${surface.file}:${String(surface.line)} ${surface.utility} — 最悪の下地では実効背景 ${toHex(effective)} / text-muted-foreground との比 ${worstCaseRatio(surface).toFixed(2)}（AA は ${String(AA_MIN_RATIO)}）。位置指定された面は下地を選べないため、不透明度を上げるか位置指定を外すこと`;
      });

    expect(violations).toEqual([]);
  });

  test("下地が確定する半透明面は対象外（誤検知しない）", () => {
    const targets = collectPositionedTranslucentSurfaces().map((s) => s.file);

    // タブのホバー（フロー内・下地は明色で確定）と公開側の装飾見本は対象外。
    expect(targets).not.toContain(
      "src/app/(admin)/admin/(dashboard)/_shared/components/ui/tabs.tsx",
    );
    expect(
      targets.some((file) => file.includes("announcement-bar/DesignPreview")),
    ).toBe(false);
  });
});
