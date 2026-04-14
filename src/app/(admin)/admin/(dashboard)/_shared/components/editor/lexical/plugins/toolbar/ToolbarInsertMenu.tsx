"use client";

import { Fragment } from "react";
import type { LexicalEditor } from "lexical";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/admin/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MERGED_CATEGORY_PAIRS,
  executeInsertItem,
  type InsertItem,
} from "../../config/insert-items";
import type { DialogId } from "../../dialogs/dialog-types";

/** サブメニュー内を 2 カラムにする最小件数 */
const TOOLBAR_INSERT_SUBMENU_GRID_MIN_ITEMS = 6;

function toolbarInsertSubContentClassName(itemCount: number): string {
  if (itemCount >= TOOLBAR_INSERT_SUBMENU_GRID_MIN_ITEMS) {
    return cn(
      "min-w-[272px] max-h-[min(70vh,440px)] overflow-y-auto p-1",
      "grid grid-cols-2 gap-0.5",
    );
  }
  return "min-w-[200px] max-h-[min(70vh,440px)] overflow-y-auto p-1";
}

type Props = {
  insertItems: readonly InsertItem[];
  editor: LexicalEditor;
  openDialog?: (id: DialogId) => void;
};

export function ToolbarInsertMenuItems({
  insertItems,
  editor,
  openDialog,
}: Props) {
  const categoriesWithItems = CATEGORY_ORDER.filter((category) =>
    insertItems.some((i) => i.category === category),
  );
  return categoriesWithItems.map((category, catIndex) => {
    const prevCategory = categoriesWithItems[catIndex - 1];
    const showSeparator =
      prevCategory !== undefined &&
      !MERGED_CATEGORY_PAIRS.has(`${prevCategory}→${category}`);
    const categoryItems = insertItems.filter((i) => i.category === category);

    if (categoryItems.length === 1) {
      const item = categoryItems[0];
      if (item === undefined) {
        return null;
      }
      return (
        <Fragment key={category}>
          {showSeparator && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={() => executeInsertItem(item, editor, openDialog)}
            className="flex items-center gap-2"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{item.label}</span>
          </DropdownMenuItem>
        </Fragment>
      );
    }

    return (
      <Fragment key={category}>
        {showSeparator && <DropdownMenuSeparator />}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <span className="min-w-0 flex-1 truncate text-left">
              {CATEGORY_LABELS[category]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={4}
            alignOffset={-4}
            className={toolbarInsertSubContentClassName(categoryItems.length)}
          >
            {categoryItems.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => executeInsertItem(item, editor, openDialog)}
                className={cn(
                  "flex items-center gap-2",
                  categoryItems.length >=
                    TOOLBAR_INSERT_SUBMENU_GRID_MIN_ITEMS && "py-2 text-xs",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{item.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </Fragment>
    );
  });
}
