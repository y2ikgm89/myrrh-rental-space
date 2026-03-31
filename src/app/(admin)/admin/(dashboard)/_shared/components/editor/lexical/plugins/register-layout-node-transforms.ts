/**
 * LayoutContainer / LayoutItem の構造を正規化する Node Transforms
 *
 * 列数（templateColumnsState）はここだけが子 LayoutItem 数と整合させる正本とする。
 * 列プリセットの更新はインスペクター / ツールバーが `$setState` のみ行う（二重ロジックを避ける）。
 *
 * @see https://github.com/facebook/lexical/tree/main/packages/lexical-playground（IconLayout 関連は playground ソース参照）
 */

import {
  $createParagraphNode,
  $getState,
  mergeRegister,
  type LexicalEditor,
} from "lexical";
import { getColumnsFromTemplate } from "../config/layout-templates";
import {
  $isLayoutContainerNode,
  LayoutContainerNode,
  templateColumnsState,
} from "../nodes/LayoutContainerNode";
import {
  $createLayoutItemNode,
  $isLayoutItemNode,
  LayoutItemNode,
} from "../nodes/LayoutItemNode";

export function registerLayoutNodeTransforms(
  editor: LexicalEditor,
): () => void {
  return mergeRegister(
    editor.registerNodeTransform(LayoutItemNode, (node) => {
      const parent = node.getParent();
      if (!$isLayoutContainerNode(parent)) {
        const children = node.getChildren();
        for (const child of children) {
          node.insertBefore(child);
        }
        node.remove();
        return;
      }

      if (node.getChildren().length === 0) {
        node.append($createParagraphNode());
      }
    }),

    editor.registerNodeTransform(LayoutContainerNode, (node) => {
      const snapshot = node.getChildren();

      for (const child of snapshot) {
        if (!$isLayoutItemNode(child)) {
          const firstItem = node.getChildren().find($isLayoutItemNode);
          if (firstItem && $isLayoutItemNode(firstItem)) {
            firstItem.append(child);
          } else {
            const item = $createLayoutItemNode();
            item.append(child);
            node.append(item);
          }
        }
      }

      const expected = getColumnsFromTemplate(
        $getState(node, templateColumnsState),
      );

      while (node.getChildren().length < expected) {
        const item = $createLayoutItemNode();
        item.append($createParagraphNode());
        node.append(item);
      }

      while (node.getChildren().length > expected) {
        const ch = node.getChildren();
        const mergeTarget = ch[expected - 1];
        const overflow = ch[ch.length - 1];
        if (
          !$isLayoutItemNode(mergeTarget) ||
          !$isLayoutItemNode(overflow) ||
          overflow === mergeTarget
        ) {
          break;
        }
        for (const c of overflow.getChildren()) {
          mergeTarget.append(c);
        }
        overflow.remove();
      }
    }),
  );
}
