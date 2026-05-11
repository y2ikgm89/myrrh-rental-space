/**
 * Table Action Menu Plugin
 *
 * @description テーブルセル選択時に行・列操作メニューを表示するプラグイン
 *
 * セル選択時に小さなトリガーボタンを表示し、
 * 行/列の挿入・削除・セル結合/分割操作を提供する
 */

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableCellNodeFromLexicalNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableSelection,
  $unmergeCell,
} from "@lexical/table";
import type { TableCellNode } from "@lexical/table";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
} from "lexical";
import { IconChevronDown } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";

// =============================================================================
// Types
// =============================================================================

type TableActionMenuPluginProps = {
  anchorElem: HTMLElement | null;
};

type MenuPosition = {
  top: number;
  left: number;
};

// =============================================================================
// Helpers
// =============================================================================

function getSelectedCellNode(): TableCellNode | null {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const anchor = selection.anchor.getNode();
    return $getTableCellNodeFromLexicalNode(anchor);
  }
  if ($isTableSelection(selection)) {
    const anchor = selection.anchor.getNode();
    return $getTableCellNodeFromLexicalNode(anchor);
  }
  return null;
}

function computeMenuPosition(
  cellNode: TableCellNode,
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  anchorElem: HTMLElement,
): MenuPosition | null {
  const cellDOMNode = editor.getElementByKey(cellNode.getKey());
  if (!cellDOMNode) return null;

  const cellRect = cellDOMNode.getBoundingClientRect();
  const anchorRect = anchorElem.getBoundingClientRect();

  return {
    top: cellRect.top - anchorRect.top + anchorElem.scrollTop,
    left: cellRect.right - anchorRect.left - 28 + anchorElem.scrollLeft,
  };
}

// =============================================================================
// Menu Component
// =============================================================================

type TableActionMenuProps = {
  position: MenuPosition;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDeleteRow: () => void;
  onDeleteColumn: () => void;
  onUnmergeCell: () => void;
  isMergedCell: boolean;
};

function TableActionMenu({
  position,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onDeleteRow,
  onDeleteColumn,
  onUnmergeCell,
  isMergedCell,
}: TableActionMenuProps) {
  return (
    <div
      className="absolute z-10"
      style={{ top: position.top + 4, left: position.left }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded border border-border bg-popover text-popover-foreground shadow-sm hover:bg-muted"
            aria-label="テーブル操作メニュー"
          >
            <IconChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[160px]">
          <DropdownMenuItem onClick={onInsertRowAbove} className="text-sm">
            上に行を挿入
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onInsertRowBelow} className="text-sm">
            下に行を挿入
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onInsertColumnLeft} className="text-sm">
            左に列を挿入
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onInsertColumnRight} className="text-sm">
            右に列を挿入
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDeleteRow}
            className="text-sm text-destructive focus:text-destructive"
          >
            行を削除
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDeleteColumn}
            className="text-sm text-destructive focus:text-destructive"
          >
            列を削除
          </DropdownMenuItem>
          {isMergedCell && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onUnmergeCell} className="text-sm">
                セルを分割
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// =============================================================================
// Main Plugin
// =============================================================================

export function TableActionMenuPlugin({
  anchorElem,
}: TableActionMenuPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [isMergedCell, setIsMergedCell] = useState(false);

  useEffect(() => {
    if (!anchorElem) return;

    const updateMenu = () => {
      editor.read(() => {
        const cellNode = getSelectedCellNode();
        if (!cellNode) {
          setMenuPosition(null);
          return;
        }

        const position = computeMenuPosition(cellNode, editor, anchorElem);
        if (!position) {
          setMenuPosition(null);
          return;
        }

        setMenuPosition(position);
        setIsMergedCell(cellNode.getColSpan() > 1 || cellNode.getRowSpan() > 1);
      });
    };

    let isFirstUpdate = true;

    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateMenu();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        // Re-compute position when table layout changes
        if (isFirstUpdate) {
          isFirstUpdate = false;
          return;
        }
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        updateMenu();
      }),
    );
  }, [editor, anchorElem]);

  const handleInsertRowAbove = () => {
    editor.update(() => {
      $insertTableRowAtSelection(false);
    });
  };

  const handleInsertRowBelow = () => {
    editor.update(() => {
      $insertTableRowAtSelection(true);
    });
  };

  const handleInsertColumnLeft = () => {
    editor.update(() => {
      $insertTableColumnAtSelection(false);
    });
  };

  const handleInsertColumnRight = () => {
    editor.update(() => {
      $insertTableColumnAtSelection(true);
    });
  };

  const handleDeleteRow = () => {
    editor.update(() => {
      $deleteTableRowAtSelection();
    });
  };

  const handleDeleteColumn = () => {
    editor.update(() => {
      $deleteTableColumnAtSelection();
    });
  };

  const handleUnmergeCell = () => {
    editor.update(() => {
      $unmergeCell();
    });
  };

  if (!anchorElem || !menuPosition) {
    return null;
  }

  return createPortal(
    <TableActionMenu
      position={menuPosition}
      onInsertRowAbove={handleInsertRowAbove}
      onInsertRowBelow={handleInsertRowBelow}
      onInsertColumnLeft={handleInsertColumnLeft}
      onInsertColumnRight={handleInsertColumnRight}
      onDeleteRow={handleDeleteRow}
      onDeleteColumn={handleDeleteColumn}
      onUnmergeCell={handleUnmergeCell}
      isMergedCell={isMergedCell}
    />,
    anchorElem,
  );
}
