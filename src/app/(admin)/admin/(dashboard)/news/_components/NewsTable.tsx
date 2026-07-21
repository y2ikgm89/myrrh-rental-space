"use client";

import { useState } from "react";
import {
  PublishSwitch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { updateNewsPublished } from "@/admin/actions/news";
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

  // Round-4 audit Cluster J / Finding #10 sibling: 検索・並び替え・ページ移動で
  // news が入れ替わっても selectedIds はローカル state に残るため、
  // 次の「一括公開 / 一括削除」で見えていない過去選択のお知らせまで対象になる。
  // 詳細は PostTable.tsx の該当コメント参照。
  const visibleIdSet = new Set(allIds);
  const effectiveSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id));

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
                <TableHead>タイトル</TableHead>
                <TableHead className="hidden md:table-cell">公開日時</TableHead>
                <TableHead className="hidden lg:table-cell">作成日時</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
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
                  <TableCell
                    className="whitespace-nowrap"
                    onClick={stopRowClick}
                  >
                    <PublishSwitch
                      id={item.id}
                      isPublished={item.isPublished}
                      onToggle={updateNewsPublished}
                      resourceLabel={`${item.title} の公開状態`}
                    />
                  </TableCell>
                  <TableCell className="text-right" onClick={stopRowClick}>
                    <NewsActionCell newsId={item.id} />
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <NewsBulkActions
        selectedIds={effectiveSelectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
