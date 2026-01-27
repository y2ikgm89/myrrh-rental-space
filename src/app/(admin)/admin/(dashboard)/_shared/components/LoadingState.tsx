type LoadingStateProps = {
  message?: string
  variant?: 'table' | 'inline'
}

/**
 * 統一されたローディング状態コンポーネント
 *
 * @example
 * ```tsx
 * // テーブル用（デフォルト）
 * <Suspense fallback={<LoadingState />}>
 *
 * // インライン用
 * <LoadingState variant="inline" message="エディタを読み込み中..." />
 * ```
 */
export function LoadingState({
  message = '読み込み中...',
  variant = 'table',
}: LoadingStateProps) {
  if (variant === 'inline') {
    return (
      <div className="animate-pulse text-sm text-muted-foreground">
        {message}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white p-12 text-center">
      <p className="text-muted-foreground">{message}</p>
    </div>
  )
}
