/**
 * ステータスバナーコンポーネント
 *
 * 接続テスト結果の表示に使用
 */

interface StatusBannerProps {
  success: boolean
  children: React.ReactNode
}

export function StatusBanner({
  success,
  children,
}: StatusBannerProps): React.ReactElement {
  const borderColor = success ? 'border-green-200' : 'border-red-200'
  const bgColor = success ? 'bg-green-50' : 'bg-red-50'

  return (
    <div className={`rounded-lg border p-4 ${borderColor} ${bgColor}`}>
      {children}
    </div>
  )
}
