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
} from 'lexical'
import { $create, $getState, $getStateChange, $setState, createState, ElementNode } from 'lexical'

// =============================================================================
// State
// =============================================================================

export const tabPanelIndexState = createState('tabIndex', {
  parse: (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0,
})

export const tabPanelActiveState = createState('isActive', {
  parse: (v: unknown): boolean => typeof v === 'boolean' ? v : true,
})

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabPanelElement(element: HTMLElement): null | DOMConversionOutput {
  const indexAttr = element.getAttribute('data-tab-index')
  const tabIndex = indexAttr ? parseInt(indexAttr, 10) : 0
  const isActive = element.getAttribute('aria-hidden') !== 'true'
  const node = $createTabPanelNode(tabIndex, isActive)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class TabPanelNode extends ElementNode {
  override $config() {
    return this.config('tab-panel', {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: tabPanelIndexState },
        { flat: true, stateConfig: tabPanelActiveState },
      ],
    })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
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

  override exportDOM(): DOMExportOutput {
    const tabIndex = $getState(this, tabPanelIndexState)
    const isActive = $getState(this, tabPanelActiveState)
    const element = document.createElement('div')
    element.setAttribute('role', 'tabpanel')
    element.setAttribute('data-tab-index', String(tabIndex))
    if (!isActive) element.setAttribute('aria-hidden', 'true')
    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const tabIndex = $getState(this, tabPanelIndexState)
    const isActive = $getState(this, tabPanelActiveState)
    const element = document.createElement('div')
    element.setAttribute('role', 'tabpanel')
    element.setAttribute('data-tab-index', String(tabIndex))
    if (!isActive) element.setAttribute('aria-hidden', 'true')
    return element
  }

  override updateDOM(prevNode: TabPanelNode, dom: HTMLElement): boolean {
    const indexChange = $getStateChange(this, prevNode, tabPanelIndexState)
    if (indexChange) {
      const [newIndex] = indexChange
      dom.setAttribute('data-tab-index', String(newIndex))
    }
    const activeChange = $getStateChange(this, prevNode, tabPanelActiveState)
    if (activeChange) {
      const [newIsActive] = activeChange
      if (newIsActive) {
        dom.removeAttribute('aria-hidden')
      } else {
        dom.setAttribute('aria-hidden', 'true')
      }
    }
    return false
  }

  override isShadowRoot(): boolean {
    return true
  }

  override canInsertTextBefore(): false {
    return false
  }

  override canInsertTextAfter(): false {
    return false
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
  const node = $create(TabPanelNode)
  $setState(node, tabPanelIndexState, tabIndex)
  $setState(node, tabPanelActiveState, isActive)
  return node
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
