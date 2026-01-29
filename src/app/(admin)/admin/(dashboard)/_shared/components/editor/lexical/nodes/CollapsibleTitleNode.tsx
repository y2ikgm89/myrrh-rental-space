/**
 * Collapsible Title Node
 *
 * @description 折りたたみのタイトル部分を表すElementNode
 * <summary>要素として出力される
 */

'use client'

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  RangeSelection,
} from 'lexical'
import { $applyNodeReplacement, ElementNode } from 'lexical'
import { $isCollapsibleContainerNode } from './CollapsibleContainerNode'
import { $isCollapsibleContentNode } from './CollapsibleContentNode'

// =============================================================================
// Types
// =============================================================================

export type SerializedCollapsibleTitleNode = SerializedElementNode

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleTitleElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createCollapsibleTitleNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleTitleNode extends ElementNode {
  static getType(): string {
    return 'collapsible-title'
  }

  static clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
    return new CollapsibleTitleNode(node.__key)
  }

  static importJSON(_serializedNode: SerializedCollapsibleTitleNode): CollapsibleTitleNode {
    return $createCollapsibleTitleNode()
  }

  static importDOM(): DOMConversionMap | null {
    return {
      summary: () => ({
        conversion: $convertCollapsibleTitleElement,
        priority: 1,
      }),
    }
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  exportJSON(): SerializedCollapsibleTitleNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-title',
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('summary')
    element.className = 'px-4 py-3 cursor-pointer font-medium bg-muted/50 flex items-center gap-2 select-none'
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-title', 'true')
    element.className = 'px-4 py-3 cursor-pointer font-medium bg-muted/50 flex items-center gap-2'
    return element
  }

  updateDOM(): false {
    return false
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  collapseAtStart(_selection: RangeSelection): boolean {
    // Container全体をアンラップ
    const container = this.getParent()
    if ($isCollapsibleContainerNode(container)) {
      return container.collapseAtStart()
    }
    return false
  }

  insertNewAfter(_selection: RangeSelection, restoreSelection = true): null | ElementNode {
    // Enterキーで折りたたみを開いてContentノードにフォーカス
    const container = this.getParent()
    if ($isCollapsibleContainerNode(container)) {
      container.setOpen(true)
      const content = container.getChildren().find($isCollapsibleContentNode)
      if (content) {
        const firstChild = content.getFirstChild()
        if (firstChild) {
          if (restoreSelection) {
            firstChild.selectStart()
          }
          return null
        }
      }
    }
    return null
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * CollapsibleTitleノードを作成する
 *
 * @returns CollapsibleTitleNode インスタンス
 */
export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return $applyNodeReplacement(new CollapsibleTitleNode())
}

/**
 * ノードがCollapsibleTitleNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns CollapsibleTitleNodeの場合true
 */
export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined
): node is CollapsibleTitleNode {
  return node instanceof CollapsibleTitleNode
}
