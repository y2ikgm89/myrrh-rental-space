/**
 * Layout Item Node
 *
 * @description レイアウトコンテナ内の個別カラム
 *
 * 公式Playgroundパターンに準拠
 * - ElementNodeを拡張
 * - LayoutContainerNode内に配置
 * - isShadowRoot()でネスト境界を形成
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from 'lexical'
import { $create, $createParagraphNode, ElementNode } from 'lexical'
import { $isLayoutContainerNode } from './LayoutContainerNode'

// =============================================================================
// Type Guard (declared early for use in class)
// =============================================================================

export function $isLayoutItemNode(
  node: LexicalNode | null | undefined
): node is LayoutItemNode {
  return node instanceof LayoutItemNode
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertLayoutItemElement(): DOMConversionOutput | null {
  const node = $createLayoutItemNode()
  return { node }
}

// =============================================================================
// Node
// =============================================================================

export class LayoutItemNode extends ElementNode {
  override $config() {
    return this.config('layout-item', { extends: ElementNode })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (!element.hasAttribute('data-lexical-layout-item')) {
          return null
        }
        return {
          conversion: $convertLayoutItemElement,
          priority: 2,
        }
      },
    }
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div')
    dom.setAttribute('data-lexical-layout-item', 'true')

    if (config.theme['layoutItem']) {
      dom.className = config.theme['layoutItem']
    }

    return dom
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-lexical-layout-item', 'true')
    return { element }
  }

  override updateDOM(): boolean {
    return false
  }

  // レイアウトアイテムは選択境界として機能
  override isShadowRoot(): boolean {
    return true
  }

  // 先頭でBackspace時の挙動
  override collapseAtStart(): boolean {
    const parent = this.getParent()
    if (!$isLayoutContainerNode(parent)) {
      return false
    }

    const siblings = parent.getChildren()
    const isFirst = siblings[0] === this
    const allEmpty = siblings.every(
      (sibling) =>
        $isLayoutItemNode(sibling) &&
        sibling.getChildren().length === 0
    )

    if (isFirst && allEmpty) {
      // 全カラムが空なら、コンテナを段落に置換
      const paragraph = $createParagraphNode()
      parent.replace(paragraph)
      paragraph.select()
      return true
    }

    return false
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

export function $createLayoutItemNode(): LayoutItemNode {
  return $create(LayoutItemNode)
}
