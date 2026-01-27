'use client'

/**
 * コメント統計カード
 */

import { MessageCircle, Clock, Trash2 } from 'lucide-react'
import type { CommentStats as Stats } from '@/admin/actions/post-comment'

type Props = {
  stats: Stats
}

export function CommentStats({ stats }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* 総コメント数 */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <MessageCircle className="w-4 h-4" />
          <span className="text-sm font-medium">総コメント数</span>
        </div>
        <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
      </div>

      {/* 今日のコメント */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">今日のコメント</span>
        </div>
        <p className="text-2xl font-bold text-primary">
          {stats.today.toLocaleString()}
        </p>
      </div>

      {/* 削除済み */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">削除済み</span>
        </div>
        <p className="text-2xl font-bold text-destructive">
          {stats.deleted.toLocaleString()}
        </p>
      </div>
    </div>
  )
}
