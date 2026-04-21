/**
 * Group Node
 *
 * @description SWELLライクなボックス装飾コンテナ（ElementNode）
 * 15種のスタイルプリセット + AccentColor 10色
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
} from "lexical";
import { createEnumGuard } from "../config/type-guards";
import { type AccentColor, isAccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export type GroupStyle =
  | "solid-border"
  | "dashed-border"
  | "solid-accent"
  | "dashed-accent"
  | "left-border"
  | "filled"
  | "filled-light"
  | "gray-bg"
  | "stripe"
  | "grid"
  | "stitch"
  | "emboss"
  | "kakko"
  | "big-kakko"
  | "note";

export const GROUP_STYLES: readonly GroupStyle[] = [
  "solid-border",
  "dashed-border",
  "solid-accent",
  "dashed-accent",
  "left-border",
  "filled",
  "filled-light",
  "gray-bg",
  "stripe",
  "grid",
  "stitch",
  "emboss",
  "kakko",
  "big-kakko",
  "note",
] as const;

export const GROUP_STYLE_CATEGORIES = {
  border: [
    "solid-border",
    "dashed-border",
    "solid-accent",
    "dashed-accent",
    "left-border",
  ] as const,
  background: ["filled", "filled-light", "gray-bg", "stripe", "grid"] as const,
  decoration: ["stitch", "emboss", "kakko", "big-kakko", "note"] as const,
} as const;

export const GROUP_STYLE_LABELS: Record<GroupStyle, string> = {
  "solid-border": "実線",
  "dashed-border": "破線",
  "solid-accent": "実線（カラー）",
  "dashed-accent": "破線（カラー）",
  "left-border": "左線",
  filled: "塗り",
  "filled-light": "淡い塗り",
  "gray-bg": "グレー背景",
  stripe: "ストライプ",
  grid: "方眼",
  stitch: "ステッチ",
  emboss: "エンボス",
  kakko: "かっこ",
  "big-kakko": "大かっこ",
  note: "付箋",
};

// =============================================================================
// Type Guards
// =============================================================================

export const isGroupStyle = createEnumGuard<GroupStyle>(GROUP_STYLES);

// =============================================================================
// State
// =============================================================================

export const groupStyleState = createState("groupStyle", {
  parse: (v: unknown): GroupStyle =>
    typeof v === "string" && isGroupStyle(v) ? v : "solid-border",
});

export const groupColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertGroupElement(
  element: HTMLElement,
): DOMConversionOutput | null {
  const styleAttr = element.getAttribute("data-group-style");
  const colorAttr = element.getAttribute("data-color");
  const groupStyle =
    typeof styleAttr === "string" && isGroupStyle(styleAttr)
      ? styleAttr
      : "solid-border";
  const color =
    typeof colorAttr === "string" && isAccentColor(colorAttr)
      ? colorAttr
      : "default";
  const node = $createGroupNode(groupStyle, color);
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class GroupNode extends ElementNode {
  override $config() {
    return this.config("group", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: groupStyleState },
        { flat: true, stateConfig: groupColorState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-group")) {
          return { conversion: $convertGroupElement, priority: 2 };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const style = $getState(this, groupStyleState);
    const color = $getState(this, groupColorState);
    const element = document.createElement("div");
    element.setAttribute("data-group", "true");
    element.setAttribute("data-group-style", style);
    if (color !== "default") {
      element.setAttribute("data-color", color);
    }
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const style = $getState(this, groupStyleState);
    const color = $getState(this, groupColorState);
    const element = document.createElement("div");
    element.setAttribute("data-group", "true");
    element.setAttribute("data-group-style", style);
    if (color !== "default") {
      element.setAttribute("data-color", color);
    }
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): false {
    const styleChange = $getStateChange(this, prevNode, groupStyleState);
    if (styleChange !== null) {
      dom.setAttribute("data-group-style", styleChange[0]);
    }
    const colorChange = $getStateChange(this, prevNode, groupColorState);
    if (colorChange !== null) {
      const [newColor] = colorChange;
      if (newColor !== "default") {
        dom.setAttribute("data-color", newColor);
      } else {
        dom.removeAttribute("data-color");
      }
    }
    return false;
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

  /**
   * Backspace at start → グループ解除（全子ノードを順序保持で親階層に展開）。
   *
   * 旧実装は「1 番目の子の children だけ新 paragraph に flatten」する lossy 挙動だった。
   * 本実装は WordPress Gutenberg の unwrap 相当 — `$ungroupNode` に委譲する。
   */
  override collapseAtStart(): boolean {
    $ungroupNode(this);
    return true;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createGroupNode(
  groupStyle: GroupStyle = "solid-border",
  color: AccentColor = "default",
): GroupNode {
  const node = $create(GroupNode);
  $setState(node, groupStyleState, groupStyle);
  $setState(node, groupColorState, color);
  return node;
}

export function $isGroupNode(
  node: LexicalNode | null | undefined,
): node is GroupNode {
  return node instanceof GroupNode;
}

// =============================================================================
// Unwrap helper
// =============================================================================

/**
 * GroupNode を解除して子ノードをそのまま親階層に展開する（WordPress Gutenberg の
 * unwrap 相当）。
 *
 * 挙動:
 * - 子を 1 つずつ順に Group の直後に再挿入（順序保持）
 * - Group ノード自体は remove
 * - カーソルは旧 1 番目の子の先頭へ
 *
 * 呼び出し側は `editor.update()` コールバック内であること。
 */
export function $ungroupNode(group: GroupNode): void {
  const children = group.getChildren();
  const firstChild = children[0];

  // 子がゼロ（通常起きないが NodeTransform で段落が埋められる前の瞬間）: 黙って消す
  if (!firstChild) {
    group.remove();
    return;
  }

  let insertTarget: LexicalNode = group;
  for (const child of children) {
    insertTarget.insertAfter(child);
    insertTarget = child;
  }
  group.remove();
  firstChild.selectStart();
}
