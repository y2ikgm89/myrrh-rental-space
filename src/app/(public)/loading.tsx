/**
 * 公開ページ用ローディングUI
 *
 * ページ遷移時のSuspenseフォールバック。
 * 公開ページのブランドに合わせたスピナー。
 */

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    </div>
  );
}
