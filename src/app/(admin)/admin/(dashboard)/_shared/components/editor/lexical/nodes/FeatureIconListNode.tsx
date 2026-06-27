/**
 * FeatureIconList Node
 *
 * @description アイコン付きで設備や特徴を一覧表示するコンポジットノード
 * FeatureIconListContainerNode + FeatureIconItemNode の2ノード構成
 *
 * exportDOM は `data-icon-name` のみ（SVG は公開時 hydrate）。編集 UI の createDOM /
 * updateDOM では WYSIWYG のため CuratedIcon を SVG として埋め込む。
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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseString } from "../config/type-guards";
import { createEnumGuard } from "../config/type-guards";
import { type AccentColor, isAccentColor } from "../config/accent-colors";
import { getCuratedIconComponent } from "@/shared/components/icon-curation/component-map";

/**
 * curation list の icon を SVG として要素内に埋め込む。
 * - `name` 空または curation 外: 既存の SVG 子要素を除去（テキスト fallback）
 * - 該当 icon あり: `<svg>` を `data-icon-svg` 属性付きで innerHTML として埋め込み
 *
 * `createDOM` / `updateDOM` / `exportDOM` から共通で呼ばれる。
 * `renderToStaticMarkup` は同期関数で SSR / browser 両環境で動作する（react-dom/server）。
 */
function renderIconSvgInto(host: HTMLElement, iconName: string): void {
  // 既存の埋め込み SVG をクリア（updateDOM で icon が変わった場合）
  const existing = host.querySelector(":scope > svg[data-icon-svg]");
  if (existing) existing.remove();

  if (iconName === "") return;
  const Icon = getCuratedIconComponent(iconName);
  if (!Icon) return;

  const svgMarkup = renderToStaticMarkup(
    createElement(Icon, {
      className: "feature-icon-svg",
      "aria-hidden": true,
    }),
  );
  // SVG を最初の子として挿入（li 内の paragraph テキストはそのまま残す）
  host.insertAdjacentHTML("afterbegin", svgMarkup);
  // 挿入後に識別用 data-icon-svg 属性を付与（Tabler IconProps 型が strict で
  // data-* を受け付けないため、DOM 経由で setAttribute）
  const inserted = host.querySelector(":scope > svg");
  if (inserted) inserted.setAttribute("data-icon-svg", "");
}

// =============================================================================
// Types
// =============================================================================

export type FeatureIconListColumns = 1 | 2 | 3;

export const ICON_SIZES = ["sm", "md", "lg"] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const isIconSize = createEnumGuard<IconSize>(ICON_SIZES);

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

// =============================================================================
// FeatureIconItemNode
// =============================================================================

export class FeatureIconItemNode extends ElementNode {
  override $config() {
    return this.config("feature-icon-item", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: featureIconItemNameState }],
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
            const node = $createFeatureIconItemNode({ iconName });
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
    renderIconSvgInto(li, $getState(this, featureIconItemNameState));
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
      renderIconSvgInto(dom, newIconName);
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
  } = {},
): FeatureIconItemNode {
  const node = $create(FeatureIconItemNode);
  $setState(node, featureIconItemNameState, params.iconName ?? "");
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
