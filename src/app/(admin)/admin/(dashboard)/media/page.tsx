/**
 * メディア管理ページ
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { MediaFilters } from './_components/MediaFilters'
import { MediaListWrapper } from './_components/MediaListWrapper'

export const metadata: Metadata = {
  title: 'メディア管理',
}

type PageProps = {
  searchParams: Promise<{
    type?: string
    usage?: string
    search?: string
    page?: string
    view?: string
  }>
}

export default async function MediaPage({ searchParams }: PageProps) {
  const params = await searchParams

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">メディア管理</h1>
        <p className="text-muted-foreground">
          画像・動画・ドキュメントの一元管理
        </p>
      </div>

      {/* Filters */}
      <Suspense fallback={<div className="h-10 bg-muted animate-pulse rounded" />}>
        <MediaFilters />
      </Suspense>

      {/* Media List */}
      <Suspense fallback={<MediaGridSkeleton />}>
        <MediaListWrapper searchParams={params} />
      </Suspense>
    </div>
  )
}

function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square bg-muted animate-pulse rounded-lg"
        />
      ))}
    </div>
  )
}
