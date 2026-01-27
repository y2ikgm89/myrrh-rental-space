/**
 * Layout Container Node
 *
 * @description CSSグリッドベースのカラムレイアウトコンテナ
 *
 * 公式Playgroundパターンに準拠
 * - ElementNodeを拡張
 * - templateColumnsでグリッド列を定義
 * - isShadowRoot()でネスト境界を形成
 */

import {
  $applyNodeReplacement,
  ElementNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type SerializedLayoutContainerNode = Spread<
  {
    templateColumns: string
  },
  SerializedElementNode
>

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertLayoutContainerElement(
  element: HTMLElement
): DOMConversionOutput | null {
  const templateColumns =
    element.style.gridTemplateColumns || element.dataset.layoutTemplate || '1fr 1fr'
  const node = $createLayoutContainerNode(templateColumns)
  return { node }
}

// =============================================================================
// Node
// =============================================================================

export class LayoutContainerNode extends ElementNode {
  __templateColumns: string

  static getType(): string {
    return 'layout-container'
  }

  static clone(node: LayoutContainerNode): LayoutContainerNode {
    return new LayoutContainerNode(node.__templateColumns, node.__key)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (!element.hasAttribute('data-lexical-layout-container')) {
          return null
        }
        return {
          conversion: $convertLayoutContainerElement,
          priority: 2,
        }
      },
    }
  }

  static importJSON(json: SerializedLayoutContainerNode): LayoutContainerNode {
    return $createLayoutContainerNode(json.templateColumns)
  }

  constructor(templateColumns: string = '1fr 1fr', key?: NodeKey) {
    super(key)
    this.__templateColumns = templateColumns
  }

  exportJSON(): SerializedLayoutContainerNode {
    return {
      ...super.exportJSON(),
      templateColumns: this.__templateColumns,
      type: 'layout-container',
      version: 1,
    }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div')
    dom.setAttribute('data-lexical-layout-container', 'true')
    dom.style.display = 'grid'
    dom.style.gridTemplateColumns = this.__templateColumns
    dom.style.gap = '1rem'

    if (config.theme.layoutContainer) {
      dom.className = config.theme.layoutContainer
    }

    return dom
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-lexical-layout-container', 'true')
    element.setAttribute('data-layout-template', this.__templateColumns)
    element.style.display = 'grid'
    element.style.gridTemplateColumns = this.__templateColumns
    element.style.gap = '1rem'
    return { element }
  }

  updateDOM(
    prevNode: LayoutContainerNode,
    dom: HTMLElement
  ): boolean {
    if (prevNode.__templateColumns !== this.__templateColumns) {
      dom.style.gridTemplateColumns = this.__templateColumns
      return false
    }
    return false
  }

  getTemplateColumns(): string {
    return this.getLatest().__templateColumns
  }

  setTemplateColumns(templateColumns: string): void {
    const self = this.getWritable()
    self.__templateColumns = templateColumns
  }

  // レイアウトコンテナは選択境界として機能
  isShadowRoot(): boolean {
    return true
  }

  // 空のコンテナを許可しない
  canBeEmpty(): boolean {
    return false
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

export function $createLayoutContainerNode(
  templateColumns: string = '1fr 1fr'
): LayoutContainerNode {
  return $applyNodeReplacement(new LayoutContainerNode(templateColumns))
}

export function $isLayoutContainerNode(
  node: LexicalNode | null | undefined
): node is LayoutContainerNode {
  return node instanceof LayoutContainerNode
}
