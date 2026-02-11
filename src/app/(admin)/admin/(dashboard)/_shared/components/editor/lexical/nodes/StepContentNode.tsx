/**
 * StepContent Node
 *
 * @description ステップのコンテンツ部分
 * StepItemNodeの子として使用
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SerializedStepContentNode extends SerializedElementNode {}

// =============================================================================
// Constants
// =============================================================================

const CONTENT_CLASS = 'text-muted-foreground text-sm'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepContentElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createStepContentNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class StepContentNode extends ElementNode {
  static getType(): string {
    return 'step-content'
  }

  static clone(node: StepContentNode): StepContentNode {
    return new StepContentNode(node.__key)
  }

  static importJSON(serializedNode: SerializedStepContentNode): StepContentNode {
    return $createStepContentNode().updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-step-content')) {
          return {
            conversion: $convertStepContentElement,
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

  exportJSON(): SerializedStepContentNode {
    return {
      ...super.exportJSON(),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-step-content', 'true')
    element.className = CONTENT_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-step-content', 'true')
    element.className = CONTENT_CLASS
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
 * StepContentノードを作成する
 *
 * @returns StepContentNode インスタンス
 */
export function $createStepContentNode(): StepContentNode {
  return $applyNodeReplacement(new StepContentNode())
}

/**
 * ノードがStepContentNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns StepContentNodeの場合true
 */
export function $isStepContentNode(
  node: LexicalNode | null | undefined
): node is StepContentNode {
  return node instanceof StepContentNode
}
