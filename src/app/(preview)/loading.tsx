/**
 * プレビュー用ローディング UI
 *
 * `(preview)/preview/pages/[slug]` の Suspense fallback。
 * 管理者のみアクセスする画面のため装飾は最小限に抑える。
 */

export default function PreviewLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mb-4">
          <div
            className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary"
            aria-hidden="true"
          />
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          プレビューを読み込み中...
        </p>
      </div>
    </main>
  );
}
