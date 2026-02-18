/**
 * /posts — ブログ記事一覧ページ
 *
 * パターンB: セクション + カスタムコンテンツ
 * セクション（Hero等）をレンダー後、記事グリッド + ページネーション
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 * ページネーション: nuqs createSearchParamsCache
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import type { SearchParams } from 'nuqs/server'
import { connection } from 'next/server'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPublishedPostsList } from '@/public/actions/post'
import { getPageSectionsWithFallback } from '@/public/actions/section'
import { SectionRenderer } from '@/public/components/sections/SectionRenderer'
import { Pagination } from '@/public/components/Pagination'
import { paginationSearchParams } from '@/public/lib/search-params'
import { PostGrid } from './_components/PostGrid'

interface PageProps {
  searchParams: Promise<SearchParams>
}

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('posts')
}

export default async function PostsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection()

  const [sections, { page }] = await Promise.all([
    getPageSectionsWithFallback('posts'),
    paginationSearchParams.parse(searchParams),
  ])

  const { posts, totalPages, currentPage } = await getPublishedPostsList(
    Math.max(1, page),
  )

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'ブログ', url: '/posts' },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <PostGrid posts={posts} />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/posts"
        />
      </section>
    </>
  )
}
