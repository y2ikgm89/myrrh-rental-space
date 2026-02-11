/**
 * 投稿管理ページ
 *
 * 4タブ構造で記事一覧・カテゴリー・タグ・コメントを管理
 */

import { Suspense } from 'react'
import Link from 'next/link'
import {
  getPosts,
  getPostCategories,
  getPostTags,
} from '@/admin/actions/post'
import {
  getAdminComments,
  getCommentStats,
  type CommentFilters as CommentFiltersType,
} from '@/admin/actions/post-comment'
import { PostFilters } from './_components/PostFilters'
import { PostTable } from './_components/PostTable'
import { CategoryManager } from './taxonomy/_components/CategoryManager'
import { TagManager } from './taxonomy/_components/TagManager'
import { CommentFilters } from './comments/_components/CommentFilters'
import { CommentTable } from './comments/_components/CommentTable'
import { CommentStats } from './comments/_components/CommentStats'
import {
  Button,
  Pagination,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/admin/components/ui'
import { LoadingState } from '@/admin/components/LoadingState'
import { parsePostStatusFilter } from '@/shared/lib/validations/enums'
import { createTypeGuard } from '@/shared/lib/serialize'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '投稿管理 | Myrrh Rental Space',
}

// タブの型定義
const POST_TABS = ['posts', 'categories', 'tags', 'comments'] as const
type PostTab = (typeof POST_TABS)[number]

// コメントステータスフィルター
const COMMENT_STATUS_VALUES = ['ALL', 'ACTIVE', 'DELETED'] as const
const isValidCommentStatus = createTypeGuard(COMMENT_STATUS_VALUES)

const POST_TABS_SET = new Set<string>(POST_TABS)
function isValidTab(tab: string | undefined): tab is PostTab {
  return typeof tab === 'string' && POST_TABS_SET.has(tab)
}

type SearchParams = Promise<{
  tab?: string
  status?: string
  categoryId?: string
  search?: string
  page?: string
  postId?: string
}>

type PageProps = {
  searchParams: SearchParams
}

// ==============================================================================
// 記事一覧タブのコンポーネント
// ==============================================================================

async function PostFiltersWrapper() {
  const categories = await getPostCategories()
  return <PostFilters categories={categories} />
}

async function PostList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = parsePostStatusFilter(params.status)
  const categoryId = params.categoryId
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const result = await getPosts(
    { status, categoryId, search },
    { page, limit: 10 }
  )

  return (
    <>
      <PostTable posts={result.posts} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

// ==============================================================================
// カテゴリータブのコンポーネント
// ==============================================================================

async function CategoryContent() {
  const categories = await getPostCategories()
  return <CategoryManager initialCategories={categories} />
}

// ==============================================================================
// タグタブのコンポーネント
// ==============================================================================

async function TagContent() {
  const tags = await getPostTags()
  return <TagManager initialTags={tags} />
}

// ==============================================================================
// コメントタブのコンポーネント
// ==============================================================================

async function CommentStatsWrapper() {
  const stats = await getCommentStats()
  return <CommentStats stats={stats} />
}

async function CommentList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = isValidCommentStatus(params.status) ? params.status : undefined
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

// ==============================================================================
// メインページコンポーネント
// ==============================================================================

export default async function PostsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const currentTab = isValidTab(params.tab) ? params.tab : 'posts'

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">投稿管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            投稿・カテゴリー・タグ・コメントを管理します
          </p>
        </div>
        {currentTab === 'posts' && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/posts/new">新規作成</Link>
          </Button>
        )}
      </div>

      {/* タブ */}
      <Tabs defaultValue={currentTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="posts" asChild>
            <Link href="/admin/posts?tab=posts">記事一覧</Link>
          </TabsTrigger>
          <TabsTrigger value="categories" asChild>
            <Link href="/admin/posts?tab=categories">カテゴリー</Link>
          </TabsTrigger>
          <TabsTrigger value="tags" asChild>
            <Link href="/admin/posts?tab=tags">タグ</Link>
          </TabsTrigger>
          <TabsTrigger value="comments" asChild>
            <Link href="/admin/posts?tab=comments">コメント</Link>
          </TabsTrigger>
        </TabsList>

        {/* 記事一覧タブ */}
        <TabsContent value="posts" className="space-y-6">
          <Suspense fallback={<LoadingState variant="inline" />}>
            <PostFiltersWrapper />
          </Suspense>
          <Suspense fallback={<LoadingState />}>
            <PostList searchParams={searchParams} />
          </Suspense>
        </TabsContent>

        {/* カテゴリータブ */}
        <TabsContent value="categories">
          <Suspense fallback={<LoadingState />}>
            <CategoryContent />
          </Suspense>
        </TabsContent>

        {/* タグタブ */}
        <TabsContent value="tags">
          <Suspense fallback={<LoadingState />}>
            <TagContent />
          </Suspense>
        </TabsContent>

        {/* コメントタブ */}
        <TabsContent value="comments" className="space-y-6">
          <Suspense
            fallback={
              <div className="grid gap-4 md:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card p-4">
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
          <CommentFilters />
          <Suspense fallback={<LoadingState />}>
            <CommentList searchParams={searchParams} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
