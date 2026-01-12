'use client'

/**
 * ログインフォーム（Client Component）
 *
 * Better Auth 版
 */

import { useState, useEffect, type FormEvent, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/auth-client'
import { credentialsSchema, loginTokenSchema } from '@/lib/validations/auth'

const STORAGE_KEY = 'myrrh_admin_email'

export function LoginForm(): ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // 保存されたメールアドレスを読み込み
  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEY)
    if (savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [])

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()
    setError('')

    const parsedCredentials = credentialsSchema.safeParse({ email, password })
    if (!parsedCredentials.success) {
      setError('入力内容を確認してください')
      return
    }

    setIsLoading(true)

    try {
      const { email: validatedEmail, password: validatedPassword } =
        parsedCredentials.data

      const result = await signIn.email({
        email: validatedEmail,
        password: validatedPassword,
      })

      if (result.error) {
        setError('メールアドレスまたはパスワードが正しくありません')
      } else {
        // メールアドレスを保存/削除
        if (rememberMe) {
          localStorage.setItem(STORAGE_KEY, validatedEmail)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }

        // ログイン成功後、URLパラメータのトークンを保持してリダイレクト
        // これにより、proxy.tsでトークンの有効期限を延長できる
        const token = searchParams.get('token')
        const parsedToken = loginTokenSchema.safeParse(token)
        const redirectUrl = parsedToken.success
          ? `/admin?token=${parsedToken.data}`
          : '/admin'
        router.push(redirectUrl)
        router.refresh()
      }
    } catch {
      setError('ログイン中にエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          placeholder="admin@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          パスワード
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center">
        <input
          id="remember-me"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded cursor-pointer"
        />
        <label
          htmlFor="remember-me"
          className="ml-2 block text-sm text-gray-700 cursor-pointer select-none"
        >
          メールアドレスを保存する
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  )
}
