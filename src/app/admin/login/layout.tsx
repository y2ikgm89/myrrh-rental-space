/**
 * ログインページ専用レイアウト
 *
 * 管理画面のサイドバーを非表示にする
 */

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
