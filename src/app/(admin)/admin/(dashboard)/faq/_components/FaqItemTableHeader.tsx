"use client";

/**
 * FAQ 項目テーブルの sortable ヘッダー
 *
 * - sortBy が "order" 以外のときは dnd 並び替えが無効化される（UI で通知）
 * - 既存パターン: `PostTableHeader` / `ReservationTableHeader` と同構造
 */

import { useTransition } from "react";
import { useQueryStates } from "nuqs";
import {
  Checkbox,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { SortableColumnHeader } from "@/admin/components/table";
import type { AdminFaqItemSortBy } from "@/shared/lib/nuqs";
import { adminFaqSearchParamsParsers } from "@/shared/lib/nuqs";

type FaqItemTableHeaderProps = {
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly onToggleAll: () => void;
  readonly showCategory: boolean;
  readonly sortable: boolean;
};

export function FaqItemTableHeader({
  allSelected,
  someSelected,
  onToggleAll,
  showCategory,
  sortable,
}: FaqItemTableHeaderProps) {
  const [, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(adminFaqSearchParamsParsers, {
    history: "push",
    shallow: false,
    startTransition,
  });

  const handleSort = (column: AdminFaqItemSortBy) => {
    if (params.sortBy === column) {
      void setParams({
        sortOrder: params.sortOrder === "asc" ? "desc" : "asc",
        page: 1,
      });
    } else {
      void setParams({
        sortBy: column,
        sortOrder: column === "viewCount" ? "desc" : "asc",
        page: 1,
      });
    }
  };

  return (
    <TableHeader>
      <TableRow>
        {sortable ? (
          <TableHead className="w-12" />
        ) : (
          <TableHead className="w-8" />
        )}
        <TableHead className="w-10">
          <Checkbox
            checked={allSelected}
            aria-checked={
              allSelected ? "true" : someSelected ? "mixed" : "false"
            }
            onCheckedChange={onToggleAll}
            aria-label="すべて選択"
          />
        </TableHead>
        <TableHead>質問</TableHead>
        {showCategory && (
          <TableHead className="hidden md:table-cell">カテゴリ</TableHead>
        )}
        <TableHead className="hidden md:table-cell">公開状態</TableHead>
        <SortableColumnHeader
          column="viewCount"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden text-right lg:table-cell"
        >
          閲覧数
        </SortableColumnHeader>
        <SortableColumnHeader
          column="updatedAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          更新日時
        </SortableColumnHeader>
        <TableHead className="text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
