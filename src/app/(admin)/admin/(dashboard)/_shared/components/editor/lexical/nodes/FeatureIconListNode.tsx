/**
 * FeatureIconList Node
 *
 * @description アイコン付きで設備や特徴を一覧表示するコンポジットノード
 * FeatureIconListContainerNode + FeatureIconItemNode の2ノード構成
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
import { parseString } from "../config/type-guards";
import { createEnumGuard } from "../config/type-guards";
import { type AccentColor, isAccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export type FeatureIconListColumns = 1 | 2 | 3;

export const ICON_SIZES = ["sm", "md", "lg"] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const isIconSize = createEnumGuard<IconSize>(ICON_SIZES);

export const ICON_LIBRARIES = ["lucide", "simple-icons"] as const;
export type IconLibrary = (typeof ICON_LIBRARIES)[number];
export const isIconLibrary = createEnumGuard<IconLibrary>(ICON_LIBRARIES);

// =============================================================================
// Helpers
// =============================================================================

function parseColumns(v: unknown): FeatureIconListColumns {
  if (v === 1 || v === 2 || v === 3) return v;
  return 2;
}

// =============================================================================
// FeatureIconListContainerNode States
// =============================================================================

export const featureIconListColumnsState = createState("columns", {
  parse: parseColumns,
});

export const featureIconListAccentColorState = createState("accentColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

export const featureIconListIconSizeState = createState("iconSize", {
  parse: (v: unknown): IconSize =>
    typeof v === "string" && isIconSize(v) ? v : "md",
});

// =============================================================================
// FeatureIconListContainerNode
// =============================================================================

export class FeatureIconListContainerNode extends ElementNode {
  override $config() {
    return this.config("feature-icon-list-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: featureIconListColumnsState },
        { flat: true, stateConfig: featureIconListAccentColorState },
        { flat: true, stateConfig: featureIconListIconSizeState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      ul: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-feature-icon-list")
        )
          return null;
        return {
          conversion: (element) => {
            const columnsRaw = element.getAttribute("data-columns");
            const color = element.getAttribute("data-color");
            const iconSizeRaw = element.getAttribute("data-icon-size");
            const node = $createFeatureIconListContainerNode({
              columns: parseColumns(
                columnsRaw !== null ? parseInt(columnsRaw, 10) : undefined,
              ),
              accentColor:
                typeof color === "string" && isAccentColor(color)
                  ? color
                  : "default",
              iconSize:
                typeof iconSizeRaw === "string" && isIconSize(iconSizeRaw)
                  ? iconSizeRaw
                  : "md",
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

  override canBeEmpty(): false {
    return false;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const ul = document.createElement("ul");
    ul.setAttribute("data-feature-icon-list", "");
    ul.setAttribute(
      "data-columns",
      String($getState(this, featureIconListColumnsState)),
    );
    ul.setAttribute(
      "data-color",
      $getState(this, featureIconListAccentColorState),
    );
    ul.setAttribute(
      "data-icon-size",
      $getState(this, featureIconListIconSizeState),
    );
    return ul;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const columnsChange = $getStateChange(
      this,
      prevNode,
      featureIconListColumnsState,
    );
    if (columnsChange !== null) {
      const [newColumns] = columnsChange;
      dom.setAttribute("data-columns", String(newColumns));
    }
    const colorChange = $getStateChange(
      this,
      prevNode,
      featureIconListAccentColorState,
    );
    if (colorChange !== null) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }
    const iconSizeChange = $getStateChange(
      this,
      prevNode,
      featureIconListIconSizeState,
    );
    if (iconSizeChange !== null) {
      const [newIconSize] = iconSizeChange;
      dom.setAttribute("data-icon-size", newIconSize);
    }
    return false;
  }

  override exportDOM() {
    const ul = document.createElement("ul");
    ul.setAttribute("data-feature-icon-list", "");
    ul.setAttribute(
      "data-columns",
      String($getState(this, featureIconListColumnsState)),
    );
    ul.setAttribute(
      "data-color",
      $getState(this, featureIconListAccentColorState),
    );
    ul.setAttribute(
      "data-icon-size",
      $getState(this, featureIconListIconSizeState),
    );
    return { element: ul };
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// FeatureIconItemNode States
// =============================================================================

export const featureIconItemNameState = createState("iconName", {
  parse: parseString,
});

export const featureIconItemLibraryState = createState("iconLibrary", {
  parse: (v: unknown): IconLibrary =>
    typeof v === "string" && isIconLibrary(v) ? v : "lucide",
});

// =============================================================================
// FeatureIconItemNode
// =============================================================================

export class FeatureIconItemNode extends ElementNode {
  override $config() {
    return this.config("feature-icon-item", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: featureIconItemNameState },
        { flat: true, stateConfig: featureIconItemLibraryState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      li: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-feature-icon-item")
        )
          return null;
        return {
          conversion: (element) => {
            const iconName = element.getAttribute("data-icon-name") ?? "";
            const iconLibraryRaw = element.getAttribute("data-icon-library");
            const node = $createFeatureIconItemNode({
              iconName,
              iconLibrary:
                typeof iconLibraryRaw === "string" &&
                isIconLibrary(iconLibraryRaw)
                  ? iconLibraryRaw
                  : "lucide",
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
    const li = document.createElement("li");
    li.setAttribute("data-feature-icon-item", "");
    li.setAttribute(
      "data-icon-name",
      $getState(this, featureIconItemNameState),
    );
    li.setAttribute(
      "data-icon-library",
      $getState(this, featureIconItemLibraryState),
    );
    return li;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const iconNameChange = $getStateChange(
      this,
      prevNode,
      featureIconItemNameState,
    );
    if (iconNameChange !== null) {
      const [newIconName] = iconNameChange;
      dom.setAttribute("data-icon-name", newIconName);
    }
    const iconLibraryChange = $getStateChange(
      this,
      prevNode,
      featureIconItemLibraryState,
    );
    if (iconLibraryChange !== null) {
      const [newIconLibrary] = iconLibraryChange;
      dom.setAttribute("data-icon-library", newIconLibrary);
    }
    return false;
  }

  override exportDOM() {
    const li = document.createElement("li");
    li.setAttribute("data-feature-icon-item", "");
    li.setAttribute(
      "data-icon-name",
      $getState(this, featureIconItemNameState),
    );
    li.setAttribute(
      "data-icon-library",
      $getState(this, featureIconItemLibraryState),
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

export function $createFeatureIconListContainerNode(
  params: {
    columns?: FeatureIconListColumns;
    accentColor?: AccentColor;
    iconSize?: IconSize;
  } = {},
): FeatureIconListContainerNode {
  const node = $create(FeatureIconListContainerNode);
  $setState(node, featureIconListColumnsState, params.columns ?? 2);
  $setState(
    node,
    featureIconListAccentColorState,
    params.accentColor ?? "default",
  );
  $setState(node, featureIconListIconSizeState, params.iconSize ?? "md");
  return node;
}

export function $createFeatureIconItemNode(
  params: {
    iconName?: string;
    iconLibrary?: IconLibrary;
  } = {},
): FeatureIconItemNode {
  const node = $create(FeatureIconItemNode);
  $setState(node, featureIconItemNameState, params.iconName ?? "");
  $setState(node, featureIconItemLibraryState, params.iconLibrary ?? "lucide");
  return node;
}

export function $isFeatureIconListContainerNode(
  node: LexicalNode | null | undefined,
): node is FeatureIconListContainerNode {
  return node instanceof FeatureIconListContainerNode;
}

export function $isFeatureIconItemNode(
  node: LexicalNode | null | undefined,
): node is FeatureIconItemNode {
  return node instanceof FeatureIconItemNode;
}
