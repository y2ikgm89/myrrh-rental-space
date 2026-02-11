/**
 * StepTitle Node
 *
 * @description ステップのタイトル部分
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
export interface SerializedStepTitleNode extends SerializedElementNode {}

// =============================================================================
// Constants
// =============================================================================

const TITLE_CLASS = 'font-medium text-foreground'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepTitleElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createStepTitleNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class StepTitleNode extends ElementNode {
  static getType(): string {
    return 'step-title'
  }

  static clone(node: StepTitleNode): StepTitleNode {
    return new StepTitleNode(node.__key)
  }

  static importJSON(serializedNode: SerializedStepTitleNode): StepTitleNode {
    return $createStepTitleNode().updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      h4: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-step-title')) {
          return {
            conversion: $convertStepTitleElement,
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

  exportJSON(): SerializedStepTitleNode {
    return {
      ...super.exportJSON(),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('h4')
    element.setAttribute('data-step-title', 'true')
    element.className = TITLE_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('h4')
    element.setAttribute('data-step-title', 'true')
    element.className = TITLE_CLASS
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
 * StepTitleノードを作成する
 *
 * @returns StepTitleNode インスタンス
 */
export function $createStepTitleNode(): StepTitleNode {
  return $applyNodeReplacement(new StepTitleNode())
}

/**
 * ノードがStepTitleNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns StepTitleNodeの場合true
 */
export function $isStepTitleNode(
  node: LexicalNode | null | undefined
): node is StepTitleNode {
  return node instanceof StepTitleNode
}
