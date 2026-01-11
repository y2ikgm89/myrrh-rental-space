/**
 * 最近の予約/お問い合わせスケルトン
 */

import { Card, CardContent, CardHeader } from '@/components/admin/ui/card'

export function RecentItemsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 最近の予約 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="h-6 w-24 animate-pulse rounded bg-gray-200 mb-1" />
            <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-5 w-14 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 最近のお問い合わせ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="h-6 w-32 animate-pulse rounded bg-gray-200 mb-1" />
            <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-5 w-14 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
