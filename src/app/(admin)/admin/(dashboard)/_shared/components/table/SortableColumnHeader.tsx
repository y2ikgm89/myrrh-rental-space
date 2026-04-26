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
  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? currentSortOrder === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const directionLabel = isActive
    ? currentSortOrder === "asc"
      ? "昇順"
      : "降順"
    : "未ソート";

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
      >
        {children}
        <span className="sr-only">（{directionLabel}）</span>
        {isActive ? (
          currentSortOrder === "asc" ? (
            <IconArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <IconArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          <IconArrowsSort
            className="h-3.5 w-3.5 text-muted-foreground/50"
            aria-hidden="true"
          />
        )}
      </button>
    </TableHead>
  );
}
