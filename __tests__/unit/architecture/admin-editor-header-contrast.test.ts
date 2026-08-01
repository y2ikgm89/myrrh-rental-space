import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  AA_MIN_RATIO,
  contrastRatio,
  createOklchTokenReader,
  over,
  toHex,
  type Rgb,
} from "../../helpers/color-contrast";

/**
 * 管理画面インラインエディタ: 固定ヘッダーの WCAG 2.1 AA (SC 1.4.3 = 4.5:1) drift gate。
 *
 * ## 何が起きていたか
 *
 * `EditorHeader` は `fixed top-0 left-0 right-0` = **ビューポート全幅**で、z-index は
 * `Z_INDEX.editorToolbar`(65)。サイドバーの `Z_INDEX.sidebar`(10) より上にあるため、
 * 左 256px（`w-64`）はサイドバーに**被さって**描画される。
 *
 * 一方、管理シェルがサイドバーを外すのは **hydration 後**。`InlineEditorShell` の
 * `useFullscreenMode` が `useLayoutEffect` で `enterFullscreen()` を呼び、
 * `ResponsiveSidebar` / `TopBar` の `if (isFullscreen) return null` が効くのは
 * クライアントで最初の commit が走った後なので、**SSR HTML にはサイドバーが載っている**。
 *
 * そのためヘッダー背景が半透明（旧 `bg-background/95` +
 * `supports-[backdrop-filter]:bg-background/60` + `backdrop-blur`）だと、
 * 最初のペイントからハイドレーション完了までの間、左 256px の実効背景が
 * `--color-sidebar-bg` との合成になる:
 *
 *   bg-background(#f6f9fc) を alpha 0.6 で sidebar-bg(#0a121f) に合成 → #989da4
 *   その上の slug (`text-muted-foreground` #5b646f, 14px) = **2.18:1**
 *
 * axe はこの窓に入ったスキャンでだけ違反として報告するので flaky に見えるが、実体は
 * 「ページを開くたびに必ず通る経路」で、たまたま検出タイミングが揺れているだけ。
 * 実測は CI run 30678172597 の `lexical-toolbar-roving-tabindex.spec.ts`
 * （axe color-contrast serious、1 node）。
 *
 * ## この gate が固定するもの
 *
 * 1. ヘッダー背景が**不透明**であること（＝実効背景が `--color-background` 1 本に定まり、
 *    背後に何が描かれていてもコントラストが変わらない）
 * 2. その不透明背景の上でヘッダーの全テキストトークンが AA を満たすこと
 * 3. 旧構成が実際に AA を割っていたこと（「戻しても良かったのでは」を封じる回帰再現）
 *
 * `admin-dimmed-control-contrast.test.ts` / `admin-feature-disabled-contrast.test.ts`
 * と同じ計算モデル（`__tests__/helpers/color-contrast.ts`）を使う。
 */

const ADMIN_ROOT = join(process.cwd(), "src", "app", "(admin)");
const DASHBOARD = join(ADMIN_ROOT, "admin", "(dashboard)");
const INLINE = join(DASHBOARD, "_shared", "components", "editor", "inline");

const ADMIN_CSS = join(ADMIN_ROOT, "_styles", "admin.css");
const EDITOR_HEADER = join(INLINE, "EditorHeader.tsx");
const INLINE_EDITOR_SHELL = join(INLINE, "InlineEditorShell.tsx");
const INLINE_HOOKS = join(INLINE, "hooks.ts");
const EDITOR_LOADING = join(
  DASHBOARD,
  "_shared",
  "components",
  "EditorLoading.tsx",
);
const RESPONSIVE_SIDEBAR = join(
  DASHBOARD,
  "_components",
  "ResponsiveSidebar.tsx",
);
const Z_INDEX = join(DASHBOARD, "_shared", "lib", "styles", "z-index.ts");

const round2 = (value: number): number => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// source 読み込み
// ---------------------------------------------------------------------------

/** rename / 消滅を silent green で見逃さない hard-fail。 */
function readFileOrThrow(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Expected file to exist: ${path}`);
  }
  return readFileSync(path, "utf8");
}

/**
 * 規約を説明するコメント自身を違反として数えないよう、ブロック / 行コメントを落とす。
 * このファイルが守る規約の説明には `bg-background/60` や `backdrop-blur` が
 * 実際に登場するため、これが無いと自分のコメントで fail する。
 */
function normalizedSource(path: string): string {
  return readFileOrThrow(path)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/\s+/gu, " ");
}

const readOklchToken = createOklchTokenReader(readFileOrThrow(ADMIN_CSS));

const BACKGROUND = readOklchToken("background");
const SIDEBAR_BG = readOklchToken("sidebar-bg");
const FOREGROUND = readOklchToken("foreground");
const MUTED_FOREGROUND = readOklchToken("muted-foreground");
const WARNING_STRONG = readOklchToken("warning-strong");

// ---------------------------------------------------------------------------
// 計算実装の検算（axe の独立実測値の再現）
// ---------------------------------------------------------------------------

/**
 * 8bit sRGB へ量子化する。
 *
 * ブラウザは `oklch()` を **serialize 済みの 8bit `rgb()`** にしてから alpha 合成する
 * ため、連続値のまま合成する `over()` とは 1 LSB ずれることがある。実測でも
 * 連続値だと `#979ca3`、量子化してからだと axe と同じ `#989da4` になった
 * （比率は 2.1745 vs 2.1824 で結論は変わらない）。
 *
 * anchor テストで axe の hex と厳密一致させるためだけに使う。実際の AA 判定
 * （下の TEXT_PAIRS）は不透明背景なので合成が絡まず、量子化の有無に依存しない。
 */
function quantize8bit(color: Rgb): Rgb {
  return [
    Math.round(color[0] * 255) / 255,
    Math.round(color[1] * 255) / 255,
    Math.round(color[2] * 255) / 255,
  ];
}

/** 旧構成の実効背景: `supports-[backdrop-filter]:bg-background/60` on サイドバー。 */
const TRANSLUCENT_OVER_SIDEBAR = over(
  quantize8bit(BACKGROUND),
  quantize8bit(SIDEBAR_BG),
  0.6,
);

describe("色計算モデルの検算（axe の独立実測値を再現する）", () => {
  test("前景トークンが axe の報告した hex と一致する", () => {
    // CI run 30678172597 の axe レポート: foreground color #5b646f。
    expect(toHex(MUTED_FOREGROUND)).toBe("#5b646f");
  });

  test("半透明ヘッダー × サイドバーの合成が axe の報告した背景と一致する", () => {
    // 同レポート: background color #989da4 / contrast 2.2 / 10.5pt (14px) normal。
    expect(toHex(TRANSLUCENT_OVER_SIDEBAR)).toBe("#989da4");
    expect(
      contrastRatio(MUTED_FOREGROUND, TRANSLUCENT_OVER_SIDEBAR),
    ).toBeCloseTo(2.2, 1);
  });
});

// ---------------------------------------------------------------------------
// コントラスト実測（不透明ヘッダー上のテキスト）
// ---------------------------------------------------------------------------

/**
 * `EditorHeader` が描画するテキストと、その実効背景。
 *
 * 背景はすべて不透明な `--color-background` そのもの。ヘッダーに alpha を戻すと
 * ここが「背後次第」になり、この表の値が実測と乖離する（だから下の source guard で
 * alpha を禁止している）。
 */
const TEXT_PAIRS: { usage: string; fg: Rgb }[] = [
  {
    // slots.title — `text-base font-medium`（body から foreground を継承）
    usage: "EditorHeader タイトル (foreground)",
    fg: FOREGROUND,
  },
  {
    // slots.slug — `text-sm text-muted-foreground`。axe が落としたのはここ。
    usage: "EditorHeader スラッグ (muted-foreground, text-sm = 14px)",
    fg: MUTED_FOREGROUND,
  },
  {
    // slots.dirtyIndicator — `text-xs text-warning-strong`。isDirty のときだけ出る。
    // 12px なので large-text 例外(3:1)は使えず 4.5:1 が必要。
    usage:
      "EditorHeader「未保存」インジケータ (warning-strong, text-xs = 12px)",
    fg: WARNING_STRONG,
  },
];

describe("不透明ヘッダー上のテキストのコントラスト (WCAG 2.1 AA)", () => {
  for (const { usage, fg } of TEXT_PAIRS) {
    test(`${usage} が 4.5:1 以上`, () => {
      const ratio = contrastRatio(fg, BACKGROUND);
      // 失敗時に「どの色が何:1 だったか」を出す（トークン調整の手がかり）。
      expect({
        fg: toHex(fg),
        bg: toHex(BACKGROUND),
        ratio: round2(ratio),
        required: AA_MIN_RATIO,
        pass: ratio >= AA_MIN_RATIO,
      }).toMatchObject({ pass: true });
    });
  }

  test("旧構成（半透明 × サイドバー）は実際に AA を割っていた（回帰の再現）", () => {
    // 「不透明化しなくても良かったのでは」を封じるため、旧実装の実測値を残す。
    // axe が報告したのは slug の 1 node だけだが、それは新規投稿ページで
    // isDirty=false だったから。未保存インジケータも同じ背景で AA を割る。
    const belowAA = TEXT_PAIRS.filter(
      ({ fg }) => contrastRatio(fg, TRANSLUCENT_OVER_SIDEBAR) < AA_MIN_RATIO,
    ).map(({ usage }) => usage);

    expect(belowAA).toEqual([
      "EditorHeader スラッグ (muted-foreground, text-sm = 14px)",
      "EditorHeader「未保存」インジケータ (warning-strong, text-xs = 12px)",
    ]);
  });
});

// ---------------------------------------------------------------------------
// source ガード: ヘッダー背景に alpha / backdrop-filter を戻していないこと
// ---------------------------------------------------------------------------

/** `bg-foo/40` のような alpha 付き背景ユーティリティ。 */
const ALPHA_BACKGROUND = /\bbg-[a-z0-9-]+\/\d+/u;
/** `backdrop-blur` / `supports-[backdrop-filter]:...` 等。 */
const BACKDROP_FILTER = /backdrop-(?:blur|filter)|\[backdrop-filter\]/u;

const OPAQUE_HEADER_GUARDS: {
  label: string;
  path: string;
  /** 対象の class 文字列を source から取り出す。 */
  extract: (source: string) => string | undefined;
}[] = [
  {
    label: "EditorHeader — tv() の header スロット",
    path: EDITOR_HEADER,
    extract: (source) => /header:\s*"([^"]*)"/u.exec(source)?.[1],
  },
  {
    label: "EditorLoading — route loading fallback の固定ヘッダー",
    path: EDITOR_LOADING,
    extract: (source) =>
      /className="(fixed inset-x-0 top-0[^"]*)"/u.exec(source)?.[1],
  },
];

describe("エディタ固定ヘッダーの背景は不透明のまま", () => {
  for (const { label, path, extract } of OPAQUE_HEADER_GUARDS) {
    test(`${label} は alpha / backdrop-filter を使わない`, () => {
      const headerClass = extract(normalizedSource(path));
      // 取り出せない = class の書き方が変わった。silent green にせず落とす。
      expect(headerClass).toBeDefined();
      const classes = headerClass ?? "";

      expect({
        classes,
        hasAlphaBackground: ALPHA_BACKGROUND.test(classes),
        hasBackdropFilter: BACKDROP_FILTER.test(classes),
      }).toMatchObject({ hasAlphaBackground: false, hasBackdropFilter: false });

      // 撤去だけして背景そのものを失う変更も検知する（透明 = 背後次第に戻る）。
      expect(classes).toContain("bg-background");
    });
  }
});

// ---------------------------------------------------------------------------
// 前提の確認: この規約が必要であり続けること
// ---------------------------------------------------------------------------

/**
 * 「なぜ不透明でなければならないか」は 3 つの前提に乗っている。前提が消えたら
 * この gate の必要性も見直すべきなので、消えたら落ちるようにしておく。
 * （逆に前提が生きている限り、alpha を戻す変更は必ず AA 違反になる）
 */
describe("不透明を要求する前提が生きている", () => {
  test("EditorHeader はビューポート全幅の fixed である", () => {
    const headerClass =
      /header:\s*"([^"]*)"/u.exec(normalizedSource(EDITOR_HEADER))?.[1] ?? "";
    expect(headerClass).toContain("fixed");
    expect(headerClass).toContain("left-0");
    expect(headerClass).toContain("right-0");
  });

  test("エディタツールバーの z-index はサイドバーより上", () => {
    const source = readFileOrThrow(Z_INDEX);
    const sidebar = /\bsidebar:\s*(\d+)/u.exec(source)?.[1];
    const editorToolbar = /\beditorToolbar:\s*(\d+)/u.exec(source)?.[1];
    expect(sidebar).toBeDefined();
    expect(editorToolbar).toBeDefined();
    expect(Number(editorToolbar)).toBeGreaterThan(Number(sidebar));
  });

  test("サイドバーは暗色トークンを背景に持つ", () => {
    // 明色なら合成しても AA を割らない。暗色だから 2.18:1 まで落ちた。
    expect(normalizedSource(RESPONSIVE_SIDEBAR)).toContain("bg-sidebar-bg");
    expect(contrastRatio(SIDEBAR_BG, BACKGROUND)).toBeGreaterThan(AA_MIN_RATIO);
  });

  test("サイドバーが外れるのは hydration 後（SSR HTML には載っている）", () => {
    // `useLayoutEffect` はサーバーでは走らないので、SSR 出力は isFullscreen=false
    // ＝ サイドバーあり。ここが「サーバー側で editor route を判定して最初から
    // 隠す」に変われば、半透明でも安全になりうる（そのときはこの gate を見直す）。
    const hooks = normalizedSource(INLINE_HOOKS);
    expect(
      /useLayoutEffect\(\(\) => \{ enterFullscreen\(\);/u.exec(hooks),
    ).not.toBeNull();
    expect(normalizedSource(INLINE_EDITOR_SHELL)).toContain(
      "useFullscreenMode()",
    );
    expect(normalizedSource(RESPONSIVE_SIDEBAR)).toContain(
      "if (isFullscreen) return null;",
    );
  });

  test("エディタ本文はヘッダーの下を通過しない（backdrop-blur は元々不要）", () => {
    // InlineEditorShell は h-dvh + 内側 overflow-hidden でスクロールコンテナを
    // ヘッダー下端より下に閉じ込める。すりガラス効果が働く余地が無いので、
    // 不透明化による見た目の損失は無い。
    const shell = normalizedSource(INLINE_EDITOR_SHELL);
    expect(shell).toContain('"h-dvh flex flex-col pt-14"');
    expect(shell).toContain('"flex flex-1 min-w-0 overflow-hidden"');
  });
});
