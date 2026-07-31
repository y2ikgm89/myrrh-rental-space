import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  AA_MIN_RATIO,
  contrastRatio,
  createOklchTokenReader,
  over,
  saturate,
  toHex,
  type Rgb,
} from "../../helpers/color-contrast";

/**
 * 管理画面: 「操作可能なのに `opacity-*` で減光している」要素の
 * WCAG 2.1 AA (SC 1.4.3 Contrast Minimum = 4.5:1) drift gate。
 *
 * ## なぜ opacity が危険か
 *
 * CSS Color 4 の `opacity` は**グループ操作**で、subtree を一度バッファに描いてから
 * 合成する。つまり前景（テキスト）だけでなく**背景も一緒に畳み込まれる**ため、
 * 「文字だけ薄くなる」直感とは違い、実効コントラストは opacity の値そのものより
 * 大きく落ちる。https://www.w3.org/TR/css-color-4/#transparency
 *
 * WCAG 2.1 SC 1.4.3 の "Incidental" 例外は **inactive**（`disabled` 属性を持つ等、
 * 実際に操作できない）な UI コンポーネントだけが対象。押せる・フォーカスできる・
 * 行クリックで遷移できる要素は 4.5:1 が必要。
 * https://www.w3.org/TR/WCAG21/#contrast-minimum
 *
 * ## この gate が守る範囲
 *
 * サイドバー nav 項目（`admin-feature-disabled-contrast.test.ts`）とは別に、管理画面全域で
 * 「無効 / 非表示 / 過去 / 削除済み」を **group opacity** で表現していた 5 箇所を
 * 対象にする。いずれも減光を撤去し、前景を畳み込まない手がかり
 * （背景 tint / 実色トークン / saturate フィルタ）へ置き換えた。
 *
 * 2 方向から固定する:
 *
 * 1. `admin.css` の OKLCH トークンから実際のコントラスト比を計算して AA を強制
 * 2. 各コンポーネントの source で「その状態に group opacity を戻していない」ことを固定
 *
 * 計算は CSS Color 4 の oklch → oklab → sRGB と WCAG 2.1 の相対輝度に従う。実装の
 * 妥当性は「axe が独立に実測した `--color-sidebar-bg` = `#0a121f` と、二重減光時の
 * `#646c79` / 3.54:1 を再現できること」で検算している（下の anchor テスト）。
 */

const ADMIN_ROOT = join(process.cwd(), "src", "app", "(admin)");
const DASHBOARD = join(ADMIN_ROOT, "admin", "(dashboard)");

const ADMIN_CSS = join(ADMIN_ROOT, "_styles", "admin.css");
const SORTABLE_NAV_ITEM = join(
  DASHBOARD,
  "settings",
  "appearance",
  "_components",
  "navigation",
  "SortableNavItem.tsx",
);
const SECTION_LIST_ITEM = join(
  DASHBOARD,
  "pages",
  "[slug]",
  "edit",
  "_components",
  "SectionListItem.tsx",
);
const SIDEBAR_WIDGET_CARD = join(
  DASHBOARD,
  "settings",
  "_components",
  "sections",
  "sidebar",
  "SidebarWidgetCard.tsx",
);
const EVENT_CELL = join(
  DASHBOARD,
  "reservations",
  "_components",
  "calendar",
  "EventCell.tsx",
);
const RESERVATION_TABLE = join(
  DASHBOARD,
  "reservations",
  "_components",
  "ReservationTable.tsx",
);
const AUTO_IMAGE_FIELD = join(
  DASHBOARD,
  "pages",
  "[slug]",
  "_sections",
  "_components",
  "auto-fields",
  "AutoImageField.tsx",
);
const AUTO_MEDIA_FIELD = join(
  DASHBOARD,
  "pages",
  "[slug]",
  "_sections",
  "_components",
  "auto-fields",
  "AutoMediaField.tsx",
);
const STRIPE_SECTION = join(
  DASHBOARD,
  "settings",
  "_components",
  "sections",
  "StripeSection.tsx",
);
const DROPDOWN_MENU = join(
  DASHBOARD,
  "_shared",
  "components",
  "ui",
  "dropdown-menu.tsx",
);
const MOBILE_EDITOR_FALLBACK = join(
  DASHBOARD,
  "_shared",
  "components",
  "editor",
  "lexical",
  "parts",
  "MobileEditorFallback.tsx",
);
const MEDIA_PREVIEW = join(
  DASHBOARD,
  "_shared",
  "components",
  "media-picker",
  "MediaPreview.tsx",
);

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
 * 規約を説明するコメント自身を違反として数えないよう、ブロック / 行コメントを
 * 落とす。さらに空白を 1 個に潰して prettier の改行位置に依存しないようにする。
 */
function normalizedSource(path: string): string {
  return readFileOrThrow(path)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/\s+/gu, " ");
}

const adminCss = readFileOrThrow(ADMIN_CSS);

const readOklchToken = createOklchTokenReader(adminCss);

const CARD = readOklchToken("card");
const FOREGROUND = readOklchToken("foreground");
const MUTED = readOklchToken("muted");
const MUTED_FOREGROUND = readOklchToken("muted-foreground");
const ACCENT = readOklchToken("accent");
const POPOVER = readOklchToken("popover");
const SECONDARY = readOklchToken("secondary");
const SECONDARY_FOREGROUND = readOklchToken("secondary-foreground");

/** `bg-muted/40` を card の上に敷いた実効背景（無効行 / 削除済み行）。 */
const MUTED_40_ON_CARD = over(MUTED, CARD, 0.4);
/** `bg-muted/30`（無効ウィジェットカード、カレンダーの過去セル）。 */
const MUTED_30_ON_CARD = over(MUTED, CARD, 0.3);
/** `hover:bg-accent/50`（テーブル行 / セクション一覧の hover）。 */
const ACCENT_50_ON_CARD = over(ACCENT, CARD, 0.5);

/**
 * 予約ステータスの tint。`getStatusColorClass` が返す `bg-<status>` の alpha は
 * 通常 15%、CANCELLED のみ `bg-muted` の 40%。
 */
const STATUS_TINTS: { status: string; color: Rgb; alpha: number }[] = [
  { status: "PENDING", color: readOklchToken("warning"), alpha: 0.15 },
  { status: "CONFIRMED", color: readOklchToken("success"), alpha: 0.15 },
  { status: "COMPLETED", color: readOklchToken("info"), alpha: 0.15 },
  { status: "NO_SHOW", color: readOklchToken("destructive"), alpha: 0.15 },
  { status: "CANCELLED", color: MUTED, alpha: 0.4 },
];

// ---------------------------------------------------------------------------
// 計算実装の検算
// ---------------------------------------------------------------------------

describe("色計算モデルの検算", () => {
  test("OKLCH→sRGB 変換が axe の独立実測値を再現する", () => {
    // CI run 30617695076 の axe レポートが報告したサイドバー背景色。
    expect(toHex(readOklchToken("sidebar-bg"))).toBe("#0a121f");
  });

  test("group opacity の合成モデルが axe の実測値を再現する", () => {
    // `opacity-80` の <a> 内で `text-sidebar-text-muted/80` を重ねた二重減光
    // （実効 alpha 0.64）。axe は #646c79 / 3.54:1 を報告した。
    const sidebarBg = readOklchToken("sidebar-bg");
    const doubled = over(readOklchToken("sidebar-text-muted"), sidebarBg, 0.64);
    expect(toHex(doubled)).toBe("#646c79");
    expect(contrastRatio(doubled, sidebarBg)).toBeCloseTo(3.54, 1);
  });

  test("saturate は backdrop を前景に畳み込まない（opacity との構造的な違い）", () => {
    // saturate の係数は WCAG 相対輝度と同じ 0.213/0.715/0.072 だが、CSS filter は
    // gamma-encoded sRGB 空間で評価されるので相対輝度は**保存されない**
    // （例: warning は 0.418 → 0.382）。だから TEXT_PAIRS でも saturate を適用して測る。
    //
    // それでも saturate を残せる理由は輝度ではなく合成構造にある: saturate は要素
    // 自身の色だけを変換し backdrop を混ぜないので、実効前景が背後のセル色に
    // 依存しない。group opacity は backdrop を畳み込むので依存する。
    const viaOpacity = [
      toHex(over(FOREGROUND, CARD, 0.6)),
      toHex(over(FOREGROUND, MUTED_30_ON_CARD, 0.6)),
    ];
    expect(viaOpacity[0]).not.toBe(viaOpacity[1]);
  });

  test("同じ要素に opacity-60 を戻すと AA を割る（saturate-50 を選んだ理由）", () => {
    // 過去セル (bg-card + bg-muted/30) 上の EventCell 本文。
    const belowAA = STATUS_TINTS.filter(
      ({ color, alpha }) =>
        contrastRatio(
          over(saturate(FOREGROUND, 0.5), MUTED_30_ON_CARD, 0.6),
          over(saturate(color, 0.5), MUTED_30_ON_CARD, 0.6 * alpha),
        ) < AA_MIN_RATIO,
    ).map(({ status }) => status);

    // 実測 4.00〜4.42:1。CANCELLED だけ 4.56:1 で辛うじて通っていた。
    expect(belowAA).toEqual(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"]);
  });
});

// ---------------------------------------------------------------------------
// コントラスト実測
// ---------------------------------------------------------------------------

/**
 * 修正後の前景 / 背景ペア。すべて通常サイズテキスト（14px 以下）なので
 * large-text 例外 (3:1) は使えず 4.5:1 が必要。
 */
const TEXT_PAIRS: { usage: string; fg: Rgb; bg: Rgb }[] = [
  // --- SortableNavItem: 無効ナビ項目 / 無効ソーシャルリンク（bg-muted/40） ---
  {
    usage: "SortableNavItem 無効行のラベル (foreground on bg-muted/40)",
    fg: FOREGROUND,
    bg: MUTED_40_ON_CARD,
  },
  {
    usage: "SortableNavItem 無効行の URL (muted-foreground on bg-muted/40)",
    fg: MUTED_FOREGROUND,
    bg: MUTED_40_ON_CARD,
  },
  {
    usage: "SortableNavItem 無効行の「無効」Badge (secondary)",
    fg: SECONDARY_FOREGROUND,
    bg: SECONDARY,
  },

  // --- SectionListItem: 非表示セクションのラベル（text-muted-foreground） ---
  {
    usage: "SectionListItem 非表示セクションのラベル / 未選択 (bg-card)",
    fg: MUTED_FOREGROUND,
    bg: CARD,
  },
  {
    usage: "SectionListItem 非表示セクションのラベル / 選択中 (bg-accent)",
    fg: MUTED_FOREGROUND,
    bg: ACCENT,
  },
  {
    usage: "SectionListItem 非表示セクションのラベル / hover (bg-accent/50)",
    fg: MUTED_FOREGROUND,
    bg: ACCENT_50_ON_CARD,
  },

  // --- SidebarWidgetCard: 無効ウィジェット（bg-muted/30） ---
  {
    usage:
      "SidebarWidgetCard 無効ウィジェットのラベル (foreground on bg-muted/30)",
    fg: FOREGROUND,
    bg: MUTED_30_ON_CARD,
  },
  {
    usage:
      "SidebarWidgetCard 無効ウィジェットの説明 (muted-foreground on bg-muted/30)",
    fg: MUTED_FOREGROUND,
    bg: MUTED_30_ON_CARD,
  },

  // --- ReservationTable: 削除済み行（bg-muted/40） ---
  {
    usage: "ReservationTable 削除済み行の本文 (foreground on bg-muted/40)",
    fg: FOREGROUND,
    bg: MUTED_40_ON_CARD,
  },
  {
    usage:
      "ReservationTable 削除済み行の時刻 / メール (muted-foreground on bg-muted/40)",
    fg: MUTED_FOREGROUND,
    bg: MUTED_40_ON_CARD,
  },
  {
    usage:
      "ReservationTable 削除済み行の hover (muted-foreground on bg-accent/50)",
    fg: MUTED_FOREGROUND,
    bg: ACCENT_50_ON_CARD,
  },
  {
    usage: "ReservationTable「削除済み」バッジ (muted-foreground on bg-muted)",
    fg: MUTED_FOREGROUND,
    bg: MUTED,
  },

  // --- StripeSection: 通貨非対応の決済手段（減光撤去） ---
  {
    usage: "StripeSection 通貨非対応の決済手段名 (foreground on bg-card)",
    fg: FOREGROUND,
    bg: CARD,
  },
  {
    usage:
      "StripeSection 通貨非対応の「対応通貨: ...」(muted-foreground on bg-card)",
    fg: MUTED_FOREGROUND,
    bg: CARD,
  },

  // --- DropdownMenuShortcut: menu item 内のショートカット表記（減光撤去） ---
  {
    usage: "DropdownMenuShortcut 通常 (muted-foreground on bg-popover)",
    fg: MUTED_FOREGROUND,
    bg: POPOVER,
  },
  {
    usage: "DropdownMenuShortcut focus 中 (muted-foreground on bg-accent)",
    fg: MUTED_FOREGROUND,
    bg: ACCENT,
  },

  // --- MobileEditorFallback: 読み取り専用プレビュー本文（減光撤去） ---
  {
    usage: "MobileEditorFallback プレビュー本文 (foreground on bg-card)",
    fg: FOREGROUND,
    bg: CARD,
  },
];

// --- EventCell / EventBadge: 過去・キャンセルイベント（saturate-50、opacity なし） ---
// 過去セルは `bg-muted/30` のオーバーレイが敷かれるため backdrop が 2 通りある。
for (const [backdropName, backdrop] of [
  ["過去セル (bg-card + bg-muted/30)", MUTED_30_ON_CARD],
  ["通常セル (bg-card)", CARD],
] as const) {
  for (const { status, color, alpha } of STATUS_TINTS) {
    TEXT_PAIRS.push({
      usage: `EventCell ${status} の本文 / スペース名 (text-foreground) — ${backdropName}`,
      fg: saturate(FOREGROUND, 0.5),
      bg: over(saturate(color, 0.5), backdrop, alpha),
    });
  }
}

// 「定期」バッジは `bg-muted` が不透明なので backdrop に依存しない。
TEXT_PAIRS.push({
  usage: "EventCell「定期」バッジ (muted-foreground on 不透明 bg-muted)",
  fg: saturate(MUTED_FOREGROUND, 0.5),
  bg: saturate(MUTED, 0.5),
});

describe("操作可能な減光要素のコントラスト (WCAG 2.1 AA)", () => {
  for (const { usage, fg, bg } of TEXT_PAIRS) {
    test(`${usage} が 4.5:1 以上`, () => {
      const ratio = contrastRatio(fg, bg);
      // 失敗時に「どの色が何:1 だったか」を出す（トークン調整の手がかり）。
      expect({
        fg: toHex(fg),
        bg: toHex(bg),
        ratio: round2(ratio),
        required: AA_MIN_RATIO,
        pass: ratio >= AA_MIN_RATIO,
      }).toMatchObject({ pass: true });
    });
  }

  test("修正前の group opacity は実際に AA を割っていた（回帰の再現）", () => {
    // 「撤去しなくても良かったのでは」を封じるため、旧実装の実測値を残す。
    const before: { usage: string; ratio: number }[] = [
      {
        usage: "SortableNavItem opacity-50 の URL",
        ratio: contrastRatio(over(MUTED_FOREGROUND, CARD, 0.5), CARD),
      },
      {
        usage: "SidebarWidgetCard opacity-60 の説明",
        ratio: contrastRatio(
          over(MUTED_FOREGROUND, CARD, 0.6),
          over(MUTED, CARD, 0.6 * 0.3),
        ),
      },
      {
        usage: "ReservationTable opacity-50 の本文",
        ratio: contrastRatio(over(FOREGROUND, CARD, 0.5), CARD),
      },
      {
        usage: "StripeSection opacity-50 の「対応通貨: ...」",
        ratio: contrastRatio(over(MUTED_FOREGROUND, CARD, 0.5), CARD),
      },
      {
        usage: "DropdownMenuShortcut opacity-60 の focus 中",
        // focus:bg-accent focus:text-accent-foreground が当たった状態。
        ratio: contrastRatio(
          over(readOklchToken("accent-foreground"), ACCENT, 0.6),
          ACCENT,
        ),
      },
    ];
    for (const { usage, ratio } of before) {
      expect({ usage, wasBelowAA: ratio < AA_MIN_RATIO }).toMatchObject({
        wasBelowAA: true,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// source ガード: 該当状態に group opacity を戻していないこと
// ---------------------------------------------------------------------------

const OPACITY_GUARDS: {
  label: string;
  path: string;
  /** この状態に group opacity を当て直したら fail させる。 */
  forbidden: RegExp;
  /** 減光の代わりに使う手がかり（撤去だけして手がかりを失う変更も検知する）。 */
  required: string[];
}[] = [
  {
    label: "SortableNavItem — 無効ナビ項目 / 無効ソーシャルリンク",
    path: SORTABLE_NAV_ITEM,
    forbidden: /!(?:item|link)\.isActive && "[^"]*opacity-/u,
    required: [
      '!item.isActive && "bg-muted/40"',
      '!link.isActive && "bg-muted/40"',
    ],
  },
  {
    label: "SectionListItem — 非表示セクションのラベルボタン",
    path: SECTION_LIST_ITEM,
    forbidden: /!section\.isActive && "[^"]*opacity-/u,
    required: ['!section.isActive && "text-muted-foreground"'],
  },
  {
    label: "SidebarWidgetCard — 無効ウィジェット",
    path: SIDEBAR_WIDGET_CARD,
    forbidden: /!widget\.enabled && "[^"]*opacity-/u,
    required: ['!widget.enabled && "bg-muted/30"'],
  },
  {
    label: "EventCell / EventBadge — 過去 / キャンセルイベント",
    path: EVENT_CELL,
    forbidden: /isMuted && "[^"]*opacity-/u,
    required: ['isMuted && "saturate-50"'],
  },
  {
    label: "ReservationTable — 削除済み行",
    path: RESERVATION_TABLE,
    forbidden: /deletedAt[^;]{0,160}?opacity-/u,
    required: ['{ className: "bg-muted/40" }'],
  },
  {
    // この状態でだけ出る「対応通貨: ...」が唯一の理由説明なので、
    // Checkbox が disabled でも読める必要がある（旧 opacity-50 で 2.14:1）。
    label: "StripeSection — 通貨非対応の決済手段",
    path: STRIPE_SECTION,
    forbidden: /disabledForCurrency && "[^"]*opacity-/u,
    required: ['disabledForCurrency && "cursor-not-allowed"'],
  },
  {
    // このファイルには `data-[disabled]:opacity-50`（本当に不活性な menu item、
    // Incidental 例外に該当）が別途あるので、shortcut の class だけを見る。
    label: "DropdownMenuShortcut — menu item 内のショートカット表記",
    path: DROPDOWN_MENU,
    forbidden: /ml-auto text-xs tracking-widest[^"]*opacity-/u,
    required: ['"ml-auto text-xs tracking-widest text-muted-foreground"'],
  },
  {
    // UI コントロールではなくコンテンツなので、`pointer-events-none` があっても
    // Incidental 例外は使えない（旧 opacity-60 で 4.65〜4.74:1 と余裕僅少）。
    label: "MobileEditorFallback — 読み取り専用プレビュー本文",
    path: MOBILE_EDITOR_FALLBACK,
    forbidden: /prose prose-sm[^"]*opacity-/u,
    required: ['"prose prose-sm pointer-events-none max-w-none"'],
  },
];

describe("操作可能な要素に group opacity を戻していない", () => {
  for (const { label, path, forbidden, required } of OPACITY_GUARDS) {
    test(`${label} は減光ではなく別の手がかりを使う`, () => {
      const source = normalizedSource(path);
      expect(forbidden.exec(source)).toBeNull();
      for (const needle of required) {
        expect(source).toContain(needle);
      }
    });
  }

  test("EventCell のスペース名は tint 上で薄くなる muted-foreground を使わない", () => {
    // `bg-destructive/15` + 過去セルの `bg-muted/30` が重なると 4.40:1 まで落ちる。
    // calendar-domain.ts のデザイン方針（text は text-foreground 統一）とも一致させる。
    const source = normalizedSource(EVENT_CELL);
    expect(source).toContain(
      '"mt-0.5 truncate text-[0.6875rem] leading-tight"',
    );
  });
});

// ---------------------------------------------------------------------------
// Incidental 例外が成立し続けることのガード
// ---------------------------------------------------------------------------

/**
 * `AutoImageField` / `AutoMediaField` のプレビュー枠は `(disabled || isBusy)` で
 * `opacity-60` を掛ける（実測では muted テキストが 2.55:1 まで落ちる）。これが
 * SC 1.4.3 の "inactive user interface component" 例外で許されるのは、枠内に
 * **操作できる要素が 1 つも残っていない**場合だけ。前提が崩れた瞬間に例外は消えて
 * AA 違反になるので、崩れ方を 2 系統に分けて固定する。
 *
 * 1. `disabled` 属性を持てるコントロール（button / Button）→ 全数に配線されているか
 * 2. `disabled` 属性を**持てない**操作可能要素（`<video controls>` /
 *    `<audio controls>` / `<iframe>`）→ `inert` で包まれているか
 *
 * (2) は実際に見落としていた: `AutoMediaField` は `MediaPreview` 経由で動画・音声・
 * 埋め込みプレイヤーを描画しうるのに、それらは disabled にならないため減光下でも
 * 再生操作ができてしまっていた（PR #1733 のレビュー指摘）。
 */
describe("減光したまま許容できる箇所は inactive であり続ける", () => {
  for (const [label, path] of [
    ["AutoImageField", AUTO_IMAGE_FIELD],
    ["AutoMediaField", AUTO_MEDIA_FIELD],
  ] as const) {
    test(`${label} は減光中すべての button が disabled`, () => {
      const source = normalizedSource(path);

      // 減光の条件そのもの。
      expect(source).toContain('(disabled || isBusy) && "opacity-60"');

      // ボタンの総数と `disabled={disabled || isBusy}` の数が一致する
      // ＝ 減光中に押せる button が 1 つも残らない。
      // ※ これは disabled 属性を持てる要素しか見ない。持てない要素は下の test。
      const buttons = source.match(/<[Bb]utton\b/gu) ?? [];
      const disabledBindings =
        source.match(/disabled=\{disabled \|\| isBusy\}/gu) ?? [];
      expect({
        buttons: buttons.length,
        disabledBindings: disabledBindings.length,
      }).toMatchObject({ disabledBindings: buttons.length });
      expect(buttons.length).toBeGreaterThan(0);

      // drag & drop も無効。これが無いと枠自体が操作可能になり例外が崩れる。
      expect(source).toContain("if (disabled || isUploading) return;");
    });
  }

  /** `disabled` 属性を持てないのに操作できる要素。 */
  const NON_DISABLEABLE_OPERABLE = ["<video", "<audio", "<iframe"];

  test("MediaPreview は disabled にできない操作可能要素を描画する（前提の確認）", () => {
    // この前提が消えたら下の inert ガードの必要性も見直す。
    const source = normalizedSource(MEDIA_PREVIEW);
    const found = NON_DISABLEABLE_OPERABLE.filter((tag) =>
      source.includes(tag),
    );
    expect(found).toEqual(NON_DISABLEABLE_OPERABLE);
  });

  test("AutoMediaField は MediaPreview を inert で包んで本当に操作不能にする", () => {
    const source = normalizedSource(AUTO_MEDIA_FIELD);
    // `inert` は subtree を focus 不可・click 不可にし a11y tree からも除く。
    // `<video controls>` 等に disabled 相当を効かせる唯一の標準手段。
    expect(
      /inert=\{disabled \|\| isBusy\}>\s*<MediaPreview\b/u.exec(source),
    ).not.toBeNull();
  });

  test("AutoImageField の減光枠には disabled にできない操作可能要素が無い", () => {
    // こちらは `<Image>`（非操作）と disabled 済み Button だけなので inert 不要。
    // 将来 video/audio/iframe が入ったら inert を足す必要がある。
    const source = normalizedSource(AUTO_IMAGE_FIELD);
    const found = NON_DISABLEABLE_OPERABLE.filter((tag) =>
      source.includes(tag),
    );
    expect(found).toEqual([]);
  });
});
