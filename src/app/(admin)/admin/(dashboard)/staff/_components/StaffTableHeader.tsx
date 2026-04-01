"use client";

import { useQueryStates } from "nuqs";
import { adminUserSearchParamsParsers } from "@/shared/lib/nuqs";
import { SortableColumnHeader } from "@/admin/components/table";
import { TableHeader, TableHead, TableRow } from "@/admin/components/ui";

export function StaffTableHeader() {
  const [params, setParams] = useQueryStates(adminUserSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handleSort = (column: string) => {
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
        <SortableColumnHeader
          column="name"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          名前
        </SortableColumnHeader>
        <TableHead>メールアドレス</TableHead>
        <TableHead className="whitespace-nowrap">ロール</TableHead>
        <TableHead className="hidden md:table-cell">予約数</TableHead>
        <TableHead className="hidden md:table-cell">記事数</TableHead>
        <SortableColumnHeader
          column="createdAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          登録日
        </SortableColumnHeader>
        <TableHead className="text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
