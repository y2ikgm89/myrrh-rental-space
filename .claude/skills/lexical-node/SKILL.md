---
name: lexical-node
description: Creates custom Lexical editor nodes with DecoratorNode or ElementNode patterns. Use when adding new content types to the rich text editor, such as embeds, callouts, or interactive elements. Implements exportDOM/importDOM, type-safe factory functions, and React Compiler compatible patterns.
argument-hint: <NodeName> [decorator|element]
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Lexical カスタムノード作成

Lexicalエディタ用のカスタムノードを作成します。

## 引数

- `NodeName`: PascalCase（例: `Callout`, `CodeBlock`）
- `タイプ`: `decorator`（デフォルト）または `element`

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:
- ノードの目的（何を表現するか）
- 必要なプロパティ
- HTMLでの表現方法

### 2. 既存実装の確認

参照実装を読み込む:
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ImageNode.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/YouTubeNode.tsx`

### 3. ノードファイル作成

パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/${NodeName}Node.tsx`

**DecoratorNode テンプレート（Reactコンポーネント埋め込み用）:**

```typescript
/**
 * ${NodeName} Node
 *
 * ${説明}
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedDecoratorNode,
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// interface extends パターン（v0.40.0 推奨）
// Spread<> は使用しない
export interface Serialized${NodeName}Node extends SerializedDecoratorNode {
  // プロパティ定義（JSON serializable のみ）
  prop: string
}

function ${NodeName}Component({
  nodeKey,
  // プロパティ
}: {
  nodeKey: NodeKey
  // 型定義
}) {
  return (
    <div data-lexical-node-key={nodeKey}>
      {/* コンポーネント実装 */}
    </div>
  )
}

function $convert${NodeName}Element(domNode: Node): null | DOMConversionOutput {
  // DOM→ノード変換ロジック
  return null
}

export class ${NodeName}Node extends DecoratorNode<ReactElement> {
  // プライベートプロパティ（__プレフィックス必須）
  __prop: string

  static getType(): string {
    return '${nodeName.toLowerCase()}'
  }

  static clone(node: ${NodeName}Node): ${NodeName}Node {
    return new ${NodeName}Node(node.__prop, node.__key)
  }

  // importJSON: ファクトリ関数 + updateFromJSON チェーン（v0.40.0 推奨）
  static importJSON(serializedNode: Serialized${NodeName}Node): ${NodeName}Node {
    return $create${NodeName}Node({
      prop: serializedNode.prop,
    }).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      // DOM要素 → 変換関数マッピング
    }
  }

  constructor(prop: string, key?: NodeKey) {
    super(key)
    this.__prop = prop
  }

  // exportJSON: super.exportJSON() が type/version を自動提供
  exportJSON(): Serialized${NodeName}Node {
    return {
      ...super.exportJSON(),
      prop: this.__prop,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    // HTML出力設定
    return { element }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = config.theme.${nodeName.toLowerCase()} || ''
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return <${NodeName}Component nodeKey={this.__key} prop={this.__prop} />
  }
}

// オブジェクトパラメータパターン（推奨）
// $applyNodeReplacement でノード置換フックを適用（Lexical 公式推奨）
export function $create${NodeName}Node({
  prop,
}: {
  prop: string
}): ${NodeName}Node {
  return $applyNodeReplacement(new ${NodeName}Node(prop))
}

export function $is${NodeName}Node(
  node: LexicalNode | null | undefined
): node is ${NodeName}Node {
  return node instanceof ${NodeName}Node
}
```

### 4. エクスポート追加

`nodes/index.ts` に追加:

```typescript
export {
  ${NodeName}Node,
  $create${NodeName}Node,
  $is${NodeName}Node,
} from './${NodeName}Node'
export type { Serialized${NodeName}Node } from './${NodeName}Node'
```

### 5. LexicalEditor.tsx 更新

```typescript
import { ${NodeName}Node } from './nodes/${NodeName}Node'

const initialConfig = {
  nodes: [
    // 既存ノード...
    ${NodeName}Node,
  ],
}
```

### 6. テーマ追加（必要な場合）

`theme.ts` に追加:

```typescript
export const editorTheme: EditorThemeClasses = {
  // ...
  ${nodeName.toLowerCase()}: 'editor-${nodeName.toLowerCase()}',
}
```

## 重要なルール

詳細は `.claude/rules/lexical-patterns.md` を参照。

- **プロパティ**: JSON serializableのみ（Function, Symbol, Map, Set禁止）
- **__プレフィックス**: プライベートプロパティには必須
- **exportDOM/importDOM**: 公開ページ表示に必須
- **型アサーション禁止**: `.claude/rules/type-safety.md` 準拠
- **React Compiler互換**: `.claude/rules/react-patterns.md` 準拠

## Definition of Done

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] 既存テストが壊れていないこと
- [ ] `exportJSON()` / `importJSON()` が正しく往復変換
- [ ] `exportDOM()` / `importDOM()` が正しく往復変換
- [ ] `nodes/index.ts` にエクスポート追加
- [ ] `LexicalEditor.tsx` の initialConfig.nodes に登録
