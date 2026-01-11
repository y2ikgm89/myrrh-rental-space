/**
 * ログインページ専用レイアウト
 *
 * 管理画面のサイドバーを非表示にする
 */

import type { ReactElement, ReactNode } from 'react'

export default function LoginLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return <>{children}</>
}
