'use client'

/**
 * ログアウトボタン
 *
 * トークン付きでログインページにリダイレクトする
 */

import { useRouter } from 'next/navigation'
import { signOut } from '@/shared/lib/auth-client'
import type { ReactElement } from 'react'

interface LogoutButtonProps {
  token: string
}

export function LogoutButton({ token }: LogoutButtonProps): ReactElement {
  const router = useRouter()

  const handleLogout = async (): Promise<void> => {
    await signOut()
    router.push(`/admin/login?token=${token}`)
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      ログアウト
    </button>
  )
}
