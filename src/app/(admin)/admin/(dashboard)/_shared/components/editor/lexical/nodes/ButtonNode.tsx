/**
 * Button Node
 *
 * @description ボタン/CTAを表示するDecoratorNode
 * variant: primary/secondary/outline
 * size: sm/md/lg
 * alignment: left/center/right
 */

"use client";

import { cn } from "@/shared/lib/cn";

import type { ReactElement } from "react";
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
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import {
  createEnumGuard,
  parseBoolean,
  parseStringWithDefault,
} from "../config/type-guards";

// =============================================================================
// Types
// =============================================================================

export type ButtonVariant = "primary" | "secondary" | "outline";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonAlignment = "left" | "center" | "right";

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "outline",
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
// Constants
// =============================================================================

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const ALIGNMENT_STYLES: Record<ButtonAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

const BUTTON_BASE_CLASS =
  "inline-flex items-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// =============================================================================
// State
// =============================================================================

export const buttonTextState = createState("text", {
  parse: parseStringWithDefault("ボタン"),
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

export const buttonOpenInNewTabState = createState("openInNewTab", {
  parse: parseBoolean,
});

// =============================================================================
// Component
// =============================================================================

function ButtonComponent({
  text,
  href,
  variant,
  size,
  alignment,
  openInNewTab,
  nodeKey,
}: {
  text: string;
  href: string;
  variant: ButtonVariant;
  size: ButtonSize;
  alignment: ButtonAlignment;
  openInNewTab: boolean;
  nodeKey: NodeKey;
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      data-button-alignment={alignment}
      className={cn("my-6 flex", ALIGNMENT_STYLES[alignment])}
    >
      <a
        href={href}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noreferrer" : undefined}
        className={cn(
          BUTTON_BASE_CLASS,
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
        )}
        draggable={false}
        onClick={(e) => e.preventDefault()} // エディタ内ではナビゲーション無効
      >
        {text}
      </a>
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertButtonElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const link = element.querySelector("a");
  if (!link) return null;

  const text = link.textContent ?? "ボタン";
  const href = link.getAttribute("href") ?? "#";
  const variantAttr = element.getAttribute("data-button-variant");
  const sizeAttr = element.getAttribute("data-button-size");
  const alignmentAttr = element.getAttribute("data-button-alignment");
  const openInNewTab = link.getAttribute("target") === "_blank";

  const variant =
    variantAttr && isButtonVariant(variantAttr) ? variantAttr : "primary";
  const size = sizeAttr && isButtonSize(sizeAttr) ? sizeAttr : "md";
  const alignment =
    alignmentAttr && isButtonAlignment(alignmentAttr)
      ? alignmentAttr
      : "center";

  const node = $createButtonNode({
    text,
    href,
    variant,
    size,
    alignment,
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
        { flat: true, stateConfig: buttonTextState },
        { flat: true, stateConfig: buttonHrefState },
        { flat: true, stateConfig: buttonVariantState },
        { flat: true, stateConfig: buttonSizeState },
        { flat: true, stateConfig: buttonAlignmentState },
        { flat: true, stateConfig: buttonOpenInNewTabState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-button-alignment")) {
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
    const text = $getState(this, buttonTextState);
    const href = $getState(this, buttonHrefState);
    const variant = $getState(this, buttonVariantState);
    const size = $getState(this, buttonSizeState);
    const alignment = $getState(this, buttonAlignmentState);
    const openInNewTab = $getState(this, buttonOpenInNewTabState);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-button-alignment", alignment);
    wrapper.setAttribute("data-button-variant", variant);
    wrapper.setAttribute("data-button-size", size);

    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;

    if (openInNewTab) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }

    wrapper.appendChild(link);
    return { element: wrapper };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
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
    return (
      <ButtonComponent
        text={$getState(this, buttonTextState)}
        href={$getState(this, buttonHrefState)}
        variant={$getState(this, buttonVariantState)}
        size={$getState(this, buttonSizeState)}
        alignment={$getState(this, buttonAlignmentState)}
        openInNewTab={$getState(this, buttonOpenInNewTabState)}
        nodeKey={this.getKey()}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * ボタンノードを作成する
 *
 * @param params - ボタンのパラメータ
 * @returns ButtonNode インスタンス
 */
export function $createButtonNode({
  text,
  href,
  variant = "primary",
  size = "md",
  alignment = "center",
  openInNewTab = false,
}: {
  text: string;
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  alignment?: ButtonAlignment;
  openInNewTab?: boolean;
}): ButtonNode {
  const node = $create(ButtonNode);
  $setState(node, buttonTextState, text);
  $setState(node, buttonHrefState, href);
  $setState(node, buttonVariantState, variant);
  $setState(node, buttonSizeState, size);
  $setState(node, buttonAlignmentState, alignment);
  $setState(node, buttonOpenInNewTabState, openInNewTab);
  return node;
}

/**
 * ノードがButtonNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns ButtonNodeの場合true
 */
export function $isButtonNode(
  node: LexicalNode | null | undefined,
): node is ButtonNode {
  return node instanceof ButtonNode;
}
