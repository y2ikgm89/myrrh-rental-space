"use client";

import { useQueryStates } from "nuqs";
import { adminEventSearchParamsParsers } from "@/shared/lib/nuqs";
import { CheckboxCell, SortableColumnHeader } from "@/admin/components/table";
import { TableHeader, TableHead, TableRow } from "@/admin/components/ui";

type EventSortBy =
  "startTime" | "endTime" | "createdAt" | "updatedAt" | "title";

type EventTableHeaderProps = {
  allSelected: boolean;
  onToggleAll: () => void;
};

export function EventTableHeader({
  allSelected,
  onToggleAll,
}: EventTableHeaderProps) {
  const [params, setParams] = useQueryStates(adminEventSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  const handleSort = (column: EventSortBy) => {
    const isSameColumn = params.sortBy === column;
    void setParams({
      sortBy: column,
      sortOrder: isSameColumn && params.sortOrder === "desc" ? "asc" : "desc",
      page: 1,
    });
  };

  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-10">
          <CheckboxCell
            checked={allSelected}
            onChange={() => onToggleAll()}
            aria-label="すべての行を選択"
          />
        </TableHead>
        <SortableColumnHeader
          column="title"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          タイトル
        </SortableColumnHeader>
        <SortableColumnHeader
          column="startTime"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden md:table-cell"
        >
          開始日時
        </SortableColumnHeader>
        <TableHead className="hidden md:table-cell">終了日時</TableHead>
        <TableHead className="hidden lg:table-cell">場所</TableHead>
        <TableHead>ステータス</TableHead>
        <TableHead className="text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
