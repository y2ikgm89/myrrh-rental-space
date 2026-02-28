/**
 * StepsContainer Node
 *
 * @description ステップリストの親コンテナ
 * 子ノード: StepItemNode×N
 */

"use client";

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
  $createParagraphNode,
  $isElementNode,
} from "lexical";
import { createEnumGuard } from "../config/type-guards";
import { isAccentColor, type AccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export type StepsStyle = "numbered" | "big" | "small" | "icon" | "timeline";

export type StepsShape = "circle" | "square";

export type StepsFill = "filled" | "outline";

export const STEPS_STYLES: readonly StepsStyle[] = [
  "numbered",
  "big",
  "small",
  "icon",
  "timeline",
] as const;

export const STEPS_SHAPES: readonly StepsShape[] = [
  "circle",
  "square",
] as const;

export const STEPS_FILLS: readonly StepsFill[] = ["filled", "outline"] as const;

// =============================================================================
// Type Guards
// =============================================================================

export const isStepsStyle = createEnumGuard<StepsStyle>(STEPS_STYLES);
export const isStepsShape = createEnumGuard<StepsShape>(STEPS_SHAPES);
export const isStepsFill = createEnumGuard<StepsFill>(STEPS_FILLS);

// =============================================================================
// State
// =============================================================================

export const stepsStyleState = createState("stepsStyle", {
  parse: (v: unknown): StepsStyle =>
    typeof v === "string" && isStepsStyle(v) ? v : "numbered",
});

export const stepsLabelState = createState("stepsLabel", {
  parse: (v: unknown): string => (typeof v === "string" ? v : "STEP"),
});

export const stepsShapeState = createState("stepsShape", {
  parse: (v: unknown): StepsShape =>
    typeof v === "string" && isStepsShape(v) ? v : "circle",
});

export const startNumberState = createState("startNumber", {
  parse: (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 1 ? v : 1,
});

export const stepsFillState = createState("stepsFill", {
  parse: (v: unknown): StepsFill =>
    typeof v === "string" && isStepsFill(v) ? v : "filled",
});

export const stepsColorState = createState("stepsColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertStepsContainerElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const styleAttr = element.getAttribute("data-steps-style");
  const style = styleAttr && isStepsStyle(styleAttr) ? styleAttr : "numbered";
  const labelAttr = element.getAttribute("data-steps-label");
  const shapeAttr = element.getAttribute("data-steps-shape");
  const startAttr = element.getAttribute("data-steps-start");
  const fillAttr = element.getAttribute("data-steps-fill");
  const colorAttr = element.getAttribute("data-color");

  const node = $createStepsContainerNode({
    style,
    label: labelAttr ?? "STEP",
    shape: shapeAttr && isStepsShape(shapeAttr) ? shapeAttr : "circle",
    startNumber: startAttr ? parseInt(startAttr, 10) || 1 : 1,
    fill: fillAttr && isStepsFill(fillAttr) ? fillAttr : "filled",
    color: colorAttr && isAccentColor(colorAttr) ? colorAttr : "default",
  });
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class StepsContainerNode extends ElementNode {
  override $config() {
    return this.config("steps-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: stepsStyleState },
        { flat: true, stateConfig: stepsLabelState },
        { flat: true, stateConfig: stepsShapeState },
        { flat: true, stateConfig: startNumberState },
        { flat: true, stateConfig: stepsFillState },
        { flat: true, stateConfig: stepsColorState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-steps")) {
          return {
            conversion: $convertStepsContainerElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const style = $getState(this, stepsStyleState);
    const label = $getState(this, stepsLabelState);
    const shape = $getState(this, stepsShapeState);
    const startNumber = $getState(this, startNumberState);
    const fill = $getState(this, stepsFillState);
    const color = $getState(this, stepsColorState);

    const element = document.createElement("div");
    element.setAttribute("data-steps", "true");
    element.setAttribute("data-steps-style", style);
    element.setAttribute("data-steps-label", label);
    element.setAttribute("data-steps-shape", shape);
    element.setAttribute("data-steps-start", String(startNumber));
    element.setAttribute("data-steps-fill", fill);
    element.setAttribute("data-color", color);
    element.style.setProperty("--step-label", `"${label}"`);

    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const style = $getState(this, stepsStyleState);
    const label = $getState(this, stepsLabelState);
    const shape = $getState(this, stepsShapeState);
    const startNumber = $getState(this, startNumberState);
    const fill = $getState(this, stepsFillState);
    const color = $getState(this, stepsColorState);

    const element = document.createElement("div");
    element.setAttribute("data-steps", "true");
    element.setAttribute("data-steps-style", style);
    element.setAttribute("data-steps-label", label);
    element.setAttribute("data-steps-shape", shape);
    element.setAttribute("data-steps-start", String(startNumber));
    element.setAttribute("data-steps-fill", fill);
    element.setAttribute("data-color", color);
    element.style.setProperty("--step-label", `"${label}"`);

    return element;
  }

  override updateDOM(prevNode: StepsContainerNode, dom: HTMLElement): boolean {
    const styleChange = $getStateChange(this, prevNode, stepsStyleState);
    if (styleChange) {
      const [newStyle] = styleChange;
      dom.setAttribute("data-steps-style", newStyle);
    }

    const labelChange = $getStateChange(this, prevNode, stepsLabelState);
    if (labelChange) {
      const [newLabel] = labelChange;
      dom.setAttribute("data-steps-label", newLabel);
      dom.style.setProperty("--step-label", `"${newLabel}"`);
    }

    const shapeChange = $getStateChange(this, prevNode, stepsShapeState);
    if (shapeChange) {
      const [newShape] = shapeChange;
      dom.setAttribute("data-steps-shape", newShape);
    }

    const startChange = $getStateChange(this, prevNode, startNumberState);
    if (startChange) {
      const [newStart] = startChange;
      dom.setAttribute("data-steps-start", String(newStart));
    }

    const fillChange = $getStateChange(this, prevNode, stepsFillState);
    if (fillChange) {
      const [newFill] = fillChange;
      dom.setAttribute("data-steps-fill", newFill);
    }

    const colorChange = $getStateChange(this, prevNode, stepsColorState);
    if (colorChange) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }

    return false;
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canBeEmpty(): false {
    return false;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override collapseAtStart(): boolean {
    const children = this.getChildren();
    const paragraph = $createParagraphNode();

    if (children.length > 0) {
      const firstChild = children[0];
      if ($isElementNode(firstChild)) {
        const firstChildChildren = firstChild.getChildren();
        for (const child of firstChildChildren) {
          paragraph.append(child);
        }
      }
    }

    this.replace(paragraph);
    return true;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

type StepsContainerOptions = {
  style?: StepsStyle;
  label?: string;
  shape?: StepsShape;
  startNumber?: number;
  fill?: StepsFill;
  color?: AccentColor;
};

/**
 * StepsContainerノードを作成する
 */
export function $createStepsContainerNode(
  options: StepsContainerOptions = {},
): StepsContainerNode {
  const {
    style = "numbered",
    label = "STEP",
    shape = "circle",
    startNumber = 1,
    fill = "filled",
    color = "default",
  } = options;

  const node = $create(StepsContainerNode);
  $setState(node, stepsStyleState, style);
  $setState(node, stepsLabelState, label);
  $setState(node, stepsShapeState, shape);
  $setState(node, startNumberState, startNumber);
  $setState(node, stepsFillState, fill);
  $setState(node, stepsColorState, color);
  return node;
}

/**
 * ノードがStepsContainerNodeかどうかを判定する
 */
export function $isStepsContainerNode(
  node: LexicalNode | null | undefined,
): node is StepsContainerNode {
  return node instanceof StepsContainerNode;
}
