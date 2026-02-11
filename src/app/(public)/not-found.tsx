/**
 * 公開ページ用404ページ
 *
 * 存在しないURLへのアクセス時に表示。
 * 公開ページのレイアウト（Header/Footer）内で表示される。
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 md:px-8">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <span className="font-heading text-8xl font-bold text-border">
            404
          </span>
        </div>

        <h1 className="mb-3 font-heading text-2xl font-bold tracking-tight text-foreground">
          ページが見つかりません
        </h1>

        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          お探しのページは存在しないか、
          <br />
          移動した可能性があります。
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-full border border-primary-dark bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            ホームに戻る
          </Link>
          <Link
            href="/spaces"
            className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            スペース一覧を見る
          </Link>
        </div>
      </div>
    </div>
  )
}
