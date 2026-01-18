import { Suspense } from 'react'
import Link from 'next/link'
import { getLocations } from '@/admin/actions/location'
import { LocationFilters } from '../../locations/_components/LocationFilters'
import { LocationTable } from '../../locations/_components/LocationTable'
import { Button } from '@/admin/components/ui'

// =============================================================================
// 型定義
// =============================================================================

type SearchParams = Promise<{
  published?: string
  search?: string
  tab?: string
}>

interface LocationTabContentProps {
  searchParams: SearchParams
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function LocationList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const includeInactive = params.published !== 'true'
  const search = params.search

  const result = await getLocations({
    includeInactive,
    search,
  })

  return <LocationTable locations={result.locations} />
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export async function LocationTabContent({ searchParams }: LocationTabContentProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">場所一覧</h2>
          <p className="text-sm text-muted-foreground">
            場所（建物・施設）の追加・編集・公開管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/locations/new">新規作成</Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<div>読み込み中...</div>}>
        <LocationFilters />
      </Suspense>

      {/* 場所一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <LocationList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
