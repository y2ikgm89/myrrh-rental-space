/**
 * 認証画面用レイアウト
 *
 * サイドバーなしのシンプルなレイアウト
 * セキュリティ上、未認証ユーザーに管理画面構造を見せない
 */

import type { ReactElement, ReactNode } from 'react'

export default function AuthLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return <>{children}</>
}
