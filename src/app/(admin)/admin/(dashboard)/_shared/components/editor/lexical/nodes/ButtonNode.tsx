/**
 * Button Node
 *
 * @description ボタン/CTAを表示するDecoratorNode
 *
 * 公開 Button Primitive (`@/public/components/design-system/button`) と
 * variant / size / sharp edge / WCAG 2.5.5 (44px) を完全一致させる。
 * label は ButtonLabelToken[] (text + icon 混在の rich label)。
 * AccentColor (data-color 10色) で bronze 以外の accent も指定可能。
 *
 * Lexical Rule §17 準拠: createDOM / exportDOM では CSS クラス禁止、
 * data-attribute のみで構築し `lexical-content.css` の
 * `[data-button-*]` セレクタで公開 Button Primitive と視覚一致するスタイルを適用。
 *
 * Phase 1-4 で確立した rich label token pattern (Section.config.buttons[] /
 * NavigationItem.label) を Lexical 本文中の Button にも適用する Phase 5。
 */

"use client";

import { type ReactElement, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $create,
  $getNodeByKey,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { getCuratedIconComponent } from "@/shared/components/icon-curation/component-map";
import {
  buttonLabelTokenSchema,
  createTextToken,
  isIconToken,
  isTextToken,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";
import { isAccentColor, type AccentColor } from "../config/accent-colors";
import {
  createEnumGuard,
  parseBoolean,
  parseStringWithDefault,
} from "../config/type-guards";

// =============================================================================
// Types
// =============================================================================

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "link"
  | "editorial";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonAlignment = "left" | "center" | "right";

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "link",
  "editorial",
] as const;
export const BUTTON_SIZES: readonly ButtonSize[] = ["sm", "md", "lg"] as const;
export const BUTTON_ALIGNMENTS: readonly ButtonAlignment[] = [
  "left",
  "center",
  "right",
] as const;

// =============================================================================
// Type Guards
// =============================================================================

export const isButtonVariant = createEnumGuard<ButtonVariant>(BUTTON_VARIANTS);
export const isButtonSize = createEnumGuard<ButtonSize>(BUTTON_SIZES);
export const isButtonAlignment =
  createEnumGuard<ButtonAlignment>(BUTTON_ALIGNMENTS);

// =============================================================================
// State
// =============================================================================

export const buttonLabelState = createState("label", {
  parse: (v: unknown): ButtonLabelToken[] => {
    if (!Array.isArray(v)) return [];
    const result: ButtonLabelToken[] = [];
    for (const item of v) {
      const parsed = buttonLabelTokenSchema.safeParse(item);
      if (parsed.success) result.push(parsed.data);
    }
    return result;
  },
});

export const buttonHrefState = createState("href", {
  parse: parseStringWithDefault("#"),
});

export const buttonVariantState = createState("variant", {
  parse: (v: unknown): ButtonVariant =>
    typeof v === "string" && isButtonVariant(v) ? v : "primary",
});

export const buttonSizeState = createState("size", {
  parse: (v: unknown): ButtonSize =>
    typeof v === "string" && isButtonSize(v) ? v : "md",
});

export const buttonAlignmentState = createState("alignment", {
  parse: (v: unknown): ButtonAlignment =>
    typeof v === "string" && isButtonAlignment(v) ? v : "center",
});

export const buttonColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

export const buttonOpenInNewTabState = createState("openInNewTab", {
  parse: parseBoolean,
});

// =============================================================================
// Icon helpers
// =============================================================================

/** Icon token を SVG markup として埋め込む (FeatureIconListNode pattern 準拠) */
function renderIconSvgMarkup(iconName: string): string {
  const Icon = getCuratedIconComponent(iconName);
  if (!Icon) return "";
  return renderToStaticMarkup(
    createElement(Icon, {
      "aria-hidden": true,
    }),
  );
}

// =============================================================================
// Component (editor preview)
// =============================================================================

function ButtonComponent({
  nodeKey,
}: {
  nodeKey: NodeKey;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();

  const state = editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!$isButtonNode(node)) return null;
    return {
      label: $getState(node, buttonLabelState),
      href: $getState(node, buttonHrefState),
      variant: $getState(node, buttonVariantState),
      size: $getState(node, buttonSizeState),
      alignment: $getState(node, buttonAlignmentState),
      color: $getState(node, buttonColorState),
      openInNewTab: $getState(node, buttonOpenInNewTabState),
    };
  });

  if (!state) return null;

  return (
    <div
      data-lexical-node-key={nodeKey}
      data-button="true"
      data-button-alignment={state.alignment}
      data-button-variant={state.variant}
      data-button-size={state.size}
      {...(state.color !== "default" && { "data-color": state.color })}
    >
      <a
        href={state.href}
        {...(state.openInNewTab && {
          target: "_blank",
          rel: "noreferrer",
        })}
        draggable={false}
        onClick={(e) => e.preventDefault()}
      >
        {state.label.map((token) => {
          if (isTextToken(token)) {
            return <span key={token._key}>{token.value}</span>;
          }
          if (isIconToken(token)) {
            return (
              <CuratedIcon
                key={token._key}
                name={token.name}
                aria-hidden="true"
              />
            );
          }
          return null;
        })}
      </a>
    </div>
  );
}

// =============================================================================
// DOM Conversion (importDOM)
// =============================================================================

function $convertButtonElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const link = element.querySelector("a");
  if (!link) return null;

  const text = link.textContent ?? "";
  const href = link.getAttribute("href") ?? "#";
  const variantAttr = element.getAttribute("data-button-variant");
  const sizeAttr = element.getAttribute("data-button-size");
  const alignmentAttr = element.getAttribute("data-button-alignment");
  const colorAttr = element.getAttribute("data-color");
  const openInNewTab = link.getAttribute("target") === "_blank";

  const variant: ButtonVariant =
    variantAttr && isButtonVariant(variantAttr) ? variantAttr : "primary";
  const size: ButtonSize = sizeAttr && isButtonSize(sizeAttr) ? sizeAttr : "md";
  const alignment: ButtonAlignment =
    alignmentAttr && isButtonAlignment(alignmentAttr)
      ? alignmentAttr
      : "center";
  const color: AccentColor =
    colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";

  const node = $createButtonNode({
    label: text ? [createTextToken(text)] : [],
    href,
    variant,
    size,
    alignment,
    color,
    openInNewTab,
  });
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class ButtonNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("button", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: buttonLabelState },
        { flat: true, stateConfig: buttonHrefState },
        { flat: true, stateConfig: buttonVariantState },
        { flat: true, stateConfig: buttonSizeState },
        { flat: true, stateConfig: buttonAlignmentState },
        { flat: true, stateConfig: buttonColorState },
        { flat: true, stateConfig: buttonOpenInNewTabState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-button")) {
          return {
            conversion: $convertButtonElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const label = $getState(this, buttonLabelState);
    const href = $getState(this, buttonHrefState);
    const variant = $getState(this, buttonVariantState);
    const size = $getState(this, buttonSizeState);
    const alignment = $getState(this, buttonAlignmentState);
    const color = $getState(this, buttonColorState);
    const openInNewTab = $getState(this, buttonOpenInNewTabState);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-button", "true");
    wrapper.setAttribute("data-button-alignment", alignment);
    wrapper.setAttribute("data-button-variant", variant);
    wrapper.setAttribute("data-button-size", size);
    if (color !== "default") {
      wrapper.setAttribute("data-color", color);
    }

    const link = document.createElement("a");
    link.setAttribute("href", href);
    if (openInNewTab) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noreferrer");
    }

    for (const token of label) {
      if (isTextToken(token)) {
        const span = document.createElement("span");
        span.textContent = token.value;
        link.appendChild(span);
      } else if (isIconToken(token)) {
        const markup = renderIconSvgMarkup(token.name);
        if (markup) {
          link.insertAdjacentHTML("beforeend", markup);
        }
      }
    }

    wrapper.appendChild(link);
    return { element: wrapper };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-button", "true");
    div.setAttribute(
      "data-button-alignment",
      $getState(this, buttonAlignmentState),
    );
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return <ButtonComponent nodeKey={this.getKey()} />;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createButtonNode({
  label = [],
  href = "#",
  variant = "primary",
  size = "md",
  alignment = "center",
  color = "default",
  openInNewTab = false,
}: {
  label?: ButtonLabelToken[];
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  alignment?: ButtonAlignment;
  color?: AccentColor;
  openInNewTab?: boolean;
} = {}): ButtonNode {
  const node = $create(ButtonNode);
  $setState(node, buttonLabelState, label);
  $setState(node, buttonHrefState, href);
  $setState(node, buttonVariantState, variant);
  $setState(node, buttonSizeState, size);
  $setState(node, buttonAlignmentState, alignment);
  $setState(node, buttonColorState, color);
  $setState(node, buttonOpenInNewTabState, openInNewTab);
  return node;
}

export function $isButtonNode(
  node: LexicalNode | null | undefined,
): node is ButtonNode {
  return node instanceof ButtonNode;
}
