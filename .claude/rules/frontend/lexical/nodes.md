---
description: Lexical ノード実装パターン（NodeState API・単一レベル vs コンポジット・新規ノード登録チェックリスト）
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical ノード実装パターン

## ノード実装パターン

### 5つの基本ノード

| ノード        | 拡張可能 | 用途                                      |
| ------------- | -------- | ----------------------------------------- |
| RootNode      | ❌       | contenteditable のトップコンテナ          |
| LineBreakNode | ❌       | 改行表現                                  |
| ElementNode   | ✅       | ブロック要素（ParagraphNode, LinkNode等） |
| TextNode      | ✅       | テキスト＋フォーマット（bold, italic等）  |
| DecoratorNode | ✅       | React/任意コンポーネント埋め込み          |

### NodeState API（標準パターン — 全ノードで採用済み）

`$config` + `createState` で `getType`, `clone`, `importJSON`, `exportJSON`, `updateFromJSON`, `afterCloneFrom` を自動生成。
`flat: true` で既存JSONとの後方互換性を維持。

**状態宣言:**

```typescript
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";

// 各プロパティをcreateStateで宣言（ファイルトップレベル）
export const calloutTypeState = createState("calloutType", {
  parse: (v: unknown): CalloutType =>
    typeof v === "string" && isCalloutType(v) ? v : "info",
});
```

**ノードクラス:**

```typescript
export class CalloutNode extends ElementNode {
  // $config() が getType, clone, importJSON, exportJSON を自動生成
  $config() {
    return this.config("callout", {
      extends: ElementNode, // 親クラスを指定
      stateConfigs: [{ flat: true, stateConfig: calloutTypeState }],
    });
  }

  // importDOM() — 変更なし（DOM→Node変換）
  // exportDOM() — $getState() でプロパティ取得
  // createDOM(), updateDOM() — $getState()/$getStateChange() 使用
  // decorate() — DecoratorNodeのみ、$getState() 使用
}
```

**プロパティアクセス:**

```typescript
// 読み取り: $getState(node, stateConfig)
const type = $getState(this, calloutTypeState);

// 書き込み: $setState(node, stateConfig, value)
$setState(this, calloutTypeState, "warning");

// DOM更新での変更検出: $getStateChange(this, prevNode, stateConfig)
const change = $getStateChange(this, prevNode, calloutTypeState);
if (change) {
  const [newType] = change;
  dom.setAttribute("data-callout-type", newType);
}
```

**ファクトリ関数:**

```typescript
// 単一プロパティ
export function $createCalloutNode(type: CalloutType = 'info'): CalloutNode {
  return $setState($create(CalloutNode), calloutTypeState, type)
}

// 複数プロパティ
export function $createImageNode({ src, alt = '', width, height }: {...}): ImageNode {
  const node = $create(ImageNode)
  $setState(node, srcState, src)
  $setState(node, altState, alt)
  if (width !== undefined) $setState(node, widthState, width)
  if (height !== undefined) $setState(node, heightState, height)
  return node
}

// 型ガード（変更なし）
export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode
}
```

**ゼロプロパティノード（子ノードのみ保持）:**

```typescript
export class CollapsibleTitleNode extends ElementNode {
  $config() {
    return this.config("collapsible-title", { extends: ElementNode });
  }
  // stateConfigs 不要
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return $create(CollapsibleTitleNode);
}
```

### プロパティルール

- **JSON serializable のみ**: Function, Symbol, Map, Set 禁止
- **`createState` の `parse` 関数**: デシリアライゼーション時のバリデーション+デフォルト値を担当
- **`$getState` / `$setState`**: プロパティの読み書きに使用。`__` フィールドや `getWritable()` / `getLatest()` は不要

## 単一レベルコンテナ vs コンポジットノード

| 分類                   | 例                                          | isShadowRoot | Arrow key escape        | 用途                         |
| ---------------------- | ------------------------------------------- | ------------ | ----------------------- | ---------------------------- |
| **単一レベルコンテナ** | CalloutNode, GroupNode                      | **不要**     | **不要**                | 装飾・意味付きラッパー       |
| **コンポジットノード** | Collapsible, Steps, Tabs, Layout, PullQuote | **必須**     | **必要**（`$onEscape`） | Title/Content 内部構造を保護 |

単一レベルコンテナに `isShadowRoot` を追加するとカーソルが閉じ込められ、`$onEscape` で段落挿入が必要になる悪循環を生む。Lexical のデフォルト矢印キー動作で自然に脱出できる。

## コンポジットノードアーキテクチャ

複数ノードで構成される複合コンポーネント（Tabs、Steps、Collapsible、PullQuote 等）のパターン。
公式 Lexical Playground に準拠。

### ノード階層

```
ContainerNode（ルート）
├── TitleNode / ListNode（子: タイトル/リスト部分）
└── ContentNode / PanelNode（子: コンテンツ領域）
```

### メソッドガイドライン

| メソッド                | コンテナノード | 子ノード（Title/Content） | 目的                     |
| ----------------------- | -------------- | ------------------------- | ------------------------ |
| `isShadowRoot()`        | ✅ 必須        | ✅ 必須                   | 編集境界の確立           |
| `canBeEmpty()`          | ✅ `false`     | —                         | 空コンテナ防止           |
| `collapseAtStart()`     | ✅ 実装        | ❌ 禁止                   | Backspace でノード解除   |
| `canInsertTextBefore()` | ✅ `false`     | ✅ `false`                | テキスト漏れ防止         |
| `canInsertTextAfter()`  | ✅ `false`     | ✅ `false`                | テキスト漏れ防止         |
| `insertNewAfter()`      | —              | △ TitleNodeのみ           | Enter でコンテンツへ移動 |

### isShadowRoot()

**すべてのコンテナ・中間コンテナ・子ノード ElementNode に必須**。キャレットがキーボード操作で境界外に漏れるのを防止:

```typescript
isShadowRoot(): boolean {
  return true
}
```

**実装済み（32 ノード — 全 ElementNode コンポジット子ノード）:**

- Collapsible: ContainerNode, ItemNode, TitleNode, ContentNode
- Steps: ContainerNode, StepItemNode, StepTitleNode, StepContentNode
- Tabs: ContainerNode, TabListNode, TabTitleNode, TabPanelNode
- PullQuote: Node, TextNode, CitationNode
- Gallery: ContainerNode, ItemNode
- Testimonial: ContainerNode, ItemNode
- Timeline: ContainerNode, ItemNode
- FeatureIconList: ContainerNode, ItemNode
- PricingTable: ContainerNode, PlanNode, FeatureNode
- Layout: ContainerNode, ItemNode
- CaptionBox: Node, TitleNode, ContentNode
- Cover: Node

#### カラムレイアウト（LayoutContainer / LayoutItem）

- **状態**: `templateColumnsState`（広い画面の `grid-template-columns`）と `templateColumnsNarrowState`（狭い画面用。DOM では `LAYOUT_MOBILE_COLUMNS_VAR` = `--lexical-layout-mobile`）。列数と子 `LayoutItem` の整合は **`register-layout-node-transforms.ts` のコンテナ Transform のみ**が行い、`templateColumns` のトークン数のみを見る（狭い画面の列数はレイアウトのみ変更しスロット数は変えない）。
- **DOM 取り込み**: `data-lexical-layout-container` かつ **インライン `gridTemplateColumns` が空でない**ときのみコンテナとして変換。狭い画面用は `style` の `--lexical-layout-mobile` が無ければ `1fr`。
- **DOM 出力**: `data-lexical-layout-container` + インライン `grid-template-columns`（広い画面）+ `--lexical-layout-mobile`（狭い画面）。`lexical-content.css` の `@media (max-width: 768px)` で後者に `!important` 切替（ブレークポイントは `layout-templates.ts` の `LAYOUT_BREAKPOINT_MAX_PX` と一致させる）。
- **編集 UX**: キャレットがカラム内にあるときツールバーに「カラム」ドロップダウン（`LayoutToolbarSection`）。挿入ダイアログ・インスペクターと同一プリセット（`LAYOUT_TEMPLATES` / `LAYOUT_NARROW_TEMPLATES`）を共有する。
- **挿入**: スロット生成は `lib/layout-insert.ts` の `$createPopulatedLayoutContainer`。配置は `@lexical/utils` の `$insertNodeToNearestRoot`（公式 JSDocどおり root/shadow root 境界で分割。キャレットに応じカラム内ネスト可）。ダイアログ等で選択が失われた場合のみ先頭列へフォールバック。列テンプレ変更は `$setState` のみ（ツールバー / インスペクター）。専用 `LexicalCommand` は置かない。
- **列減**: 右端列の子ブロックは `register-layout-node-transforms` により新しい最終列へマージされる（データ消失なし。編集 UI に注意書きあり）。
- **空カラム**: 通常は空段落 1 つ。`$isEmptyLayoutItemNode`（Playground 同名）で「未入力カラム」を判定する。`collapseAtStart` の全列空判定に使用する。
- StepsContainerNode, StepContentNode
- TabsContainerNode, TabPanelNode
- PullQuoteNode

### canBeEmpty()

コンテナノードで `false` を返し、空のコンテナが残存するのを防止:

```typescript
override canBeEmpty(): false {
  return false
}
```

**対象:** CollapsibleContainerNode, StepsContainerNode, TabsContainerNode, LayoutContainerNode, PricingTableNode, TestimonialNode（ContainerNode）, FeatureIconListNode（ContainerNode）

### collapseAtStart()

**コンテナノードのみに実装**。Backspace でコンポジットノード全体をパラグラフに分解:

```typescript
// コンテナノード: 子のコンテンツをパラグラフに展開
collapseAtStart(): boolean {
  const children = this.getChildren()
  const paragraph = $createParagraphNode()

  if (children.length > 0) {
    const firstChild = children[0]
    if ($isElementNode(firstChild)) {
      const firstChildChildren = firstChild.getChildren()
      for (const child of firstChildChildren) {
        paragraph.append(child)
      }
    }
  }

  this.replace(paragraph)
  return true
}
```

**子ノード（Title/Content等）には collapseAtStart を実装しない**。isShadowRoot が境界保護を担当する。

### insertNewAfter()（CollapsibleTitleNode 専用パターン）

タイトルで Enter を押した際、コンテナを開いてコンテンツ先頭にフォーカス移動:

```typescript
insertNewAfter(_selection: RangeSelection, restoreSelection = true): null | ElementNode {
  const container = this.getParent()
  if ($isCollapsibleContainerNode(container)) {
    $setState(container, openState, true)
    const content = container.getChildren().find($isCollapsibleContentNode)
    if (content) {
      const firstChild = content.getFirstChild()
      if (firstChild) {
        if (restoreSelection) firstChild.selectStart()
        return null
      }
    }
  }
  return null
}
```

### CSS-first exportDOM パターン

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

### AccentColor システム

各ブロック（Collapsible / PullQuote / Steps / Tabs）が共有する10色アクセントカラーシステム。
CSS変数 `--accent` / `--accent-fg` でブロック内の強調色を統一制御する。

**ファイル構成**:

| ファイル                            | 役割                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| `config/accent-colors.ts`           | 型・定数・スウォッチ値・ラベル（Single Source of Truth）    |
| `shared/styles/lexical-content.css` | `[data-color="X"]` セレクタで CSS トークン定義（canonical） |
| `inspector/ColorSwatchPicker.tsx`   | 10色スウォッチ選択 UI コンポーネント                        |

#### `[data-color]` CSS 変数伝播の仕組み

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

#### 新しいブロックに AccentColor を追加する手順

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

#### タブスタイル別 AccentColor CSS パターン

スタイル別に適した手法でアクセントを表現（いずれもレイアウト変更なし）:

| スタイル    | 手法               | 適用プロパティ                                                               |
| ----------- | ------------------ | ---------------------------------------------------------------------------- |
| `underline` | 下線色             | `border-bottom-color: var(--accent)`                                         |
| `pills`     | 背景色＋テキスト色 | `background-color: var(--accent)` / `color: var(--accent-fg)`                |
| `boxed`     | inset top-stripe   | `box-shadow: inset 0 2px 0 var(--accent)`（box-shadow = レイアウト変更なし） |
| `minimal`   | 下線色             | `border-bottom-color: var(--accent)`                                         |

### NodeState `parse` 関数の共通ヘルパー（`config/type-guards.ts`）

文字列・真偽値の `parse` 関数は `config/type-guards.ts` の共通ヘルパーを使う。inline lambda の重複禁止:

```typescript
import { parseString, parseBoolean } from "../config/type-guards";

// OK: ヘルパー使用
export const titleState = createState("title", { parse: parseString });
export const openState = createState("open", { parse: parseBoolean });

// NG: inline lambda の重複（parseString/parseBoolean で代替）
export const titleState = createState("title", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});
```

enum/カスタム型（デフォルト値あり・型ガード必要）の場合のみカスタム `parse` を書く。

### 型ガードユーティリティ（createEnumGuard）

ノード固有のリテラル型に対する型ガードは `config/type-guards.ts` の `createEnumGuard` を使用:

```typescript
import { createEnumGuard } from "../config/type-guards";

export type StepsStyle = "numbered" | "big" | "small" | "icon" | "timeline";
export const STEPS_STYLES: readonly StepsStyle[] = [
  "numbered",
  "big",
  "small",
  "icon",
  "timeline",
] as const;
export const isStepsStyle = createEnumGuard<StepsStyle>(STEPS_STYLES);
```

**注意:** これは Prisma enum ではないため `enums.ts` ではなくノードファイル内に定義する。

## 新規ノード登録チェックリスト

ノード + プラグイン + インスペクターパネルをフル追加する場合の登録箇所（合計 9 箇所）:

| ファイル                                       | 内容                                       | 必須条件                                       |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `config/nodes.ts`                              | `EDITOR_NODES` に追加                      | 全ノード                                       |
| `nodes/index.ts`                               | barrel export                              | 全ノード                                       |
| `config/dialog-registry.ts`                    | `REGISTRY_DIALOG_IDS` + `DIALOG_REGISTRY`  | Dialog 使用時                                  |
| `config/insert-items.ts`                       | `INSERT_ITEMS`                             | ツールバー/ピッカーに表示する場合              |
| `plugins/index.ts`                             | Plugin export                              | Plugin あり                                    |
| `config/inspector-registry.ts`                 | `getInspectableInfoFromRegistry`           | Inspector あり                                 |
| `inspector/hooks/inspectable-nodes.ts`         | `InspectableNodeType` + `SelectedNodeInfo` | Inspector あり                                 |
| `inspector/InspectorSidebar.tsx`               | switch case                                | Inspector あり                                 |
| `inspector/panels/index.ts`                    | Panel export                               | Inspector あり                                 |
| `__tests__/unit/.../inspectable-nodes.test.ts` | カウントと `expectedTypes` を更新          | Inspector あり（`InspectableNodeType` 追加時） |

**HTML→Lexical JSON**: `tryConvertHtmlStringToLexicalJsonString`（`html-to-lexical-json.ts`）の戻りは `ConvertHtmlToLexicalJsonResult`。失敗時に `EMPTY` へ黙ってフォールバックしない。空 HTML（trim 後）のみ意図した空ドキュメントとして `ok: true` + `EMPTY_LEXICAL_EDITOR_STATE_JSON`。

**挿入メニュー UI**: ツールバー「挿入」は **カテゴリごとのサブメニュー**（`DropdownMenuSub`）。項目が **6 件以上**のカテゴリはサブメニュー内 **2 カラム**。タイムライン・料金表等は `patterns`、カラム・コールアウト等は `layout`。詳細は `.claude/rules/frontend/lexical/toolbar-layout.md` の「挿入メニュー」。

**挿入実行**: ツールバーは `executeInsertItem`（`dialog` は同期 `openDialog`、それ以外は 1 回の `editor.update`）。スラッシュメニューはトリガー削除と同一 `update` 内で `applyInsertItemInUpdate`（`dialog` は `queueMicrotask` で `openDialog`）。`type: "transform"` は `applyInUpdate` で $ API のみとし、ネストした `editor.update` を禁止。

**ポイント**: Floating Text Format Toolbar 経由で開くインラインノード（Ruby / Tooltip 等)は `INSERT_ITEMS` 不要だが `dialog-registry` への登録は必要。登録漏れは型エラーではなく実行時に無音で失敗するため注意。

## exportDOM 内で curation icon を SVG として埋め込む（FeatureIconListNode pattern）

Lexical Node の `exportDOM` / `createDOM` で curation icon を `<svg>` として直接埋め込みたい場合（公開側で `SanitizedHtml` 経由の static HTML 描画で利用するため、追加の rehype-react layer を作らずに icon を可視化）、**`react-dom/server` の `renderToStaticMarkup` + `insertAdjacentHTML` + `setAttribute` 後付け** pattern を使う:

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
- `createDOM` / `updateDOM` / `exportDOM` から共通で呼ぶ（Lexical エディタ内 / 公開 HTML / Mobile fallback すべてで一貫した描画）

**curation 外は silent no-op**: `getCuratedIconComponent(name)` が undefined を返したら icon は埋め込まれず、`<li>` 内の paragraph テキストのみが残る。既存 DB に lucide / simple-icons 名が残っている場合の自然 fallback として機能する。

**他の icon library で同 pattern を使う場合**: lucide-react / heroicons 等も React component を export するため動作するが、本プロジェクトは **Tabler 単一ライブラリ統一**（CLAUDE.md「アイコンライブラリは `@tabler/icons-react`」）。新規 Lexical Node でアイコン埋め込みが必要な場合は curation 経由（または curation 外を許容するなら `dynamic-tabler-icon` の `Reflect.get` pattern）を使う。

参照実装: `FeatureIconListNode.tsx` の `renderIconSvgInto` ヘルパー（2026-05-08 lucide/simple-icons から Tabler 統一時に追加）。
