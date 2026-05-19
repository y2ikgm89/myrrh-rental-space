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
