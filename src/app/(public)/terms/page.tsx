/**
 * 利用規約ページ
 *
 * @description レンタルスペースサービスの利用規約を表示（Termsテーブルから取得）
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: セクション構造
 * - 動的コンテンツ: 規約データ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { prisma } from '@/shared/lib/prisma'
import { TermsType, TermsStatus } from '@/shared/generated/prisma/enums'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    container: 'mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8',
    content: '',
    header: 'mb-12 text-center',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    lastUpdated: 'mt-2 text-sm text-muted-foreground',
  },
})()

/**
 * サイト全体の利用規約を取得（キャッシュ付き）
 */
async function getSiteWideTerms() {
  'use cache'
  cacheLife('hours')
  cacheTag('terms', 'site-terms')

  return prisma.terms.findFirst({
    where: {
      type: TermsType.TERMS_OF_USE,
      isSiteWide: true,
      isActive: true,
    },
    include: {
      versions: {
        where: {
          isCurrentVersion: true,
          status: TermsStatus.PUBLISHED,
        },
        take: 1,
      },
    },
  })
}

export async function generateMetadata(): Promise<Metadata> {
  const terms = await getSiteWideTerms()

  if (!terms) {
    return {
      title: '利用規約',
    }
  }

  return {
    title: terms.title,
    description: terms.metaDescription || undefined,
    keywords: terms.metaKeywords || undefined,
    openGraph: {
      title: terms.ogpTitle || terms.title,
      description: terms.ogpDescription || terms.metaDescription || undefined,
      images: terms.ogpImageUrl ? [terms.ogpImageUrl] : undefined,
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
 * 動的コンテンツ: 規約内容
 */
async function TermsContent(): Promise<ReactElement> {
  const terms = await getSiteWideTerms()

  if (!terms || terms.versions.length === 0) {
    notFound()
  }

  const currentVersion = terms.versions[0]

  return (
    <>
      <header className={styles.header()}>
        <h1 className={styles.title()}>{terms.title}</h1>
        {currentVersion.publishedAt && (
          <p className={styles.lastUpdated()}>
            最終更新日: {formatDate(currentVersion.publishedAt)}
          </p>
        )}
      </header>

      <ContentRenderer html={currentVersion.content} />
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
  return (
    <section className={styles.section()}>
      <div className={styles.container()}>
        <div className={styles.content()}>
          <Suspense fallback={<TermsLoading />}>
            <TermsContent />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
