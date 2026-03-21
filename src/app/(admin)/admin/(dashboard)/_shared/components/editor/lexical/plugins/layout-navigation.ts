/**
 * カラムレイアウト内のキャレット移動（Lexical Playground の Layout と同様の境界脱出）
 *
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/nodes/LayoutContainerNode.ts
 */

import { $shouldOverrideDefaultCharacterSelection } from "@lexical/selection";
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $findMatchingParent,
  type LexicalNode,
} from "lexical";
import {
  $isLayoutContainerNode,
  type LayoutContainerNode,
} from "../nodes/LayoutContainerNode";
import {
  $isLayoutItemNode,
  type LayoutItemNode,
} from "../nodes/LayoutItemNode";

export function $findEnclosingLayoutContainer(
  start: LexicalNode,
): LayoutContainerNode | null {
  if ($isLayoutContainerNode(start)) {
    return start;
  }
  return $findMatchingParent(start, $isLayoutContainerNode);
}

export function $findEnclosingLayoutItem(
  start: LexicalNode,
): LayoutItemNode | null {
  if ($isLayoutItemNode(start)) {
    return start;
  }
  return $findMatchingParent(start, $isLayoutItemNode);
}

/**
 * 上下キーでコンテナ境界を脱出（先頭カラムの先頭 / 最終カラムの末尾のみ）
 */
export function $onVerticalEscapeLayout(direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const layoutItem = $findEnclosingLayoutItem(selection.anchor.getNode());
  if (!layoutItem) return false;

  const container = layoutItem.getParent();
  if (!$isLayoutContainerNode(container)) return false;

  const siblings = container.getChildren();
  const itemIndex = siblings.indexOf(layoutItem);
  const isLastColumn = itemIndex === siblings.length - 1;
  const isFirst = itemIndex === 0;

  if (direction === "up") {
    if (!isFirst) return false;
    if (!$shouldOverrideDefaultCharacterSelection(selection, true)) return false;
    const paragraph = $createParagraphNode();
    container.insertBefore(paragraph);
    paragraph.select();
    return true;
  }

  if (direction === "down") {
    if (!isLastColumn) return false;
    if (!$shouldOverrideDefaultCharacterSelection(selection, false)) return false;
    const paragraph = $createParagraphNode();
    container.insertAfter(paragraph);
    paragraph.select();
    return true;
  }

  return false;
}

/**
 * 左右キーで隣カラムへキャレット移動
 */
export function $onHorizontalLayoutNavigation(
  direction: "left" | "right",
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const layoutItem = $findEnclosingLayoutItem(selection.anchor.getNode());
  if (!layoutItem) return false;

  const container = layoutItem.getParent();
  if (!$isLayoutContainerNode(container)) return false;

  const siblings = container.getChildren();
  const itemIndex = siblings.indexOf(layoutItem);
  const isBackward = direction === "left";

  if (!$shouldOverrideDefaultCharacterSelection(selection, isBackward)) {
    return false;
  }

  if (direction === "right") {
    if (itemIndex >= siblings.length - 1) return false;
    const next = siblings[itemIndex + 1];
    if (!$isLayoutItemNode(next)) return false;
    const first = next.getFirstChild();
    if (first !== null) {
      first.selectStart();
      return true;
    }
    return false;
  }

  if (itemIndex <= 0) return false;
  const prev = siblings[itemIndex - 1];
  if (!$isLayoutItemNode(prev)) return false;
  const last = prev.getLastChild();
  if (last !== null) {
    last.selectEnd();
    return true;
  }
  return false;
}

/**
 * INSERT 直後など、レイアウトアイテム内の最初のブロック末尾にキャレットを置く
 */
export function $selectEndOfFirstLayoutItemBlock(
  layoutItem: LayoutItemNode,
): void {
  const first = layoutItem.getFirstChild();
  if (first !== null && $isElementNode(first)) {
    first.selectEnd();
  }
}
