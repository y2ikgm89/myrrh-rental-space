'use client'

/**
 * パスワード設定フォーム
 *
 * スタッフ招待メールからアクセスし、パスワードを設定
 */

import { useState, type FormEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { setupPassword } from '@/admin/actions/staff-invitation'
import { signIn } from '@/shared/lib/auth-client'
import type { InvitationData } from '@/admin/lib/validations/staff-invitation'

type Props = {
  invitation: InvitationData
  token: string
}

export function SetupForm({ invitation, token }: Props): ReactElement {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setIsLoading(true)

    try {
      const result = await setupPassword({
        token,
        password,
        confirmPassword,
      })

      if (!result.success) {
        setError(result.error ?? 'パスワード設定に失敗しました')
        setIsLoading(false)
        return
      }

      // ユーザー作成成功 → 自動ログイン
      const signInResult = await signIn.email({
        email: invitation.email,
        password,
      })

      if (signInResult.error) {
        // ログイン失敗でもユーザーは作成済み → ログインページへ
        router.push('/admin/login')
      } else {
        // ログイン成功 → ダッシュボードへ
        router.push('/admin')
        router.refresh()
      }
    } catch {
      setError('エラーが発生しました。再度お試しください。')
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

      <div className="bg-gray-50 rounded-lg p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">メールアドレス</dt>
            <dd className="text-gray-900 font-medium">{invitation.email}</dd>
          </div>
          {invitation.name && (
            <div className="flex justify-between">
              <dt className="text-gray-500">お名前</dt>
              <dd className="text-gray-900 font-medium">{invitation.name}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500">権限</dt>
            <dd className="text-gray-900 font-medium">
              {invitation.role === 'SUPER_ADMIN' && 'スーパー管理者'}
              {invitation.role === 'ADMIN' && '管理者'}
              {invitation.role === 'EDITOR' && '編集者'}
              {invitation.role === 'VIEWER' && '閲覧者'}
              {invitation.role === 'USER' && 'ユーザー'}
            </dd>
          </div>
        </dl>
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
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          placeholder="8文字以上"
        />
        <p className="mt-1 text-xs text-gray-500">8文字以上で設定してください</p>
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          パスワード（確認）
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          placeholder="もう一度入力"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? '設定中...' : 'パスワードを設定してログイン'}
      </button>
    </form>
  )
}
