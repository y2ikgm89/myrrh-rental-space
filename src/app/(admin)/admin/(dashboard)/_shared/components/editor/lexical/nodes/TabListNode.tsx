/**
 * TabList Node
 *
 * @description タブのヘッダーリスト
 * TabsContainerNodeの子として使用
 * 子ノード: TabTitleNode×N
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
export interface SerializedTabListNode extends SerializedElementNode {}

// =============================================================================
// Constants
// =============================================================================

const LIST_CLASS = 'flex border-b bg-muted/50'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabListElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createTabListNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class TabListNode extends ElementNode {
  static getType(): string {
    return 'tab-list'
  }

  static clone(node: TabListNode): TabListNode {
    return new TabListNode(node.__key)
  }

  static importJSON(serializedNode: SerializedTabListNode): TabListNode {
    return $createTabListNode().updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.getAttribute('role') === 'tablist') {
          return {
            conversion: $convertTabListElement,
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

  exportJSON(): SerializedTabListNode {
    return {
      ...super.exportJSON(),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('role', 'tablist')
    element.className = LIST_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('role', 'tablist')
    element.className = LIST_CLASS
    return element
  }

  updateDOM(): boolean {
    return false
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
 * TabListノードを作成する
 *
 * @returns TabListNode インスタンス
 */
export function $createTabListNode(): TabListNode {
  return $applyNodeReplacement(new TabListNode())
}

/**
 * ノードがTabListNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabListNodeの場合true
 */
export function $isTabListNode(
  node: LexicalNode | null | undefined
): node is TabListNode {
  return node instanceof TabListNode
}
