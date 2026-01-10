'use client'

/**
 * コメント投稿フォーム（Client Component）
 *
 * ログインユーザー・ゲストの両方に対応
 * ゲストの場合はTurnstile検証が必要
 */

import { useState, useTransition, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Send, Loader2 } from 'lucide-react'
import { Turnstile } from '@/components/Turnstile'
import { createComment } from '@/actions/blog-comment'
import { cn } from '@/lib/utils'

type Props = {
  postId: string
  postSlug: string
  parentCommentId?: string
  onSuccess?: () => void
  isReply?: boolean
}

export function CommentForm({
  postId,
  // postSlug is reserved for future use (e.g., optimistic updates)
  postSlug: _postSlug,
  parentCommentId,
  onSuccess,
  isReply = false,
}: Props) {
  void _postSlug
  const { data: session, status } = useSession()
  const [isPending, startTransition] = useTransition()
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const formRef = useRef<HTMLFormElement>(null)

  const isLoggedIn = status === 'authenticated' && !!session?.user
  const isLoading = status === 'loading'

  // Turnstileが必要かどうか（ゲストの場合のみ）
  const needsTurnstile = !isLoggedIn && typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  // フォーム送信
  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})

    startTransition(async () => {
      const content = formData.get('content') as string
      const guestName = formData.get('guestName') as string | null
      const guestEmail = formData.get('guestEmail') as string | null

      const result = await createComment({
        postId,
        parentCommentId,
        content,
        guestName: guestName ?? undefined,
        guestEmail: guestEmail ?? undefined,
        turnstileToken: turnstileToken ?? undefined,
      })

      if (result.success) {
        // フォームをリセット
        formRef.current?.reset()
        setTurnstileToken(null)
        onSuccess?.()
      } else {
        setError(result.error)
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
        }
      }
    })
  }

  // ローディング中
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className={cn(
        'space-y-4',
        isReply ? 'bg-muted/30 p-4 rounded-lg' : 'border rounded-lg p-4'
      )}
    >
      {/* ゲスト用の名前・メール入力 */}
      {!isLoggedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="guestName" className="block text-sm font-medium mb-1">
              お名前 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              id="guestName"
              name="guestName"
              required
              maxLength={100}
              placeholder="お名前を入力"
              className={cn(
                'w-full px-3 py-2 border rounded-md text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                fieldErrors.guestName && 'border-destructive'
              )}
            />
            {fieldErrors.guestName && (
              <p className="mt-1 text-xs text-destructive">
                {fieldErrors.guestName[0]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="guestEmail" className="block text-sm font-medium mb-1">
              メールアドレス <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              id="guestEmail"
              name="guestEmail"
              required
              placeholder="example@example.com"
              className={cn(
                'w-full px-3 py-2 border rounded-md text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                fieldErrors.guestEmail && 'border-destructive'
              )}
            />
            {fieldErrors.guestEmail && (
              <p className="mt-1 text-xs text-destructive">
                {fieldErrors.guestEmail[0]}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              メールアドレスは公開されません
            </p>
          </div>
        </div>
      )}

      {/* ログインユーザーの場合は名前を表示 */}
      {isLoggedIn && session?.user?.name && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{session.user.name}</span>{' '}
          としてコメント
        </p>
      )}

      {/* コメント入力 */}
      <div>
        <label htmlFor="content" className="sr-only">
          コメント
        </label>
        <textarea
          id="content"
          name="content"
          required
          maxLength={2000}
          rows={isReply ? 3 : 4}
          placeholder={isReply ? '返信を入力...' : 'コメントを入力...'}
          className={cn(
            'w-full px-3 py-2 border rounded-md text-sm resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
            fieldErrors.content && 'border-destructive'
          )}
        />
        {fieldErrors.content && (
          <p className="mt-1 text-xs text-destructive">
            {fieldErrors.content[0]}
          </p>
        )}
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-muted-foreground">最大2000文字</p>
        </div>
      </div>

      {/* Turnstile（ゲストのみ） */}
      {needsTurnstile && (
        <div className="flex justify-start">
          <Turnstile
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            size="normal"
          />
        </div>
      )}

      {/* エラーメッセージ */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* 送信ボタン */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || (needsTurnstile && !turnstileToken)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>送信中...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>{isReply ? '返信する' : 'コメントを投稿'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  )
}
