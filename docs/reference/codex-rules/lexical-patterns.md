---
paths:
  - src/app/(admin)/**/lexical/**
---

# Lexical エディタ実装パターン

> Codex 用参照ドキュメント。admin Lexical 実装はこのファイルを正本とする。
> Next.js 16 / React 19 / Turbopack / React Compiler 対応

## 概要

このプロジェクトでのLexical実装ガイドライン。
実装パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`（インポートは `@/admin/...` エイリアスに従う）

## 技術スタック整合性

| 技術           | バージョン         | 互換性                               |
| -------------- | ------------------ | ------------------------------------ |
| Lexical        | 0.41.0             | React 17+対応                        |
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
// useMemoで初期化（Lexical内部で実装済み）
const initialConfig = useMemo(() => ({
  namespace: 'LexicalEditor',
  theme: editorTheme,
  nodes: [...],
  onError: (error: Error) => console.error('Lexical Error:', error),
}), [])
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

| 項目 | 内容 |
| ---- | ---- |
| 状態共有 | `inspector/inspector-sidebar-context.tsx` の **`InspectorSidebarProvider`**（`LexicalEditor` / `EditorInner` で `showInspector` に応じて `enabled` を渡す） |
| 消費 API | **`useInspectorSidebar()`** — `toggle` / `expand` / `collapse` / `isExpanded` / `isInspectorAvailable` |
| React 19 Context | **`<InspectorSidebarContext value={...}>`** でラップ。**`.Provider` は使わない**。フックは **`use(InspectorSidebarContext)`**（`useContext` 禁止に準拠） |
| 永続化 | `localStorage` キー **`myrrh-lexical-inspector-expanded`**（`1` = 展開、`0` = 折りたたみ）。利用不可環境では黙って無視 |
| ツールバー | `ToolbarPlugin` — パネル開閉（`aria-pressed` / `aria-controls="lexical-block-inspector-panel"`） |
| キーボード | **`Ctrl+Shift+0`**（**`Numpad0` 可**）。`KeyboardShortcutsPlugin` 内で `isInspectorAvailable` が false のときはコマンドを処理しない |
| 無効化 | `LexicalEditor` の **`showInspector={false}`** — サイドバー非マウント・トグル非表示・上記ショートカット無効 |
| マークアップ | パネルルートは **`<aside id="lexical-block-inspector-panel" aria-label="ブロック設定パネル">`** |

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

**すべてのコンテナ/コンテンツノードに必須**。キャレットがキーボード操作で境界外に漏れるのを防止:

```typescript
isShadowRoot(): boolean {
  return true
}
```

**現在の実装状況（全9ノード）:**

- CollapsibleContainerNode, CollapsibleContentNode
- LayoutContainerNode, LayoutItemNode
- StepsContainerNode, StepContentNode
- TabsContainerNode, TabPanelNode
- PullQuoteNode

### canBeEmpty()

コンテナノードで `false` を返し、空のコンテナが残存するのを防止:

```typescript
canBeEmpty(): boolean {
  return false
}
```

**対象:** CollapsibleContainerNode, StepsContainerNode, TabsContainerNode, LayoutContainerNode

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
updateDOM(prevNode: StepsContainerNode, dom: HTMLElement): boolean {
  const change = $getStateChange(this, prevNode, stepsStyleState)
  if (change) {
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

### エディタ参照の取得

LexicalComposer の外へ editor インスタンスを渡す必要がある場合は、
独自の `useEffect` で ref を同期せず `EditorRefPlugin` を使う:

```typescript
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin'

const editorRef = useRef<LexicalEditor | null>(null)

<EditorRefPlugin editorRef={editorRef} />
```

### HTML 初期化パターン

HTML を Lexical node に変換して初期化するときは、`$insertNodes()` の前に root を選択する:

```typescript
editor.update(() => {
  const parser = new DOMParser();
  const dom = parser.parseFromString(htmlString, "text/html");
  const nodes = $generateNodesFromDOM(editor, dom);
  const root = $getRoot();

  root.clear();
  root.select();
  $insertNodes(nodes);
});
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
    // ログ記録（本番）またはスロー（開発）
    console.error("Lexical Error:", error);
    // 例外をスローしなければLexicalは自動回復
  },
};
```

## 禁止事項

1. **直接的なDOM操作禁止**: `editor.update()` / `editor.read()` を経由
2. **updateListener内での更新禁止**: パフォーマンス問題（Node Transforms使用）
3. **read/update混在禁止**: 同期的にネストしない
4. **メモリリーク**: リスナーは必ず `mergeRegister` で登録解除
5. **型アサーション禁止**: 型ガード関数 `$isXxxNode()` を使用
6. **制御コンポーネント化禁止**: EditorStateを親コンポーネントで管理しない
7. **LexicalErrorBoundary省略禁止**: RichTextPluginには必須（v0.36+ は named export: `{ LexicalErrorBoundary }`）
8. **プレースホルダーの渡し先を誤らない**: `ContentEditable` に `placeholder` と `aria-placeholder` を渡す
9. **`@lexical/utils` からの `mergeRegister` / `$findMatchingParent` import禁止**: v0.40.0で `lexical` 本体に移動。`import { mergeRegister } from 'lexical'` を使用
10. **レガシーノードパターン禁止**: `static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `__property`, `getWritable()`, `getLatest()`, `$applyNodeReplacement`, `SerializedXxxNode` interface — すべて `$config` + `createState` + `$getState` / `$setState` に置換済み
11. **ブロックレベルノードへの `$insertNodes` 使用禁止**: `$insertNodeToNearestRoot` (`@lexical/utils`) を使用。`$insertNodes` はインライン/混合ノード専用
12. **deprecated な `__EXPERIMENTAL` テーブル API 使用禁止**: `@lexical/table` の stable な `*AtSelection` API を使用する
13. **React render内でのノードプロパティ直接アクセス禁止**: `editor.getEditorState().read(() => $getState(node, xxxState))` で囲む。Lexicalはアクティブなeditor stateが必要
14. **`node.__property` 直接アクセス禁止**: `$getState(node, xxxState)` を使用。`__` フィールドは `$config` で自動管理
15. **ノードクラスに getter/setter ラッパー定義禁止**: `node.getText()` / `node.setText(v)` ではなく `$getState(node, textState)` / `$setState(node, textState, v)` を直接使用。ラッパーメソッドは後方互換性ハックであり CLAUDE.md §禁止事項に違反
16. **子ノードの collapseAtStart 委譲禁止**: Title/Content/Panel 等の子ノードに `collapseAtStart()` を実装しない。`isShadowRoot()` で境界保護する。コンテナノードのみが `collapseAtStart()` を持つ
17. **コンテナ/コンテンツノードの isShadowRoot 省略禁止**: 複合ノードのコンテナ・コンテンツ・パネルノードには必ず `isShadowRoot() { return true }` を実装する
18. **exportDOM での CSS クラス使用禁止**: `config.theme.*` や `className` は `createDOM` のみ（エディタ内表示）。`exportDOM` は data-attributes のみで HTML を構築する
19. **updateDOM で `return true` の乱用禁止**: 属性変更は `$getStateChange` + `dom.setAttribute()` で差分更新し `return false`。`return true` は DOM 要素タグの変更等、DOM 再構築が必要な場合のみ

## ファイル命名規則

| 種類       | 命名              | 例                  |
| ---------- | ----------------- | ------------------- |
| ノード     | `XxxNode.tsx`     | `CalloutNode.tsx`   |
| プラグイン | `XxxPlugin.tsx`   | `CalloutPlugin.tsx` |
| 型定義     | `types.ts` に追加 | -                   |

## HTML互換性

exportDOM/importDOMは公開ページでのHTMLレンダリングに必須:

- `exportDOM()`: エディタ状態 → HTML
- `importDOM()`: HTML → エディタ状態（再編集時）

## Gotchas（補足）

- **`MobileEditorFallback`（画面幅 &lt; 1024px）** — 親から渡された **`contentJson` を headless で HTML に変換**してプレビューする（未保存の変更を反映）。`contentJson` が無い・変換失敗時は **`contentHtml`** にフォールバック。headless 変換は `parseEditorState` のあと **`editor.setEditorState(editorState)`** を挟んでから `$generateHtmlFromNodes` すること（省略すると空 HTML になりうる）。実装: `preview/render-editor-state-to-html-client.ts` / サーバー側は `preview/headless-renderer.ts`
