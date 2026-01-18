/**
 * 管理画面ログインページ
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/shared/lib/auth'
import { LoginForm } from './LoginForm'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'ログイン',
}

export default async function LoginPage(): Promise<ReactElement> {
  const session = await getSession()

  // 既にログイン済みならダッシュボードへ
  if (session?.user) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">管理画面</h1>
            <p className="text-gray-600 mt-2">ログインしてください</p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
