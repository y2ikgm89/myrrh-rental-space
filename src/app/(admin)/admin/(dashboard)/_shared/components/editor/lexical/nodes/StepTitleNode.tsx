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
} from 'lexical'
import { $create, ElementNode } from 'lexical'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepTitleElement(_element: HTMLElement): null | DOMConversionOutput {
  const node = $createStepTitleNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class StepTitleNode extends ElementNode {
  override $config() {
    return this.config('step-title', { extends: ElementNode })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      h4: (element: HTMLElement) => {
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

  override exportDOM(): DOMExportOutput {
    const element = document.createElement('h4')
    element.setAttribute('data-step-title', 'true')

    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('h4')
    element.setAttribute('data-step-title', 'true')

    return element
  }

  override updateDOM(): boolean {
    return false
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
 * StepTitleノードを作成する
 *
 * @returns StepTitleNode インスタンス
 */
export function $createStepTitleNode(): StepTitleNode {
  return $create(StepTitleNode)
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
