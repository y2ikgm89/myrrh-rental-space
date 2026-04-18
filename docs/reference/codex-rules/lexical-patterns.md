---
paths:
  - src/app/(admin)/**/lexical/**
---

# Lexical エディタ実装パターン

> **本文正本**（Codex / Claude Code 共通）。`docs/reference/codex-rules/lexical-patterns.md` と `.claude/rules/frontend/lexical-patterns.md` は **同一バイト列**（検証: `bun run docs:verify-policy-sync` → `scripts/verify-policy-docs.mjs`）。運用: `docs/reference/codex-rules/instruction-topology.md`。Next.js 16 / React 19 / Turbopack / React Compiler 対応

## 概要

このプロジェクトでのLexical実装ガイドライン。
実装パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`（インポートは `@/admin/...` エイリアスに従う）

### 実装タスク用スキル（正本とひな形）

- **手順の正本**: `.claude/skills/lexical-node` / `lexical-plugin` / `lexical-toolbar` の各 `SKILL.md`
- **任意の長文コードひな形**: 各 skill の `reference/scaffold-*.md`
- **Claude Code**: `.claude/skills/<同名>/SKILL.md` はスタブ — 上記正本（と必要なら `reference/`）を開く

## 技術スタック整合性

| 技術           | バージョン         | 互換性                               |
| -------------- | ------------------ | ------------------------------------ |
| Lexical        | 0.43.x             | React 17+対応                        |
| React          | 19.2.4             | ✅ peerDependencies対応              |
| React Compiler | 1.0.0              | ✅ 自動メモ化（useCallback基本不要） |
| Turbopack      | Next.js 16 default | ✅ optimizePackageImports設定済み    |

## React 19 + React Compiler対応

### useCallback は基本不要

React Compiler が自動メモ化するため、手動での `useCallback` は不要。
ただし、`useSyncExternalStore` の subscribe 等、外部ライブラリが参照同一性を要求する場合は明示的に使用:

```typescript
// OK: React Compiler が自動メモ化（推奨）
const openDialog = () => setIsOpen(true);

// OK: 外部ライブラリ要件で明示的に使用
const subscribe = useCallback((callback) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}, []);
```

### React 19 StrictMode対応

LexicalComposerはuseMemoでエディタを作成するため、StrictModeでも問題なし:

```typescript
// 設定オブジェクト（安定した参照が必要な場合はコンポーネント外に定義）
const initialConfig = {
  namespace: 'LexicalEditor',
  theme: editorTheme,
  nodes: [...],
  onError: (error: Error) => logger.error('Lexical Error', { error: error.message }),
}
```

## アーキテクチャ

```
lexical/
├── LexicalEditor.tsx      # メイン（LexicalComposer + InspectorSidebarProvider）
├── index.ts               # 公開エクスポート
├── theme.ts               # エディタテーマ定義
├── types.ts               # 型定義
├── inspector/             # 右・ブロック設定パネル（Gutenberg 風）
│   ├── InspectorSidebar.tsx
│   ├── inspector-sidebar-context.tsx  # 開閉 + localStorage 永続化
│   └── panels/            # ノード別インスペクター
├── nodes/
│   ├── index.ts           # ノードエクスポート
│   ├── ImageNode.tsx      # DecoratorNode例
│   └── YouTubeNode.tsx    # DecoratorNode例
└── plugins/
    ├── index.ts           # プラグインエクスポート
    ├── ToolbarPlugin.tsx  # ツールバー
    ├── ImagePlugin.tsx    # 画像挿入ダイアログ
    └── YouTubePlugin.tsx  # YouTube挿入ダイアログ
```

## ブロック設定パネル（Inspector Sidebar）

右ペインは **開閉可能**（執筆エリアの確保・認知負荷の整理）。仕様の一次情報は本節。

| 項目             | 内容                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 状態共有         | `inspector/inspector-sidebar-context.tsx` の **`InspectorSidebarProvider`**（`LexicalEditor` / `EditorInner` で `showInspector` に応じて `enabled` を渡す） |
| 消費 API         | **`useInspectorSidebar()`** — `toggle` / `expand` / `collapse` / `isExpanded` / `isInspectorAvailable`                                                      |
| React 19 Context | **`<InspectorSidebarContext value={...}>`** でラップ。**`.Provider` は使わない**。フックは **`use(InspectorSidebarContext)`**（`useContext` 禁止に準拠）    |
| 永続化           | `localStorage` キー **`myrrh-lexical-inspector-panel`**（`1` = 展開、`0` = 折りたたみ、未設定は折りたたみ）。利用不可環境では黙って無視                     |
| ツールバー       | `ToolbarPlugin` — APG Toolbar（`role="toolbar"`）。パネル開閉（`aria-pressed` / `aria-controls="lexical-block-inspector-panel"`）                           |
| キーボード       | **`Ctrl+Shift+0`**（**`Numpad0` 可**）。`KeyboardShortcutsPlugin` 内で `isInspectorAvailable` が false のときはコマンドを処理しない                         |
| 無効化           | `LexicalEditor` の **`showInspector={false}`** — サイドバー非マウント・トグル非表示・上記ショートカット無効                                                 |
| 展開時の幅       | **420px**（インライン記事設定パネル default と揃える）                                                                                                      |
| マークアップ     | パネルルートは **`<aside id="lexical-block-inspector-panel" aria-label="ブロック設定パネル（本文中のブロック用）">`**                                       |

**新規プラグイン**がパネル開閉に連動する場合: `LexicalComposer` 配下かつ **`InspectorSidebarProvider` 内**で `useInspectorSidebar()` を呼ぶこと。Provider 外ではフックが throw する。

## 非制御コンポーネント設計

Lexicalは**非制御コンポーネント**として設計されている。EditorStateを親で管理しない:

```typescript
// NG: EditorStateを親に渡して制御しようとする
const [editorState, setEditorState] = useState()
<LexicalEditor state={editorState} onChange={setEditorState} />

// OK: onChangeでHTMLを取得（非制御）
<LexicalEditor onChange={(html) => setValue(html)} />
```

## 公式プラグイン一覧

| プラグイン               | 用途                 | 必要ノード                             |
| ------------------------ | -------------------- | -------------------------------------- |
| `RichTextPlugin`         | リッチテキスト編集   | HeadingNode, QuoteNode                 |
| `PlainTextPlugin`        | プレーンテキスト編集 | -                                      |
| `HistoryPlugin`          | Undo/Redo            | -                                      |
| `OnChangePlugin`         | 状態変更監視         | -                                      |
| `ListPlugin`             | 箇条書き/番号リスト  | ListNode, ListItemNode                 |
| `CheckListPlugin`        | チェックリスト       | ListNode, ListItemNode                 |
| `LinkPlugin`             | リンク編集           | LinkNode                               |
| `AutoLinkPlugin`         | URL自動リンク化      | AutoLinkNode                           |
| `TablePlugin`            | テーブル編集         | TableNode, TableRowNode, TableCellNode |
| `TabIndentationPlugin`   | Tabキーインデント    | -                                      |
| `MarkdownShortcutPlugin` | Markdown記法         | 各種ノード                             |
| `TableOfContentsPlugin`  | 目次生成             | HeadingNode                            |
| `ClearEditorPlugin`      | エディタクリア       | -                                      |
| `EditorRefPlugin`        | エディタ参照取得     | -                                      |

**このプロジェクトで使用中:**

- RichTextPlugin, HistoryPlugin, ListPlugin, LinkPlugin, TabIndentationPlugin, OnChangePlugin

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

## プラグイン実装パターン

### ノード挿入: `$insertNodeToNearestRoot` vs `$insertNodes`

公式Playgroundパターンに準拠:

| 関数                             | import元         | 用途                                                         |
| -------------------------------- | ---------------- | ------------------------------------------------------------ |
| `$insertNodeToNearestRoot(node)` | `@lexical/utils` | **ブロックレベルノード**（ElementNode, DecoratorNode）       |
| `$insertNodes([node])`           | `lexical`        | **インライン/混合ノード**（TextNode, Image, 複数ノード一括） |

```typescript
// ブロックレベルノード（Callout, Collapsible, Layout, YouTube, Button等）
import { $insertNodeToNearestRoot } from "@lexical/utils";
$insertNodeToNearestRoot(blockNode); // 単一ノード、配列不要

// インライン/混合ノード（Emoji, Image, BlockTemplate等）
import { $insertNodes } from "lexical";
$insertNodes([inlineNode]); // 配列で渡す
$insertNodes(mixedNodes); // 複数ノード一括挿入
```

### 直接更新パターン（推奨: ダイアログ付きプラグイン）

```typescript
import { $insertNodeToNearestRoot } from "@lexical/utils";

// コマンド登録不要。ダイアログから直接editor.update()を呼び出す
// React Compiler が自動メモ化するため useCallback 不要
const handleSubmit = () => {
  editor.update(() => {
    const node = $createCustomNode(formData);
    $insertNodeToNearestRoot(node);
  });
  onClose();
};
```

### コマンド登録パターン（ツールバーボタン等から直接呼び出す場合）

```typescript
import { createCommand, COMMAND_PRIORITY_EDITOR } from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";

export const INSERT_CUSTOM_COMMAND = createCommand<Payload>("INSERT_CUSTOM");

function CustomPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_CUSTOM_COMMAND,
      (payload) => {
        editor.update(() => {
          const node = $createCustomNode(payload);
          $insertNodeToNearestRoot(node);
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);
}
```

### リスナー登録

`mergeRegister` は v0.40.0 から `lexical` 本体に移動（`@lexical/utils` からの旧パスも互換性あり）:

```typescript
import { mergeRegister } from "lexical"; // v0.40.0+: lexical本体からimport

useEffect(() => {
  return mergeRegister(
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        /* 状態読み取り */
      });
    }),
    editor.registerCommand(COMMAND, handler, priority),
  );
}, [editor]);
```

### Node Transforms（状態変更の推奨方法）

`updateListener` 内での `editor.update()` は非推奨。代わりに **Node Transforms** を使用:

```typescript
// 非推奨: updateListener内で更新
editor.registerUpdateListener(() => {
  editor.update(() => {
    /* 追加のレンダリングが発生 */
  });
});

// 推奨: Node Transforms
editor.registerNodeTransform(TextNode, (node) => {
  // 条件チェックで無限ループ防止
  if (!node.hasFormat("bold")) {
    node.toggleFormat("bold");
  }
});
```

**実践例: 絵文字ショートコード変換**

```typescript
function textNodeTransform(node: TextNode): void {
  if (!node.isSimpleText() || node.hasFormat("code")) return;

  const text = node.getTextContent();
  const emojiMatch = findEmoji(text);
  if (emojiMatch === null) return;

  // 最初のマッチのみ処理（残りはtransformが再実行される）
  let targetNode;
  if (emojiMatch.position === 0) {
    [targetNode] = node.splitText(
      emojiMatch.position + emojiMatch.shortcode.length,
    );
  } else {
    [, targetNode] = node.splitText(
      emojiMatch.position,
      emojiMatch.position + emojiMatch.shortcode.length,
    );
  }

  const emojiNode = $createEmojiNode(emojiMatch.unifiedID);
  targetNode.replace(emojiNode);
}

export function registerEmoji(editor: LexicalEditor): () => void {
  return editor.registerNodeTransform(TextNode, textNodeTransform);
}
```

**Node Transformsの利点:**

- 単一のDOM調整で複数の変換を処理
- 不要なレンダリングサイクルを回避
- HistoryPluginと干渉しない
- 新規挿入ノードは自動的にdirtyとしてマークされ再実行

## 状態シリアライゼーション

```typescript
// JSON保存（推奨: 完全な状態保持）
const json = editorState.toJSON();
const jsonString = JSON.stringify(json);

// HTML出力（公開ページ表示用）
editorState.read(() => {
  const html = $generateHtmlFromNodes(editor, null);
});
```

## エラーハンドリング

```typescript
const initialConfig = {
  onError: (error: Error) => {
    // logger.error でログ記録。例外をスローしなければLexicalは自動回復
    logger.error("Lexical Error", { error: error.message });
  },
};
```

## LexicalEditor（メイン）のレイアウト・DraggableBlock・プレースホルダー

[Lexical React 公式](https://lexical.dev/docs/getting-started/react) では **`ContentEditable` に `placeholder` を渡す**。`@lexical/react` の [`ContentEditable` 実装](https://github.com/facebook/lexical/blob/main/packages/lexical-react/src/LexicalContentEditable.tsx) では、プレースホルダーは **編集ルートの兄弟ノード**として描画されるため、`ContentEditable` に付けた `prose` / `prose-p:leading-relaxed` は **プレースホルダーには継承されない**。本文と揃えるには `LexicalEditor.tsx` 側で **`text-base leading-relaxed lg:text-lg`** 等を明示する（`top-6` / `left-10` は `py-6` / `pl-10` と一致）。

### レイアウト定数（単一正本）

| ファイル                     | 内容                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor-layout-constants.ts` | `EDITOR_PADDING_LEFT`（40）、`EDITOR_PADDING_RIGHT`（24）、`EDITOR_PADDING_HORIZONTAL`（64）。`LexicalEditor` の `ContentEditable` の `pl-10` / `pr-6` と **同値**に保つ。 |

`contentWidth` の `maxWidth` は `contentWidth + EDITOR_PADDING_HORIZONTAL` で計算する（`CLAUDE.md` のコンテンツ幅節と同じ）。

### DraggableBlockPlugin（ローカルフォーク）

`@lexical/react` の `DraggableBlockPlugin_EXPERIMENTAL` は内部で固定パディング（例: `TEXT_BOX_HORIZONTAL_PADDING = 28`）を使う。当プロジェクトの **左 40px / 右 24px** と一致しないため、**`plugins/lexical-draggable-block-plugin.ts` にフォーク**し、`editor-layout-constants` と `getBlockLineHeightPx`（unitless `line-height` 対応）を組み込む。メインエディタは **`plugins/DraggableBlockPlugin.tsx` 経由のみ** — **`@lexical/react/LexicalDraggableBlockPlugin` を直接 import しない**。

- ドラッグ UI の横位置はフォークが付与する **`transform` のみ**。メニュー／ドロップライン用 DOM に **`left-*` を重ねない**（`left-1` + `translate` や `left-6` + `translate` は二重オフセットになる）。
- `@lexical/react` を上げたら **`node_modules/.../LexicalDraggableBlockPlugin` と差分マージ**し、必要ならフォークを更新する。
- `eslint.config.mjs` の `lexical-draggable-fork` が当該ファイル用のルール緩和を担う。フォークを大きく変えたら **要否を再確認**する。

## 禁止事項

1. **直接的なDOM操作禁止**: `editor.update()` / `editor.read()` を経由
2. **updateListener内での更新禁止**: パフォーマンス問題（Node Transforms使用）
3. **read/update混在禁止**: 同期的にネストしない
4. **メモリリーク**: リスナーは必ず `mergeRegister` で登録解除
5. **型アサーション禁止**: 型ガード関数 `$isXxxNode()` を使用
6. **制御コンポーネント化禁止**: EditorStateを親コンポーネントで管理しない
7. **LexicalErrorBoundary省略禁止**: RichTextPluginには必須（v0.36+ は named export: `{ LexicalErrorBoundary }`）
8. **プレースホルダーの渡し先を誤らない**: `RichTextPlugin` に `placeholder` を渡さない。`ContentEditable` に `placeholder` と `aria-placeholder` を渡す（[Lexical React の用法](https://lexical.dev/docs/getting-started/react)）
9. **`@lexical/utils` からの `mergeRegister` / `$findMatchingParent` import禁止**: v0.40.0で `lexical` 本体に移動。`import { mergeRegister } from 'lexical'` を使用
10. **レガシーノードパターン禁止**: `static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `__property`, `getWritable()`, `getLatest()`, `$applyNodeReplacement`, `SerializedXxxNode` interface — すべて `$config` + `createState` + `$getState` / `$setState` に置換済み
11. **ブロックレベルノードへの `$insertNodes` 使用禁止**: `$insertNodeToNearestRoot` (`@lexical/utils`) を使用。`$insertNodes` はインライン/混合ノード専用
12. **React render内でのノードプロパティ直接アクセス禁止**: `editor.getEditorState().read(() => $getState(node, xxxState))` で囲む。Lexicalはアクティブなeditor stateが必要
13. **`node.__property` 直接アクセス禁止**: `$getState(node, xxxState)` を使用。`__` フィールドは `$config` で自動管理
14. **ノードクラスに getter/setter ラッパー定義禁止**: `node.getText()` / `node.setText(v)` ではなく `$getState(node, textState)` / `$setState(node, textState, v)` を直接使用。ラッパーメソッドは後方互換性ハックであり CLAUDE.md §禁止事項に違反
15. **子ノードの collapseAtStart 委譲禁止**: Title/Content/Panel 等の子ノードに `collapseAtStart()` を実装しない。`isShadowRoot()` で境界保護する。コンテナノードのみが `collapseAtStart()` を持つ
16. **コンテナ/コンテンツノードの isShadowRoot 省略禁止**: 複合ノードのコンテナ・コンテンツ・パネルノードには必ず `isShadowRoot() { return true }` を実装する
17. **CSS クラス使用禁止（createDOM / exportDOM 共通）**: `createDOM` / `exportDOM` では `config.theme.*` も CSS クラスも一切使用しない。data-attributes のみで DOM を構築する。CSS は `lexical-content.css` のアトリビュートセレクタで対応。`createDOM` のシグネチャは `override createDOM(_config: EditorConfig): HTMLElement`（未使用でも `_config` 必須）
18. **updateDOM で `return true` の乱用禁止**: 属性変更は `$getStateChange` + `dom.setAttribute()` で差分更新し `return false`。`return true` は DOM 要素タグの変更等、DOM 再構築が必要な場合のみ
19. **AccentColor スウォッチ値と CSS トークン値の不一致禁止**: `lexical-content.css` の `[data-color]` `--accent` 値が **canonical**。`ACCENT_COLOR_SWATCHES`（`accent-colors.ts`）はその値をミラーするため、CSS 変更時は TS 側も必ず更新すること。Preview（ColorSwatchPicker）と実際の適用色が乖離するためユーザー混乱の原因になる
20. **インライン DecoratorNode 挿入時の選択テキスト削除漏れ禁止**: `$insertNodes` でインラインノードを挿入する前に RangeSelection がある場合は `selection.removeText()` を呼ぶ。未呼出の場合、選択テキストが残存したまま挿入される

```typescript
// OK パターン（Ruby / Tooltip 等のインライン挿入）
editor.update(() => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    selection.removeText(); // ← 必須: 選択テキストを先に削除
  }
  $insertNodes([$createRubyNode(baseText, rubyText)]);
});
```

21. **`TableCellResizerPlugin` は @lexical/react 0.43.x に存在しない**: 使用禁止。`<TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />` が現バージョンのテーブル強化の上限
22. **`exportDOM` 定義時に `importDOM` 省略禁止**: `exportDOM` を定義したすべてのノードは `static override importDOM(): DOMConversionMap | null` も必ず実装する。省略すると Lexical dev-mode が `exportDOM implemented without matching importDOM` を警告し続ける
23. **組み込みノード（TableNode 等）を継承する場合は Node Replacement パターン必須**: 独自型文字列（`"custom-table"`）を持つカスタムノードと `{ replace: TableNode, with: factory, withKlass: CustomTableNode }` をセットで `EDITOR_NODES` に登録する。`withKlass` が `editor._nodes.get("table")` に `CustomTableNode` を登録するため `TablePlugin.hasNodes([TableNode])` が通過し、`$isTableNode(customTableNode)` も `instanceof` で `true` になる。親の型文字列をそのまま使う手法（`this.config("table", ...)`）は公式パターン外であり禁止
24. **`updateDOM` の `prevNode` に具象型使用禁止** — `prevNode: CalloutNode` ではなく `prevNode: this` を使用。公式パターン準拠かつ継承時の型安全性を確保する
25. **`$getStateChange` の truthy チェック禁止** — `if (change)` ではなく `if (change !== null)` を使用。公式ドキュメントと一致させる
26. **常に `false` を返す `updateDOM` に `boolean` 戻り型禁止** — 引数なし・常に `return false` のメソッドは `override updateDOM(): false` とリテラル型で宣言する。DecoratorNode や状態を持たない子ノードが該当
27. **`contentWidthClassName` / `contentWidthStyle` 禁止（削除済み）** — `contentWidth?: number`（テキスト領域の純粋な幅 px）を使用。エディタ内部で `EDITOR_PADDING_HORIZONTAL`（64px）を加算。`useContentWidth` フック → `resolveWidthStyles().px`
28. **Route Handler での `$generateHtmlFromNodes` 使用禁止** — DOM API 不在で 500 エラー。プレビュー HTML はクライアント側の `renderEditorStateJsonToHtmlClient` で生成。保存時は Server Actions の `renderEditorStateToHtmlLazy`（動作する）

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

**挿入メニュー UI**: ツールバー「挿入」は **カテゴリごとのサブメニュー**（`DropdownMenuSub`）。項目が **6 件以上**のカテゴリはサブメニュー内 **2 カラム**。タイムライン・料金表等は `patterns`、カラム・コールアウト等は `layout`。詳細は `docs/reference/codex-rules/lexical-patterns.md` の「挿入メニュー」。

**挿入実行**: ツールバーは `executeInsertItem`（`dialog` は同期 `openDialog`、それ以外は 1 回の `editor.update`）。スラッシュメニューはトリガー削除と同一 `update` 内で `applyInsertItemInUpdate`（`dialog` は `queueMicrotask` で `openDialog`）。`type: "transform"` は `applyInUpdate` で $ API のみとし、ネストした `editor.update` を禁止。

**ポイント**: FloatingToolbar 経由で開くインラインノード（Ruby / Tooltip 等）は `INSERT_ITEMS` 不要だが `dialog-registry` への登録は必要。登録漏れは型エラーではなく実行時に無音で失敗するため注意。

## ファイル命名規則

| 種類       | 命名              | 例                  |
| ---------- | ----------------- | ------------------- |
| ノード     | `XxxNode.tsx`     | `CalloutNode.tsx`   |
| プラグイン | `XxxPlugin.tsx`   | `CalloutPlugin.tsx` |
| 型定義     | `types.ts` に追加 | -                   |

## HTML互換性

`exportDOM` と `importDOM` はセットで実装が必須（片方のみで dev-mode に警告が出る）:

- `exportDOM()`: エディタ状態 → HTML（クリップボード・公開ページ出力）
- `importDOM()`: HTML → エディタ状態（クリップボードペースト・再編集時）

### importDOM 実装パターン

```typescript
static override importDOM(): DOMConversionMap | null {
  return {
    div: (domNode) => {  // exportDOM が出力するタグ名
      if (!(domNode instanceof HTMLElement) || !domNode.hasAttribute("data-xxx"))
        return null;  // 別ノードの同タグは null を返してスキップ
      return {
        conversion: (element) => {
          const node = $createXxxNode({
            value: element.getAttribute("data-value") ?? "",  // getAttribute は string | null → ?? "" 必須
          });
          return { node };
        },
        priority: 2,  // div/figure/li 等の汎用タグをオーバーライドするために必須
      };
    },
  };
}
```

**`after: () => []`** — HTML の子要素を Lexical 子ノードとして取り込まない場合のみ使用:

```typescript
// NG: テキスト編集可能ノードに使用（子ノードが復元されなくなる）
// OK: 画像ノード等、子要素(<img>/<figcaption> 等)を Lexical 子ノードにしたくない場合のみ
return { node, after: () => [] };
```

## Gotchas

- **単一レベルコンテナ（CalloutNode, GroupNode）に `isShadowRoot` 禁止** — `isShadowRoot` はコンポジットノード（Collapsible/Steps/Tabs/Layout 等の Title/Content 内部構造を持つもの）専用。単一レベルコンテナに追加するとカーソルが閉じ込められ `$onEscape` で段落挿入が必要になる。Lexical のデフォルト矢印キー動作で自然に脱出できる
- **`MobileEditorFallback`（画面幅 &lt; 1024px）** — 親から渡された **`contentJson` を headless で HTML に変換**してプレビューする（未保存の変更を反映）。**`lexicalJsonSchema` 非適合時はプレビューせず警告**（自動正規化しない）。`EMPTY_LEXICAL_EDITOR_STATE_JSON` は **空段落 1 ブロック**。DB 修正は `docs/operations/lexical-editor-state-json.md`。headless 変換は `parseEditorState` のあと **`editor.setEditorState(editorState)`** を挟んでから `$generateHtmlFromNodes` すること（省略すると空 HTML になりうる）。実装: `preview/render-editor-state-to-html-client.ts` / サーバー側は `preview/headless-renderer.ts`
- **`createDOM` → data-attribute 変換後は `theme.ts` の旧エントリを削除** — `config.theme.*` 参照除去後、`theme.ts` に残った CSS クラスエントリが dead code になる。変換時にセットで削除する
- **`createEnumGuard` の型ガードは `string` を要求** — `createEnumGuard` が返す関数は `(value: string) => value is T` シグネチャ。`parse: (v: unknown)` から直接渡すと型エラー。AccentColor 等の parse パターン: `parse: (v: unknown): AccentColor => typeof v === "string" && isAccentColor(v) ? v : "default"`
- **`importDOM` で `getAttribute()` → AccentColor 変換に型ガード必須** — `element.getAttribute("data-color") ?? "default"` の型は `string`（`AccentColor` ではない）。必ず `isAccentColor(colorAttr) ? colorAttr : "default"` でガードする
- **テーブルセル内の `mb-4` が余分な縦幅を生む** — HTML 仕様でテーブルセル内はマージン相殺が起きず、`ParagraphNode` の `mb-4`（16px）がそのまま余白になる。`lexical-content.css` に `table :is(td, th) > :last-child { margin-bottom: 0; }` を追加（unlayered CSS は Tailwind utilities より優先）
- **`theme.ts` の `w-full` と `fixedLayout` state は競合する** — テーマクラスの `w-full` がインライン style による `fixedLayout` 制御を上書きする。テーマから `w-full` を削除し、幅制御は `CustomTableNode._applyAttributes()` の `fixedLayout` state に一本化すること
- **constructor 必須引数を持つ組み込みノード拡張時は `new CustomNode(arg)` 直接使用** — `$create(Klass)` は引数を渡せず `__tag` 等 private フィールドが undefined になる。`(node as unknown as { __tag }).__tag = tag` で後付けするのは型アサーション禁止違反。Lexical 公式 `$createHeadingNode` も `new HeadingNode(tag)` パターンを採用（`@lexical/rich-text`）。`CustomHeadingNode` / `CustomTableNode` が参照実装
- **`registerNodeTransform` コールバック引数は公式型 `(node: T) => void` に準拠** — document 全体を走査して重複解決する等で引数を使わない場合でも `(_node: T) => {...}` で明示する（TypeScript の parameter omission で実行時は動くが、型要件明示がクリーン）
- **Node Transform の fallback 値は deterministic 必須** — `crypto.randomUUID()` / `Math.random()` 等ランダム値を transform 内で生成すると、再実行ごとに別値 → `$setState` 差分検出 → 再び dirty で無限ループ。`used.size + 1` や position ベースの deterministic fallback を使う（例: `section-${used.size + 1}`）。`HeadingAnchorPlugin` 参照実装
- **Prisma JSON フィールドは headless 外でも JSON 直接 traverse が可能** — `@lexical/headless` + `createHeadlessEditor` は Node 環境で動くが全ノード登録が必要。公開側の単純な heading 抽出等は **`contentJson` を JSON.parse して再帰 traverse**（`unknown` 受付）する方が軽量。`extractHeadings` (`@/shared/lib/lexical/extract-headings`) が参照実装

### createDOM と exportDOM のタグ不一致は許容される

`createDOM`（エディタ内レンダリング用）と `exportDOM`（HTML出力用）が異なるタグを使ってもよい:

- Lexical のクリップボードは **`exportDOM` の HTML を使用**（`createDOM` の DOM はクリップボードに使われない）
- 内部コピペは JSON パス（`exportJSON`/`importJSON`）→ `importDOM` は `exportDOM` 出力タグに合わせる

## Gotchas（gotchas.md より移動）

- **Lexical は既に dynamic import 済み** — `LazyLexicalEditor.tsx` が `next/dynamic` + `ssr: false` でコード分割。管理 layout には Lexical の直接 import なし。パフォーマンスレビューで「Lexical がバンドル肥大化」と指摘された場合は `LazyLexicalEditor` の存在を確認してから対応判断
- **admin.css の `--font-serif` は Lexical WYSIWYG 用** — エディタ内の h1/h2 を公開ページと同じ Cormorant Garamond で表示するため。admin layout.tsx で Cormorant Garamond をロード、`theme.ts` の h1/h2 に `font-heading` 適用。管理 UI（サイドバー、フォーム等）は `--font-sans` のまま
- **Lexical エディタのコンテンツ領域は `bg-card`（白）** — `bg-background`（`oklch(0.98 ...)` 微グレー）ではなく `bg-card`（`oklch(1 0 0)` 白）を使用。文書編集エリアは紙のメタファーで白背景が適切。`LexicalEditor.tsx` の外枠 div で設定
- **Lexical ツールバーはエディタ+インスペクターの全幅に配置（Gutenberg パターン）** — ツールバーを `section` の外に出し、外枠 `div.flex-col` の直下に配置。コンテンツ+インスペクターは `div.flex.flex-1` で横並び。ツールバーがインスペクター開閉時にかぶらない。`LexicalEditor.tsx` で実装
- **`tryConvertHtmlStringToLexicalJsonString` は SSR で使用不可** — `DOMParser` が Node.js に存在しない。Server Component / Server Action から呼ぶと `Attempted to call client function from the server` エラー。`useState` 遅延初期化で呼ぶ場合も `typeof window === "undefined"` ガードが必須（SSR でも実行されるため）
- **複合ノードの `isShadowRoot()` は全子ノードに必須** — Container だけでなく Item / Title / Content / Panel / Citation 等の全中間・子 ElementNode にも `isShadowRoot(): boolean { return true }` を実装する。欠落するとキャレットがノード境界を越えて漏れる。`updateDOM` の `prevNode` は具象クラス名ではなく `this` 型を使用
- **Lexical アップグレード時はバージョン参照を全文 grep** — `0.XX` で `.claude/agents/`, `.claude/skills/`, `docs/`, `__tests__/`, ソースコメントを検索。CLAUDE.md・lexical-patterns.md（.claude/rules + docs/reference 両方）・TECH_STACK.md・project-reviewer.md・lexical-reviewer.md・scaffold ファイル・DraggableBlockPlugin フォークコメントが対象。plans/ の完了済みファイルは変更不要
