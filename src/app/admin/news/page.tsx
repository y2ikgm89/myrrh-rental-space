import { Suspense } from 'react'
import Link from 'next/link'
import { getNewsList } from '@/actions/admin/news'
import { NewsFilters } from './_components/NewsFilters'
import { NewsTable } from './_components/NewsTable'
import { Button, Pagination } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'お知らせ管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  status?: string
  search?: string
  page?: string
}>

type PageProps = {
  searchParams: SearchParams
}

async function NewsList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = params.status as 'ALL' | 'PUBLISHED' | 'DRAFT' | undefined
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const result = await getNewsList({ status, search }, { page, limit: 10 })

  return (
    <>
      <NewsTable news={result.news} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

export default async function NewsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">お知らせ管理</h1>
          <p className="text-muted-foreground">
            お知らせの作成・編集・公開管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/news/new">新規作成</Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<div>読み込み中...</div>}>
        <NewsFilters />
      </Suspense>

      {/* お知らせ一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <NewsList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
