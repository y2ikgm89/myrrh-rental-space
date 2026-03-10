/**
 * CommentItem
 *
 * @description 個別のコメントを表示するコンポーネント
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Trash2, User } from "lucide-react";
import { Button } from "@/admin/components/ui/button";
import type { EditorComment } from "@/admin/types/editor-comment";

type CommentItemProps = {
  comment: EditorComment;
  onDelete?: (commentId: string) => void;
  canDelete?: boolean;
};

export function CommentItem({
  comment,
  onDelete,
  canDelete = true,
}: CommentItemProps) {
  const timeAgo = formatDistanceToNow(new Date(comment.createdAt), {
    addSuffix: true,
    locale: ja,
  });

  return (
    <div className="group flex gap-3 py-3">
      {/* アバター */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* コンテンツ */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {comment.createdByUser?.name ?? "不明なユーザー"}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      </div>

      {/* アクション */}
      {canDelete && onDelete && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDelete(comment.id)}
            title="削除"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}
