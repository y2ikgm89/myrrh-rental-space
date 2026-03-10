/**
 * グローバルローディングUI
 *
 * ページ遷移時のSuspenseフォールバック。
 * Next.jsが自動的にSuspenseでラップする。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/loading
 */

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    </div>
  );
}
