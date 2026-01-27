/**
 * ステータスバナーコンポーネント
 *
 * 接続テスト結果の表示に使用
 * - 成功: green系
 * - エラー: destructive系（統一カラー）
 */

import type { ReactNode, ReactElement } from 'react'

interface StatusBannerProps {
  success: boolean
  children: ReactNode
}

export function StatusBanner({
  success,
  children,
}: StatusBannerProps): ReactElement {
  const styles = success
    ? 'border-green-200 bg-green-50'
    : 'border-destructive/50 bg-destructive/10'

  return <div className={`rounded-lg border p-4 ${styles}`}>{children}</div>
}
