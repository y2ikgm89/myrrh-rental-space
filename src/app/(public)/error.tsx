'use client'

/**
 * 公開ページ用エラーページ
 *
 * 公開ページでのエラーをキャッチ。
 * レイアウト（Header/Footer）は維持される。
 */

import { useEffect, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  const router = useRouter()

  useEffect(() => {
    console.error('Public page error:', error)
  }, [error])

  const handleReset = () => {
    startTransition(() => {
      reset()
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <svg
            className="mx-auto h-20 w-20 text-amber-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="mb-4 text-2xl font-bold text-gray-900">
          エラーが発生しました
        </h1>

        <p className="mb-8 text-gray-600">
          ページの読み込み中にエラーが発生しました。
          <br />
          再度お試しいただくか、ホームページにお戻りください。
        </p>

        {error.digest && (
          <p className="mb-6 text-sm text-gray-500">
            エラーID: {error.digest}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={handleReset}
            className="rounded-lg bg-primary-600 px-6 py-3 font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            再試行する
          </button>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
