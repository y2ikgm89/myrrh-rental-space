"use client";

/**
 * 投稿一覧テーブル
 *
 * チェックボックス付きのインタラクティブテーブル
 */

import { useState } from "react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { PostStatusBadge } from "@/admin/components/status-badges";
import { PostActionCell } from "./PostActionCell";
import { PostTableHeader } from "./PostTableHeader";
import { PostBulkActions } from "./PostBulkActions";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { PostListData } from "@/shared/domain/posts/types";

// =============================================================================
// Types
// =============================================================================

type PostTableProps = {
  posts: PostListData[];
};

// =============================================================================
// PostTable Component
// =============================================================================

export function PostTable({ posts }: PostTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = posts.map((p) => p.id);
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

  if (posts.length === 0) {
    return (
      <EmptyState
        message="投稿がありません"
        action={{ label: "新規作成", href: "/admin/posts/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <PostTableHeader
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(post.id)}
                      onChange={() => toggleOne(post.id)}
                      className="rounded border-border"
                      aria-label={`${post.title}を選択`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <PostStatusBadge status={post.status} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="max-w-xs truncate font-medium">
                        {post.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        /{post.slug}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{post.category.name}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                    {post.viewCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {post.publishedAt
                      ? formatDateTimeShort(post.publishedAt)
                      : "-"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatDateTimeShort(post.createdAt)}
                  </TableCell>
                  <TableCell>
                    <PostActionCell postId={post.id} status={post.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 一括操作バー */}
      <PostBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
