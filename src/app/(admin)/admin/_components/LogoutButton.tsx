'use client'

/**
 * ログアウトボタン
 *
 * トークン付きでログインページにリダイレクトする
 */

import { signOut } from 'next-auth/react'
import type { ReactElement } from 'react'

interface LogoutButtonProps {
  token: string
}

export function LogoutButton({ token }: LogoutButtonProps): ReactElement {
  const handleLogout = async (): Promise<void> => {
    await signOut({
      callbackUrl: `/admin/login?token=${token}`,
    })
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-sm text-gray-600 hover:text-gray-900"
    >
      ログアウト
    </button>
  )
}
