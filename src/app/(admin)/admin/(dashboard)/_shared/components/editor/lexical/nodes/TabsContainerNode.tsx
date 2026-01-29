/**
 * TabsContainer Node
 *
 * @description タブ切り替えの親コンテナ
 * 子ノード: TabListNode + TabPanelNode×N
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
  Spread,
} from 'lexical'
import { $applyNodeReplacement, ElementNode, $createParagraphNode, $isElementNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type SerializedTabsContainerNode = Spread<
  {
    activeIndex: number
  },
  SerializedElementNode
>

// =============================================================================
// Constants
// =============================================================================

const CONTAINER_CLASS = 'my-4 border rounded-lg overflow-hidden'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabsContainerElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const activeAttr = element.getAttribute('data-tabs-active')
  const activeIndex = activeAttr ? parseInt(activeAttr, 10) : 0
  const node = $createTabsContainerNode(activeIndex)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class TabsContainerNode extends ElementNode {
  __activeIndex: number

  static getType(): string {
    return 'tabs-container'
  }

  static clone(node: TabsContainerNode): TabsContainerNode {
    return new TabsContainerNode(node.__activeIndex, node.__key)
  }

  static importJSON(serializedNode: SerializedTabsContainerNode): TabsContainerNode {
    return $createTabsContainerNode(serializedNode.activeIndex)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-tabs-container')) {
          return {
            conversion: $convertTabsContainerElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(activeIndex: number = 0, key?: NodeKey) {
    super(key)
    this.__activeIndex = activeIndex
  }

  exportJSON(): SerializedTabsContainerNode {
    return {
      ...super.exportJSON(),
      type: 'tabs-container',
      activeIndex: this.__activeIndex,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-tabs-container', 'true')
    element.setAttribute('data-tabs-active', String(this.__activeIndex))
    element.className = CONTAINER_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-tabs-container', 'true')
    element.setAttribute('data-tabs-active', String(this.__activeIndex))
    element.className = CONTAINER_CLASS
    return element
  }

  updateDOM(prevNode: TabsContainerNode, dom: HTMLElement): boolean {
    if (prevNode.__activeIndex !== this.__activeIndex) {
      dom.setAttribute('data-tabs-active', String(this.__activeIndex))
      return false
    }
    return false
  }

  getActiveIndex(): number {
    return this.getLatest().__activeIndex
  }

  setActiveIndex(index: number): void {
    const self = this.getWritable()
    self.__activeIndex = index
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  collapseAtStart(): boolean {
    const children = this.getChildren()
    const paragraph = $createParagraphNode()

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
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * TabsContainerノードを作成する
 *
 * @param activeIndex - アクティブなタブのインデックス
 * @returns TabsContainerNode インスタンス
 */
export function $createTabsContainerNode(activeIndex: number = 0): TabsContainerNode {
  return $applyNodeReplacement(new TabsContainerNode(activeIndex))
}

/**
 * ノードがTabsContainerNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabsContainerNodeの場合true
 */
export function $isTabsContainerNode(
  node: LexicalNode | null | undefined
): node is TabsContainerNode {
  return node instanceof TabsContainerNode
}
