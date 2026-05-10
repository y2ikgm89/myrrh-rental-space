---
description: Lexical 5 基本ノード + NodeState API ($config / createState / $getState / $setState) + プロパティルール
paths:
  - src/shared/lib/lexical/**
  - src/**/editor/**
  - src/**/*lexical*
---

# Lexical NodeState API

> 5 基本ノード分類 + `$config` + `createState` 標準パターン + JSON serializable プロパティルール。

## 5 つの基本ノード

| ノード        | 拡張可能 | 用途                                       |
| ------------- | -------- | ------------------------------------------ |
| RootNode      | ❌       | contenteditable のトップコンテナ           |
| LineBreakNode | ❌       | 改行表現                                   |
| ElementNode   | ✅       | ブロック要素（ParagraphNode, LinkNode 等） |
| TextNode      | ✅       | テキスト＋フォーマット（bold, italic 等）  |
| DecoratorNode | ✅       | React/任意コンポーネント埋め込み           |

## NodeState API（標準パターン — 全ノードで採用済み）

`$config` + `createState` で `getType`, `clone`, `importJSON`, `exportJSON`, `updateFromJSON`, `afterCloneFrom` を自動生成。
`flat: true` で既存 JSON との後方互換性を維持。

### 状態宣言

```typescript
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";

// 各プロパティを createState で宣言（ファイルトップレベル）
export const calloutTypeState = createState("calloutType", {
  parse: (v: unknown): CalloutType =>
    typeof v === "string" && isCalloutType(v) ? v : "info",
});
```

### ノードクラス

```typescript
export class CalloutNode extends ElementNode {
  // $config() が getType, clone, importJSON, exportJSON を自動生成
  $config() {
    return this.config("callout", {
      extends: ElementNode, // 親クラスを指定
      stateConfigs: [{ flat: true, stateConfig: calloutTypeState }],
    });
  }

  // importDOM() — 変更なし（DOM→Node 変換）
  // exportDOM() — $getState() でプロパティ取得
  // createDOM(), updateDOM() — $getState() / $getStateChange() 使用
  // decorate() — DecoratorNode のみ、$getState() 使用
}
```

### プロパティアクセス

```typescript
// 読み取り: $getState(node, stateConfig)
const type = $getState(this, calloutTypeState);

// 書き込み: $setState(node, stateConfig, value)
$setState(this, calloutTypeState, "warning");

// DOM 更新での変更検出: $getStateChange(this, prevNode, stateConfig)
const change = $getStateChange(this, prevNode, calloutTypeState);
if (change) {
  const [newType] = change;
  dom.setAttribute("data-callout-type", newType);
}
```

### ファクトリ関数

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

### ゼロプロパティノード（子ノードのみ保持）

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

## プロパティルール

- **JSON serializable のみ**: Function, Symbol, Map, Set 禁止
- **`createState` の `parse` 関数**: デシリアライゼーション時のバリデーション + デフォルト値を担当
- **`$getState` / `$setState`**: プロパティの読み書きに使用。`__` フィールドや `getWritable()` / `getLatest()` は不要
