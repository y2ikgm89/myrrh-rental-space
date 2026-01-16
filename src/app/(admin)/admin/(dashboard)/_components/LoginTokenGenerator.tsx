'use client'

/**
 * ワンタイムログイントークン生成コンポーネント
 *
 * 管理者がスタッフにログインURLを共有するためのワンタイムトークンを生成
 */

import { useState, useRef, useEffect, type ReactElement } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { loginTokenResponseSchema } from '@/lib/validations/auth'

export function LoginTokenGenerator(): ReactElement {
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // アンマウント時にタイムアウトをクリーンアップ
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const generateToken = async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    setIsCopied(false)

    try {
      const response = await fetch('/api/admin/login-tokens', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('トークンの生成に失敗しました')
      }

      const data = loginTokenResponseSchema.safeParse(await response.json())
      if (!data.success) {
        throw new Error('トークンのレスポンスが不正です')
      }

      setLoginUrl(data.data.loginUrl)
      setExpiresAt(data.data.expiresAt)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (): Promise<void> => {
    if (!loginUrl) return

    try {
      await navigator.clipboard.writeText(loginUrl)
      setIsCopied(true)

      // 既存のタイムアウトをクリア
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }

      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000)
    } catch {
      setError('クリップボードへのコピーに失敗しました')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        スタッフ用ログインURL生成
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        スタッフにログイン画面を共有するためのトークンURLを生成します。
        生成されたURLは30日間有効で、スタッフがログインに成功するたびに自動的に30日間延長されます。
        定期的にログインされるトークンは自動的に延長されるため、新しいトークンを生成する必要はありません。
      </p>

      <div className="space-y-4">
        <button
          onClick={generateToken}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              新しいログインURLを生成
            </>
          )}
        </button>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {loginUrl && (
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">ログインURL</p>
              <p className="text-sm font-mono text-gray-900 break-all">
                {loginUrl}
              </p>
            </div>
            {expiresAt && (
              <p className="text-xs text-gray-500">
                有効期限: {new Date(expiresAt).toLocaleString('ja-JP')}
              </p>
            )}
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4" />
                  コピーしました
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  URLをコピー
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
