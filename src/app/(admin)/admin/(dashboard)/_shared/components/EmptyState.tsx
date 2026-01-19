import Link from 'next/link'
import { Button } from './ui/button'

type EmptyStateProps = {
  message: string
  action?: {
    label: string
    href: string
  }
}

/**
 * 統一された空状態コンポーネント
 *
 * @example
 * ```tsx
 * // アクションなし
 * <EmptyState message="データがありません" />
 *
 * // アクションあり
 * <EmptyState
 *   message="ブログ記事がありません"
 *   action={{ label: "新規作成", href: "/admin/blog/new" }}
 * />
 * ```
 */
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border bg-white p-12 text-center">
      <p className="text-muted-foreground">{message}</p>
      {action && (
        <Button asChild className="mt-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}
