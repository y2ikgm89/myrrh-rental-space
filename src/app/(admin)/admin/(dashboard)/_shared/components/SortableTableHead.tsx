"use client";

/**
 * SortableTableHead - ソート可能なテーブルヘッダー
 *
 * @description クリックでソート順序を切り替えられるテーブルヘッダーコンポーネント
 */

import type { ReactNode } from "react";
import { IconArrowsUpDown, IconArrowUp, IconArrowDown } from "@tabler/icons-react";
import { TableHead } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";

type SortableTableHeadProps<T extends string> = {
  field: T;
  currentSortBy: T;
  currentSortOrder: "asc" | "desc";
  onToggle: (field: T) => void;
  children: ReactNode;
  className?: string;
};

export function SortableTableHead<T extends string>({
  field,
  currentSortBy,
  currentSortOrder,
  onToggle,
  children,
  className,
}: SortableTableHeadProps<T>) {
  const isActive = currentSortBy === field;

  return (
    <TableHead className={cn(className)}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onToggle(field)}
        aria-label={`${String(children)}で並び替え`}
      >
        {children}
        {isActive ? (
          currentSortOrder === "asc" ? (
            <IconArrowUp className="h-4 w-4" />
          ) : (
            <IconArrowDown className="h-4 w-4" />
          )
        ) : (
          <IconArrowsUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}
