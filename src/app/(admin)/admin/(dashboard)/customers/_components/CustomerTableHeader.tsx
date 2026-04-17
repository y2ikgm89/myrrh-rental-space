"use client";

import { useQueryStates } from "nuqs";
import { SortableColumnHeader } from "@/admin/components/table";
import { TableHead, TableHeader, TableRow } from "@/admin/components/ui";
import {
  adminCustomerSearchParamsParsers,
  type AdminCustomerSortBy,
} from "@/shared/lib/nuqs";

export function CustomerTableHeader() {
  const [params, setParams] = useQueryStates(adminCustomerSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handleSort = (column: AdminCustomerSortBy) => {
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
        <TableHead>ステータス</TableHead>
        <TableHead>お名前</TableHead>
        <TableHead className="hidden md:table-cell">種別</TableHead>
        <TableHead className="hidden lg:table-cell">メールアドレス</TableHead>
        <TableHead className="hidden md:table-cell">電話番号</TableHead>
        <SortableColumnHeader
          column="totalReservations"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden text-right md:table-cell"
        >
          予約数
        </SortableColumnHeader>
        <SortableColumnHeader
          column="totalSpent"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden text-right lg:table-cell"
        >
          累計金額
        </SortableColumnHeader>
        <SortableColumnHeader
          column="lastReservationAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          最終予約
        </SortableColumnHeader>
        <SortableColumnHeader
          column="createdAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden text-right lg:table-cell"
        >
          登録日
        </SortableColumnHeader>
        <TableHead>操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
