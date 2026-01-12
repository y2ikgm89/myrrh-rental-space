/**
 * 利用規約ページ
 *
 * @description レンタルスペースサービスの利用規約を表示（DBから取得）
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: セクション構造
 * - 動的コンテンツ: ページデータ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { ContentRenderer } from '@/components/site/ContentRenderer'
import { prisma } from '@/lib/prisma'
import { getPageLayoutSettings } from '@/lib/layout-settings'
import { getContainerStyles, getContentStyles } from '@/lib/styles/layout-mapper'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    container: 'mx-auto w-full px-4 sm:px-6 lg:px-8',
    content: '', // 幅はgetContentStylesで動的に設定
    header: 'mb-12 text-center',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    lastUpdated: 'mt-2 text-sm text-muted-foreground',
  },
})()

/**
 * ページデータを取得（キャッシュ付き）
 */
async function getTermsPage() {
  'use cache'
  cacheLife('hours')
  cacheTag('pages', 'page-terms')

  return prisma.page.findUnique({
    where: {
      slug: 'terms',
      isPublished: true,
      isActive: true,
    },
  })
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getTermsPage()

  if (!page) {
    return {
      title: '利用規約',
    }
  }

  return {
    title: page.title,
    description: page.metaDescription || page.description,
    openGraph: {
      title: page.ogpTitle || page.title,
      description: page.ogpDescription || page.metaDescription || page.description || undefined,
      images: page.ogpImageUrl ? [page.ogpImageUrl] : undefined,
    },
  }
}

/**
 * 日付をフォーマット
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * 動的コンテンツ: ページ内容
 */
async function TermsContent(): Promise<ReactElement> {
  const page = await getTermsPage()

  if (!page) {
    notFound()
  }

  return (
    <>
      <header className={styles.header()}>
        <h1 className={styles.title()}>{page.title}</h1>
        <p className={styles.lastUpdated()}>
          最終更新日: {formatDate(page.updatedAt)}
        </p>
      </header>

      <ContentRenderer html={page.content} />
    </>
  )
}

/**
 * ローディングUI
 */
function TermsLoading(): ReactElement {
  return (
    <div className="animate-pulse">
      <div className="mb-12 text-center space-y-4">
        <div className="h-10 bg-muted rounded w-64 mx-auto" />
        <div className="h-4 bg-muted rounded w-48 mx-auto" />
      </div>
      <div className="space-y-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-4 bg-muted rounded" />
        ))}
      </div>
    </div>
  )
}

export default async function TermsOfServicePage(): Promise<ReactElement> {
  // レイアウト設定を取得
  const layoutConfig = await getPageLayoutSettings('terms')
  const containerStyles = getContainerStyles(layoutConfig)
  const contentStyles = getContentStyles(layoutConfig)

  return (
    <section className={styles.section()}>
      <div className={`${styles.container()} ${containerStyles.className}`} style={containerStyles.style}>
        <div className={`${styles.content()} ${contentStyles.className}`} style={contentStyles.style}>
          <Suspense fallback={<TermsLoading />}>
            <TermsContent />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
