'use client'

/**
 * グローバルエラーページ
 *
 * ルートレベルのエラーをキャッチ。
 * layout.tsxを上書きするため、html/bodyタグが必須。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import { useEffect, startTransition } from 'react'
import { Noto_Sans_JP } from 'next/font/google'

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // エラーログサービスに送信（将来的にSentryなどに置き換え）
    console.error('Global error:', error)
  }, [error])

  const handleReset = () => {
    startTransition(() => {
      reset()
    })
  }

  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md text-center">
            <div className="mb-8">
              <svg
                className="mx-auto h-24 w-24 text-red-500"
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

            <h1 className="mb-4 text-2xl font-bold text-gray-900">
              予期しないエラーが発生しました
            </h1>

            <p className="mb-8 text-gray-600">
              申し訳ございません。システムエラーが発生しました。
              <br />
              しばらく時間をおいてから再度お試しください。
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
              {/* global-errorではRouterコンテキストが利用できないため、aタグを使用 */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                ホームに戻る
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
