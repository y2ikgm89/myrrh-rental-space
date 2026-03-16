/**
 * 認証画面ローディングUI
 *
 * (auth) レイアウト配下（ログイン・セットアップ）の Suspense フォールバック。
 */

export default function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
