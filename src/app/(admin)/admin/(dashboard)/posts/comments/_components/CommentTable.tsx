"use client";

/**
 * コメント一覧テーブル
 *
 * 一括選択・削除機能付き
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { IconTrash, IconExternalLink, IconUser } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Checkbox,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";
import {
  deleteCommentAdmin,
  deleteCommentsAdmin,
  restoreCommentAdmin,
} from "@/admin/actions/post-comment";
import type { AdminCommentData } from "@/shared/domain/post-comments/types";
import { cn } from "@/shared/lib/cn";
import { isMutationError } from "@/shared/lib/mutation-result";

type Props = {
  comments: AdminCommentData[];
};

export function CommentTable({ comments }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  // 全選択/解除
  function toggleAll() {
    if (selected.length === comments.length) {
      setSelected([]);
    } else {
      setSelected(comments.map((c) => c.id));
    }
  }

  // 個別選択
  function toggleOne(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  // 一括削除
  async function handleBulkDelete() {
    const confirmed = await confirm({
      title: "コメントを一括削除しますか？",
      description: `選択した${selected.length}件のコメントを削除します。`,
      confirmLabel: "削除",
      variant: "destructive",
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteCommentsAdmin(selected);
      if (!isMutationError(result)) {
        setSelected([]);
      } else {
        setError(result.error);
      }
    });
  }

  // 単一削除
  async function handleDelete(id: string) {
    const confirmed = await confirm({
      title: "コメントを削除しますか？",
      description: "このコメントを削除します。",
      confirmLabel: "削除",
      variant: "destructive",
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteCommentAdmin(id);
      if (isMutationError(result)) {
        setError(result.error);
      }
    });
  }

  // 復元
  async function handleRestore(id: string) {
    const confirmed = await confirm({
      title: "コメントを復元しますか？",
      description: "このコメントを復元します。",
      confirmLabel: "復元",
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await restoreCommentAdmin(id);
      if (isMutationError(result)) {
        setError(result.error);
      }
    });
  }

  // 投稿者名を取得
  function getAuthorName(comment: AdminCommentData): string {
    return comment.author.type === "user"
      ? comment.author.name
      : comment.author.guestName;
  }

  if (comments.length === 0) {
    return <EmptyState message="コメントがありません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* 一括操作バー */}
      {selected.length > 0 && (
        <div className="flex items-center gap-4 p-4 border-b bg-muted/50">
          <span className="text-sm font-medium">{selected.length}件選択中</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isPending}
          >
            <IconTrash className="w-4 h-4 mr-1" />
            選択したコメントを削除
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelected([])}>
            選択解除
          </Button>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="p-4 border-b bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* テーブル */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.length === comments.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="min-w-[200px]">コメント</TableHead>
              <TableHead className="hidden lg:table-cell">投稿者</TableHead>
              <TableHead className="hidden md:table-cell">記事</TableHead>
              <TableHead className="hidden md:table-cell">投稿日時</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comments.map((comment) => (
              <TableRow
                key={comment.id}
                className={cn(comment.isDeleted && "opacity-50")}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.includes(comment.id)}
                    onCheckedChange={() => toggleOne(comment.id)}
                  />
                </TableCell>
                <TableCell>
                  <p className="text-sm line-clamp-2 max-w-[300px]">
                    {comment.content}
                  </p>
                  {comment.parentCommentId && (
                    <span className="text-xs text-muted-foreground mt-1 block">
                      ↳ 返信コメント
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <IconUser className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {getAuthorName(comment)}
                      </p>
                      {comment.author.type === "guest" && (
                        <p className="text-xs text-muted-foreground">
                          {comment.author.guestEmail}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Link
                    href={comment.postUrl}
                    target="_blank"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <span className="line-clamp-1 max-w-[150px]">
                      {comment.postTitle}
                    </span>
                    <IconExternalLink className="w-3 h-3 flex-shrink-0" />
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), {
                      addSuffix: true,
                      locale: ja,
                    })}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {comment.isDeleted ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-destructive/10 text-destructive">
                      削除済み
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-success/10 text-success">
                      アクティブ
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ActionDropdown disabled={isPending}>
                    {comment.isDeleted ? (
                      <ActionDropdownItem
                        onClick={() => handleRestore(comment.id)}
                      >
                        復元
                      </ActionDropdownItem>
                    ) : (
                      <ActionDropdownItem
                        destructive
                        onClick={() => handleDelete(comment.id)}
                      >
                        削除
                      </ActionDropdownItem>
                    )}
                  </ActionDropdown>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
