/**
 * Timeline Node
 *
 * @description タイムラインを表示するコンポジットノード
 * TimelineContainerNode + TimelineItemNode の2ノード構成
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
import { type AccentColor, isAccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export type TimelineDirection = "horizontal" | "vertical";

// =============================================================================
// TimelineContainerNode States
// =============================================================================

export const timelineDirectionState = createState("direction", {
  parse: (v: unknown): TimelineDirection =>
    v === "horizontal" || v === "vertical" ? v : "vertical",
});

export const timelineColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// TimelineContainerNode
// =============================================================================

export class TimelineContainerNode extends ElementNode {
  override $config() {
    return this.config("timeline-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: timelineDirectionState },
        { flat: true, stateConfig: timelineColorState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-timeline")
        )
          return null;
        return {
          conversion: (element) => {
            const direction = element.getAttribute("data-direction");
            const colorAttr = element.getAttribute("data-color") ?? "default";
            const node = $createTimelineContainerNode(
              direction === "horizontal" ? "horizontal" : "vertical",
              isAccentColor(colorAttr) ? colorAttr : "default",
            );
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
    const div = document.createElement("div");
    div.setAttribute("data-timeline", "true");
    div.setAttribute("data-direction", $getState(this, timelineDirectionState));
    div.setAttribute("data-color", $getState(this, timelineColorState));
    return div;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const dirChange = $getStateChange(this, prevNode, timelineDirectionState);
    if (dirChange !== null) {
      const [newDir] = dirChange;
      dom.setAttribute("data-direction", newDir);
    }
    const colorChange = $getStateChange(this, prevNode, timelineColorState);
    if (colorChange !== null) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-timeline", "true");
    div.setAttribute("data-direction", $getState(this, timelineDirectionState));
    div.setAttribute("data-color", $getState(this, timelineColorState));
    return { element: div };
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
}

// =============================================================================
// TimelineItemNode States
// =============================================================================

export const timelineYearState = createState("year", {
  parse: parseString,
});

export const timelineLabelState = createState("label", {
  parse: parseString,
});

// =============================================================================
// TimelineItemNode
// =============================================================================

export class TimelineItemNode extends ElementNode {
  override $config() {
    return this.config("timeline-item", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: timelineYearState },
        { flat: true, stateConfig: timelineLabelState },
      ],
    });
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-timeline-item", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-timeline-item")
        )
          return null;
        return {
          conversion: (element) => {
            const node = $createTimelineItemNode({
              year: element.getAttribute("data-timeline-year") ?? "",
              label: element.getAttribute("data-timeline-label") ?? "",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-timeline-item", "true");
    div.setAttribute("data-timeline-year", $getState(this, timelineYearState));
    div.setAttribute(
      "data-timeline-label",
      $getState(this, timelineLabelState),
    );
    return { element: div };
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

export function $createTimelineContainerNode(
  direction: TimelineDirection = "vertical",
  color: AccentColor = "default",
): TimelineContainerNode {
  const node = $create(TimelineContainerNode);
  $setState(node, timelineDirectionState, direction);
  $setState(node, timelineColorState, color);
  return node;
}

export function $createTimelineItemNode(
  params: {
    year?: string;
    label?: string;
  } = {},
): TimelineItemNode {
  const node = $create(TimelineItemNode);
  $setState(node, timelineYearState, params.year ?? "");
  $setState(node, timelineLabelState, params.label ?? "");
  return node;
}

export function $isTimelineContainerNode(
  node: LexicalNode | null | undefined,
): node is TimelineContainerNode {
  return node instanceof TimelineContainerNode;
}

export function $isTimelineItemNode(
  node: LexicalNode | null | undefined,
): node is TimelineItemNode {
  return node instanceof TimelineItemNode;
}
