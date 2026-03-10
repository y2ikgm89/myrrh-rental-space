# 034: React Compiler対応 - useMemo/useCallback削除

## 概要

React Compiler（Next.js 16で有効）環境に対応し、不要な手動メモ化（useMemo/useCallback）を削除。React公式ベストプラクティスに準拠したクリーンな実装に移行。

## 背景

### React Compilerの自動最適化

React Compilerは以下を自動的に行う:

- コンポーネントと関数の自動メモ化
- 依存関係の自動追跡
- 不要な再レンダリングの防止

### React公式推奨

> "For new code, we recommend relying on the compiler for memoization and using useMemo/useCallback where needed to achieve precise control."

## 変更内容

### 削除統計

| 対象        | 変更前     | 変更後     | 削除数 |
| ----------- | ---------- | ---------- | ------ |
| useMemo     | 4ファイル  | 2ファイル  | 2      |
| useCallback | 50ファイル | 12ファイル | 38     |

### 保持したuseMemo（2ファイル）

| ファイル                   | 理由                                    |
| -------------------------- | --------------------------------------- |
| `use-calendar-state.ts:33` | `new Date()`の参照安定化が必要          |
| `LexicalEditor.tsx:312`    | Lexical `initialConfig`の安定参照が必要 |

### 保持したuseCallback（12ファイル）

| カテゴリ                | ファイル数 | 理由                                   |
| ----------------------- | ---------- | -------------------------------------- |
| Lexicalノード`onDelete` | 9          | `editor.registerCommand`依存配列で使用 |
| useEffect依存関数       | 3          | Effect実行タイミング制御に必要         |

#### 詳細

- `ToolbarPlugin.tsx` - `$updateToolbar`
- `MediaLibraryPlugin.tsx` - `fetchMedia`
- `InlineTitleEditor.tsx` - `adjustHeight`
- `ImageComponent.tsx` - `onDelete`
- `ButtonComponent.tsx` - `onDelete`
- `CalloutComponent.tsx` - `onDelete`
- `CardComponent.tsx` - `onDelete`
- `DividerNode.tsx` - `onDelete`
- `FAQComponent.tsx` - `onDelete`
- `PostListWidgetComponent.tsx` - `onDelete`
- `ReservationWidgetComponent.tsx` - `onDelete`
- `YouTubeComponent.tsx` - `onDelete`

## 削除基準

### 削除可能

1. **単純なイベントハンドラ** - `onClick`, `onChange`等のDOM要素に直接渡す関数
2. **Context Provider関数** - React Compilerが自動最適化
3. **カスタムフック戻り値** - React Compilerが呼び出し側で最適化
4. **ダイアログ開閉** - `setIsOpen(true/false)`のような単純なステート更新
5. **コンポーネント返却のuseCallback** - アンチパターン

### 保持必須

1. **外部ライブラリAPI統合** - Lexical `registerCommand`等
2. **参照安定化が必要なオブジェクト** - `new Date()`インスタンス
3. **useEffect依存配列で使用** - Effect実行タイミング制御

## 技術的詳細

### Lexicalノードの`onDelete`パターン

```typescript
// 保持必須: editor.registerCommandの依存配列で使用
const onDelete = useCallback(
  (event: KeyboardEvent) => {
    if (isSelected && $isNodeSelection($getSelection())) {
      event.preventDefault();
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) {
          node.remove();
        }
      });
      return true;
    }
    return false;
  },
  [editor, isSelected, nodeKey],
);

useEffect(() => {
  return mergeRegister(
    editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      onDelete,
      COMMAND_PRIORITY_LOW,
    ),
  );
}, [editor, onDelete]); // onDeleteは依存配列に必要
```

### 削除した典型的パターン

```typescript
// Before: 不要なuseCallback
const handleSave = useCallback(() => {
  startTransition(async () => {
    await saveData();
  });
}, []);

// After: 通常の関数
const handleSave = () => {
  startTransition(async () => {
    await saveData();
  });
};
```

## 検証

- [x] 型チェック（`bun run type-check`）
- [x] Lint（`bun run lint`）
- [x] ビルド（`bun run build`）
- [x] コードレビュー

## 参考資料

- [React Compiler Introduction](https://react.dev/learn/react-compiler/introduction)
- [useMemo – React](https://react.dev/reference/react/useMemo)
- [useCallback – React](https://react.dev/reference/react/useCallback)

## 関連

- Next.js 16 `reactCompiler: true` 設定（`next.config.ts:8`）
