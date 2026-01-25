/**
 * CommentPanel
 *
 * @description エディタコメントのサイドパネル
 *
 * コンテンツに紐づくコメントスレッド一覧を表示し、
 * 追加・返信・解決・削除などの操作を提供します。
 */

'use client'

import { startTransition, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Plus, X } from 'lucide-react'
import { Button } from '@/admin/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/admin/components/ui/tabs'
import {
  getCommentThreads,
  getThreadDetail,
  resolveThread,
  reopenThread,
  deleteThread,
  addComment,
  deleteComment,
  createCommentThread,
} from '@/admin/actions/editor-comment'
import type {
  EditorCommentThread,
  CommentableContentType,
  ThreadListItem,
} from '@/admin/types/editor-comment'
import { CommentThread } from './CommentThread'

type CommentPanelProps = {
  /** パネルの表示状態 */
  isOpen: boolean
  contentType: CommentableContentType
  contentId: string
  activeMarkId?: string | null
  onClose?: () => void
  onAddComment?: () => void
  pendingComment?: {
    markId: string
    quotedText: string
  } | null
  onPendingCommentSubmit?: (comment: string) => void
}

type TabValue = 'active' | 'resolved'

/**
 * コメントパネルコンポーネント
 *
 * isOpen=false の場合は何もレンダリングしない
 */
export function CommentPanel({
  isOpen,
  contentType,
  contentId,
  activeMarkId,
  onClose,
  onAddComment,
  pendingComment,
  onPendingCommentSubmit,
}: CommentPanelProps): React.ReactElement | null {
  const [tab, setTab] = useState<TabValue>('active')
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [expandedThread, setExpandedThread] = useState<EditorCommentThread | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingCommentText, setPendingCommentText] = useState('')

  // スレッド一覧を取得
  const loadThreads = useCallback(async () => {
    setIsLoading(true)
    const result = await getCommentThreads({
      contentType,
      contentId,
      status: tab === 'active' ? 'ACTIVE' : 'RESOLVED',
    })

    if (result.success) {
      setThreads(result.data)
    } else {
      toast.error(result.error)
    }
    setIsLoading(false)
  }, [contentType, contentId, tab])

  // スレッド選択
  const handleSelectThread = async (threadId: string) => {
    const result = await getThreadDetail(threadId)
    if (result.success) {
      setExpandedThread(result.data)
    }
  }

  // 初回ロード・タブ変更時に再取得
  useEffect(() => {
    let ignore = false

    startTransition(async () => {
      await loadThreads()
      // ignore フラグは、コンポーネントがアンマウントされた後の状態更新を防ぐ
      // loadThreads 内部で状態を更新するため、ここでは早期リターンのみ
      if (ignore) return
    })

    return () => {
      ignore = true
    }
  }, [loadThreads])

  // activeMarkId が変更されたら該当スレッドを開く
  useEffect(() => {
    if (!activeMarkId) return

    const thread = threads.find((t) => t.markId === activeMarkId)
    if (!thread) return

    // 非同期でスレッド詳細を取得
    const loadActiveThread = async () => {
      const result = await getThreadDetail(thread.id)
      if (result.success) {
        startTransition(() => {
          setExpandedThread(result.data)
        })
      }
    }
    loadActiveThread()
  }, [activeMarkId, threads])

  // スレッド解決
  const handleResolve = async (threadId: string) => {
    startTransition(async () => {
      const result = await resolveThread(threadId)
      if (result.success) {
        toast.success('スレッドを解決しました')
        // React 19: await後の状態更新は別のstartTransitionでラップ
        startTransition(() => {
          loadThreads()
          setExpandedThread(null)
        })
      } else {
        toast.error(result.error)
      }
    })
  }

  // スレッド再オープン
  const handleReopen = async (threadId: string) => {
    startTransition(async () => {
      const result = await reopenThread(threadId)
      if (result.success) {
        toast.success('スレッドを再オープンしました')
        // React 19: await後の状態更新は別のstartTransitionでラップ
        startTransition(() => {
          loadThreads()
          setExpandedThread(null)
        })
      } else {
        toast.error(result.error)
      }
    })
  }

  // スレッド削除
  const handleDeleteThread = async (threadId: string) => {
    startTransition(async () => {
      const result = await deleteThread(threadId)
      if (result.success) {
        toast.success('スレッドを削除しました')
        // React 19: await後の状態更新は別のstartTransitionでラップ
        startTransition(() => {
          loadThreads()
          setExpandedThread(null)
        })
      } else {
        toast.error(result.error)
      }
    })
  }

  // 返信追加
  const handleAddReply = async (threadId: string, content: string) => {
    const result = await addComment({ threadId, content })
    if (result.success) {
      // スレッドを再取得して更新
      const detailResult = await getThreadDetail(threadId)
      if (detailResult.success) {
        setExpandedThread(detailResult.data)
      }
      await loadThreads()
    } else {
      toast.error(result.error)
    }
  }

  // コメント削除
  const handleDeleteComment = async (commentId: string, threadId: string) => {
    const result = await deleteComment(commentId)
    if (result.success) {
      // スレッドを再取得して更新
      const detailResult = await getThreadDetail(threadId)
      if (detailResult.success) {
        setExpandedThread(detailResult.data)
      }
      await loadThreads()
    } else {
      toast.error(result.error)
    }
  }

  // 新規コメント追加（pending から）
  const handlePendingCommentSubmit = async () => {
    const comment = pendingCommentText.trim()
    if (!pendingComment || !comment) return

    const result = await createCommentThread({
      markId: pendingComment.markId,
      contentType,
      contentId,
      quotedText: pendingComment.quotedText,
      initialComment: comment,
    })

    if (result.success) {
      toast.success('コメントを追加しました')
      setPendingCommentText('')
      onPendingCommentSubmit?.(comment)
      await loadThreads()
    } else {
      toast.error(result.error)
    }
  }

  // threads are already filtered by tab status from API
  const threadCount = threads.length

  // パネルが閉じている場合は何も表示しない
  if (!isOpen) return null

  return (
    <>
      {/* モバイル用オーバーレイ */}
      <div
        className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* サイドパネル */}
      <aside
        className="fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-full bg-background border-l shadow-xl sm:w-80 flex flex-col"
        aria-label="コメントパネル"
      >
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h2 className="font-semibold">コメント</h2>
        </div>
        <div className="flex items-center gap-2">
          {onAddComment && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddComment}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </Button>
          )}
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 新規コメント入力（pendingComment がある場合） */}
      {pendingComment && (
        <div className="border-b p-4">
          <div className="rounded-lg border border-primary bg-primary/5 p-3">
            <p className="text-sm text-muted-foreground mb-2">
              &ldquo;{pendingComment.quotedText.length > 100
                ? `${pendingComment.quotedText.slice(0, 100)}...`
                : pendingComment.quotedText}&rdquo;
            </p>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="コメントを入力..."
              rows={3}
              value={pendingCommentText}
              onChange={(e) => setPendingCommentText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  handlePendingCommentSubmit()
                }
              }}
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handlePendingCommentSubmit}
                disabled={!pendingCommentText.trim()}
              >
                コメント追加
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* タブ */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-2">
          <TabsTrigger value="active" className="gap-1">
            未解決
            {tab === 'active' && threadCount > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                {threadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1">
            解決済み
            {tab === 'resolved' && threadCount > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                {threadCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex-1 mt-0 p-0">
          <ThreadList
            threads={threads}
            expandedThread={expandedThread}
            activeMarkId={activeMarkId}
            isLoading={isLoading}
            emptyMessage="未解決のコメントはありません"
            onSelectThread={handleSelectThread}
            onResolve={handleResolve}
            onDelete={handleDeleteThread}
            onAddReply={handleAddReply}
            onDeleteComment={handleDeleteComment}
          />
        </TabsContent>

        <TabsContent value="resolved" className="flex-1 mt-0 p-0">
          <ThreadList
            threads={threads}
            expandedThread={expandedThread}
            activeMarkId={activeMarkId}
            isLoading={isLoading}
            emptyMessage="解決済みのコメントはありません"
            onSelectThread={handleSelectThread}
            onReopen={handleReopen}
            onDelete={handleDeleteThread}
          />
        </TabsContent>
      </Tabs>
      </aside>
    </>
  )
}

// =============================================================================
// Thread List Component
// =============================================================================

type ThreadListProps = {
  threads: ThreadListItem[]
  expandedThread: EditorCommentThread | null
  activeMarkId?: string | null
  isLoading: boolean
  emptyMessage: string
  onSelectThread: (threadId: string) => void
  onResolve?: (threadId: string) => Promise<void>
  onReopen?: (threadId: string) => Promise<void>
  onDelete: (threadId: string) => Promise<void>
  onAddReply?: (threadId: string, content: string) => Promise<void>
  onDeleteComment?: (commentId: string, threadId: string) => Promise<void>
}

function ThreadList({
  threads,
  expandedThread,
  activeMarkId,
  isLoading,
  emptyMessage,
  onSelectThread,
  onResolve,
  onReopen,
  onDelete,
  onAddReply,
  onDeleteComment,
}: ThreadListProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="flex-1 h-full overflow-y-auto">
        <div className="space-y-3 p-4">
          <div className="text-center text-sm text-muted-foreground py-8">
            読み込み中...
          </div>
        </div>
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="flex-1 h-full overflow-y-auto">
        <div className="space-y-3 p-4">
          <div className="text-center text-sm text-muted-foreground py-8">
            {emptyMessage}
          </div>
        </div>
      </div>
    )
  }

  if (expandedThread) {
    return (
      <div className="flex-1 h-full overflow-y-auto">
        <div className="space-y-3 p-4">
          <CommentThread
            thread={expandedThread}
            isActive={expandedThread.markId === activeMarkId}
            onResolve={onResolve ? () => onResolve(expandedThread.id) : undefined}
            onReopen={onReopen ? () => onReopen(expandedThread.id) : undefined}
            onDelete={() => onDelete(expandedThread.id)}
            onAddReply={onAddReply ? (content) => onAddReply(expandedThread.id, content) : undefined}
            onDeleteComment={
              onDeleteComment
                ? (commentId) => onDeleteComment(commentId, expandedThread.id)
                : undefined
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="space-y-3 p-4">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            onClick={() => onSelectThread(thread.id)}
          >
            <p className="text-sm text-muted-foreground line-clamp-2">
              &ldquo;{thread.quotedText}&rdquo;
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{thread.commentCount}件のコメント</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
