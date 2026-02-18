/**
 * 管理画面汎用ローディングUI
 *
 * (dashboard) レイアウト配下の全ページの Suspense フォールバック。
 * ダッシュボード固有のUI（カードグリッド等）ではなく、
 * どのページでも違和感のない汎用スケルトンを表示する。
 */

export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* ページタイトル */}
      <div className="h-8 w-48 rounded bg-muted" />

      {/* コンテンツブロック */}
      <div className="space-y-4">
        <div className="h-4 w-full max-w-2xl rounded bg-muted" />
        <div className="h-4 w-full max-w-xl rounded bg-muted" />
        <div className="h-4 w-full max-w-lg rounded bg-muted" />
      </div>
    </div>
  )
}
