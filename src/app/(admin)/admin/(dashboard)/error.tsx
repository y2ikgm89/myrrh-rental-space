'use client'

/**
 * 管理画面用エラーページ
 *
 * 管理画面でのエラーをキャッチ。
 * サイドバーレイアウトは維持される。
 */

import { useEffect, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: ErrorProps) {
  const router = useRouter()

  useEffect(() => {
    console.error('Admin error:', error)
  }, [error])

  const handleReset = () => {
    startTransition(() => {
      reset()
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="mb-3 text-xl font-bold text-gray-900">
          エラーが発生しました
        </h1>

        <p className="mb-6 text-sm text-gray-600">
          管理画面でエラーが発生しました。
          <br />
          再度お試しいただくか、ダッシュボードにお戻りください。
        </p>

        {error.digest && (
          <p className="mb-4 rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-500">
            Error ID: {error.digest}
          </p>
        )}

        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              エラー詳細（開発環境のみ）
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={handleReset}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            再試行
          </button>
          <Link
            href="/admin"
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>
    </div>
  )
}
