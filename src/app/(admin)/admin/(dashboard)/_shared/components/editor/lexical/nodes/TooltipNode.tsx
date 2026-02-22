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
          const baseText = element.textContent ?? "";
          const tooltipText = element.getAttribute("title") ?? "";
          const tooltipNode = $createTooltipNode(baseText, tooltipText);
          return { node: tooltipNode };
        },
        priority: 1,
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const abbr = document.createElement("abbr");
    abbr.setAttribute("data-tooltip", "true");
    abbr.setAttribute("title", $getState(this, tooltipTextState));
    abbr.textContent = $getState(this, tooltipBaseTextState);
    return { element: abbr };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const abbr = document.createElement("abbr");
    abbr.setAttribute("data-tooltip", "true");
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
      <abbr
        data-tooltip="true"
        title={tooltipText}
        className="cursor-help underline decoration-dotted"
      >
        {baseText}
      </abbr>
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
