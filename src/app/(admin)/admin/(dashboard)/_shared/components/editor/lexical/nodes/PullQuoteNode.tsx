/**
 * PullQuote Node
 *
 * @description プルクォート（強調引用）の親コンテナ
 * 子ノード: PullQuoteTextNode + PullQuoteCitationNode
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
import { createEnumGuard, parseBoolean } from "../config/type-guards";
import { isAccentColor, type AccentColor } from "../config/accent-colors";
import {
  $createPullQuoteCitationNode,
  PullQuoteCitationNode,
} from "./PullQuoteCitationNode";

// =============================================================================
// Types
// =============================================================================

export type PullQuoteStyle = "classic" | "modern" | "minimal";

export const PULL_QUOTE_STYLES: readonly PullQuoteStyle[] = [
  "classic",
  "modern",
  "minimal",
] as const;

// =============================================================================
// Type Guards
// =============================================================================

export const isPullQuoteStyle =
  createEnumGuard<PullQuoteStyle>(PULL_QUOTE_STYLES);

// =============================================================================
// State
// =============================================================================

export const quoteStyleState = createState("quoteStyle", {
  parse: (v: unknown): PullQuoteStyle =>
    typeof v === "string" && isPullQuoteStyle(v) ? v : "classic",
});

export const pullQuoteColorState = createState("pullQuoteColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

/** 装飾的な引用符（“）の表示。default は false（ブランド方針: ミニマル） */
export const pullQuoteShowMarkState = createState("pullQuoteShowMark", {
  parse: parseBoolean,
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertPullQuoteElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const styleAttr = element.getAttribute("data-pull-quote-style");
  const style =
    styleAttr && isPullQuoteStyle(styleAttr) ? styleAttr : "classic";
  const colorAttr = element.getAttribute("data-color");
  const color: AccentColor =
    colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";
  const showMark = element.getAttribute("data-pull-quote-mark") === "true";
  const node = $createPullQuoteNode(style, color, showMark);
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class PullQuoteNode extends ElementNode {
  override $config() {
    return this.config("pull-quote", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: quoteStyleState },
        { flat: true, stateConfig: pullQuoteColorState },
        { flat: true, stateConfig: pullQuoteShowMarkState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      figure: (element: HTMLElement) => {
        if (element.hasAttribute("data-pull-quote")) {
          return {
            conversion: $convertPullQuoteElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const quoteStyle = $getState(this, quoteStyleState);
    const color = $getState(this, pullQuoteColorState);
    const showMark = $getState(this, pullQuoteShowMarkState);
    const element = document.createElement("figure");
    element.setAttribute("data-pull-quote", "true");
    element.setAttribute("data-pull-quote-style", quoteStyle);
    element.setAttribute("data-color", color);
    if (showMark) element.setAttribute("data-pull-quote-mark", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const quoteStyle = $getState(this, quoteStyleState);
    const color = $getState(this, pullQuoteColorState);
    const showMark = $getState(this, pullQuoteShowMarkState);
    const element = document.createElement("figure");
    element.setAttribute("data-pull-quote", "true");
    element.setAttribute("data-pull-quote-style", quoteStyle);
    element.setAttribute("data-color", color);
    if (showMark) element.setAttribute("data-pull-quote-mark", "true");
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const styleChange = $getStateChange(this, prevNode, quoteStyleState);
    if (styleChange !== null) {
      const [newStyle] = styleChange;
      dom.setAttribute("data-pull-quote-style", newStyle);
    }

    const colorChange = $getStateChange(this, prevNode, pullQuoteColorState);
    if (colorChange !== null) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }

    const showMarkChange = $getStateChange(
      this,
      prevNode,
      pullQuoteShowMarkState,
    );
    if (showMarkChange !== null) {
      const [newShowMark] = showMarkChange;
      if (newShowMark) dom.setAttribute("data-pull-quote-mark", "true");
      else dom.removeAttribute("data-pull-quote-mark");
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

/**
 * PullQuoteノードを作成する
 *
 * @param quoteStyle - 引用スタイル
 * @returns PullQuoteNode インスタンス
 */
export function $createPullQuoteNode(
  quoteStyle: PullQuoteStyle = "classic",
  color: AccentColor = "default",
  showMark = false,
): PullQuoteNode {
  const node = $create(PullQuoteNode);
  $setState(node, quoteStyleState, quoteStyle);
  $setState(node, pullQuoteColorState, color);
  $setState(node, pullQuoteShowMarkState, showMark);
  return node;
}

/**
 * ノードがPullQuoteNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PullQuoteNodeの場合true
 */
export function $isPullQuoteNode(
  node: LexicalNode | null | undefined,
): node is PullQuoteNode {
  return node instanceof PullQuoteNode;
}

// =============================================================================
// Citation Helpers（出典は任意の子。Inspector の表示トグルから操作する）
// =============================================================================

/**
 * PullQuote が出典（PullQuoteCitationNode）を持つか
 */
export function $pullQuoteHasCitation(node: PullQuoteNode): boolean {
  return node
    .getChildren()
    .some((child) => child instanceof PullQuoteCitationNode);
}

/**
 * PullQuote に出典を追加し、出典段落にフォーカスする（既に存在する場合は何もしない）
 */
export function $addPullQuoteCitation(node: PullQuoteNode): void {
  if ($pullQuoteHasCitation(node)) return;
  const citation = $createPullQuoteCitationNode();
  const paragraph = $createParagraphNode();
  citation.append(paragraph);
  node.append(citation);
  paragraph.selectEnd();
}

/**
 * PullQuote から出典を削除する
 */
export function $removePullQuoteCitation(node: PullQuoteNode): void {
  for (const child of node.getChildren()) {
    if (child instanceof PullQuoteCitationNode) child.remove();
  }
}
