/**
 * StepItem Node
 *
 * @description 各ステップを表現するコンテナ
 * 子ノード: StepTitleNode + StepContentNode
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
} from "lexical";

// =============================================================================
// State
// =============================================================================

export const stepNumberState = createState("stepNumber", {
  parse: (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 1,
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepItemElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const stepAttr = element.getAttribute("data-step");
  const stepNumber = stepAttr ? parseInt(stepAttr, 10) : 1;
  const node = $createStepItemNode(stepNumber);
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class StepItemNode extends ElementNode {
  override $config() {
    return this.config("step-item", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: stepNumberState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-step")) {
          return {
            conversion: $convertStepItemElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const stepNumber = $getState(this, stepNumberState);
    const element = document.createElement("div");
    element.setAttribute("data-step", String(stepNumber));

    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const stepNumber = $getState(this, stepNumberState);
    const element = document.createElement("div");
    element.setAttribute("data-step", String(stepNumber));

    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const change = $getStateChange(this, prevNode, stepNumberState);
    if (change !== null) {
      const [newStepNumber] = change;
      dom.setAttribute("data-step", String(newStepNumber));
    }
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
 * StepItemノードを作成する
 *
 * @param stepNumber - ステップ番号
 * @returns StepItemNode インスタンス
 */
export function $createStepItemNode(stepNumber: number = 1): StepItemNode {
  return $setState($create(StepItemNode), stepNumberState, stepNumber);
}

/**
 * ノードがStepItemNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns StepItemNodeの場合true
 */
export function $isStepItemNode(
  node: LexicalNode | null | undefined,
): node is StepItemNode {
  return node instanceof StepItemNode;
}
