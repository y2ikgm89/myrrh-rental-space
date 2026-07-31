/**
 * 管理画面サイドバー: WCAG 2.1 AA (1.4.3 Contrast Minimum) の 4.5:1 を
 * admin.css のトークン値から実計算して固定する drift gate。
 *
 * ## なぜ静的テストで守るのか
 *
 * この違反は「機能モジュールを OFF にしている間だけ」出るため、通常の axe E2E
 * (`axe-admin-pages.spec.ts`) では踏まれない。実際 run 30617695076 では
 * `feature-module-off-gate` spec が状態を戻し損ねた副作用として初めて表面化した
 * (前景 #646c79 / 背景 #0a121f = 3.54:1、axe `color-contrast` impact serious)。
 * 状態汚染が直れば axe からは再び見えなくなるので、OFF 状態を意図的に作る
 * `e2e/authenticated/admin/axe-admin-feature-disabled.spec.ts` と、トークン値
 * そのものを検算する本テストの 2 本立てで守る。
 * 広域 E2E は opt-in 実行だが、unit テストは required status check なので
 * 「毎 PR で必ず走る側」の防波堤はこちらが担う。
 *
 * ## 実装ノート
 *
 * - OKLCH → sRGB 変換は Björn Ottosson の公式行列 (CSS Color 4 と同一)。
 * - CSS の alpha 合成は gamma-encoded sRGB 空間で行われるため、
 *   `--color-sidebar-nav-hover: oklch(1 0 0 / 0.05)` の合成もその空間で行う。
 * - 変換実装が壊れたまま緑になるのを防ぐため、`--color-sidebar-bg` が axe の
 *   独立実測値 `#0a121f` に一致することを先に検算する (下記 anchor テスト)。
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_CSS_PATH = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "_styles",
  "admin.css",
);
const RESPONSIVE_SIDEBAR_PATH = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_components",
  "ResponsiveSidebar.tsx",
);

/** WCAG 2.1 SC 1.4.3 (Level AA) の通常サイズテキスト最低比 */
const WCAG_AA_NORMAL_TEXT = 4.5;

type Rgb = readonly [number, number, number];

function readFileOrThrow(path: string): string {
  // ファイル rename / 消滅を silent green で見逃さない hard-fail
  if (!existsSync(path)) {
    throw new Error(`Expected file to exist: ${path}`);
  }
  return readFileSync(path, "utf8");
}

/**
 * ResponsiveSidebar.tsx の **文字列リテラルだけ** を連結して返す。
 *
 * Tailwind のクラスは必ず `"..."` / `'...'` の中にあり、JSX コメント
 * （`{/* ... *\/}`）には入らない。ソース全文を grep すると「なぜこの
 * ユーティリティを使わないか」を説明したコメント自身が引っかかって
 * 誤検知するため、リテラルに絞ってから検査する。
 */
function classNameSource(): string {
  const source = readFileOrThrow(RESPONSIVE_SIDEBAR_PATH);
  const literals = source.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu) ?? [];
  return literals.join("\n");
}

/** `--color-<name>: oklch(L C H);` を読み取る（alpha 付きは対象外） */
function readOklchToken(css: string, tokenName: string): Rgb {
  const pattern = new RegExp(
    `--color-${tokenName}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`,
    "u",
  );
  const match = pattern.exec(css);
  if (match === null) {
    throw new Error(`--color-${tokenName} not found in admin.css`);
  }
  const [, rawL, rawC, rawH] = match;
  if (rawL === undefined || rawC === undefined || rawH === undefined) {
    throw new Error(`--color-${tokenName} has an unparsable oklch() value`);
  }
  return oklchToSrgb(Number(rawL), Number(rawC), Number(rawH));
}

/** OKLCH → gamma-encoded sRGB (0..1) */
function oklchToSrgb(lightness: number, chroma: number, hueDeg: number): Rgb {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return [
    encodeGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const encodeGamma = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

const decodeGamma = (x: number): number =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

/** CSS の alpha 合成（gamma-encoded sRGB 空間） */
function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [
    alpha * fg[0] + (1 - alpha) * bg[0],
    alpha * fg[1] + (1 - alpha) * bg[1],
    alpha * fg[2] + (1 - alpha) * bg[2],
  ];
}

function toHex(color: Rgb): string {
  const channel = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** WCAG 2.1 相対輝度 */
function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * decodeGamma(color[0]) +
    0.7152 * decodeGamma(color[1]) +
    0.0722 * decodeGamma(color[2])
  );
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const adminCss = readFileOrThrow(ADMIN_CSS_PATH);

const sidebarBg = readOklchToken(adminCss, "sidebar-bg");
const sidebarText = readOklchToken(adminCss, "sidebar-text");
const sidebarTextMuted = readOklchToken(adminCss, "sidebar-text-muted");
const sidebarTextDisabled = readOklchToken(adminCss, "sidebar-text-disabled");
/** `--color-sidebar-nav-hover: oklch(1 0 0 / 0.05)` を sidebar-bg 上に合成した実効背景 */
const sidebarNavHoverBg = composite([1, 1, 1], sidebarBg, 0.05);

describe("admin sidebar color contrast (WCAG 2.1 AA)", () => {
  test("OKLCH→sRGB 変換が axe の独立実測値と一致する（計算実装の検算）", () => {
    // run 30617695076 の axe レポートが報告した背景色。ここがずれていれば
    // 以下のコントラスト検証はすべて無意味なので、最初に固定する。
    expect(toHex(sidebarBg)).toBe("#0a121f");
  });

  /**
   * fg / bg / 使用箇所。すべて通常サイズテキスト（14px 以下）なので
   * large-text 例外 (3:1) は使えず 4.5:1 が必要。
   */
  const TEXT_PAIRS: { usage: string; fg: Rgb; bg: Rgb }[] = [
    {
      usage:
        "ResponsiveSidebar navItem ラベル（機能モジュール OFF・非 hover）— 本 PR の修正対象",
      fg: sidebarTextDisabled,
      bg: sidebarBg,
    },
    {
      usage: "ResponsiveSidebar navItem ラベル（機能モジュール OFF・hover 中）",
      fg: sidebarTextDisabled,
      bg: sidebarNavHoverBg,
    },
    {
      usage:
        "ResponsiveSidebar navGroupHeading / navItem 通常 / closeButton / UserInfo のメールアドレス",
      fg: sidebarTextMuted,
      bg: sidebarBg,
    },
    {
      usage:
        "AdminNavFeatureDisabledIndicator の「非公開」badge（bg-sidebar-nav-hover 上）",
      fg: sidebarTextMuted,
      bg: sidebarNavHoverBg,
    },
    {
      usage: "ResponsiveSidebar navItem ラベル（機能 ON・hover 中）",
      fg: sidebarText,
      bg: sidebarNavHoverBg,
    },
  ];

  for (const { usage, fg, bg } of TEXT_PAIRS) {
    test(`${usage} が 4.5:1 以上`, () => {
      const ratio = contrastRatio(fg, bg);
      // 失敗時に「どの色が何:1 だったか」を出す（トークン調整の手がかり）
      expect({
        fg: toHex(fg),
        bg: toHex(bg),
        ratio: round2(ratio),
        required: WCAG_AA_NORMAL_TEXT,
        pass: ratio >= WCAG_AA_NORMAL_TEXT,
      }).toMatchObject({ pass: true });
    });
  }

  test("機能 OFF 用トークンは muted より暗い（減光の視覚的手がかりが残る）", () => {
    expect(relativeLuminance(sidebarTextDisabled)).toBeLessThan(
      relativeLuminance(sidebarTextMuted),
    );
  });

  test("sidebar のテキストトークンに alpha modifier を再導入していない", () => {
    // `text-sidebar-text-muted/80` を `opacity-80` の <a> 内に置いた結果、
    // 実効 alpha が 0.64 に畳み込まれて 3.54:1 まで落ちたのが元の不具合。
    // 減光は --color-sidebar-text-disabled 一本で表現する。
    const alphaModifiers =
      classNameSource().match(
        /text-sidebar-text(?:-muted|-disabled)?\/\d+/gu,
      ) ?? [];

    expect(alphaModifiers).toEqual([]);
  });

  test("機能 OFF の nav 項目が専用トークンを使っている", () => {
    const classNames = classNameSource();

    expect(classNames).toContain("text-sidebar-text-disabled");
    // <a> 側の opacity utility も同じ畳み込みを起こすため、nav 項目には付けない。
    // overlay slot の `opacity-0` / `opacity-100` は別要素なので、ここで禁じるのは
    // 「半透明にする」中間値だけに絞る。
    expect(classNames.match(/\bopacity-(?:[1-9]|[1-9]\d)\b/gu) ?? []).toEqual(
      [],
    );
  });
});
