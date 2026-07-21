"use client";

import { IconChevronDown, IconPlus } from "@tabler/icons-react";
import type { LexicalEditor } from "lexical";
import { Toolbar } from "radix-ui";
import { Button } from "@/admin/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";
import type { InsertItem } from "../../config/insert-items";
import type { DialogId } from "../../dialogs/dialog-types";
import { ToolbarInsertMenuItems } from "./ToolbarInsertMenu";

type Props = {
  insertItems: readonly InsertItem[];
  editor: LexicalEditor;
  openDialog?: (id: DialogId) => void;
};

export function InsertSection({ insertItems, editor, openDialog }: Props) {
  if (insertItems.length === 0) return null;
  return (
    <DropdownMenu>
      <Toolbar.Button asChild>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1">
            <IconPlus className="h-4 w-4" />
            <span className="text-xs">挿入</span>
            <IconChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
      </Toolbar.Button>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <ToolbarInsertMenuItems
          insertItems={insertItems}
          editor={editor}
          {...(openDialog !== undefined ? { openDialog } : {})}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
