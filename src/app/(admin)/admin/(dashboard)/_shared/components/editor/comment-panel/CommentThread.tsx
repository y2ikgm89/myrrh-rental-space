/**
 * CommentThread
 *
 * @description コメントスレッド（引用テキスト + コメント一覧 + 入力フォーム）
 */

"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconMessage,
  IconRotate,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/admin/components/ui/collapsible";
import { Badge } from "@/admin/components/ui/badge";
import { cn } from "@/shared/lib/cn";
import type {
  EditorCommentThread,
  EditorCommentStatus,
} from "@/admin/types/editor-comment";
import { CommentItem } from "./CommentItem";
import { CommentForm } from "./CommentForm";

type CommentThreadProps = {
  thread: EditorCommentThread;
  isActive?: boolean;
  onSelect?: () => void;
  onResolve?: () => Promise<void>;
  onReopen?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onAddReply?: (content: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
};

const STATUS_CONFIG: Record<
  EditorCommentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  ACTIVE: { label: "未解決", variant: "secondary" },
  RESOLVED: { label: "解決済み", variant: "default" },
  DELETED: { label: "削除済み", variant: "destructive" },
};

export function CommentThread({
  thread,
  isActive = false,
  onSelect,
  onResolve,
  onReopen,
  onDelete,
  onAddReply,
  onDeleteComment,
}: CommentThreadProps) {
  const [isOpen, setIsOpen] = useState(isActive);
  const [isResolvePending, startResolveTransition] = useTransition();
  const [isReopenPending, startReopenTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  const statusConfig = STATUS_CONFIG[thread.status];
  const statusVariant = statusConfig?.variant ?? "secondary";
  const statusLabel = statusConfig?.label ?? "未解決";
  const timeAgo = formatDistanceToNow(new Date(thread.createdAt), {
    addSuffix: true,
    locale: ja,
  });

  const handleResolve = () => {
    if (!onResolve) return;
    startResolveTransition(async () => {
      await onResolve();
    });
  };

  const handleReopen = () => {
    if (!onReopen) return;
    startReopenTransition(async () => {
      await onReopen();
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    startDeleteTransition(async () => {
      await onDelete();
    });
  };

  const handleToggle = (opening: boolean) => {
    setIsOpen(opening);
    if (opening) {
      onSelect?.();
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          isActive ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        {/* ヘッダー */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
          >
            <IconMessage className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              {/* 引用テキスト */}
              <p className="text-sm text-muted-foreground line-clamp-2">
                &ldquo;{thread.quotedText}&rdquo;
              </p>
              {/* メタ情報 */}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={statusVariant} className="text-xs">
                  {statusLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {thread.comments.length}件のコメント
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo}</span>
              </div>
            </div>
            {isOpen ? (
              <IconChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <IconChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </CollapsibleTrigger>

        {/* コンテンツ */}
        <CollapsibleContent>
          <div className="border-t px-3 py-2">
            {/* アクションボタン */}
            <div className="flex gap-2 mb-3">
              {thread.status === "ACTIVE" && onResolve && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResolve}
                  disabled={isResolvePending}
                  className="gap-1"
                >
                  <IconCheck className="h-3 w-3" />
                  解決
                </Button>
              )}
              {thread.status === "RESOLVED" && onReopen && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReopen}
                  disabled={isReopenPending}
                  className="gap-1"
                >
                  <IconRotate className="h-3 w-3" />
                  再オープン
                </Button>
              )}
              {onDelete && thread.status !== "DELETED" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeletePending}
                  className="gap-1 text-destructive hover:text-destructive"
                >
                  <IconTrash className="h-3 w-3" />
                  削除
                </Button>
              )}
            </div>

            {/* コメント一覧 */}
            <div className="divide-y">
              {thread.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  {...(onDeleteComment && { onDelete: onDeleteComment })}
                  canDelete={thread.comments.length > 1}
                />
              ))}
            </div>

            {/* 返信フォーム */}
            {thread.status === "ACTIVE" && onAddReply && (
              <div className="mt-3 pt-3 border-t">
                <CommentForm
                  onSubmit={onAddReply}
                  placeholder="返信を入力..."
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
