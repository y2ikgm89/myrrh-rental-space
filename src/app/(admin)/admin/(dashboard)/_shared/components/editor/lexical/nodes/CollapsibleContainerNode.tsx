/**
 * Collapsible Container Node
 *
 * @description 折りたたみ可能なコンテナを表すElementNode
 * <details>要素として出力される
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
import { $applyNodeReplacement, ElementNode, $isElementNode, $createParagraphNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export interface SerializedCollapsibleContainerNode extends SerializedElementNode {
  open: boolean
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleContainerElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLDetailsElement
  const isOpen = element.open ?? false
  const node = $createCollapsibleContainerNode(isOpen)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleContainerNode extends ElementNode {
  __open: boolean

  static getType(): string {
    return 'collapsible-container'
  }

  static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key)
  }

  static importJSON(serializedNode: SerializedCollapsibleContainerNode): CollapsibleContainerNode {
    return $createCollapsibleContainerNode(serializedNode.open).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      details: () => ({
        conversion: $convertCollapsibleContainerElement,
        priority: 1,
      }),
    }
  }

  constructor(open: boolean = false, key?: NodeKey) {
    super(key)
    this.__open = open
  }

  exportJSON(): SerializedCollapsibleContainerNode {
    return {
      ...super.exportJSON(),
      open: this.__open,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('details')
    element.className = 'my-4 border border-border rounded-lg overflow-hidden'
    if (this.__open) {
      element.setAttribute('open', 'true')
    }
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-container', 'true')
    element.className = 'my-4 border border-border rounded-lg overflow-hidden'
    if (this.__open) {
      element.setAttribute('data-open', 'true')
    }
    return element
  }

  updateDOM(prevNode: CollapsibleContainerNode, dom: HTMLElement): boolean {
    if (prevNode.__open !== this.__open) {
      if (this.__open) {
        dom.setAttribute('data-open', 'true')
      } else {
        dom.removeAttribute('data-open')
      }
    }
    return false
  }

  getOpen(): boolean {
    return this.getLatest().__open
  }

  setOpen(open: boolean): void {
    const self = this.getWritable()
    self.__open = open
  }

  toggleOpen(): void {
    this.setOpen(!this.getOpen())
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

  collapseAtStart(): boolean {
    // 内容をアンラップして削除
    const children = this.getChildren()
    const paragraph = $createParagraphNode()

    // TitleノードとContentノードの内容を取り出す
    for (const child of children) {
      if ($isElementNode(child)) {
        const grandchildren = child.getChildren()
        for (const grandchild of grandchildren) {
          paragraph.append(grandchild)
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
 * CollapsibleContainerノードを作成する
 *
 * @param open - 初期状態で開いているかどうか
 * @returns CollapsibleContainerNode インスタンス
 */
export function $createCollapsibleContainerNode(open: boolean = false): CollapsibleContainerNode {
  return $applyNodeReplacement(new CollapsibleContainerNode(open))
}

/**
 * ノードがCollapsibleContainerNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns CollapsibleContainerNodeの場合true
 */
export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined
): node is CollapsibleContainerNode {
  return node instanceof CollapsibleContainerNode
}
