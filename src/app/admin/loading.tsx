/**
 * 管理画面用ローディングUI
 *
 * 管理画面のスケルトンUI。
 */

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* ページヘッダースケルトン */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-10 w-32 animate-pulse rounded bg-gray-200" />
      </div>

      {/* カードスケルトン */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <div className="mb-2 h-4 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* テーブルスケルトン */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="divide-y divide-gray-200">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
              </div>
              <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
