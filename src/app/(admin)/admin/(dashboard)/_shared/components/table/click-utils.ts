import type { KeyboardEvent, MouseEvent } from "react";

/**
 * インタラクティブ要素のクリックが行クリック（ClickableTableRow）に
 * 伝播するのを遮断するヘルパー。
 *
 * 用途: チェックボックス・StatusSelect・mailto リンク・ActionDropdown 等を
 * 内包する `<TableCell>` の `onClick` に渡す。
 */
export const stopRowClick = (e: MouseEvent | KeyboardEvent) => {
  e.stopPropagation();
};
