---
description: Lexical プラグイン実装パターン（ノード挿入・コマンド登録・状態シリアライゼーション・エラーハンドリング）
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical プラグイン実装パターン

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

## Gotchas

- **Lexical の slash command 拡張は ComponentPicker `dialog` entry 経由が公式準拠** — `EmojiPickerPlugin` の `:` trigger は special case（独自 typeahead）。新規 inline insert（icon / mention 等）を `/xxx` で起動する場合は ① `nodes/XxxNode.tsx` (DecoratorNode + `isInline()=true`) ② `plugins/XxxPlugin.tsx` (`DialogPluginProps` 受取り → 既存 admin dialog を再利用 → 選択時 `selection.removeText()` + `$insertNodes`) ③ `dialog-registry.ts` + `insert-items/<category>.ts` に `type: "dialog"` entry 追加 — の 3 点で完了。Portable Text editor の `/icon` DOM trigger 直挿入（`slash-trigger.ts`）は contenteditable + DOM walker パターンの制約による別実装、Lexical へ移植しない。参照実装: `InlineIconPlugin.tsx`（admin の `IconPickerDialog` を `DialogPluginProps` 薄ラッパー経由で再利用）
