/**
 * コメント管理ページ
 *
 * ブログ記事へのコメント一覧・削除・復元を管理
 */

import { Suspense } from 'react'
import {
  getAdminComments,
  getCommentStats,
  type CommentFilters as CommentFiltersType,
} from '@/admin/actions/blog-comment'
import { CommentFilters } from './_components/CommentFilters'
import { CommentTable } from './_components/CommentTable'
import { CommentStats } from './_components/CommentStats'
import { Pagination } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'コメント管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  status?: string
  postId?: string
  search?: string
  page?: string
}>

type PageProps = {
  searchParams: SearchParams
}

async function CommentStatsWrapper() {
  const stats = await getCommentStats()
  return <CommentStats stats={stats} />
}

async function CommentList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = params.status as 'ALL' | 'ACTIVE' | 'DELETED' | undefined
  const postId = params.postId
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const filters: CommentFiltersType = {
    status: status ?? 'ALL',
    postId,
    search,
  }

  const result = await getAdminComments(filters, { page, limit: 20 })

  return (
    <>
      <CommentTable comments={result.comments} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

export default async function CommentsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">コメント管理</h1>
          <p className="text-muted-foreground">
            ブログ記事へのコメントを管理します
          </p>
        </div>
      </div>

      {/* 統計カード */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border bg-white p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-20" />
                  <div className="h-8 bg-muted rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        }
      >
        <CommentStatsWrapper />
      </Suspense>

      {/* フィルター */}
      <CommentFilters />

      {/* コメント一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <CommentList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
