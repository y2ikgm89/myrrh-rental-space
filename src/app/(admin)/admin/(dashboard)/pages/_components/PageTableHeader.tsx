"use client";

/**
 * ページ一覧テーブルヘッダー
 *
 * カラム順は admin-ui-patterns.md のワークフロー系テーブル例外に従い、
 * 状態を左端に配置: checkbox → ステータス → タイトル → 種別 → スラッグ → セクション数 → 更新日時 → 操作
 */

import { useQueryStates } from "nuqs";
import {
  adminPageSearchParamsParsers,
  type AdminPageSortBy,
} from "@/shared/lib/nuqs";
import { SortableColumnHeader } from "@/admin/components/table";
import { TableHeader, TableHead, TableRow } from "@/admin/components/ui";

type PageTableHeaderProps = {
  allSelected: boolean;
  onToggleAll: () => void;
};

export function PageTableHeader({
  allSelected,
  onToggleAll,
}: PageTableHeaderProps) {
  const [params, setParams] = useQueryStates(adminPageSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handleSort = (column: AdminPageSortBy) => {
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
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="rounded border-border"
            aria-label="全選択"
          />
        </TableHead>
        <TableHead>ステータス</TableHead>
        <SortableColumnHeader
          column="title"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          タイトル
        </SortableColumnHeader>
        <TableHead className="hidden md:table-cell">種別</TableHead>
        <SortableColumnHeader
          column="slug"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden sm:table-cell"
        >
          スラッグ
        </SortableColumnHeader>
        <TableHead className="hidden text-right md:table-cell">構成</TableHead>
        <SortableColumnHeader
          column="updatedAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden md:table-cell"
        >
          更新日時
        </SortableColumnHeader>
        <TableHead>操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
