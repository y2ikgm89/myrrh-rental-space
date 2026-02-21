---
name: lexical-node
description: Creates custom Lexical editor nodes with DecoratorNode or ElementNode patterns. Use when adding new content types to the rich text editor, such as embeds, callouts, or interactive elements. Implements NodeState API ($config + createState), exportDOM/importDOM, type-safe factory functions, and React Compiler compatible patterns.
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
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CalloutNode.tsx`

### 3. ノードファイル作成

パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/${NodeName}Node.tsx`

**DecoratorNode テンプレート（Reactコンポーネント埋め込み用）:**

NodeState API（`$config` + `createState` + `$getState`/`$setState`）を使用。
`static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `SerializedXxxNode` interface, `$applyNodeReplacement` は**使用禁止**（`$config` が自動生成）。

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
} from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'

// --- State 宣言（ファイルトップレベル） ---
export const ${propName}State = createState('${propName}', {
  parse: (v: unknown): ${Type} =>
    typeof v === 'string' ? v : 'デフォルト値',
})

// --- Decorator Component ---
function ${NodeName}Component({
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
function $convert${NodeName}Element(domNode: Node): null | DOMConversionOutput {
  // DOM→ノード変換ロジック
  return null
}

// --- Node Class ---
export class ${NodeName}Node extends DecoratorNode<ReactElement> {
  // $config() が getType, clone, importJSON, exportJSON を自動生成
  $config() {
    return this.config('${nodename}', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: ${propName}State },
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
    const value = $getState(this, ${propName}State)
    element.setAttribute('data-${prop-name}', value)
    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-${nodename}', 'true')
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    const value = $getState(this, ${propName}State)
    return <${NodeName}Component ${propName}={value} />
  }
}

// --- Factory & Type Guard ---

// 単一プロパティ
export function $create${NodeName}Node(value: ${Type} = 'デフォルト値'): ${NodeName}Node {
  return $setState($create(${NodeName}Node), ${propName}State, value)
}

// 複数プロパティの場合:
// export function $create${NodeName}Node({ prop1, prop2 }: { prop1: string; prop2: number }): ${NodeName}Node {
//   const node = $create(${NodeName}Node)
//   $setState(node, prop1State, prop1)
//   $setState(node, prop2State, prop2)
//   return node
// }

export function $is${NodeName}Node(
  node: LexicalNode | null | undefined
): node is ${NodeName}Node {
  return node instanceof ${NodeName}Node
}
```

**ElementNode テンプレート（テキスト内容を持つブロック用）:**

```typescript
/**
 * ${NodeName} Node
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
export const ${propName}State = createState('${propName}', {
  parse: (v: unknown): ${Type} =>
    typeof v === 'string' ? v : 'デフォルト値',
})

// --- Node Class ---
export class ${NodeName}Node extends ElementNode {
  $config() {
    return this.config('${nodename}', {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: ${propName}State },
      ],
    })
  }

  static importDOM(): DOMConversionMap | null {
    return {}
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    const value = $getState(this, ${propName}State)
    element.setAttribute('data-${prop-name}', value)
    return element
  }

  updateDOM(prevNode: ${NodeName}Node, dom: HTMLElement): boolean {
    // $getStateChange で変更を検出し、属性レベルで差分更新
    const change = $getStateChange(this, prevNode, ${propName}State)
    if (change) {
      const [newValue] = change
      dom.setAttribute('data-${prop-name}', newValue)
    }
    return false  // DOM 再構築は不要
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    const value = $getState(this, ${propName}State)
    element.setAttribute('data-${prop-name}', value)
    return { element }
  }
}

// --- Factory & Type Guard ---

export function $create${NodeName}Node(value: ${Type} = 'デフォルト値'): ${NodeName}Node {
  return $setState($create(${NodeName}Node), ${propName}State, value)
}

export function $is${NodeName}Node(
  node: LexicalNode | null | undefined
): node is ${NodeName}Node {
  return node instanceof ${NodeName}Node
}
```

**ゼロプロパティ ElementNode テンプレート（子ノードのみ保持）:**

```typescript
export class ${NodeName}Node extends ElementNode {
  $config() {
    return this.config('${nodename}', { extends: ElementNode })
  }
  // stateConfigs 不要
}

export function $create${NodeName}Node(): ${NodeName}Node {
  return $create(${NodeName}Node)
}
```

**コンポジットノードテンプレート（Container / Child パターン）:**

複数ノードで構成される複合コンポーネント（Tabs, Steps, Collapsible, PullQuote 等）。
公式 Lexical Playground に準拠したパターン。

Container ノード（ルート）:

```typescript
export class ${NodeName}ContainerNode extends ElementNode {
  $config() {
    return this.config('${nodename}-container', {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: ${propName}State },
      ],
    })
  }

  // --- 必須メソッド ---

  isShadowRoot(): boolean {
    return true  // 編集境界の確立
  }

  canBeEmpty(): boolean {
    return false  // 空コンテナ防止
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  collapseAtStart(): boolean {
    // Backspace でコンポジットノード全体をパラグラフに分解
    const children = this.getChildren()
    const paragraph = $createParagraphNode()

    // noUncheckedIndexedAccess: children[0] is LexicalNode | undefined
    // $isElementNode() accepts undefined and returns false → safe
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

  // exportDOM(), createDOM(), updateDOM() — data-attributes のみ、CSS クラス不使用
}
```

Child ノード（Title / Content / Panel）:

```typescript
export class ${NodeName}ContentNode extends ElementNode {
  $config() {
    return this.config('${nodename}-content', { extends: ElementNode })
  }

  // --- 必須メソッド ---

  isShadowRoot(): boolean {
    return true  // 編集境界の確立
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  // ⚠️ collapseAtStart() は実装しない — isShadowRoot が境界保護を担当
  // ⚠️ insertNewAfter() は CollapsibleTitleNode パターンのみ（必要な場合）
}
```

**重要ルール:**

- Container ノード: `isShadowRoot` + `canBeEmpty` + `collapseAtStart` すべて実装
- Child ノード: `isShadowRoot` のみ実装、`collapseAtStart` は禁止
- exportDOM / createDOM: data-attributes のみ。`config.theme.*` / CSS クラス禁止（両メソッド共通）
- `createDOM` シグネチャ: `override createDOM(_config: EditorConfig): HTMLElement`（未使用でも `_config` 必須）
- updateDOM: `$getStateChange` + `dom.setAttribute()` で差分更新、`return false`

### 4. エクスポート追加

`nodes/index.ts` に追加:

```typescript
export {
  ${NodeName}Node,
  $create${NodeName}Node,
  $is${NodeName}Node,
  ${propName}State,
} from './${NodeName}Node'
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
  ${nodename}: 'editor-${nodename}',
}
```

## プロパティアクセスまとめ

```typescript
// 読み取り
const value = $getState(this, ${propName}State)

// 書き込み
$setState(this, ${propName}State, newValue)

// DOM更新での変更検出
const change = $getStateChange(this, prevNode, ${propName}State)
if (change) {
  const [newValue] = change
  dom.setAttribute('data-${prop-name}', newValue)
}
```

## 重要なルール

詳細は `.claude/rules/lexical-patterns.md` を参照。

- **NodeState API必須**: `$config` + `createState` + `$getState`/`$setState`
- **プロパティ**: JSON serializableのみ（Function, Symbol, Map, Set禁止）
- **exportDOM/importDOM**: 公開ページ表示に必須。data-attributes のみ、CSS クラス不使用
- **型アサーション禁止**: `.claude/rules/type-safety.md` 準拠
- **React Compiler互換**: `.claude/rules/react-patterns.md` 準拠
- **コンポジットノード**: Container に isShadowRoot + canBeEmpty + collapseAtStart、Child に isShadowRoot のみ
- **子ノードの collapseAtStart 禁止**: isShadowRoot が境界保護を担当
- **updateDOM**: `$getStateChange` + `dom.setAttribute()` で差分更新、`return false`
- **禁止**: `static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `SerializedXxxNode` interface, `$applyNodeReplacement`, `__property`, `getWritable()`, `getLatest()`, `new XxxNode()` constructor

## Definition of Done

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] `bun run test:all` で既存テストが通過
- [ ] 既存テストが壊れていないこと
- [ ] `exportJSON()` / `importJSON()` が `$config` で自動生成されること
- [ ] `exportDOM()` / `importDOM()` が正しく往復変換
- [ ] `nodes/index.ts` にエクスポート追加
- [ ] `LexicalEditor.tsx` の initialConfig.nodes に登録
