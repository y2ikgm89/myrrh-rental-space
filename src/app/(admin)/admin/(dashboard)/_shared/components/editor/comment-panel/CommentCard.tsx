/**
 * CommentCard
 *
 * @description
 * コメントスレッド 1 件 = 1 枚のカード（Google Docs 型）。
 * 折りたたみヘッダー（引用 / アバター / 名前 / 時刻 / 件数 / status / 解決・削除）と、
 * 展開時の本体（コメント一覧 + 返信フォーム）を 1 コンポーネントに統合する。
 *
 * 複数カードが同時に展開できる（一覧 = 詳細同居）。active（本文マーク選択中）の
 * カードはリング強調 + 自動展開される。
 *
 * a11y: トグルと解決/削除ボタンは「兄弟」配置（button ネスト違反を回避）。
 * 全 interactive 要素は WCAG 2.5.5（44×44px）を満たす。
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import {
  IconCheck,
  IconChevronDown,
  IconMessage,
  IconRotate,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useEffectEvent, useId } from "react";
import { Badge } from "@/admin/components/ui/badge";
import { Button } from "@/admin/components/ui/button";
import { Skeleton } from "@/admin/components/ui/skeleton";
import { cn } from "@/shared/lib/cn";
import { EDITOR_COMMENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import type {
  EditorCommentStatus,
  EditorCommentThread,
  ThreadListItem,
} from "@/admin/types/editor-comment";
import { CommentItem } from "./CommentItem";
import { CommentForm } from "./CommentForm";

type CommentCardProps = {
  thread: ThreadListItem;
  detail: EditorCommentThread | undefined;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: (threadId: string) => void;
  /** 展開時に detail 未取得なら親へ取得を要求する。 */
  onNeedDetail?: (threadId: string) => void;
  /** ↑/↓ で隣接カードのトグルへフォーカス移動（dir: -1=前 / 1=次）。 */
  onNavigate?: (threadId: string, dir: -1 | 1) => void;
  onResolve?: (threadId: string) => void;
  onReopen?: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onAddReply?: (threadId: string, content: string) => Promise<void>;
  onDeleteComment?: (commentId: string, threadId: string) => void;
};

const STATUS_VARIANT: Record<
  EditorCommentStatus,
  "default" | "secondary" | "destructive"
> = {
  ACTIVE: "secondary",
  RESOLVED: "default",
  DELETED: "destructive",
};

export function CommentCard({
  thread,
  detail,
  isExpanded,
  isActive,
  onToggle,
  onNeedDetail,
  onNavigate,
  onResolve,
  onReopen,
  onDelete,
  onAddReply,
  onDeleteComment,
}: CommentCardProps) {
  const panelId = useId();

  // 展開かつ detail 未取得なら親へ取得要求（カードが自身のデータ読込を担う）。
  const requestDetail = useEffectEvent(() => onNeedDetail?.(thread.id));
  useEffect(() => {
    if (isExpanded && !detail) requestDetail();
  }, [isExpanded, detail]);
  const timeAgo = formatDistanceToNow(new Date(thread.createdAt), {
    addSuffix: true,
    locale: ja,
  });
  const initial = thread.createdByName.trim().charAt(0);
  const statusLabel = EDITOR_COMMENT_STATUS_LABELS[thread.status];
  const statusVariant = STATUS_VARIANT[thread.status];

  return (
    <div
      className={cn(
        "group rounded-lg border transition-colors",
        isActive
          ? "border-primary bg-primary/5 ring-2 ring-ring/40"
          : "border-border bg-card",
      )}
    >
      {/* ヘッダー行: トグルボタン（flex-1）+ アクション（兄弟配置で button ネスト回避） */}
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => onToggle(thread.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onNavigate?.(thread.id, 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              onNavigate?.(thread.id, -1);
            }
          }}
          className="flex min-h-11 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* 引用スニペット */}
            <span className="line-clamp-2 text-sm text-muted-foreground">
              &ldquo;{thread.quotedText}&rdquo;
            </span>
            {/* メタ行: アバター + 名前 + 時刻 + 件数 + status */}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[0.625rem] font-medium text-muted-foreground"
                  aria-hidden="true"
                >
                  {initial}
                </span>
                <span className="font-medium text-foreground">
                  {thread.createdByName}
                </span>
              </span>
              <span>{timeAgo}</span>
              <span className="flex items-center gap-0.5">
                <IconMessage className="h-3.5 w-3.5" aria-hidden="true" />
                {thread.commentCount}
              </span>
              <Badge variant={statusVariant} className="text-xs">
                {statusLabel}
              </Badge>
            </span>
            {/* 最新コメントプレビュー（折りたたみ時のみ） */}
            {!isExpanded && thread.latestComment && (
              <span className="line-clamp-1 text-xs text-foreground/80">
                {thread.latestComment.createdByName}:{" "}
                {thread.latestComment.content}
              </span>
            )}
          </span>
        </button>

        {/* アクション */}
        <div className="flex shrink-0 items-center">
          {thread.status === "ACTIVE" && onResolve && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onResolve(thread.id)}
              aria-label="解決"
              title="解決"
            >
              <IconCheck className="h-4 w-4" />
            </Button>
          )}
          {thread.status === "RESOLVED" && onReopen && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onReopen(thread.id)}
              aria-label="再オープン"
              title="再オープン"
            >
              <IconRotate className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="destructive-ghost"
            size="icon"
            onClick={() => onDelete(thread.id)}
            aria-label="削除"
            title="削除"
            // 削除は副次操作: hover / focus 時のみ表示してクラッタを減らす（解決✓は常時表示）。
            // opacity 制御のため DOM 上は常に存在 = キーボードで Tab 到達可能（a11y 担保）。
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          >
            <IconTrash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 展開部 */}
      {isExpanded && (
        <div id={panelId} className="border-t px-3 py-2">
          {detail ? (
            <>
              <div className="divide-y">
                {detail.comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    {...(onDeleteComment && {
                      onDelete: (commentId: string) =>
                        onDeleteComment(commentId, thread.id),
                    })}
                    canDelete={detail.comments.length > 1}
                  />
                ))}
              </div>
              {detail.status === "ACTIVE" && onAddReply && (
                <div className="mt-3 border-t pt-3">
                  <CommentForm
                    onSubmit={(content) => onAddReply(thread.id, content)}
                    placeholder="返信を入力..."
                    autoFocus={isActive}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 py-2">
              <Skeleton variant="text" className="h-4 w-3/4" />
              <Skeleton variant="text" className="h-4 w-1/2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
