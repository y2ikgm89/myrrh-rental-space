"use client";

/**
 * コメント統計カード
 */

import { IconMessageCircle, IconClock, IconTrash } from "@tabler/icons-react";
import type * as PostCommentTypes from "@/shared/domain/post-comments/types";
import { formatCount } from "@/shared/lib/format/count";

type Props = {
  stats: PostCommentTypes.CommentStats;
};

export function CommentStats({ stats }: Props) {
  return (
    <div className="grid gap-4 @2xl/main:grid-cols-3">
      {/* 総コメント数 */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <IconMessageCircle className="w-4 h-4" />
          <span className="text-sm font-medium">総コメント数</span>
        </div>
        <p className="text-2xl font-bold">{formatCount(stats.total)}</p>
      </div>

      {/* 今日のコメント */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <IconClock className="w-4 h-4" />
          <span className="text-sm font-medium">今日のコメント</span>
        </div>
        <p className="text-2xl font-bold text-primary">
          {formatCount(stats.today)}
        </p>
      </div>

      {/* 削除済み */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <IconTrash className="w-4 h-4" />
          <span className="text-sm font-medium">削除済み</span>
        </div>
        <p className="text-2xl font-bold text-destructive">
          {formatCount(stats.deleted)}
        </p>
      </div>
    </div>
  );
}
