"use client";

import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
import { SortableColumnHeader, CheckboxCell } from "@/admin/components/table";
import { TableHeader, TableHead, TableRow } from "@/admin/components/ui";

type ReservationSortBy = "startTime" | "createdAt";

type ReservationTableHeaderProps = {
  allSelected: boolean;
  onToggleAll: () => void;
};

export function ReservationTableHeader({
  allSelected,
  onToggleAll,
}: ReservationTableHeaderProps) {
  const [params, setParams] = useQueryStates(
    adminReservationSearchParamsParsers,
    {
      history: "push",
      shallow: false,
    },
  );

  const handleSort = (column: ReservationSortBy) => {
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
          column="startTime"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          予約日時
        </SortableColumnHeader>
        <TableHead>スペース</TableHead>
        <TableHead className="hidden lg:table-cell">顧客</TableHead>
        <TableHead className="hidden text-right md:table-cell">料金</TableHead>
        <TableHead className="hidden md:table-cell">決済</TableHead>
        <SortableColumnHeader
          column="createdAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          登録日
        </SortableColumnHeader>
        <TableHead>ステータス</TableHead>
        <TableHead className="text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
