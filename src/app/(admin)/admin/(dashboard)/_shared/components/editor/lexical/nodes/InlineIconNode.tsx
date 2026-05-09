/**
 * Inline Icon Node
 *
 * @description curated Tabler icon を本文中にインライン挿入する DecoratorNode。
 *
 * 公式 Lexical DecoratorNode + isInline pattern に準拠（Image/YouTube 系の inline 版）。
 * 編集時は `decorate()` で `<CuratedIcon>` を React render、HTML 出力（`exportDOM`）では
 * `react-dom/server` の `renderToStaticMarkup` で SVG 文字列化して span 内に埋め込む。
 *
 * - 編集中: `<span data-lexical-inline-icon aria-hidden>` を Lexical が container として作成し、
 *   DecoratorNode の React tree が内部に SVG を render
 * - HTML 出力: `<span data-lexical-inline-icon data-icon-name="..." aria-hidden><svg .../></span>`
 *
 * curation 外 / 空 name は `null` を返し描画なし（CuratedIcon の no-op fallback）。
 */

"use client";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { getCuratedIconComponent } from "@/shared/components/icon-curation/component-map";

// =============================================================================
// State
// =============================================================================

export const inlineIconNameState = createState("name", {
  parse: parseString,
});

// =============================================================================
// Node Class
// =============================================================================

export class InlineIconNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("inline-icon", {
      extends: DecoratorNode,
      stateConfigs: [{ flat: true, stateConfig: inlineIconNameState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      span: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-lexical-inline-icon")
        ) {
          return null;
        }
        return {
          conversion: (element: HTMLElement): DOMConversionOutput => {
            const name = element.getAttribute("data-icon-name") ?? "";
            const node = $createInlineIconNode(name);
            return { node, after: () => [] };
          },
          priority: 2,
        };
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const span = document.createElement("span");
    span.setAttribute("data-lexical-inline-icon", "");
    const name = $getState(this, inlineIconNameState);
    span.setAttribute("data-icon-name", name);
    span.setAttribute("aria-hidden", "true");
    if (name !== "") {
      const Icon = getCuratedIconComponent(name);
      if (Icon) {
        const svgMarkup = renderToStaticMarkup(
          createElement(Icon, {
            className: "inline-icon-svg",
            "aria-hidden": true,
          }),
        );
        span.insertAdjacentHTML("afterbegin", svgMarkup);
        const inserted = span.querySelector(":scope > svg");
        if (inserted) inserted.setAttribute("data-icon-svg", "");
      }
    }
    return { element: span };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("data-lexical-inline-icon", "");
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }

  override decorate(): ReactElement | null {
    const name = $getState(this, inlineIconNameState);
    return <CuratedIcon name={name} className="inline-icon-svg" />;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createInlineIconNode(name: string): InlineIconNode {
  const node = $create(InlineIconNode);
  $setState(node, inlineIconNameState, name);
  return node;
}

export function $isInlineIconNode(
  node: LexicalNode | null | undefined,
): node is InlineIconNode {
  return node instanceof InlineIconNode;
}
