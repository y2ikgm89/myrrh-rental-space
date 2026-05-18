"use client";

import { useQueryStates } from "nuqs";
import { adminPostSearchParamsParsers } from "@/shared/lib/nuqs";
import { SortableColumnHeader, CheckboxCell } from "@/admin/components/table";
import { TableHeader, TableHead, TableRow } from "@/admin/components/ui";

type PostSortBy = "createdAt" | "publishedAt" | "title";

type PostTableHeaderProps = {
  allSelected: boolean;
  onToggleAll: () => void;
};

export function PostTableHeader({
  allSelected,
  onToggleAll,
}: PostTableHeaderProps) {
  const [params, setParams] = useQueryStates(adminPostSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handleSort = (column: PostSortBy) => {
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
        <TableHead className="hidden md:table-cell">カテゴリ</TableHead>
        <TableHead className="hidden text-right lg:table-cell">PV</TableHead>
        <SortableColumnHeader
          column="publishedAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden md:table-cell"
        >
          公開日時
        </SortableColumnHeader>
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
        <TableHead>操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
