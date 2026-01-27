# Lexical カスタムノード作成

Lexicalエディタ用のカスタムノードを作成します。

## 使い方

```
/lexical-node <ノード名> [ノードタイプ]
```

- `ノード名`: PascalCase（例: `Callout`, `CodeBlock`）
- `ノードタイプ`: `decorator`（デフォルト）または `element`

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:
- ノードの目的（何を表現するか）
- 必要なプロパティ
- HTMLでの表現方法

### 2. ノードファイル作成

パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/${ノード名}Node.tsx`

**DecoratorNode テンプレート（Reactコンポーネント埋め込み用）:**

```typescript
/**
 * ${ノード名} Node
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
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { DecoratorNode } from 'lexical'

export type Serialized${ノード名}Node = Spread<
  {
    // プロパティ定義
  },
  SerializedLexicalNode
>

function ${ノード名}Component({
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

function $convert${ノード名}Element(domNode: Node): null | DOMConversionOutput {
  // DOM→ノード変換ロジック
  return null
}

export class ${ノード名}Node extends DecoratorNode<ReactElement> {
  // プライベートプロパティ

  static getType(): string {
    return '${ノード名.toLowerCase()}'
  }

  static clone(node: ${ノード名}Node): ${ノード名}Node {
    return new ${ノード名}Node(/* props */, node.__key)
  }

  static importJSON(serializedNode: Serialized${ノード名}Node): ${ノード名}Node {
    return $create${ノード名}Node(/* props from serializedNode */)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      // DOM要素 → 変換関数マッピング
    }
  }

  constructor(/* props */, key?: NodeKey) {
    super(key)
    // プロパティ初期化
  }

  exportJSON(): Serialized${ノード名}Node {
    return {
      type: '${ノード名.toLowerCase()}',
      version: 1,
      // プロパティ
    }
  }

  exportDOM(): DOMExportOutput {
    // HTML出力
    const element = document.createElement('div')
    return { element }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = config.theme.${ノード名.toLowerCase()} || ''
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return <${ノード名}Component nodeKey={this.__key} /* props */ />
  }
}

// オブジェクトパラメータパターン（推奨）
export function $create${ノード名}Node({
  // プロパティ
}: {
  // 型定義
}): ${ノード名}Node {
  return new ${ノード名}Node(/* 個別引数に分解 */)
}

export function $is${ノード名}Node(
  node: LexicalNode | null | undefined
): node is ${ノード名}Node {
  return node instanceof ${ノード名}Node
}
```

**実装例（ImageNode準拠）:**

```typescript
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
```

**ElementNode テンプレート（テキスト内容を持つブロック用）:**

```typescript
/**
 * ${ノード名} Node
 *
 * ${説明}
 */

'use client'

import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical'
import { ElementNode } from 'lexical'

export type Serialized${ノード名}Node = Spread<
  {
    // プロパティ
  },
  SerializedElementNode
>

export class ${ノード名}Node extends ElementNode {
  static getType(): string {
    return '${ノード名.toLowerCase()}'
  }

  static clone(node: ${ノード名}Node): ${ノード名}Node {
    return new ${ノード名}Node(/* props */, node.__key)
  }

  static importJSON(serializedNode: Serialized${ノード名}Node): ${ノード名}Node {
    const node = $create${ノード名}Node(/* props */)
    return node
  }

  static importDOM(): DOMConversionMap | null {
    return {}
  }

  constructor(/* props */, key?: NodeKey) {
    super(key)
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.className = config.theme.${ノード名.toLowerCase()} || ''
    return element
  }

  updateDOM(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    return { element }
  }

  exportJSON(): Serialized${ノード名}Node {
    return {
      ...super.exportJSON(),
      type: '${ノード名.toLowerCase()}',
      version: 1,
    }
  }
}

// オブジェクトパラメータパターン（推奨）
export function $create${ノード名}Node({
  // プロパティ
}: {
  // 型定義
}): ${ノード名}Node {
  return new ${ノード名}Node(/* 個別引数に分解 */)
}

export function $is${ノード名}Node(
  node: LexicalNode | null | undefined
): node is ${ノード名}Node {
  return node instanceof ${ノード名}Node
}
```

### 3. エクスポート追加

`nodes/index.ts` に追加:

```typescript
export {
  ${ノード名}Node,
  $create${ノード名}Node,
  $is${ノード名}Node,
} from './${ノード名}Node'
export type { Serialized${ノード名}Node } from './${ノード名}Node'
```

### 4. LexicalEditor.tsx 更新

```typescript
import { ${ノード名}Node } from './nodes/${ノード名}Node'

const initialConfig = {
  nodes: [
    // 既存ノード...
    ${ノード名}Node,
  ],
}
```

### 5. テーマ追加（必要な場合）

`theme.ts` に追加:

```typescript
export const editorTheme: EditorThemeClasses = {
  // ...
  ${ノード名.toLowerCase()}: 'editor-${ノード名.toLowerCase()}',
}
```

### 6. メインindex.ts エクスポート

`index.ts` に追加:

```typescript
export {
  ${ノード名}Node,
  $create${ノード名}Node,
  $is${ノード名}Node,
} from './nodes'
```

## 注意事項

- `.claude/rules/lexical-patterns.md` のパターンに従う
- `.claude/rules/type-safety.md` の型安全ルールを遵守
- exportDOM/importDOM は公開ページ表示に必須
