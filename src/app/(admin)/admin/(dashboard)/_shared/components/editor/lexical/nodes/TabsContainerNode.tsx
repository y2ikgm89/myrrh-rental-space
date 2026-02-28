/**
 * TabsContainer Node
 *
 * @description タブ切り替えの親コンテナ
 * 子ノード: TabListNode + TabPanelNode×N
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

export type TabsStyle = "underline" | "pills" | "boxed" | "minimal";
export type TabsSize = "auto" | "fixed" | "fill" | "uniform";
export type TabsFixedWidth = "80" | "120" | "160" | "200";

export const TABS_STYLES: readonly TabsStyle[] = [
  "underline",
  "pills",
  "boxed",
  "minimal",
] as const;
export const TABS_SIZES: readonly TabsSize[] = [
  "auto",
  "fixed",
  "fill",
  "uniform",
] as const;
export const TABS_FIXED_WIDTHS: readonly TabsFixedWidth[] = [
  "80",
  "120",
  "160",
  "200",
] as const;

// =============================================================================
// Type Guards
// =============================================================================

export const isTabsStyle = createEnumGuard<TabsStyle>(TABS_STYLES);
export const isTabsSize = createEnumGuard<TabsSize>(TABS_SIZES);
export const isTabsFixedWidth =
  createEnumGuard<TabsFixedWidth>(TABS_FIXED_WIDTHS);

// =============================================================================
// State
// =============================================================================

export const activeIndexState = createState("activeIndex", {
  parse: (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0,
});

export const tabsStyleState = createState("tabsStyle", {
  parse: (v: unknown): TabsStyle =>
    typeof v === "string" && isTabsStyle(v) ? v : "underline",
});

export const tabsSizeState = createState("tabsSize", {
  parse: (v: unknown): TabsSize =>
    typeof v === "string" && isTabsSize(v) ? v : "auto",
});

export const tabsFixedWidthState = createState("tabsFixedWidth", {
  parse: (v: unknown): TabsFixedWidth =>
    typeof v === "string" && isTabsFixedWidth(v) ? v : "120",
});

export const tabsColorState = createState("tabsColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabsContainerElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const activeAttr = element.getAttribute("data-tabs-active");
  const activeIndex = activeAttr ? parseInt(activeAttr, 10) : 0;
  const styleAttr = element.getAttribute("data-tabs-style");
  const style = styleAttr && isTabsStyle(styleAttr) ? styleAttr : "underline";
  const sizeAttr = element.getAttribute("data-tabs-size");
  const size = sizeAttr && isTabsSize(sizeAttr) ? sizeAttr : "auto";
  const fixedWidthAttr = element.getAttribute("data-tabs-fixed-width");
  const fixedWidth =
    fixedWidthAttr && isTabsFixedWidth(fixedWidthAttr) ? fixedWidthAttr : "120";
  const colorAttr = element.getAttribute("data-color");
  const color: AccentColor =
    colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";
  const node = $createTabsContainerNode(
    activeIndex,
    style,
    size,
    fixedWidth,
    color,
  );
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class TabsContainerNode extends ElementNode {
  override $config() {
    return this.config("tabs-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: activeIndexState },
        { flat: true, stateConfig: tabsStyleState },
        { flat: true, stateConfig: tabsSizeState },
        { flat: true, stateConfig: tabsFixedWidthState },
        { flat: true, stateConfig: tabsColorState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-tabs-container")) {
          return {
            conversion: $convertTabsContainerElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const activeIndex = $getState(this, activeIndexState);
    const tabsStyle = $getState(this, tabsStyleState);
    const tabsSize = $getState(this, tabsSizeState);
    const fixedWidth = $getState(this, tabsFixedWidthState);
    const color = $getState(this, tabsColorState);
    const element = document.createElement("div");
    element.setAttribute("data-tabs-container", "true");
    element.setAttribute("data-tabs-active", String(activeIndex));
    element.setAttribute("data-tabs-style", tabsStyle);
    element.setAttribute("data-tabs-size", tabsSize);
    element.setAttribute("data-tabs-fixed-width", fixedWidth);
    element.setAttribute("data-color", color);

    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const activeIndex = $getState(this, activeIndexState);
    const tabsStyle = $getState(this, tabsStyleState);
    const tabsSize = $getState(this, tabsSizeState);
    const fixedWidth = $getState(this, tabsFixedWidthState);
    const color = $getState(this, tabsColorState);
    const element = document.createElement("div");
    element.setAttribute("data-tabs-container", "true");
    element.setAttribute("data-tabs-active", String(activeIndex));
    element.setAttribute("data-tabs-style", tabsStyle);
    element.setAttribute("data-tabs-size", tabsSize);
    element.setAttribute("data-tabs-fixed-width", fixedWidth);
    element.setAttribute("data-color", color);

    return element;
  }

  override updateDOM(prevNode: TabsContainerNode, dom: HTMLElement): boolean {
    const indexChange = $getStateChange(this, prevNode, activeIndexState);
    if (indexChange) {
      const [newIndex] = indexChange;
      dom.setAttribute("data-tabs-active", String(newIndex));
    }
    const styleChange = $getStateChange(this, prevNode, tabsStyleState);
    if (styleChange) {
      const [newStyle] = styleChange;
      dom.setAttribute("data-tabs-style", newStyle);
    }
    const sizeChange = $getStateChange(this, prevNode, tabsSizeState);
    if (sizeChange) {
      const [newSize] = sizeChange;
      dom.setAttribute("data-tabs-size", newSize);
    }
    const fixedWidthChange = $getStateChange(
      this,
      prevNode,
      tabsFixedWidthState,
    );
    if (fixedWidthChange) {
      const [newFixedWidth] = fixedWidthChange;
      dom.setAttribute("data-tabs-fixed-width", newFixedWidth);
    }
    const colorChange = $getStateChange(this, prevNode, tabsColorState);
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

export function $createTabsContainerNode(
  activeIndex: number = 0,
  tabsStyle: TabsStyle = "underline",
  tabsSize: TabsSize = "auto",
  tabsFixedWidth: TabsFixedWidth = "120",
  color: AccentColor = "default",
): TabsContainerNode {
  const node = $create(TabsContainerNode);
  $setState(node, activeIndexState, activeIndex);
  $setState(node, tabsStyleState, tabsStyle);
  $setState(node, tabsSizeState, tabsSize);
  $setState(node, tabsFixedWidthState, tabsFixedWidth);
  $setState(node, tabsColorState, color);
  return node;
}

/**
 * ノードがTabsContainerNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabsContainerNodeの場合true
 */
export function $isTabsContainerNode(
  node: LexicalNode | null | undefined,
): node is TabsContainerNode {
  return node instanceof TabsContainerNode;
}
