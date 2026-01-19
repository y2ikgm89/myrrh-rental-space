import { Suspense } from 'react'
import Link from 'next/link'
import { getSpaces } from '@/admin/actions/space'
import { SpaceFilters } from './SpaceFilters'
import { SpaceTable } from './SpaceTable'
import { Button, Pagination } from '@/admin/components/ui'

// =============================================================================
// 型定義
// =============================================================================

type SearchParams = Promise<{
  status?: string
  search?: string
  page?: string
  tab?: string
}>

interface SpaceTabContentProps {
  searchParams: SearchParams
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function SpaceList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const isPublished =
    params.status === 'true'
      ? true
      : params.status === 'false'
        ? false
        : 'ALL'
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const result = await getSpaces(
    { isPublished, search },
    { page, limit: 10 }
  )

  return (
    <>
      <SpaceTable spaces={result.spaces} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export async function SpaceTabContent({ searchParams }: SpaceTabContentProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">スペース一覧</h2>
          <p className="text-sm text-muted-foreground">
            スペースの追加・編集・公開管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/spaces/new">新規作成</Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<div>読み込み中...</div>}>
        <SpaceFilters />
      </Suspense>

      {/* スペース一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <SpaceList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
