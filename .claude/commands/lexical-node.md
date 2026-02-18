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

NodeState API（`$config` + `createState` + `$getState`/`$setState`）を使用。
`static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `SerializedXxxNode` interface, `$applyNodeReplacement` は**使用禁止**（`$config` が自動生成）。

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
} from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'

// --- State 宣言（ファイルトップレベル） ---
export const ${プロパティ名}State = createState('${プロパティ名}', {
  parse: (v: unknown): ${型} =>
    typeof v === 'string' ? v : 'デフォルト値',
})

// --- Decorator Component ---
function ${ノード名}Component({
  // プロパティ
}: {
  // 型定義
}): ReactElement {
  return (
    <div>
      {/* コンポーネント実装 */}
    </div>
  )
}

// --- DOM Conversion ---
function $convert${ノード名}Element(domNode: Node): null | DOMConversionOutput {
  // DOM→ノード変換ロジック
  return null
}

// --- Node Class ---
export class ${ノード名}Node extends DecoratorNode<ReactElement> {
  // $config() が getType, clone, importJSON, exportJSON を自動生成
  $config() {
    return this.config('${ノード名.toLowerCase()}', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: ${プロパティ名}State },
      ],
    })
  }

  static importDOM(): DOMConversionMap | null {
    return {
      // DOM要素 → 変換関数マッピング
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    const value = $getState(this, ${プロパティ名}State)
    element.setAttribute('data-${プロパティ名}', value)
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
    const value = $getState(this, ${プロパティ名}State)
    return <${ノード名}Component ${プロパティ名}={value} />
  }
}

// --- Factory & Type Guard ---

// 単一プロパティ
export function $create${ノード名}Node(value: ${型} = 'デフォルト値'): ${ノード名}Node {
  return $setState($create(${ノード名}Node), ${プロパティ名}State, value)
}

// 複数プロパティの場合:
// export function $create${ノード名}Node({ prop1, prop2 }: { prop1: string; prop2: number }): ${ノード名}Node {
//   const node = $create(${ノード名}Node)
//   $setState(node, prop1State, prop1)
//   $setState(node, prop2State, prop2)
//   return node
// }

export function $is${ノード名}Node(
  node: LexicalNode | null | undefined
): node is ${ノード名}Node {
  return node instanceof ${ノード名}Node
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
} from 'lexical'
import { $create, $getState, $getStateChange, $setState, createState, ElementNode } from 'lexical'

// --- State 宣言 ---
export const ${プロパティ名}State = createState('${プロパティ名}', {
  parse: (v: unknown): ${型} =>
    typeof v === 'string' ? v : 'デフォルト値',
})

// --- Node Class ---
export class ${ノード名}Node extends ElementNode {
  $config() {
    return this.config('${ノード名.toLowerCase()}', {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: ${プロパティ名}State },
      ],
    })
  }

  static importDOM(): DOMConversionMap | null {
    return {}
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    const value = $getState(this, ${プロパティ名}State)
    element.setAttribute('data-${プロパティ名}', value)
    element.className = config.theme.${ノード名.toLowerCase()} || ''
    return element
  }

  updateDOM(prevNode: ${ノード名}Node, dom: HTMLElement): boolean {
    // $getStateChange で変更を検出し、属性レベルで差分更新
    const change = $getStateChange(this, prevNode, ${プロパティ名}State)
    if (change) {
      const [newValue] = change
      dom.setAttribute('data-${プロパティ名}', newValue)
    }
    return false  // DOM 再構築は不要
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    const value = $getState(this, ${プロパティ名}State)
    element.setAttribute('data-${プロパティ名}', value)
    return { element }
  }
}

// --- Factory & Type Guard ---

export function $create${ノード名}Node(value: ${型} = 'デフォルト値'): ${ノード名}Node {
  return $setState($create(${ノード名}Node), ${プロパティ名}State, value)
}

export function $is${ノード名}Node(
  node: LexicalNode | null | undefined
): node is ${ノード名}Node {
  return node instanceof ${ノード名}Node
}
```

**ゼロプロパティ ElementNode テンプレート（子ノードのみ保持）:**

```typescript
export class ${ノード名}Node extends ElementNode {
  $config() {
    return this.config('${ノード名.toLowerCase()}', { extends: ElementNode })
  }
  // stateConfigs 不要
}

export function $create${ノード名}Node(): ${ノード名}Node {
  return $create(${ノード名}Node)
}
```

**コンポジットノードテンプレート（Container / Child パターン）:**

複数ノードで構成される複合コンポーネント。公式 Lexical Playground 準拠。

Container ノード:

```typescript
export class ${ノード名}ContainerNode extends ElementNode {
  $config() {
    return this.config('${ノード名.toLowerCase()}-container', {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: ${プロパティ名}State }],
    })
  }

  isShadowRoot(): boolean { return true }
  canBeEmpty(): boolean { return false }
  canInsertTextBefore(): false { return false }
  canInsertTextAfter(): false { return false }

  collapseAtStart(): boolean {
    const children = this.getChildren()
    const paragraph = $createParagraphNode()
    if (children.length > 0) {
      const firstChild = children[0]
      if ($isElementNode(firstChild)) {
        for (const child of firstChild.getChildren()) {
          paragraph.append(child)
        }
      }
    }
    this.replace(paragraph)
    return true
  }
}
```

Child ノード（Title / Content / Panel）:

```typescript
export class ${ノード名}ContentNode extends ElementNode {
  $config() {
    return this.config('${ノード名.toLowerCase()}-content', { extends: ElementNode })
  }

  isShadowRoot(): boolean { return true }
  canInsertTextBefore(): false { return false }
  canInsertTextAfter(): false { return false }

  // ⚠️ collapseAtStart は実装しない — isShadowRoot が境界保護を担当
}
```

**ルール:** Container に isShadowRoot + canBeEmpty + collapseAtStart。Child に isShadowRoot のみ。

### 3. エクスポート追加

`nodes/index.ts` に追加:

```typescript
export {
  ${ノード名}Node,
  $create${ノード名}Node,
  $is${ノード名}Node,
  ${プロパティ名}State,
} from './${ノード名}Node'
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

```typescript
export {
  ${ノード名}Node,
  $create${ノード名}Node,
  $is${ノード名}Node,
} from './nodes'
```

## プロパティアクセスまとめ

```typescript
// 読み取り
const value = $getState(this, ${プロパティ名}State)

// 書き込み
$setState(this, ${プロパティ名}State, newValue)

// DOM更新での変更検出
const change = $getStateChange(this, prevNode, ${プロパティ名}State)
if (change) {
  const [newValue] = change
  dom.setAttribute('data-${プロパティ名}', newValue)
}
```

## 注意事項

- `.claude/rules/lexical-patterns.md` のパターンに従う
- `.claude/rules/type-safety.md` の型安全ルールを遵守
- exportDOM/importDOM は公開ページ表示に必須。data-attributes のみ、CSS クラス不使用
- コンポジットノード: Container に isShadowRoot + canBeEmpty + collapseAtStart、Child に isShadowRoot のみ
- 子ノードの collapseAtStart 禁止（isShadowRoot が境界保護を担当）
- updateDOM: `$getStateChange` + `dom.setAttribute()` で差分更新、`return false`
- **禁止**: `static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `SerializedXxxNode` interface, `$applyNodeReplacement`, `__property`, `getWritable()`, `getLatest()`, `new XxxNode()` constructor
