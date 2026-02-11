/**
 * TabTitle Node
 *
 * @description 各タブのタイトル（ボタン）
 * TabListNodeの子として使用
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
import { $applyNodeReplacement, ElementNode, $createParagraphNode, $isElementNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export interface SerializedTabTitleNode extends SerializedElementNode {
  tabIndex: number
  isActive: boolean
}

// =============================================================================
// Constants
// =============================================================================

const BASE_CLASS = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer select-none'
const ACTIVE_CLASS = 'border-primary text-primary bg-background'
const INACTIVE_CLASS = 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabTitleElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const indexAttr = element.getAttribute('data-tab-index')
  const tabIndex = indexAttr ? parseInt(indexAttr, 10) : 0
  const isActive = element.getAttribute('aria-selected') === 'true'
  const node = $createTabTitleNode(tabIndex, isActive)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class TabTitleNode extends ElementNode {
  __tabIndex: number
  __isActive: boolean

  static getType(): string {
    return 'tab-title'
  }

  static clone(node: TabTitleNode): TabTitleNode {
    return new TabTitleNode(node.__tabIndex, node.__isActive, node.__key)
  }

  static importJSON(serializedNode: SerializedTabTitleNode): TabTitleNode {
    return $createTabTitleNode(serializedNode.tabIndex, serializedNode.isActive)
      .updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      button: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.getAttribute('role') === 'tab') {
          return {
            conversion: $convertTabTitleElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(tabIndex: number = 0, isActive: boolean = false, key?: NodeKey) {
    super(key)
    this.__tabIndex = tabIndex
    this.__isActive = isActive
  }

  exportJSON(): SerializedTabTitleNode {
    return {
      ...super.exportJSON(),
      tabIndex: this.__tabIndex,
      isActive: this.__isActive,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('button')
    element.setAttribute('role', 'tab')
    element.setAttribute('data-tab-index', String(this.__tabIndex))
    element.setAttribute('aria-selected', String(this.__isActive))
    element.className = `${BASE_CLASS} ${this.__isActive ? ACTIVE_CLASS : INACTIVE_CLASS}`
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('role', 'tab')
    element.setAttribute('data-tab-index', String(this.__tabIndex))
    element.setAttribute('aria-selected', String(this.__isActive))
    element.className = `${BASE_CLASS} ${this.__isActive ? ACTIVE_CLASS : INACTIVE_CLASS}`
    return element
  }

  updateDOM(prevNode: TabTitleNode, dom: HTMLElement): boolean {
    if (prevNode.__tabIndex !== this.__tabIndex) {
      dom.setAttribute('data-tab-index', String(this.__tabIndex))
    }
    if (prevNode.__isActive !== this.__isActive) {
      dom.setAttribute('aria-selected', String(this.__isActive))
      dom.className = `${BASE_CLASS} ${this.__isActive ? ACTIVE_CLASS : INACTIVE_CLASS}`
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
      const grandParent = parent.getParent()
      if (grandParent) {
        grandParent.replace(paragraph)
      }
    }
    return true
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * TabTitleノードを作成する
 *
 * @param tabIndex - タブのインデックス
 * @param isActive - アクティブ状態
 * @returns TabTitleNode インスタンス
 */
export function $createTabTitleNode(tabIndex: number = 0, isActive: boolean = false): TabTitleNode {
  return $applyNodeReplacement(new TabTitleNode(tabIndex, isActive))
}

/**
 * ノードがTabTitleNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabTitleNodeの場合true
 */
export function $isTabTitleNode(
  node: LexicalNode | null | undefined
): node is TabTitleNode {
  return node instanceof TabTitleNode
}
