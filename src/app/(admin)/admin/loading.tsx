/**
 * 管理画面共通ローディングUI
 *
 * admin/layout.tsx の children を Suspense でラップする。
 * (auth) と (dashboard) 両方のルートグループに適用される。
 */

export default function AdminRootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
