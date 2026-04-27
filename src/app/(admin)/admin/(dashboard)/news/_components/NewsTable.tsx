"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { NewsStatusBadge } from "@/admin/components/status-badges";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { NewsActionCell } from "./NewsActionCell";
import { NewsBulkActions } from "./NewsBulkActions";
import type { NewsListItem } from "@/shared/domain/news/types";

// =============================================================================
// Types
// =============================================================================

type NewsTableProps = {
  news: NewsListItem[];
};

// =============================================================================
// NewsTable Component (Client Component)
// =============================================================================

export function NewsTable({ news }: NewsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = news.map((item) => item.id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  if (news.length === 0) {
    return (
      <EmptyState
        message="お知らせがありません"
        action={{ label: "新規作成", href: "/admin/news/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <CheckboxCell
                    checked={allSelected}
                    onChange={() => toggleAll()}
                    aria-label="すべての行を選択"
                  />
                </TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>タイトル</TableHead>
                <TableHead className="hidden md:table-cell">公開日時</TableHead>
                <TableHead className="hidden lg:table-cell">作成日時</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {news.map((item) => (
                <ClickableTableRow
                  key={item.id}
                  href={`/admin/news/${item.id}`}
                  aria-label={`${item.title} のお知らせを編集`}
                >
                  <TableCell onClick={stopRowClick}>
                    <CheckboxCell
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleOne(item.id)}
                      aria-label={`${item.title} を選択`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <NewsStatusBadge isPublished={item.isPublished} />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate font-medium">
                      {item.title}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {item.publishedAtLabel ?? "-"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {item.createdAtLabel}
                  </TableCell>
                  <TableCell onClick={stopRowClick}>
                    <NewsActionCell
                      newsId={item.id}
                      isPublished={item.isPublished}
                    />
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <NewsBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
