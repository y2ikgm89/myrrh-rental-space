/**
 * UserInfo
 *
 * サイドバー下部のユーザー情報表示
 * Server Component
 */

import { getSession } from '@/lib/auth'
import type { ReactElement } from 'react'

export async function UserInfo(): Promise<ReactElement | null> {
  const session = await getSession()

  if (!session?.user) return null

  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
        <span className="text-sm font-medium">
          {session.user.name?.[0] ?? session.user.email?.[0] ?? 'U'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {session.user.name ?? 'ユーザー'}
        </p>
        <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
      </div>
    </div>
  )
}

export function UserInfoSkeleton(): ReactElement {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-700 rounded w-20" />
        <div className="h-3 bg-gray-700 rounded w-32" />
      </div>
    </div>
  )
}
