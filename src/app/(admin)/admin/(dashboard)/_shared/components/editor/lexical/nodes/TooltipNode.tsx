/**
 * Tooltip Node
 *
 * @description ツールチップを表示するインライン DecoratorNode
 */

"use client";

import type { ReactElement } from "react";
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
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { parseString } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const tooltipBaseTextState = createState("baseText", {
  parse: parseString,
});

export const tooltipTextState = createState("tooltipText", {
  parse: parseString,
});

// =============================================================================
// Node Class
// =============================================================================

export class TooltipNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("tooltip", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: tooltipBaseTextState },
        { flat: true, stateConfig: tooltipTextState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap {
    return {
      abbr: () => ({
        conversion: (element: HTMLElement): DOMConversionOutput => {
          if (element.getAttribute("data-tooltip") !== "true") {
            return { node: null };
          }
          // 新構造: 子 [data-tooltip-content] に説明文 / [data-tooltip-base] に表示テキスト。
          // 旧構造（title 属性 + 素のテキスト）も graceful に取り込む。
          const contentEl = element.querySelector("[data-tooltip-content]");
          const tooltipText =
            contentEl?.textContent ?? element.getAttribute("title") ?? "";
          contentEl?.remove();
          const baseEl = element.querySelector("[data-tooltip-base]");
          const baseText = baseEl?.textContent ?? element.textContent ?? "";
          const tooltipNode = $createTooltipNode(baseText, tooltipText);
          // 注入された表示用要素は子として取り込まない
          return { node: tooltipNode, after: () => [] };
        },
        priority: 1,
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const abbr = document.createElement("abbr");
    abbr.setAttribute("data-tooltip", "true");
    abbr.setAttribute("tabindex", "0");

    const base = document.createElement("span");
    base.setAttribute("data-tooltip-base", "");
    base.textContent = $getState(this, tooltipBaseTextState);
    abbr.appendChild(base);

    const content = document.createElement("span");
    content.setAttribute("data-tooltip-content", "");
    content.setAttribute("role", "tooltip");
    content.textContent = $getState(this, tooltipTextState);
    abbr.appendChild(content);

    return { element: abbr };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const abbr = document.createElement("abbr");
    abbr.setAttribute("data-tooltip", "true");
    abbr.setAttribute("tabindex", "0");
    return abbr;
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }

  override decorate(): ReactElement {
    const baseText = $getState(this, tooltipBaseTextState);
    const tooltipText = $getState(this, tooltipTextState);
    return (
      <>
        <span data-tooltip-base="">{baseText}</span>
        <span data-tooltip-content="" role="tooltip">
          {tooltipText}
        </span>
      </>
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * TooltipNodeを作成する
 */
export function $createTooltipNode(
  baseText: string,
  tooltipText: string,
): TooltipNode {
  const node = $create(TooltipNode);
  $setState(node, tooltipBaseTextState, baseText);
  $setState(node, tooltipTextState, tooltipText);
  return node;
}

/**
 * ノードが TooltipNode かどうかを判定する
 */
export function $isTooltipNode(
  node: LexicalNode | null | undefined,
): node is TooltipNode {
  return node instanceof TooltipNode;
}
