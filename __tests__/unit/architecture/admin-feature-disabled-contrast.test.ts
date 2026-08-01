import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  AA_MIN_RATIO,
  contrastRatio,
  createOklchTokenReader,
  over,
  relativeLuminance,
  toHex,
  type Rgb,
} from "../../helpers/color-contrast";

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
const BADGE_TSX = join(
  process.cwd(),
  "src/app/(admin)/admin/(dashboard)/_components/AdminNavFeatureDisabledIndicator.tsx",
);

/** `bg-sidebar-nav-hover` = `oklch(1 0 0 / 0.05)` = 白 5%。 */
const NAV_HOVER_WHITE_ALPHA = 0.05;
/** タブの `hover:bg-background/50`。 */
const TAB_HOVER_BACKGROUND_ALPHA = 0.5;

function readFileOrThrow(path: string): string {
  // ファイル rename / 消滅を silent green で見逃さない hard-fail
  if (!existsSync(path)) throw new Error(`Expected file to exist: ${path}`);
  return readFileSync(path, "utf8");
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

const readOklchToken = createOklchTokenReader(readFileOrThrow(ADMIN_CSS));

// --- dark: sidebar -----------------------------------------------------------
const sidebarBg = readOklchToken("sidebar-bg");
const sidebarText = readOklchToken("sidebar-text");
const sidebarTextMuted = readOklchToken("sidebar-text-muted");
const sidebarTextDisabled = readOklchToken("sidebar-text-disabled");
const sidebarAccent = readOklchToken("sidebar-accent");
const white: Rgb = [1, 1, 1];
/** `bg-sidebar-nav-hover` を sidebar 背景に合成した実効背景（hover 行）。 */
const navHoverBg = over(white, sidebarBg, NAV_HOVER_WHITE_ALPHA);

/** `--color-<name>` の oklch alpha（`/ A` 省略時は 1）。 */
function readTokenAlpha(name: string): number {
  const declaration = new RegExp(
    `--color-${name}:\\s*oklch\\(([^)]*)\\)`,
    "u",
  ).exec(readFileOrThrow(ADMIN_CSS));
  if (!declaration?.[1]) {
    throw new Error(`--color-${name} の oklch 定義が見つかりません`);
  }
  const alpha = /\/\s*([\d.]+)/u.exec(declaration[1]);
  return alpha?.[1] === undefined ? 1 : Number(alpha[1]);
}

const badgeBgAlpha = readTokenAlpha("sidebar-badge-bg");

// `readOklchToken` は `oklch(L C H)` しか解析しないため、alpha 付きに戻されると
// 「定義が見つかりません」という無関係なメッセージで落ちる。何が壊れたのかが
// 分かるよう、色を読む前にここで明示的に弾く。
if (badgeBgAlpha !== 1) {
  throw new Error(
    `--color-sidebar-badge-bg に alpha (${String(badgeBgAlpha)}) が付いています。` +
      "「非公開」badge の背景は不透明でなければならない — 半透明だと実効背景が " +
      "nav 項目の状態（active は bg-sidebar-accent の青）で変わり、" +
      "text-sidebar-text-muted が 1.72:1 まで落ちる（run 30682367841 の実測）。",
  );
}

/** 「非公開」badge の背景トークン（不透明であることは上で保証済み）。 */
const sidebarBadgeBg = readOklchToken("sidebar-badge-bg");

/**
 * nav 項目が取りうる背景。**badge の実効背景はこれに依存してはいけない。**
 *
 * `ResponsiveSidebar` の `navItemActive` は `bg-sidebar-accent`（青）を敷き、
 * アイコンとラベルは `isActive && "text-primary-foreground"` で色を反転させる。
 * badge は別コンポーネントなのでその反転から漏れる。背景まで半透明だと、
 * 反転しないテキスト色が青の上に載って AA を大きく割る。
 */
const NAV_ITEM_BACKDROPS = [
  ["通常", sidebarBg],
  ["hover", navHoverBg],
  ["active（bg-sidebar-accent）", sidebarAccent],
] as const;

/** badge 背景を nav 項目の背景に合成した実効値（不透明なら backdrop は透けない）。 */
function effectiveBadgeBg(backdrop: Rgb): Rgb {
  return over(sidebarBadgeBg, backdrop, badgeBgAlpha);
}

// --- light: space management tabs / compact badge ----------------------------
const muted = readOklchToken("muted");
const mutedForeground = readOklchToken("muted-foreground");
const background = readOklchToken("background");
/** タブの `hover:bg-background/50` を `bg-muted` の上に合成した実効背景。 */
const tabHoverBg = over(background, muted, TAB_HOVER_BACKGROUND_ALPHA);

describe("計算モデルの検算（axe 実測値の再現）", () => {
  test("OKLCH→sRGB 変換が axe の報告した背景色に一致する", () => {
    expect(toHex(sidebarBg)).toBe("#0a121f");
  });

  test("二重減光の再現値が axe の報告と一致する（sidebar の修正前）", () => {
    // <Link opacity-80> の内側で label に text-sidebar-text-muted/80 を重ねた状態。
    // グループ opacity により実効 alpha は 0.8 × 0.8 = 0.64。
    const doubled = over(sidebarTextMuted, sidebarBg, 0.8 * 0.8);
    expect(toHex(doubled)).toBe("#646c79");
    expect(contrastRatio(doubled, sidebarBg)).toBeCloseTo(3.54, 1);
  });

  test("グループ opacity は subtree の背景にも掛かる（badge が AA 境界だった理由）", () => {
    // `opacity-80` だけを残した場合の sidebar「非公開」badge。CSS Color 4 のとおり
    // 前景も背景も 1 枚のグループとして 0.8 で合成されるため、badge 自身の背景
    // (bg-sidebar-nav-hover) まで暗くなる。背景の減光を計算に入れ忘れると 4.52:1 と
    // 過大に出て、実際には AA を割っていることを見逃す。
    const groupFg = over(sidebarTextMuted, sidebarBg, 0.8);
    const groupBg = over(navHoverBg, sidebarBg, 0.8);
    const groupRatio = contrastRatio(groupFg, groupBg);

    const naiveFg = over(sidebarTextMuted, navHoverBg, 0.8);
    const naiveRatio = contrastRatio(naiveFg, navHoverBg);

    expect(groupRatio).toBeLessThan(AA_MIN_RATIO);
    expect(naiveRatio).toBeGreaterThanOrEqual(AA_MIN_RATIO);
    expect(naiveRatio).toBeGreaterThan(groupRatio);
  });

  test("明色テーマのタブは opacity-80 だけで AA を割る（撤去が必要だった理由）", () => {
    const dimmed = over(mutedForeground, muted, 0.8);
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
    bg: sidebarBadgeBg,
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

/**
 * 「非公開」badge が **nav 項目の状態に依存しない**ことの gate。
 *
 * 事故 (run 30682367841 / `axe-admin-feature-disabled`「機能モジュール OFF の
 * スペース管理タブ」): badge 背景が `bg-sidebar-nav-hover`（白 5% = ほぼ透明）
 * だったため実効背景が nav 項目の状態で変わり、**active 項目（`bg-sidebar-accent`
 * = 青）の上で 1.72:1** まで落ちた。axe 実測 `fgColor #979fab` /
 * `bgColor #2771e4` / `contrastRatio 1.72`。
 *
 * 通常項目の上では 6.30:1 で通っていたため、暗色背景だけをモデル化していた
 * 従来の `TEXT_PAIRS` では**構造的に検出できなかった**。badge が「自分の背景を
 * 持つ」ことを不変条件にして、nav 項目が取りうる全背景で検査する。
 *
 * badge に `isActive` を配線する解も採らない — 将来 active 判定が増えたときに
 * 再び漏れる。背景を不透明にすれば状態から独立する。
 */
describe("「非公開」badge は nav 項目の状態から独立している", () => {
  test("badge 背景トークンが不透明（alpha を持たない）", () => {
    expect({
      token: "--color-sidebar-badge-bg",
      alpha: badgeBgAlpha,
      hex: toHex(sidebarBadgeBg),
    }).toMatchObject({ alpha: 1 });
  });

  test("badge が半透明の nav-hover 背景を使っていない", () => {
    // 旧実装への逆戻り検出。className リテラルだけを見るのでコメントは拾わない。
    expect(classNameLiterals(BADGE_TSX)).not.toContain("bg-sidebar-nav-hover");
  });

  for (const [state, backdrop] of NAV_ITEM_BACKDROPS) {
    test(`${state} の nav 項目の上でも AA を満たす`, () => {
      const bg = effectiveBadgeBg(backdrop);
      const ratio = contrastRatio(sidebarTextMuted, bg);
      expect({
        state,
        fg: toHex(sidebarTextMuted),
        bg: toHex(bg),
        ratio: Math.round(ratio * 100) / 100,
        required: AA_MIN_RATIO,
        pass: ratio >= AA_MIN_RATIO,
      }).toMatchObject({ pass: true });
    });
  }

  test("半透明に戻すと active 項目で AA を割る（この gate が空振りでないこと）", () => {
    // 旧実装（白 5%）を active 背景に合成した再現。axe の実測 1.72 と一致する。
    const oldBadgeBg = over(white, sidebarAccent, NAV_HOVER_WHITE_ALPHA);
    expect(toHex(oldBadgeBg)).toBe("#2871e5");
    expect(contrastRatio(sidebarTextMuted, oldBadgeBg)).toBeCloseTo(1.72, 2);
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
