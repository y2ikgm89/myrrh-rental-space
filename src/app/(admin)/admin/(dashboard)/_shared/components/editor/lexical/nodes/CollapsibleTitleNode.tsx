/**
 * Collapsible Title Node
 *
 * @description 折りたたみのタイトル部分を表すElementNode
 * <summary>要素として出力される
 *
 * スタイルは lexical-content.css の [data-collapsible-title] セレクターで管理
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  RangeSelection,
} from "lexical";
import { $create, $setState, ElementNode } from "lexical";
import { $isCollapsibleItemNode, openState } from "./CollapsibleItemNode";
import { $isCollapsibleContentNode } from "./CollapsibleContentNode";

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleTitleElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createCollapsibleTitleNode();
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleTitleNode extends ElementNode {
  override $config() {
    return this.config("collapsible-title", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      summary: () => ({
        conversion: $convertCollapsibleTitleElement,
        priority: 1,
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("summary");
    element.setAttribute("data-collapsible-title", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-collapsible-title", "true");
    return element;
  }

  override updateDOM(): false {
    return false;
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override insertNewAfter(
    _selection: RangeSelection,
    restoreSelection = true,
  ): null | ElementNode {
    const item = this.getParent();
    if ($isCollapsibleItemNode(item)) {
      $setState(item, openState, true);
      const content = item.getChildren().find($isCollapsibleContentNode);
      if (content) {
        const firstChild = content.getFirstChild();
        if (firstChild) {
          if (restoreSelection) {
            firstChild.selectStart();
          }
          return null;
        }
      }
    }
    return null;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return $create(CollapsibleTitleNode);
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
  return node instanceof CollapsibleTitleNode;
}
