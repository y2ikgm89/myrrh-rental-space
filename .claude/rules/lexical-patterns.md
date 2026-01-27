# Lexical エディタ実装パターン

> Next.js 16 / React 19 / Turbopack / React Compiler 対応

## 概要

このプロジェクトでのLexical実装ガイドライン。
パス: `@/admin/components/editor/lexical/`

## 技術スタック整合性

| 技術 | バージョン | 互換性 |
|------|-----------|--------|
| Lexical | 0.39.0 | React 17+対応 |
| React | 19.2.3 | ✅ peerDependencies対応 |
| React Compiler | 1.0.0 | ✅ useCallback使用推奨 |
| Turbopack | Next.js 16 default | ✅ optimizePackageImports設定済み |

## React 19 + React Compiler対応

### useCallback必須パターン

React Compilerと互換性を保つため、コールバック関数はuseCallbackでラップ:

```typescript
// OK: React Compiler互換
const openDialog = useCallback(() => {
  setIsOpen(true)
}, [])

// NG: メモ化されない
const openDialog = () => setIsOpen(true)
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
├── LexicalEditor.tsx      # メインコンポーネント（LexicalComposer）
├── index.ts               # 公開エクスポート
├── theme.ts               # エディタテーマ定義
├── types.ts               # 型定義
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

| プラグイン | 用途 | 必要ノード |
|-----------|------|-----------|
| `RichTextPlugin` | リッチテキスト編集 | HeadingNode, QuoteNode |
| `PlainTextPlugin` | プレーンテキスト編集 | - |
| `HistoryPlugin` | Undo/Redo | - |
| `OnChangePlugin` | 状態変更監視 | - |
| `ListPlugin` | 箇条書き/番号リスト | ListNode, ListItemNode |
| `CheckListPlugin` | チェックリスト | ListNode, ListItemNode |
| `LinkPlugin` | リンク編集 | LinkNode |
| `AutoLinkPlugin` | URL自動リンク化 | AutoLinkNode |
| `TablePlugin` | テーブル編集 | TableNode, TableRowNode, TableCellNode |
| `TabIndentationPlugin` | Tabキーインデント | - |
| `MarkdownShortcutPlugin` | Markdown記法 | 各種ノード |
| `TableOfContentsPlugin` | 目次生成 | HeadingNode |
| `ClearEditorPlugin` | エディタクリア | - |
| `EditorRefPlugin` | エディタ参照取得 | - |

**このプロジェクトで使用中:**
- RichTextPlugin, HistoryPlugin, ListPlugin, LinkPlugin, TabIndentationPlugin, OnChangePlugin

## ノード実装パターン

### 5つの基本ノード

| ノード | 拡張可能 | 用途 |
|--------|----------|------|
| RootNode | ❌ | contenteditable のトップコンテナ |
| LineBreakNode | ❌ | 改行表現 |
| ElementNode | ✅ | ブロック要素（ParagraphNode, LinkNode等） |
| TextNode | ✅ | テキスト＋フォーマット（bold, italic等） |
| DecoratorNode | ✅ | React/任意コンポーネント埋め込み |

### 必須メソッド

```typescript
class CustomNode extends DecoratorNode<ReactElement> {
  static getType(): string           // ノードタイプ識別子
  static clone(node: CustomNode)     // ノード複製
  static importJSON(data)            // JSONデシリアライズ
  static importDOM()                 // HTMLインポート
  exportJSON()                       // JSONシリアライズ
  exportDOM()                        // HTMLエクスポート
  createDOM(config)                  // DOM要素作成
  updateDOM()                        // DOM更新判定
  decorate()                         // Reactコンポーネント
}
```

### ファクトリ関数（$プレフィックス）

```typescript
// オブジェクトパラメータパターン（推奨）
export function $createImageNode({
  src,
  alt = '',
  width,
  height,
}: {
  src: string
  alt?: string
  width?: number
  height?: number
}): ImageNode {
  return new ImageNode(src, alt, width, height)
}

// 型ガード
export function $isImageNode(node: LexicalNode | null): node is ImageNode {
  return node instanceof ImageNode
}
```

### プロパティルール

- **JSON serializable のみ**: Function, Symbol, Map, Set 禁止
- **__プレフィックス**: プライベートプロパティに必須
- **getWritable() / getLatest()**: 不変性維持に必要

## プラグイン実装パターン

### 直接更新パターン（推奨: ダイアログ付きプラグイン）

```typescript
// コマンド登録不要。ダイアログから直接editor.update()を呼び出す
const handleSubmit = useCallback(() => {
  editor.update(() => {
    const node = $createCustomNode(formData)
    $insertNodes([node])
  })
  onClose()
}, [editor, formData, onClose])
```

### コマンド登録パターン（ツールバーボタン等から直接呼び出す場合）

```typescript
import { createCommand, COMMAND_PRIORITY_EDITOR } from 'lexical'

export const INSERT_CUSTOM_COMMAND = createCommand<Payload>('INSERT_CUSTOM')

function CustomPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INSERT_CUSTOM_COMMAND,
      (payload) => {
        editor.update(() => {
          const node = $createCustomNode(payload)
          $insertNodes([node])
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])
}
```

### リスナー登録

```typescript
useEffect(() => {
  return mergeRegister(
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => { /* 状態読み取り */ })
    }),
    editor.registerCommand(COMMAND, handler, priority)
  )
}, [editor])
```

### Node Transforms（状態変更の推奨方法）

`updateListener` 内での `editor.update()` は非推奨。代わりに **Node Transforms** を使用:

```typescript
// 非推奨: updateListener内で更新
editor.registerUpdateListener(() => {
  editor.update(() => { /* 追加のレンダリングが発生 */ })
})

// 推奨: Node Transforms
editor.registerNodeTransform(TextNode, (node) => {
  // 条件チェックで無限ループ防止
  if (!node.hasFormat('bold')) {
    node.toggleFormat('bold')
  }
})
```

**実践例: 絵文字ショートコード変換**

```typescript
function textNodeTransform(node: TextNode): void {
  if (!node.isSimpleText() || node.hasFormat('code')) return

  const text = node.getTextContent()
  const emojiMatch = findEmoji(text)
  if (emojiMatch === null) return

  // 最初のマッチのみ処理（残りはtransformが再実行される）
  let targetNode
  if (emojiMatch.position === 0) {
    [targetNode] = node.splitText(emojiMatch.position + emojiMatch.shortcode.length)
  } else {
    [, targetNode] = node.splitText(
      emojiMatch.position,
      emojiMatch.position + emojiMatch.shortcode.length
    )
  }

  const emojiNode = $createEmojiNode(emojiMatch.unifiedID)
  targetNode.replace(emojiNode)
}

export function registerEmoji(editor: LexicalEditor): () => void {
  return editor.registerNodeTransform(TextNode, textNodeTransform)
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
const json = editorState.toJSON()
const jsonString = JSON.stringify(json)

// HTML出力（公開ページ表示用）
editorState.read(() => {
  const html = $generateHtmlFromNodes(editor, null)
})
```

## エラーハンドリング

```typescript
const initialConfig = {
  onError: (error: Error) => {
    // ログ記録（本番）またはスロー（開発）
    console.error('Lexical Error:', error)
    // 例外をスローしなければLexicalは自動回復
  },
}
```

## 禁止事項

1. **直接的なDOM操作禁止**: `editor.update()` / `editor.read()` を経由
2. **updateListener内での更新禁止**: パフォーマンス問題（Node Transforms使用）
3. **read/update混在禁止**: 同期的にネストしない
4. **メモリリーク**: リスナーは必ず `mergeRegister` で登録解除
5. **型アサーション禁止**: 型ガード関数 `$isXxxNode()` を使用
6. **制御コンポーネント化禁止**: EditorStateを親コンポーネントで管理しない
7. **LexicalErrorBoundary省略禁止**: RichTextPluginには必須

## ファイル命名規則

| 種類 | 命名 | 例 |
|------|------|-----|
| ノード | `XxxNode.tsx` | `CalloutNode.tsx` |
| プラグイン | `XxxPlugin.tsx` | `CalloutPlugin.tsx` |
| 型定義 | `types.ts` に追加 | - |

## HTML互換性

exportDOM/importDOMは公開ページでのHTMLレンダリングに必須:
- `exportDOM()`: エディタ状態 → HTML
- `importDOM()`: HTML → エディタ状態（再編集時）
