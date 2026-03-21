/**
 * カラムレイアウトの挿入ヘルパー
 *
 * @description `INSERT_LAYOUT_COMMAND` とテストで共有。列数は `getColumnsFromTemplate` に従い、
 * 各 `LayoutItem` に空段落を 1 つ入れた `LayoutContainerNode` を返す。
 *
 * @see `@lexical/utils` の `$insertNodeToNearestRoot`（Lexical 公式ユーティリティ）
 */

import { $createParagraphNode, type LexicalNode } from "lexical";
import { getColumnsFromTemplate } from "../config/layout-templates";
import {
  $createLayoutContainerNode,
  type LayoutContainerNode,
} from "../nodes/LayoutContainerNode";
import { $createLayoutItemNode } from "../nodes/LayoutItemNode";

export function $createPopulatedLayoutContainer(
  templateColumns: string,
  templateColumnsNarrow: string,
): LayoutContainerNode {
  const container = $createLayoutContainerNode(
    templateColumns,
    templateColumnsNarrow,
  );
  const columnCount = getColumnsFromTemplate(templateColumns);
  for (let i = 0; i < columnCount; i++) {
    const item = $createLayoutItemNode();
    item.append($createParagraphNode());
    container.append(item);
  }
  return container;
}

/**
 * 挿入直後にキャレットが新レイアウト配下にあるか（ダイアログで選択が失われた場合の判定用）
 */
export function $hasLexicalAncestorWithKey(
  node: LexicalNode,
  ancestorKey: string,
): boolean {
  let current: LexicalNode | null = node;
  while (current !== null) {
    if (current.getKey() === ancestorKey) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}
