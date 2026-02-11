/**
 * StepsContainer Node
 *
 * @description ステップリストの親コンテナ
 * 子ノード: StepItemNode×N
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

export type StepsStyle = 'numbered' | 'icon' | 'timeline'

export const STEPS_STYLES: readonly StepsStyle[] = ['numbered', 'icon', 'timeline'] as const

export interface SerializedStepsContainerNode extends SerializedElementNode {
  stepsStyle: StepsStyle
}

// =============================================================================
// Type Guard (Set-based pattern for type safety)
// =============================================================================

const STEPS_STYLE_SET = new Set<string>(STEPS_STYLES)

export function isStepsStyle(value: string): value is StepsStyle {
  return STEPS_STYLE_SET.has(value)
}

// =============================================================================
// Constants
// =============================================================================

const STYLE_CLASSES: Record<StepsStyle, string> = {
  numbered: '',
  icon: '',
  timeline: 'border-l-2 border-primary/30 ml-4',
}

const BASE_CLASS = 'my-6 space-y-4'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepsContainerElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const styleAttr = element.getAttribute('data-steps-style')
  const style = styleAttr && isStepsStyle(styleAttr) ? styleAttr : 'numbered'
  const node = $createStepsContainerNode(style)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class StepsContainerNode extends ElementNode {
  __stepsStyle: StepsStyle

  static getType(): string {
    return 'steps-container'
  }

  static clone(node: StepsContainerNode): StepsContainerNode {
    return new StepsContainerNode(node.__stepsStyle, node.__key)
  }

  static importJSON(serializedNode: SerializedStepsContainerNode): StepsContainerNode {
    return $createStepsContainerNode(serializedNode.stepsStyle).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-steps')) {
          return {
            conversion: $convertStepsContainerElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(stepsStyle: StepsStyle = 'numbered', key?: NodeKey) {
    super(key)
    this.__stepsStyle = stepsStyle
  }

  exportJSON(): SerializedStepsContainerNode {
    return {
      ...super.exportJSON(),
      stepsStyle: this.__stepsStyle,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-steps', 'true')
    element.setAttribute('data-steps-style', this.__stepsStyle)
    element.className = `${BASE_CLASS} ${STYLE_CLASSES[this.__stepsStyle]}`
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-steps', 'true')
    element.setAttribute('data-steps-style', this.__stepsStyle)
    element.className = `${BASE_CLASS} ${STYLE_CLASSES[this.__stepsStyle]}`
    return element
  }

  updateDOM(prevNode: StepsContainerNode, dom: HTMLElement): boolean {
    if (prevNode.__stepsStyle !== this.__stepsStyle) {
      dom.setAttribute('data-steps-style', this.__stepsStyle)
      dom.className = `${BASE_CLASS} ${STYLE_CLASSES[this.__stepsStyle]}`
      return false
    }
    return false
  }

  getStepsStyle(): StepsStyle {
    return this.getLatest().__stepsStyle
  }

  setStepsStyle(style: StepsStyle): void {
    const self = this.getWritable()
    self.__stepsStyle = style
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
 * StepsContainerノードを作成する
 *
 * @param stepsStyle - ステップスタイル
 * @returns StepsContainerNode インスタンス
 */
export function $createStepsContainerNode(stepsStyle: StepsStyle = 'numbered'): StepsContainerNode {
  return $applyNodeReplacement(new StepsContainerNode(stepsStyle))
}

/**
 * ノードがStepsContainerNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns StepsContainerNodeの場合true
 */
export function $isStepsContainerNode(
  node: LexicalNode | null | undefined
): node is StepsContainerNode {
  return node instanceof StepsContainerNode
}
