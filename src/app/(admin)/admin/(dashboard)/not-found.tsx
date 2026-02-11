/**
 * 管理画面用404ページ
 *
 * 管理画面内で存在しないURLへのアクセス時に表示。
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/admin/components/ui'

export const metadata: Metadata = {
  title: 'ページが見つかりません',
}

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4">
          <span className="text-6xl font-bold text-muted">404</span>
        </div>

        <h1 className="mb-3 text-xl font-bold text-foreground">
          ページが見つかりません
        </h1>

        <p className="mb-6 text-sm text-muted-foreground">
          お探しの管理ページは存在しないか、
          <br />
          アクセス権限がない可能性があります。
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/admin">
              ダッシュボードへ
            </Link>
          </Button>
        </div>

        <div className="mt-8 border-t border-border/50 pt-6">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            よく使うページ
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <Link href="/admin/reservations" className="text-muted-foreground hover:text-foreground hover:underline">
              予約管理
            </Link>
            <Link href="/admin/spaces" className="text-muted-foreground hover:text-foreground hover:underline">
              スペース管理
            </Link>
            <Link href="/admin/inquiries" className="text-muted-foreground hover:text-foreground hover:underline">
              お問い合わせ
            </Link>
            <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground hover:underline">
              設定
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
