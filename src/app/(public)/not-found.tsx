/**
 * 公開ページ用404ページ
 *
 * 公開ページ内で存在しないURLへのアクセス時に表示。
 * Header/Footerレイアウトが適用される。
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'

export const metadata: Metadata = {
  title: 'ページが見つかりません',
  description: 'お探しのページは存在しないか、移動した可能性があります。',
}

export default async function NotFound() {
  const postPrefix = await getPostUrlPrefix()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <span className="text-7xl font-bold text-gray-200">404</span>
        </div>

        <h1 className="mb-4 text-2xl font-bold text-gray-900">
          ページが見つかりません
        </h1>

        <p className="mb-8 text-gray-600">
          お探しのページは存在しないか、移動した可能性があります。
          <br />
          URLをご確認いただくか、以下のリンクからお探しください。
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
            スペース一覧
          </Link>
        </div>

        <div className="mt-12 border-t border-gray-200 pt-8">
          <p className="mb-4 text-sm font-medium text-gray-700">
            お探しの情報はこちらから
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link href="/spaces" className="text-primary-600 hover:underline">
              スペース一覧
            </Link>
            <Link href="/news" className="text-primary-600 hover:underline">
              お知らせ
            </Link>
            <Link href={postPrefix || '/'} className="text-primary-600 hover:underline">
              ブログ
            </Link>
            <Link href="/contact" className="text-primary-600 hover:underline">
              お問い合わせ
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
