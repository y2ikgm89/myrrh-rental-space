/**
 * TabPanel Node
 *
 * @description 各タブのコンテンツパネル
 * TabsContainerNodeの子として使用
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

export type SerializedTabPanelNode = Spread<
  {
    tabIndex: number
    isActive: boolean
  },
  SerializedElementNode
>

// =============================================================================
// Constants
// =============================================================================

const BASE_CLASS = 'p-4'
const HIDDEN_CLASS = 'hidden'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabPanelElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const indexAttr = element.getAttribute('data-tab-index')
  const tabIndex = indexAttr ? parseInt(indexAttr, 10) : 0
  const isActive = !element.classList.contains('hidden')
  const node = $createTabPanelNode(tabIndex, isActive)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class TabPanelNode extends ElementNode {
  __tabIndex: number
  __isActive: boolean

  static getType(): string {
    return 'tab-panel'
  }

  static clone(node: TabPanelNode): TabPanelNode {
    return new TabPanelNode(node.__tabIndex, node.__isActive, node.__key)
  }

  static importJSON(serializedNode: SerializedTabPanelNode): TabPanelNode {
    return $createTabPanelNode(serializedNode.tabIndex, serializedNode.isActive)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.getAttribute('role') === 'tabpanel') {
          return {
            conversion: $convertTabPanelElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(tabIndex: number = 0, isActive: boolean = true, key?: NodeKey) {
    super(key)
    this.__tabIndex = tabIndex
    this.__isActive = isActive
  }

  exportJSON(): SerializedTabPanelNode {
    return {
      ...super.exportJSON(),
      type: 'tab-panel',
      tabIndex: this.__tabIndex,
      isActive: this.__isActive,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('role', 'tabpanel')
    element.setAttribute('data-tab-index', String(this.__tabIndex))
    element.className = this.__isActive ? BASE_CLASS : `${BASE_CLASS} ${HIDDEN_CLASS}`
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('role', 'tabpanel')
    element.setAttribute('data-tab-index', String(this.__tabIndex))
    element.className = this.__isActive ? BASE_CLASS : `${BASE_CLASS} ${HIDDEN_CLASS}`
    return element
  }

  updateDOM(prevNode: TabPanelNode, dom: HTMLElement): boolean {
    if (prevNode.__tabIndex !== this.__tabIndex) {
      dom.setAttribute('data-tab-index', String(this.__tabIndex))
    }
    if (prevNode.__isActive !== this.__isActive) {
      dom.className = this.__isActive ? BASE_CLASS : `${BASE_CLASS} ${HIDDEN_CLASS}`
    }
    return false
  }

  getTabIndex(): number {
    return this.getLatest().__tabIndex
  }

  setTabIndex(tabIndex: number): void {
    const self = this.getWritable()
    self.__tabIndex = tabIndex
  }

  getIsActive(): boolean {
    return this.getLatest().__isActive
  }

  setIsActive(isActive: boolean): void {
    const self = this.getWritable()
    self.__isActive = isActive
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

    // タブコンテナ全体を置換
    const parent = this.getParent()
    if (parent) {
      parent.replace(paragraph)
    }
    return true
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * TabPanelノードを作成する
 *
 * @param tabIndex - タブのインデックス
 * @param isActive - アクティブ状態
 * @returns TabPanelNode インスタンス
 */
export function $createTabPanelNode(tabIndex: number = 0, isActive: boolean = true): TabPanelNode {
  return $applyNodeReplacement(new TabPanelNode(tabIndex, isActive))
}

/**
 * ノードがTabPanelNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabPanelNodeの場合true
 */
export function $isTabPanelNode(
  node: LexicalNode | null | undefined
): node is TabPanelNode {
  return node instanceof TabPanelNode
}
