/**
 * StepItem Node
 *
 * @description 各ステップを表現するコンテナ
 * 子ノード: StepTitleNode + StepContentNode
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

export interface SerializedStepItemNode extends SerializedElementNode {
  stepNumber: number
}

// =============================================================================
// Constants
// =============================================================================

const ITEM_CLASS = 'flex gap-4'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepItemElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const stepAttr = element.getAttribute('data-step')
  const stepNumber = stepAttr ? parseInt(stepAttr, 10) : 1
  const node = $createStepItemNode(stepNumber)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class StepItemNode extends ElementNode {
  __stepNumber: number

  static getType(): string {
    return 'step-item'
  }

  static clone(node: StepItemNode): StepItemNode {
    return new StepItemNode(node.__stepNumber, node.__key)
  }

  static importJSON(serializedNode: SerializedStepItemNode): StepItemNode {
    return $createStepItemNode(serializedNode.stepNumber).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-step')) {
          return {
            conversion: $convertStepItemElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(stepNumber: number = 1, key?: NodeKey) {
    super(key)
    this.__stepNumber = stepNumber
  }

  exportJSON(): SerializedStepItemNode {
    return {
      ...super.exportJSON(),
      stepNumber: this.__stepNumber,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-step', String(this.__stepNumber))
    element.className = ITEM_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-step', String(this.__stepNumber))
    element.className = ITEM_CLASS
    return element
  }

  updateDOM(prevNode: StepItemNode, dom: HTMLElement): boolean {
    if (prevNode.__stepNumber !== this.__stepNumber) {
      dom.setAttribute('data-step', String(this.__stepNumber))
      return false
    }
    return false
  }

  getStepNumber(): number {
    return this.getLatest().__stepNumber
  }

  setStepNumber(stepNumber: number): void {
    const self = this.getWritable()
    self.__stepNumber = stepNumber
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
 * StepItemノードを作成する
 *
 * @param stepNumber - ステップ番号
 * @returns StepItemNode インスタンス
 */
export function $createStepItemNode(stepNumber: number = 1): StepItemNode {
  return $applyNodeReplacement(new StepItemNode(stepNumber))
}

/**
 * ノードがStepItemNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns StepItemNodeの場合true
 */
export function $isStepItemNode(
  node: LexicalNode | null | undefined
): node is StepItemNode {
  return node instanceof StepItemNode
}
