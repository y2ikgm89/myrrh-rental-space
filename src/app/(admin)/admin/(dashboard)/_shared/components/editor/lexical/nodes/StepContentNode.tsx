/**
 * StepContent Node
 *
 * @description ステップのコンテンツ部分
 * StepItemNodeの子として使用
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import { $create, ElementNode } from "lexical";

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepContentElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createStepContentNode();
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class StepContentNode extends ElementNode {
  override $config() {
    return this.config("step-content", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-step-content")) {
          return {
            conversion: $convertStepContentElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-step-content", "true");

    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-step-content", "true");

    return element;
  }

  override updateDOM(): false {
    return false;
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
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
  return $create(StepContentNode);
}

/**
 * ノードがStepContentNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns StepContentNodeの場合true
 */
export function $isStepContentNode(
  node: LexicalNode | null | undefined,
): node is StepContentNode {
  return node instanceof StepContentNode;
}
