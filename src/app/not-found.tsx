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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <span className="text-8xl font-bold text-gray-200">404</span>
        </div>

        <h1 className="mb-4 text-2xl font-bold text-gray-900">
          ページが見つかりません
        </h1>

        <p className="mb-8 text-gray-600">
          お探しのページは存在しないか、
          <br />
          移動した可能性があります。
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-lg bg-primary-600 px-6 py-3 font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            ホームに戻る
          </Link>
          <Link
            href="/spaces"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            スペース一覧を見る
          </Link>
        </div>
      </div>
    </div>
  )
}
