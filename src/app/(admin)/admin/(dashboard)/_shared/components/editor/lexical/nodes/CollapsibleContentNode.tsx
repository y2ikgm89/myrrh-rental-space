/**
 * Collapsible Content Node
 *
 * @description 折りたたみのコンテンツ部分を表すElementNode
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
} from 'lexical'
import { $applyNodeReplacement, ElementNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SerializedCollapsibleContentNode extends SerializedElementNode {}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleContentElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createCollapsibleContentNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleContentNode extends ElementNode {
  static getType(): string {
    return 'collapsible-content'
  }

  static clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key)
  }

  static importJSON(serializedNode: SerializedCollapsibleContentNode): CollapsibleContentNode {
    return $createCollapsibleContentNode().updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-collapsible-content')) {
          return {
            conversion: $convertCollapsibleContentElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  exportJSON(): SerializedCollapsibleContentNode {
    return {
      ...super.exportJSON(),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-content', 'true')
    element.className = 'px-4 py-3 border-t border-border'
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-content', 'true')
    element.className = 'px-4 py-3 border-t border-border'
    return element
  }

  updateDOM(): false {
    return false
  }

  isShadowRoot(): boolean {
    return true
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * CollapsibleContentノードを作成する
 *
 * @returns CollapsibleContentNode インスタンス
 */
export function $createCollapsibleContentNode(): CollapsibleContentNode {
  return $applyNodeReplacement(new CollapsibleContentNode())
}

/**
 * ノードがCollapsibleContentNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns CollapsibleContentNodeの場合true
 */
export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined
): node is CollapsibleContentNode {
  return node instanceof CollapsibleContentNode
}
