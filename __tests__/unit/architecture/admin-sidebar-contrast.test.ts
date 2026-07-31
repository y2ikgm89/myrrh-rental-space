import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * admin サイドバーの色コントラスト gate（WCAG 2.1 AA = 4.5:1）。
 *
 * 背景: 公開面 OFF の nav 項目は親 `<Link>` の `opacity-80` と、ラベル span の
 * `text-sidebar-text-muted/80` で**二重に減光**されていた。実効 alpha が
 * 0.8 × 0.8 = 0.64 になり、`#646c79` on `#0a121f` = **3.54:1** で AA 未達
 * （axe `color-contrast` serious として CI run 30617695076 で実測）。
 * これは機能モジュールを OFF にしている間だけ現れるため、通常の axe スキャンでは
 * 表面化せず長期間潜伏していた。
 *
 * この gate は 2 方向から固定する:
 *
 * 1. `admin.css` の OKLCH トークンから実際のコントラスト比を計算して AA を強制する
 *    （トークンを暗くする変更を検知）
 * 2. 減光の合成が二重にならないことを source で固定する（`opacity-*` を持つ要素の
 *    内側でラベルに opacity modifier を重ねる形の再発を検知）
 *
 * 計算は CSS Color 4 の oklch → oklab → linear sRGB と WCAG 2.1 の相対輝度に従う。
 * 実装の妥当性は「二重減光時に axe が報告した #646c79 / 3.54 を再現できること」で
 * 検証している（下の regression テスト）。
 */

const ADMIN_CSS = join(process.cwd(), "src/app/(admin)/_styles/admin.css");
const SIDEBAR_TSX = join(
  process.cwd(),
  "src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx",
);

/** WCAG 2.1 AA の通常テキスト最低コントラスト比。 */
const AA_MIN_RATIO = 4.5;

/** 公開面 OFF の nav 項目に掛かる唯一の減光（親 `<Link>` の `opacity-80`）。 */
const DISABLED_NAV_OPACITY = 0.8;

/** `bg-sidebar-nav-hover` = `oklch(1 0 0 / 0.05)` = 白 5%。 */
const NAV_HOVER_WHITE_ALPHA = 0.05;

type Rgb = readonly [number, number, number];

function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear: readonly number[] = [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];

  const encoded = linear.map((channel) => {
    const clamped = Math.min(1, Math.max(0, channel));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });

  return [encoded[0] ?? 0, encoded[1] ?? 0, encoded[2] ?? 0];
}

function relativeLuminance([r, g, b]: Rgb): number {
  const toLinear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** alpha 合成（source-over）。 */
function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `admin.css` から `--color-<name>: oklch(L C H)` を読む。 */
function readOklchToken(source: string, name: string): Rgb {
  const match = new RegExp(
    `--color-${name}:\\s*oklch\\(\\s*([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s*\\)`,
    "u",
  ).exec(source);
  if (!match) {
    throw new Error(
      `admin.css に --color-${name} の oklch 定義が見つかりません`,
    );
  }
  const [, l, c, h] = match;
  return oklchToRgb(Number(l), Number(c), Number(h));
}

/**
 * 規約を説明するコメント自身を違反として数えないよう、ブロック / 行コメントを
 * 落としてから走査する（`suspense-shell-duplicate-id.test.ts` と同じ手法）。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

const cssSource = readFileSync(ADMIN_CSS, "utf8");
const sidebarSource = stripComments(readFileSync(SIDEBAR_TSX, "utf8"));

const sidebarBg = readOklchToken(cssSource, "sidebar-bg");
const sidebarText = readOklchToken(cssSource, "sidebar-text");
const sidebarTextMuted = readOklchToken(cssSource, "sidebar-text-muted");
const white: Rgb = [1, 1, 1];

describe("admin サイドバーのコントラスト (WCAG 2.1 AA)", () => {
  test("計算モデルが axe の実測値を再現する", () => {
    // 二重減光時（alpha 0.8 × 0.8）に axe が報告した値。
    const doubled = composite(sidebarTextMuted, sidebarBg, 0.8 * 0.8);
    expect(toHex(sidebarBg)).toBe("#0a121f");
    expect(toHex(doubled)).toBe("#646c79");
    expect(contrastRatio(doubled, sidebarBg)).toBeCloseTo(3.54, 1);
  });

  test("通常の nav 項目 (solid muted) が AA を満たす", () => {
    expect(contrastRatio(sidebarTextMuted, sidebarBg)).toBeGreaterThanOrEqual(
      AA_MIN_RATIO,
    );
  });

  test("アクティブでない通常テキスト (sidebar-text) が AA を満たす", () => {
    expect(contrastRatio(sidebarText, sidebarBg)).toBeGreaterThanOrEqual(
      AA_MIN_RATIO,
    );
  });

  test("公開面 OFF の nav 項目が AA を満たす", () => {
    const dimmed = composite(sidebarTextMuted, sidebarBg, DISABLED_NAV_OPACITY);
    expect(contrastRatio(dimmed, sidebarBg)).toBeGreaterThanOrEqual(
      AA_MIN_RATIO,
    );
  });

  test("公開面 OFF の badge (nav-hover 背景) が AA を満たす", () => {
    const badgeBg = composite(white, sidebarBg, NAV_HOVER_WHITE_ALPHA);
    const badgeFg = composite(sidebarTextMuted, badgeBg, DISABLED_NAV_OPACITY);
    expect(contrastRatio(badgeFg, badgeBg)).toBeGreaterThanOrEqual(
      AA_MIN_RATIO,
    );
  });
});

describe("減光の合成が二重にならない", () => {
  test("親 <Link> の減光は opacity-80 のみ", () => {
    expect(sidebarSource).toContain('"opacity-80 saturate-75"');
  });

  test("ラベル span に opacity modifier を重ねない", () => {
    // `text-sidebar-text-muted/NN` のような alpha 付きユーティリティが
    // 減光済みの subtree 内で再導入されると AA を割る。
    const withAlphaModifier = [
      ...sidebarSource.matchAll(/text-sidebar-text-muted\/\d+/gu),
    ];
    expect(withAlphaModifier).toEqual([]);
  });
});
