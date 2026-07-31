/**
 * WCAG コントラスト検証用の色計算ヘルパー。
 *
 * `admin-dimmed-control-contrast.test.ts` と
 * `admin-feature-disabled-contrast.test.ts` が同じ計算を二重実装していたため
 * 抽出した（`architecture-fs.ts` と同じ経緯）。片方だけ直すと 2 つの gate が
 * 静かに乖離し、「テストは緑なのに AA を割っている」状態を作れてしまう。
 *
 * ## この計算が守るべき 3 つの前提
 *
 * 1. **`opacity` はグループ操作**。CSS Color 4 は「after the element (including
 *    its descendants) is rendered into an RGBA offscreen image, the opacity
 *    setting specifies how to blend the offscreen rendering into the current
 *    composite rendering」「applies the specified opacity to the element *as a
 *    whole*, including its contents」と定める。つまり減光は前景だけでなく
 *    **背景にも掛かる**。`over()` を前景にだけ適用して背景に忘れると比率が過大に
 *    出る（実例: 4.493 を 4.524 と誤報告し AA 未達を見逃した）。
 *    https://www.w3.org/TR/css-color-4/#transparency
 * 2. **alpha 合成は gamma-encoded sRGB 空間**で行われる（linear ではない）。
 * 3. **CSS filter の shorthand は sRGB 空間で評価される**（SVG filter primitive の
 *    既定 linearRGB とは違う）。`saturate()` の係数は WCAG 相対輝度と同じ
 *    0.213/0.715/0.072 だが gamma-encoded 値に掛かるため**相対輝度は保存されない**。
 *    減光後の比率を測るときは saturate も必ず適用する。
 *    https://www.w3.org/TR/filter-effects-1/#funcdef-filter-saturate
 *
 * ## 実装の検算方法
 *
 * 変換が壊れたまま緑になるのを防ぐため、呼び出し側の gate は axe が独立に実測した
 * 値を anchor に置くこと（`--color-sidebar-bg` = `#0a121f`、二重減光時の
 * `#646c79` / 3.54:1。CI run 30617695076）。
 */

/** gamma-encoded sRGB (各チャンネル 0..1)。 */
export type Rgb = readonly [number, number, number];

/** WCAG 2.1 SC 1.4.3 (Level AA) の通常サイズテキスト最低コントラスト比。 */
export const AA_MIN_RATIO = 4.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** linear sRGB → gamma-encoded sRGB。 */
const encodeGamma = (value: number): number =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

/** gamma-encoded sRGB → linear sRGB（WCAG 相対輝度の前段）。 */
const decodeGamma = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

/**
 * OKLCH → gamma-encoded sRGB。行列は Björn Ottosson / CSS Color 4 準拠。
 *
 * gamut 外の値は encode 前に clip する（naive clipping）。`@theme` のトークンは
 * すべて sRGB 内なので実際には効かないが、将来 chroma を上げたときに
 * NaN / 負値が比率計算へ漏れるのを防ぐ。
 */
export function oklchToSrgb(
  lightness: number,
  chroma: number,
  hueDeg: number,
): Rgb {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    encodeGamma(
      clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    ),
    encodeGamma(
      clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    ),
    encodeGamma(
      clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ),
  ];
}

/**
 * alpha 合成（source-over、gamma-encoded sRGB 空間）。
 *
 * `bg-foo/40` のような alpha 付き背景の合成にも、`opacity-*` による
 * グループ減光にも同じ式を使う。**グループ減光では前景と背景の両方に適用する**
 * （前提 1 参照）。
 */
export function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [
    alpha * fg[0] + (1 - alpha) * bg[0],
    alpha * fg[1] + (1 - alpha) * bg[1],
    alpha * fg[2] + (1 - alpha) * bg[2],
  ];
}

/**
 * CSS `filter: saturate(s)`（sRGB 空間、前提 3 参照）。
 *
 * `opacity` と違い backdrop を前景へ畳み込まないため、減光の代替として使える。
 */
export function saturate(color: Rgb, s: number): Rgb {
  const [r, g, b] = color;
  return [
    clamp01(
      (0.213 + 0.787 * s) * r +
        (0.715 - 0.715 * s) * g +
        (0.072 - 0.072 * s) * b,
    ),
    clamp01(
      (0.213 - 0.213 * s) * r +
        (0.715 + 0.285 * s) * g +
        (0.072 - 0.072 * s) * b,
    ),
    clamp01(
      (0.213 - 0.213 * s) * r +
        (0.715 - 0.715 * s) * g +
        (0.072 + 0.928 * s) * b,
    ),
  ];
}

/** WCAG 2.1 相対輝度。 */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * decodeGamma(color[0]) +
    0.7152 * decodeGamma(color[1]) +
    0.0722 * decodeGamma(color[2])
  );
}

/** WCAG 2.1 コントラスト比（順序不同）。 */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `#rrggbb`。axe が報告する hex と突き合わせて計算実装を検算するのに使う。 */
export function toHex(color: Rgb): string {
  return `#${color
    .map((channel) =>
      Math.round(clamp01(channel) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * CSS ソースから `--color-<name>: oklch(L C H)` を読む reader を作る。
 *
 * alpha 付き（`oklch(1 0 0 / 0.05)`）は意図的に対象外 —— 合成先が分からないと
 * 比率を出せないので、呼び出し側で `over()` を使って明示的に合成させる。
 *
 * @example
 * const readToken = createOklchTokenReader(readFileSync(ADMIN_CSS, "utf8"));
 * const card = readToken("card");
 */
export function createOklchTokenReader(
  cssSource: string,
): (name: string) => Rgb {
  return (name: string): Rgb => {
    const match = new RegExp(
      `--color-${name}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`,
      "u",
    ).exec(cssSource);
    if (match === null) {
      throw new Error(`--color-${name} の oklch 定義が見つかりません`);
    }
    const [, rawL, rawC, rawH] = match;
    if (rawL === undefined || rawC === undefined || rawH === undefined) {
      throw new Error(`--color-${name} の oklch() が解析できません`);
    }
    return oklchToSrgb(Number(rawL), Number(rawC), Number(rawH));
  };
}
