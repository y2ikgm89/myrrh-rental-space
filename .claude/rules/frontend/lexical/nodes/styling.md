---
description: Lexical ノードの CSS-first exportDOM パターン（data-attributes のみ）+ AccentColor システム + curation icon SVG 埋め込み
paths:
  - src/shared/lib/lexical/**
  - src/**/editor/**
  - src/**/*lexical*
  - src/**/*lexical-content.css
  - src/shared/components/icon-curation/**
---

# Lexical ノード スタイリング

> data-attributes のみ使う CSS-first exportDOM + 10 色 AccentColor (`[data-color]` → `--accent` / `--accent-fg`) + Tabler Icon の static markup 埋め込み (`renderToStaticMarkup` + `setAttribute`)。

## CSS-first exportDOM パターン

exportDOM / createDOM では **data-attributes のみ使用**。CSS クラスは使用しない。
公開ページの CSS でアトリビュートセレクタによるスタイリングを行う:

```typescript
// exportDOM(): 公開ページ HTML 出力
exportDOM(): DOMExportOutput {
  const element = document.createElement('div')
  element.setAttribute('data-steps', 'true')
  element.setAttribute('data-steps-style', $getState(this, stepsStyleState))
  return { element }
}

// createDOM(): エディタ内 DOM
createDOM(_config: EditorConfig): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-steps', 'true')
  element.setAttribute('data-steps-style', $getState(this, stepsStyleState))
  return element
}

// updateDOM(): 差分更新（return false で DOM 再構築を回避）
updateDOM(prevNode: this, dom: HTMLElement): boolean {
  const change = $getStateChange(this, prevNode, stepsStyleState)
  if (change !== null) {
    const [newStyle] = change
    dom.setAttribute('data-steps-style', newStyle)
  }
  return false
}
```

```css
/* 公開ページ CSS: アトリビュートセレクタ */
[data-steps] {
  /* コンテナスタイル */
}
[data-steps-style="numbered"] {
  /* numbered 固有スタイル */
}
[data-steps-style="timeline"] {
  /* timeline 固有スタイル */
}
```

## CSS-first ノードは `lexical-content.css` のスタイルセクションが必須（dead UI 防止）

`createDOM` / `exportDOM` が `data-*` 属性のみ出力する CSS-first ノードは、**`lexical-content.css` に対応する `[data-*]` セクションを必ず追加する**。属性を出力しても CSS が無ければ editor・公開ページとも「素の縦積み div（dead UI）」になり、Inspector で編集しても見た目に反映されない。新規 CSS-first ノード追加時は `frontend/lexical/nodes.md` の登録チェックリストの CSS 行を必ず満たすこと。

**検出 grep**（ノードが出力する全 `data-*` 属性が CSS に存在するか）:

```bash
# 例: 新ノードの属性が lexical-content.css にあるか（0 なら dead UI）
grep -c "data-<block>" src/shared/styles/lexical-content.css
```

実例: Cover / Gallery / Timeline / PricingTable / Testimonial は属性を出力しながら CSS が皆無で全ブロック dead UI だった（2026-06-02 に全 5 ブロックの CSS を新規実装、FeatureIconList が手本）。

## CSS-first ノードはモバイル/レスポンシブ対応必須（dead UI と同格）

CSS が存在しても**モバイルで横溢れ・過密**になるブロックは「対応漏れ」とみなす（dead UI と同格の必須要件）。CSS-first ノードの `lexical-content.css` セクションは desktop レイアウトだけでなく狭画面挙動も必ず定義する。`lexical-content.css` は admin / public 両 root layout が import する共有 CSS のため、editor（`<1024px` は `MobileEditorFallback` の静的描画）・公開ページ双方で効く。

| ブロック種別                                                       | 必須パターン                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多カラム grid（Gallery / Pricing / Testimonial / FeatureIconList） | mobile-first `grid-template-columns: 1fr`（or 2 列）→ `@media (min-width: 48rem)` で多カラム展開                                                                                                                  |
| カラム（Layout container）                                         | `@media (max-width: 768px)` で `--lexical-layout-mobile` 列に上書き                                                                                                                                               |
| 横長コンテンツ（Table 等、列数可変で幅が伸びる）                   | `@media (max-width: 768px)` で `display: block; width: max-content; max-width: 100%; overflow-x: auto`（GitHub markdown 方式）。セレクタは `[data-<node>-*]` 等で当該ノードに限定し shadcn 管理テーブルに非干渉に |
| 埋め込み iframe（YouTube / X / Instagram 等）                      | `width: 100%` + `max-width: <N>`（固定 max-width 単独は narrow で溢れる）                                                                                                                                         |
| サイド画像カード（Bookmark / LinkCard）                            | 画像 wrap に `flex-shrink: 0`、テキスト側に `min-width: 0`（テキストのみ収縮）                                                                                                                                    |
| 固定 padding が大きいブロック（PullQuote / Callout 等）            | 本文を拡大したら padding は `clamp(min, vw 追従, max)` で mobile 縮小（過密回避）                                                                                                                                 |

**起点 grep**（CSS に媒体クエリ / 収縮機構があるかの目視確認）:

```bash
grep -nE "grid-template-columns|width:|overflow-x|@media" src/shared/styles/lexical-content.css
```

実例: Table のみ scroll ラッパー・幅制約が無く狭画面でページ全体が横溢れ（2026-06-03 `table[data-table-style]` に mobile `overflow-x` を追加して解消）。PullQuote は本文拡大に伴い padding を `clamp` 化（同日）。

## 共有 `lexical-content.css` のテーマ専用トークンは `var(--token, literal)` フォールバック必須

`lexical-content.css` は admin.css / public.css 双方が import する共有ファイル。両テーマに存在するトークン（`--font-serif` / `--color-foreground` / `--accent` / `--color-muted` 等）は bare 参照可だが、**片テーマにしか定義されていないトークンを bare 参照すると、もう一方（多くは admin = エディタ）で値が解決されず壊れる**。

実例: `--text-pullquote`（+ `--text-pullquote--line-height` / `--font-weight` 等）は public.css のみ定義。引用本文に `font-size: var(--text-pullquote)` を bare 参照すると admin エディタ内で font-size が unset 化する。`var(--text-pullquote, clamp(1.5rem, 1.25rem + 1.15vw, 2rem))` の形で **literal フォールバックを public 値と同期してミラー**し両コンテキストで同一表示にする（2026-06-03）。既存の `var(--accent, var(--color-accent))` と同じパターン。

**判定**: トークン使用前に両定義を確認。片方のみなら fallback 必須。

```bash
grep -n "<token>" "src/app/(admin)/_styles/admin.css" "src/app/(public)/_styles/public.css"
```

## 表示値を NodeState で保持するノードの DOM 注入パターン

年・価格・著者・評価・タイトル等の **表示値を NodeState（data 属性）で保持する**ノード（編集可能な子テキストを持たない、または子とメタが別）は、値を **`createDOM` / `updateDOM` / `exportDOM` の 3 メソッドすべてで実 DOM 要素として注入**する（`attr()` 擬似要素ではなく実テキスト要素 = a11y / SEO 対応）。Gallery の `applyGalleryItemContent` / FeatureIconList の SVG 注入が手本。

- **共通ヘルパー** を 1 つ定義し 3 メソッドから呼ぶ。注入要素に `data-*` マーカーを付け、再注入前に `host.querySelectorAll(":scope > [marker]").forEach((el) => el.remove())` で重複防止。
- **`exportDOM` でも必ず注入する** — createDOM(editor) だけ注入して exportDOM(公開) を data 属性のみにすると、**公開ページで値が不可視になる**（editor だけ直り公開が壊れる非対称バグ。サブエージェント実装で実際に発生 → 2026-06-02 修正）。
- **`updateDOM`** は関連 state 変化時（`$getStateChange(...) !== null`）にヘルパー再呼び出し。常に `return false`。
- **`importDOM` は注入メタを子として取り込まない** — 子を持たないノードは `return { node, after: () => [] }`、実子（feature / quote 等）を持つノードは conversion 冒頭で `element.querySelectorAll(":scope > [marker]").forEach((el) => el.remove())` してから default child import に委ねる（注入メタが junk 子ノードとして復元される round-trip バグ防止）。
- 子と注入メタの**視覚順序は flex `order`** で制御（注入を host 先頭/末尾に置き「メタ → 本文 → フッター」等を表現）。

実装参照: `TimelineNode` / `PricingTableNode` / `TestimonialNode` / `GalleryNode`。

## DecoratorNode の `exportDOM` は `decorate()` の可視内容を再現する

DecoratorNode は editor を React `decorate()` で描画するが、**公開ページは `exportDOM` の静的 HTML + CSS で描画される**。`decorate()` がタイトル・著者・float 等を表示しているのに `exportDOM` がそれらを data 属性のみで出力すると、**公開ページだけ表示が劣化する**（Audio のタイトル/アーティスト消失 / InlineImage の float 喪失。2026-06-02 修正）。`exportDOM` は decorate と同じ可視要素・配置を出力し、`[data-*]` CSS で整える。

## AccentColor システム

各ブロック（Collapsible / PullQuote / Steps / Tabs）が共有する 10 色アクセントカラーシステム。
CSS 変数 `--accent` / `--accent-fg` でブロック内の強調色を統一制御する。

**ファイル構成**:

| ファイル                            | 役割                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| `config/accent-colors.ts`           | 型・定数・スウォッチ値・ラベル（Single Source of Truth）    |
| `shared/styles/lexical-content.css` | `[data-color="X"]` セレクタで CSS トークン定義（canonical） |
| `inspector/ColorSwatchPicker.tsx`   | 10 色スウォッチ選択 UI コンポーネント                       |

### `[data-color]` CSS 変数伝播の仕組み

コンテナノードの `exportDOM` が `data-color` 属性を出力 → CSS セレクタが `--accent` / `--accent-fg` を伝播:

```css
/* lexical-content.css: data-color="blue" の場合 */
[data-color="blue"] {
  --accent: oklch(0.55 0.2 260);
  --accent-fg: oklch(1 0 0);
}

/* 子要素で --accent を参照（フォールバック必須） */
[data-steps-style="numbered"] .step-number {
  background-color: var(--accent, var(--color-accent));
  color: var(--accent-fg, var(--color-background));
}
```

`data-color="default"` または属性なし → フォールバック `var(--color-accent)` / `var(--color-background)` が適用される。

### 新しいブロックに AccentColor を追加する手順

1. **ノードクラスに `colorState` を追加**（`defaultColorState` から `default` フォールバック）

   ```typescript
   import { createState } from "lexical";
   import { type AccentColor, isAccentColor } from "../config/accent-colors";

   export const colorState = createState("color", {
     parse: (v: unknown): AccentColor =>
       typeof v === "string" && isAccentColor(v) ? v : "default",
   });
   ```

2. **`exportDOM` で `data-color` 属性を出力**（`default` は属性なしで省略可）

   ```typescript
   exportDOM(): DOMExportOutput {
     const element = document.createElement('div')
     const color = $getState(this, colorState)
     element.setAttribute('data-my-block', 'true')
     if (color !== 'default') element.setAttribute('data-color', color)
     return { element }
   }
   ```

3. **`lexical-content.css`** — `[data-color]` トークンはグローバル定義済み。子要素セレクタに `var(--accent, var(--color-accent))` を参照するだけでよい

4. **InspectorPanel に `ColorSwatchPicker` を追加**

   ```typescript
   import { ColorSwatchPicker } from '../ColorSwatchPicker'
   import { type AccentColor } from '../../config/accent-colors'

   <ColorSwatchPicker
     value={currentColor}
     onChange={(color: AccentColor) =>
       updateNode((n) => { $setState(n, colorState, color) })
     }
   />
   ```

### AccentColor 反映パターン — Material 3 state layer 比率 SSoT

ブロック（Tabs / Collapsible / PullQuote 等）の bg / border / text に `color-mix(in oklch, var(--accent) X%, var(--color-background))` を適用し、AccentColor 切替を全 surface に伝播する。比率は Material Design 3 state layer specification 準拠（hover 8% / selected 10-12%、上限 12%）。base は `--color-background` (白) を使い純色を visible にする — `--color-muted` (グレー) を base にすると accent が灰色に飲まれて視認不能になる silent bug。

```css
/* Material 3 state layer baseline */
background-color: color-mix(
  in oklch,
  var(--accent, var(--color-accent)) 8%,
  var(--color-background)
);
```

#### タブスタイル別の役割分担

| スタイル    | tablist 背景   | active タブ                                            | hover                 |
| ----------- | -------------- | ------------------------------------------------------ | --------------------- |
| `underline` | accent 10% mix | text=accent + bg=accent 12% mix + border-bottom=accent | bg=accent 8% mix      |
| `pills`     | accent 12% mix | bg=accent (純色) + text=accent-fg                      | bg=accent 10% mix     |
| `boxed`     | transparent    | bg/border-bottom=accent 10% mix + border-top=accent    | bg=accent 8% on muted |
| `minimal`   | transparent    | text=accent + border-bottom=accent                     | bg=accent 8% mix      |

#### 他ブロックへの伝播

| ブロック / variant                 | 適用箇所         | 比率                                     |
| ---------------------------------- | ---------------- | ---------------------------------------- |
| `data-collapsible-title` (default) | title bg         | 8% accent + background                   |
| `data-collapsible-style="card"`    | title bg         | 10% accent + background                  |
| `data-collapsible-style="filled"`  | title bg (純色)  | `var(--accent)` + `var(--accent-fg)`     |
| `data-pull-quote-style="classic"`  | bg + border-left | 8% accent + background + `var(--accent)` |
| `data-pull-quote-style="minimal"`  | border-left      | `var(--accent)` (2px solid)              |

新規 variant 追加時は本テーブルに 1 行追加 + `lexical-content.css` 該当セクションへ `color-mix` を配置。`pills` の active のみが純色 accent を使う例外（コントラスト確保のため `var(--accent-fg)` text 必須）、他は全て mix で「accent 着色だが下地は維持」の方針で統一する。

## exportDOM 内で curation icon を SVG として埋め込む（FeatureIconListNode pattern）

Lexical Node の `exportDOM` / `createDOM` で curation icon を `<svg>` として直接埋め込みたい場合、**`react-dom/server` の `renderToStaticMarkup` + `insertAdjacentHTML` + `setAttribute` 後付け** pattern を使う:

```typescript
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getCuratedIconComponent } from "@/shared/components/icon-curation/component-map";

function renderIconSvgInto(host: HTMLElement, iconName: string): void {
  // updateDOM で icon が変わった場合の重複防止
  host.querySelector(":scope > svg[data-icon-svg]")?.remove();
  if (iconName === "") return;
  const Icon = getCuratedIconComponent(iconName);
  if (!Icon) return; // curation 外は no-op fallback（テキストのみ表示）
  const markup = renderToStaticMarkup(
    createElement(Icon, { className: "feature-icon-svg", "aria-hidden": true }),
  );
  host.insertAdjacentHTML("afterbegin", markup);
  // Tabler IconProps 型は data-* を受け付けないため挿入後に setAttribute で後付け
  host.querySelector(":scope > svg")?.setAttribute("data-icon-svg", "");
}
```

**重要なポイント**:

- `renderToStaticMarkup` は **同期関数** で SSR / browser 両環境で動作（`react-dom/server`）— Lexical の同期 `exportDOM` / `createDOM` から直接呼べる
- `getCuratedIconComponent` は `@/shared/components/icon-curation/component-map` の **client-safe SSoT**（`"use client"` なし、Lexical SSR / admin Client / public 共有）
- **Tabler `IconProps` 型は `data-*` を受け付けない silent fail** — `createElement(Icon, { "data-icon-svg": "" })` は TS 型エラー、`setAttribute` で後付けが canonical
- 既存 SVG を削除してから挿入（`updateDOM` で icon が変わった場合の重複防止）
- 公開側 CSS で `[data-feature-icon-list][data-icon-size="sm"] svg[data-icon-svg]` セレクタでサイズ・色制御
- `createDOM` / `updateDOM` / `exportDOM` から共通で呼ぶ

**curation 外は silent no-op**: `getCuratedIconComponent(name)` が undefined を返したら icon は埋め込まれず、`<li>` 内の paragraph テキストのみが残る。既存 DB に lucide / simple-icons 名が残っている場合の自然 fallback として機能する。

**他の icon library で同 pattern を使う場合**: lucide-react / heroicons 等も React component を export するため動作するが、本プロジェクトは **Tabler 単一ライブラリ統一**（CLAUDE.md「アイコンライブラリは `@tabler/icons-react`」）。新規 Lexical Node でアイコン埋め込みが必要な場合は curation 経由（または curation 外を許容するなら `dynamic-tabler-icon` の `Reflect.get` pattern）を使う。

## Inspector / Dialog プレビュー UI の data-attribute セット付与

Inspector / Dialog のプレビュー DOM で `[data-X-style="Y"]` (variant) のみ付与すると `[data-X]` (base) の padding / margin / border-radius が適用されず装飾が壊れる silent bug。**base 属性と variant 属性は必ずセット付与**。

NG: `<span data-group-style={style} />`（base 不在で kakko corner / stitch outline-offset 等が枠外） / OK: `<div data-group="true" data-group-style={style} {...(color !== "default" && { "data-color": color })}>{label}</div>`

**対象ノード（要 base+variant セット）**: Group / Steps / Tabs / FeatureIconList / Callout 等。新規ノードでプレビュー UI 実装時は `lexical-content.css` のセレクタ構造を確認してから DOM を組む。公開本文では `createDOM` / `exportDOM` が両属性を出すため発生せず、Inspector / Dialog の **DOM 再現**でのみ顕在化する。
