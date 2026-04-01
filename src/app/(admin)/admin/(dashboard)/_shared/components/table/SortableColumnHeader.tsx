"use client";

import type { ReactNode } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import { TableHead } from "@/admin/components/ui";

type SortableColumnHeaderProps<T extends string> = {
  column: T;
  currentSortBy: T | null;
  currentSortOrder: "asc" | "desc";
  onSort: (column: T) => void;
  children: ReactNode;
  className?: string;
};

export function SortableColumnHeader<T extends string>({
  column,
  currentSortBy,
  currentSortOrder,
  onSort,
  children,
  className,
}: SortableColumnHeaderProps<T>) {
  const isActive = currentSortBy === column;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
      >
        {children}
        {isActive ? (
          currentSortOrder === "asc" ? (
            <IconArrowUp className="h-3.5 w-3.5" />
          ) : (
            <IconArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <IconArrowsSort className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}
