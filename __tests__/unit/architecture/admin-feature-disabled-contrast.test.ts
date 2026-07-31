import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * 「機能モジュール OFF」表示のコントラスト gate（WCAG 2.1 AA = 4.5:1）。
 *
 * 対象は公開面 OFF を示す 2 つの導線:
 * - `ResponsiveSidebar`（ダークテーマのサイドバー nav 項目）
 * - `SpaceManagementTabs`（明色テーマのタブバー）
 *
 * どちらも `AdminNavFeatureDisabledIndicator`（「非公開」badge）を伴う同じ意匠で、
 * 同じ原因で AA を割っていた。
 *
 * ## そもそも例外に当たらない
 *
 * WCAG 2.1 SC 1.4.3 の "Incidental" 例外は「text ... that are part of an
 * **inactive** user interface component ... have no contrast requirement」と定める。
 * 公開面 OFF の nav 項目・タブは inactive ではない —— クリックでき、フォーカスでき、
 * 管理画面では一覧・編集を継続できる（`ADMIN_NAV_DISABLED_TOOLTIP_TEMPLATE` が
 * その仕様を明示している）。したがって 4.5:1 が必要。
 * https://www.w3.org/TR/WCAG21/#contrast-minimum
 *
 * ## 減光を opacity で表現しない理由
 *
 * CSS Color 4 は opacity をグループ操作と定めている:「after the element
 * (including its descendants) is rendered into an RGBA offscreen image, the
 * opacity setting specifies how to blend the offscreen rendering into the
 * current composite rendering」「applies the specified opacity to the element
 * *as a whole*, including its contents」。
 * https://www.w3.org/TR/css-color-4/#transparency
 *
 * つまり opacity は subtree の**前景も背景も**まとめて畳み込み、宣言された色の値
 * からは実効値が読めなくなる。実測された害:
 *
 * | 箇所                              | opacity 方式 | 現行（トークン / 撤去） |
 * | --------------------------------- | ------------ | ----------------------- |
 * | sidebar ラベル（`opacity-80` × `/80`） | 3.54:1   | 5.60:1                  |
 * | sidebar「非公開」badge（`opacity-80`） | 4.49:1   | 6.30:1                  |
 * | スペース管理タブ（`opacity-80`）        | 3.46:1   | 5.18:1                  |
 *
 * sidebar はダークテーマで余裕があるため専用トークン
 * `--color-sidebar-text-disabled` で減光する。明色テーマのタブは
 * `text-muted-foreground` on `bg-muted` が元から 5.18:1 しか無く、AA を保ったまま
 * 減光できる幅が無いので減光しない（合図は badge が担う）。
 *
 * 計算モデルの妥当性は「二重減光時に axe が報告した `#646c79` / 3.54 を再現できる
 * こと」で検証している（下の anchor テスト）。ランタイム側の担保は
 * `e2e/authenticated/admin/axe-admin-feature-disabled.spec.ts`。
 */

const ADMIN_CSS = join(process.cwd(), "src/app/(admin)/_styles/admin.css");
const SIDEBAR_TSX = join(
  process.cwd(),
  "src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx",
);
const SPACE_TABS_TSX = join(
  process.cwd(),
  "src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx",
);

/** WCAG 2.1 AA の通常テキスト最低コントラスト比。 */
const AA_MIN_RATIO = 4.5;

/** `bg-sidebar-nav-hover` = `oklch(1 0 0 / 0.05)` = 白 5%。 */
const NAV_HOVER_WHITE_ALPHA = 0.05;
/** タブの `hover:bg-background/50`。 */
const TAB_HOVER_BACKGROUND_ALPHA = 0.5;

type Rgb = readonly [number, number, number];

function readFileOrThrow(path: string): string {
  // ファイル rename / 消滅を silent green で見逃さない hard-fail
  if (!existsSync(path)) throw new Error(`Expected file to exist: ${path}`);
  return readFileSync(path, "utf8");
}

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

/** alpha 合成（source-over）。CSS の合成は gamma-encoded sRGB 空間で行われる。 */
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
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
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
 * ソースの **文字列リテラルだけ** を連結して返す。
 *
 * Tailwind のクラスは必ず `"..."` / `'...'` の中にあり、JSX コメントには入らない。
 * ソース全文を走査すると「なぜこのユーティリティを使わないか」を説明した
 * コメント自身が引っかかって誤検知する。
 */
function classNameLiterals(path: string): string {
  const source = readFileOrThrow(path);
  return (source.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu) ?? []).join(
    "\n",
  );
}

const cssSource = readFileOrThrow(ADMIN_CSS);

// --- dark: sidebar -----------------------------------------------------------
const sidebarBg = readOklchToken(cssSource, "sidebar-bg");
const sidebarText = readOklchToken(cssSource, "sidebar-text");
const sidebarTextMuted = readOklchToken(cssSource, "sidebar-text-muted");
const sidebarTextDisabled = readOklchToken(cssSource, "sidebar-text-disabled");
const white: Rgb = [1, 1, 1];
/** `bg-sidebar-nav-hover` を sidebar 背景に合成した実効背景（hover 行 / badge）。 */
const navHoverBg = composite(white, sidebarBg, NAV_HOVER_WHITE_ALPHA);

// --- light: space management tabs / compact badge ----------------------------
const muted = readOklchToken(cssSource, "muted");
const mutedForeground = readOklchToken(cssSource, "muted-foreground");
const background = readOklchToken(cssSource, "background");
/** タブの `hover:bg-background/50` を `bg-muted` の上に合成した実効背景。 */
const tabHoverBg = composite(background, muted, TAB_HOVER_BACKGROUND_ALPHA);

describe("計算モデルの検算（axe 実測値の再現）", () => {
  test("OKLCH→sRGB 変換が axe の報告した背景色に一致する", () => {
    expect(toHex(sidebarBg)).toBe("#0a121f");
  });

  test("二重減光の再現値が axe の報告と一致する（sidebar の修正前）", () => {
    // <Link opacity-80> の内側で label に text-sidebar-text-muted/80 を重ねた状態。
    // グループ opacity により実効 alpha は 0.8 × 0.8 = 0.64。
    const doubled = composite(sidebarTextMuted, sidebarBg, 0.8 * 0.8);
    expect(toHex(doubled)).toBe("#646c79");
    expect(contrastRatio(doubled, sidebarBg)).toBeCloseTo(3.54, 1);
  });

  test("グループ opacity は subtree の背景にも掛かる（badge が AA 境界だった理由）", () => {
    // `opacity-80` だけを残した場合の sidebar「非公開」badge。CSS Color 4 のとおり
    // 前景も背景も 1 枚のグループとして 0.8 で合成されるため、badge 自身の背景
    // (bg-sidebar-nav-hover) まで暗くなる。背景の減光を計算に入れ忘れると 4.52:1 と
    // 過大に出て、実際には AA を割っていることを見逃す。
    const groupFg = composite(sidebarTextMuted, sidebarBg, 0.8);
    const groupBg = composite(navHoverBg, sidebarBg, 0.8);
    const groupRatio = contrastRatio(groupFg, groupBg);

    const naiveFg = composite(sidebarTextMuted, navHoverBg, 0.8);
    const naiveRatio = contrastRatio(naiveFg, navHoverBg);

    expect(groupRatio).toBeLessThan(AA_MIN_RATIO);
    expect(naiveRatio).toBeGreaterThanOrEqual(AA_MIN_RATIO);
    expect(naiveRatio).toBeGreaterThan(groupRatio);
  });

  test("明色テーマのタブは opacity-80 だけで AA を割る（撤去が必要だった理由）", () => {
    const dimmed = composite(mutedForeground, muted, 0.8);
    expect(contrastRatio(dimmed, muted)).toBeLessThan(AA_MIN_RATIO);
    // 減光しなければ AA を満たす = 「減光の撤去」が正しい対処である根拠
    expect(contrastRatio(mutedForeground, muted)).toBeGreaterThanOrEqual(
      AA_MIN_RATIO,
    );
  });
});

/**
 * fg / bg / 使用箇所。いずれも通常サイズテキスト（14px 以下）なので
 * large-text 例外 (3:1) は使えず 4.5:1 が必要。
 * 実装から opacity を排したので、宣言値がそのまま実効値になる。
 */
const TEXT_PAIRS: { usage: string; fg: Rgb; bg: Rgb }[] = [
  {
    usage: "sidebar: 公開面 OFF の nav ラベル / アイコン（非 hover）",
    fg: sidebarTextDisabled,
    bg: sidebarBg,
  },
  {
    usage: "sidebar: 公開面 OFF の nav ラベル / アイコン（hover 中）",
    fg: sidebarTextDisabled,
    bg: navHoverBg,
  },
  {
    usage:
      "sidebar: navGroupHeading / 通常の nav 項目 / closeButton / UserInfo のメールアドレス",
    fg: sidebarTextMuted,
    bg: sidebarBg,
  },
  {
    usage: "sidebar: AdminNavFeatureDisabledIndicator の「非公開」badge",
    fg: sidebarTextMuted,
    bg: navHoverBg,
  },
  {
    usage: "sidebar: 通常の nav 項目（hover 中）",
    fg: sidebarText,
    bg: navHoverBg,
  },
  {
    usage: "タブ: 公開面 OFF のタブラベル + compact badge（非 hover）",
    fg: mutedForeground,
    bg: muted,
  },
  {
    usage: "タブ: 公開面 OFF のタブラベル（hover 中）",
    fg: mutedForeground,
    bg: tabHoverBg,
  },
];

describe("機能モジュール OFF 表示のコントラスト (WCAG 2.1 AA)", () => {
  for (const { usage, fg, bg } of TEXT_PAIRS) {
    test(`${usage} が AA を満たす`, () => {
      const ratio = contrastRatio(fg, bg);
      // 失敗時に「どの色が何:1 だったか」を出す（トークン調整の手がかり）
      expect({
        fg: toHex(fg),
        bg: toHex(bg),
        ratio: Math.round(ratio * 100) / 100,
        required: AA_MIN_RATIO,
        pass: ratio >= AA_MIN_RATIO,
      }).toMatchObject({ pass: true });
    });
  }

  test("sidebar の公開面 OFF 用トークンは muted より暗い（減光の手がかりが残る）", () => {
    expect(relativeLuminance(sidebarTextDisabled)).toBeLessThan(
      relativeLuminance(sidebarTextMuted),
    );
  });
});

describe("減光機構が opacity へ逆戻りしていない", () => {
  const sidebarClassNames = classNameLiterals(SIDEBAR_TSX);
  const tabClassNames = classNameLiterals(SPACE_TABS_TSX);

  test("sidebar の公開面 OFF 項目は専用トークンで減光する", () => {
    expect(sidebarClassNames).toContain("text-sidebar-text-disabled");
  });

  test("sidebar のテキストトークンに alpha modifier を重ねない", () => {
    expect(
      sidebarClassNames.match(/text-sidebar-text(?:-muted|-disabled)?\/\d+/gu),
    ).toBeNull();
  });

  for (const [label, classNames] of [
    ["ResponsiveSidebar", sidebarClassNames],
    ["SpaceManagementTabs", tabClassNames],
  ] as const) {
    test(`${label} が半透明の opacity utility を使わない`, () => {
      // `opacity-0` / `opacity-100`（完全透明・完全不透明）は色の畳み込みを
      // 起こさないので対象外。禁じるのは中間値。
      expect(classNames.match(/\bopacity-(?:[1-9]|[1-9]\d)\b/gu)).toBeNull();
    });
  }
});
