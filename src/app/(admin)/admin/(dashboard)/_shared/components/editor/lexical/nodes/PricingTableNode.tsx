/**
 * PricingTable Node
 *
 * @description 料金比較表を表示するコンポジットノード
 * PricingTableContainerNode + PricingPlanNode + PricingFeatureNode の3ノード構成
 */

"use client";

import type { DOMConversionMap, EditorConfig, LexicalNode } from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
} from "lexical";
import {
  parseBoolean,
  parseBooleanWithDefault,
  parseString,
} from "../config/type-guards";
import { type AccentColor, isAccentColor } from "../config/accent-colors";

// =============================================================================
// PricingPlanNode States
// =============================================================================

export const planNameState = createState("name", {
  parse: parseString,
});

export const planPriceState = createState("price", {
  parse: parseString,
});

export const planPeriodState = createState("period", {
  parse: parseString,
});

export const planFeaturedState = createState("featured", {
  parse: parseBoolean,
});

export const planColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// PricingFeatureNode States
// =============================================================================

export const featureIncludedState = createState("included", {
  parse: parseBooleanWithDefault(true),
});

// =============================================================================
// PricingTableContainerNode
// =============================================================================

export class PricingTableContainerNode extends ElementNode {
  override $config() {
    return this.config("pricing-table-container", {
      extends: ElementNode,
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-pricing")
        )
          return null;
        return {
          conversion: (_element) => {
            const node = $createPricingTableContainerNode();
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canBeEmpty(): false {
    return false;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-pricing", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-pricing", "true");
    div.setAttribute("data-pricing-columns", String(this.getChildren().length));
    return { element: div };
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// PricingPlanNode
// =============================================================================

export class PricingPlanNode extends ElementNode {
  override $config() {
    return this.config("pricing-plan", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: planNameState },
        { flat: true, stateConfig: planPriceState },
        { flat: true, stateConfig: planPeriodState },
        { flat: true, stateConfig: planFeaturedState },
        { flat: true, stateConfig: planColorState },
      ],
    });
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-pricing-plan", "true");
    div.setAttribute(
      "data-featured",
      String($getState(this, planFeaturedState)),
    );
    div.setAttribute("data-color", $getState(this, planColorState));
    return div;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const featuredChange = $getStateChange(this, prevNode, planFeaturedState);
    if (featuredChange !== null) {
      const [newFeatured] = featuredChange;
      dom.setAttribute("data-featured", String(newFeatured));
    }
    const colorChange = $getStateChange(this, prevNode, planColorState);
    if (colorChange !== null) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }
    return false;
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-pricing-plan")
        )
          return null;
        return {
          conversion: (element) => {
            const colorAttr = element.getAttribute("data-color") ?? "default";
            const node = $createPricingPlanNode({
              name: element.getAttribute("data-name") ?? "",
              price: element.getAttribute("data-price") ?? "",
              period: element.getAttribute("data-period") ?? "",
              featured: element.getAttribute("data-featured") === "true",
              color: isAccentColor(colorAttr) ? colorAttr : "default",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-pricing-plan", "true");
    div.setAttribute("data-name", $getState(this, planNameState));
    div.setAttribute("data-price", $getState(this, planPriceState));
    div.setAttribute("data-period", $getState(this, planPeriodState));
    div.setAttribute(
      "data-featured",
      String($getState(this, planFeaturedState)),
    );
    div.setAttribute("data-color", $getState(this, planColorState));
    return { element: div };
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// PricingFeatureNode
// =============================================================================

export class PricingFeatureNode extends ElementNode {
  override $config() {
    return this.config("pricing-feature", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: featureIncludedState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      li: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-pricing-feature")
        )
          return null;
        return {
          conversion: (element) => {
            const node = $createPricingFeatureNode({
              included: element.getAttribute("data-included") !== "false",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-pricing-feature", "true");
    div.setAttribute(
      "data-included",
      String($getState(this, featureIncludedState)),
    );
    return div;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const includedChange = $getStateChange(
      this,
      prevNode,
      featureIncludedState,
    );
    if (includedChange !== null) {
      const [newIncluded] = includedChange;
      dom.setAttribute("data-included", String(newIncluded));
    }
    return false;
  }

  override exportDOM() {
    const li = document.createElement("li");
    li.setAttribute("data-pricing-feature", "true");
    li.setAttribute(
      "data-included",
      String($getState(this, featureIncludedState)),
    );
    return { element: li };
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

export function $createPricingTableContainerNode(): PricingTableContainerNode {
  return $create(PricingTableContainerNode);
}

export function $createPricingPlanNode(
  params: {
    name?: string;
    price?: string;
    period?: string;
    featured?: boolean;
    color?: AccentColor;
  } = {},
): PricingPlanNode {
  const node = $create(PricingPlanNode);
  $setState(node, planNameState, params.name ?? "");
  $setState(node, planPriceState, params.price ?? "");
  $setState(node, planPeriodState, params.period ?? "月");
  $setState(node, planFeaturedState, params.featured ?? false);
  $setState(node, planColorState, params.color ?? "default");
  return node;
}

export function $createPricingFeatureNode(
  params: {
    included?: boolean;
  } = {},
): PricingFeatureNode {
  const node = $create(PricingFeatureNode);
  $setState(node, featureIncludedState, params.included ?? true);
  return node;
}

export function $isPricingTableContainerNode(
  node: LexicalNode | null | undefined,
): node is PricingTableContainerNode {
  return node instanceof PricingTableContainerNode;
}

export function $isPricingPlanNode(
  node: LexicalNode | null | undefined,
): node is PricingPlanNode {
  return node instanceof PricingPlanNode;
}

export function $isPricingFeatureNode(
  node: LexicalNode | null | undefined,
): node is PricingFeatureNode {
  return node instanceof PricingFeatureNode;
}
