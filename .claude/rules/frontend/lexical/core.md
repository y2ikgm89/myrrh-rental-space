---
description: Lexical コアアーキテクチャ（技術スタック・Compiler 対応・Inspector・非制御設計・公式プラグイン一覧）
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical エディタ実装パターン — コアアーキテクチャ

> **本文正本**（Claude Code）。Codex は `AGENTS.md` + `.codex/rules/**` を独立 SSoT として参照（同期廃止済み、2026-04-24）。Next.js 16 / React 19 / Turbopack / React Compiler 対応

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
| Lexical        | 0.45.x             | React 17+対応                        |
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
