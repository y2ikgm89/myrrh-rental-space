"use client";

/**
 * SortableTableHead - ソート可能なテーブルヘッダー
 *
 * @description クリックでソート順序を切り替えられるテーブルヘッダーコンポーネント
 */

import type { ReactNode } from "react";
import {
  IconArrowsUpDown,
  IconArrowUp,
  IconArrowDown,
} from "@tabler/icons-react";
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
  // WAI-ARIA: `aria-sort` は tableheader element 側に付ける (button ではない)。
  // 未ソート列は "none" を明示する — 省略すると screen reader が列全体を
  // "unsorted" として announce するタイミングを失う。
  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? currentSortOrder === "asc"
      ? "ascending"
      : "descending"
    : "none";
  // aria-label は sr-only + <button> 内テキストの二重読み上げを防ぐため、
  // children のうち文字列部分だけを visible text から抽出する。string 化
  // (旧 `String(children)`) は ReactNode に配列 / element が混じった時に
  // "[object Object]" になる silent bug があった。ここでは "並び替え" の
  // 状態文言だけを sr-only 併記し、可視ラベルは children 表示に任せる。
  const stateHint =
    ariaSort === "ascending"
      ? "昇順"
      : ariaSort === "descending"
        ? "降順"
        : "未ソート";

  return (
    <TableHead className={cn(className)} aria-sort={ariaSort}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onToggle(field)}
      >
        {children}
        <span className="sr-only">（{stateHint}: クリックで切替）</span>
        {isActive ? (
          currentSortOrder === "asc" ? (
            <IconArrowUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <IconArrowDown className="h-4 w-4" aria-hidden="true" />
          )
        ) : (
          <IconArrowsUpDown className="h-4 w-4 opacity-50" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}
