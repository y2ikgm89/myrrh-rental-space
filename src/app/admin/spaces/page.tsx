import { Suspense } from 'react'
import Link from 'next/link'
import { getSpaces } from '@/actions/admin/space'
import { SpaceFilters } from './_components/SpaceFilters'
import { SpaceTable } from './_components/SpaceTable'
import { Pagination } from './_components/Pagination'
import { Button } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'スペース管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  published?: string
  search?: string
  page?: string
}>

type PageProps = {
  searchParams: SearchParams
}

async function SpaceList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const isPublished =
    params.published === 'true'
      ? true
      : params.published === 'false'
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

export default async function SpacesPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">スペース管理</h1>
          <p className="text-muted-foreground">
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
