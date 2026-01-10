/**
 * 公開ページ用ローディングUI
 *
 * コンテンツエリアのみのローディング表示。
 * Header/Footerは維持される。
 */

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600" />
        </div>
        <p className="text-sm text-gray-600">読み込み中...</p>
      </div>
    </div>
  )
}
