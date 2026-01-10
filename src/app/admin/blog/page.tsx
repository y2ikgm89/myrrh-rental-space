import { Suspense } from 'react'
import Link from 'next/link'
import { getBlogPosts, getBlogCategories } from '@/actions/admin/blog'
import { BlogFilters } from './_components/BlogFilters'
import { BlogTable } from './_components/BlogTable'
import { Pagination } from './_components/Pagination'
import { Button } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ブログ管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  status?: string
  categoryId?: string
  search?: string
  page?: string
}>

type PageProps = {
  searchParams: SearchParams
}

async function BlogFiltersWrapper() {
  const categories = await getBlogCategories()
  return <BlogFilters categories={categories} />
}

async function BlogList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = params.status as 'ALL' | 'PUBLISHED' | 'DRAFT' | undefined
  const categoryId = params.categoryId
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const result = await getBlogPosts(
    { status, categoryId, search },
    { page, limit: 10 }
  )

  return (
    <>
      <BlogTable posts={result.posts} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

export default async function BlogPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ブログ管理</h1>
          <p className="text-muted-foreground">
            ブログ記事の作成・編集・公開管理を行います
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/blog/comments">コメント管理</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/blog/categories">カテゴリ管理</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/blog/new">新規作成</Link>
          </Button>
        </div>
      </div>

      {/* フィルター */}
      <Suspense fallback={<div>読み込み中...</div>}>
        <BlogFiltersWrapper />
      </Suspense>

      {/* ブログ一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <BlogList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
