/**
 * 管理画面用404ページ
 *
 * 管理画面内で存在しないURLへのアクセス時に表示。
 */

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'ページが見つかりません',
}

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4">
          <span className="text-6xl font-bold text-gray-200">404</span>
        </div>

        <h1 className="mb-3 text-xl font-bold text-gray-900">
          ページが見つかりません
        </h1>

        <p className="mb-6 text-sm text-gray-600">
          お探しの管理ページは存在しないか、
          <br />
          アクセス権限がない可能性があります。
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/admin"
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            ダッシュボードへ
          </Link>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-6">
          <p className="mb-3 text-xs font-medium text-gray-500">
            よく使うページ
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <Link href="/admin/reservations" className="text-gray-600 hover:text-gray-900 hover:underline">
              予約管理
            </Link>
            <Link href="/admin/spaces" className="text-gray-600 hover:text-gray-900 hover:underline">
              スペース管理
            </Link>
            <Link href="/admin/inquiries" className="text-gray-600 hover:text-gray-900 hover:underline">
              お問い合わせ
            </Link>
            <Link href="/admin/settings" className="text-gray-600 hover:text-gray-900 hover:underline">
              設定
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
