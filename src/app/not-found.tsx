/**
 * グローバル404ページ
 *
 * 存在しないURLへのアクセス時に表示。
 * サーバーコンポーネントとして実装可能。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/not-found
 */

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'ページが見つかりません',
  description: 'お探しのページは存在しないか、移動した可能性があります。',
  robots: {
    index: false,
    follow: false,
  },
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <span className="text-8xl font-bold text-muted-foreground/20">404</span>
        </div>

        <h1 className="mb-4 text-2xl font-bold text-foreground">
          ページが見つかりません
        </h1>

        <p className="mb-8 text-muted-foreground">
          お探しのページは存在しないか、
          <br />
          移動した可能性があります。
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            ホームに戻る
          </Link>
          <Link
            href="/spaces"
            className="rounded-lg border border-border bg-card px-6 py-3 font-medium text-card-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            スペース一覧を見る
          </Link>
        </div>
      </div>
    </div>
  )
}
