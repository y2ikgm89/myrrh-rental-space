/**
 * カスタムページ公開表示
 *
 * DBに保存されたカスタムページを表示
 * サイドバー表示設定に対応
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでデータ取得をキャッシュ
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { BlogSidebar } from '@/public/components/sidebar'
import { getSidebarSettings, getSidebarData } from '@/public/actions/sidebar'
import { prisma } from '@/shared/lib/prisma'
import { getPageLayoutSettings } from '@/public/lib/layout-settings'
import { getContainerStyles, getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { SYSTEM_PAGE_SLUGS } from '@/shared/lib/validations/page'
import { getBaseUrl } from '@/shared/lib/constants'
import type { ReactElement } from 'react'

const BASE_URL = getBaseUrl()

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    container: 'mx-auto w-full px-4 sm:px-6 lg:px-8',
    layout: 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-8',
    layoutNoSidebar: '',
    mainContent: '',
    sidebar: 'mt-8 lg:mt-0',
    article: '',
    breadcrumb: 'mb-8 flex items-center gap-2 text-sm text-muted-foreground',
    breadcrumbLink: 'hover:text-foreground transition-colors',
    header: 'mb-8',
    title: 'text-3xl sm:text-4xl font-bold tracking-tight text-foreground',
    description: 'mt-4 text-lg text-muted-foreground',
    content: '',
  },
})()

// =============================================================================
// Types
// =============================================================================

interface PageProps {
  params: Promise<{ slug: string }>
}

// =============================================================================
// Data Fetching with Cache
// =============================================================================

/**
 * カスタムページを取得（キャッシュ付き）
 */
async function getCustomPage(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('pages', `page-${slug}`)

  // システムページは除外
  if (SYSTEM_PAGE_SLUGS.includes(slug)) {
    return null
  }

  return await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
    select: {
      title: true,
      slug: true,
      description: true,
      content: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      showSidebar: true,
      contentWidth: true,
      contentWidthCustom: true,
    },
  })
}

/**
 * メタデータ用ページ情報を取得（キャッシュ付き）
 */
async function getPageForMetadata(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('pages', `page-${slug}`)

  // システムページは除外
  if (SYSTEM_PAGE_SLUGS.includes(slug)) {
    return null
  }

  return await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
    select: {
      title: true,
      description: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
    },
  })
}

// =============================================================================
// Metadata
// =============================================================================

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params

  const page = await getPageForMetadata(slug)

  if (!page) {
    return {
      title: 'ページが見つかりません',
    }
  }

  const title = page.ogpTitle || page.title
  const description = page.ogpDescription || page.metaDescription || page.description || undefined

  return {
    title: page.title,
    description,
    keywords: page.metaKeywords || undefined,
    openGraph: {
      title,
      description,
      images: page.ogpImageUrl ? [page.ogpImageUrl] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: page.ogpImageUrl ? [page.ogpImageUrl] : undefined,
    },
  }
}

/**
 * 静的パラメータ生成
 */
export async function generateStaticParams() {
  'use cache'
  cacheLife('hours')
  cacheTag('pages')

  try {
    const pages = await prisma.page.findMany({
      where: {
        isPublished: true,
        isActive: true,
        isSystemPage: false,  // システムページを除外
      },
      select: { slug: true },
      take: 100,
    })

    if (pages.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return pages.map((page) => ({
      slug: page.slug,
    }))
  } catch {
    return [{ slug: '__placeholder__' }]
  }
}

// =============================================================================
// Page Component
// =============================================================================

export default async function CustomPage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const page = await getCustomPage(slug)

  if (!page) {
    notFound()
  }

  // サイドバー表示判定
  // カスタムページのデフォルトは非表示（false）
  // showSidebar が明示的に true の場合のみ表示
  const showSidebar = page.showSidebar === true

  // サイドバーデータを取得（showSidebar が true の場合のみ）
  const [sidebarSettings, sidebarData] = showSidebar
    ? await Promise.all([getSidebarSettings(), getSidebarData()])
    : [{ enabled: false, widgets: {} }, null]

  // サイドバーを実際に表示するかどうか
  const shouldShowSidebar = showSidebar && sidebarSettings.enabled

  // レイアウト設定を取得
  const layoutConfig = await getPageLayoutSettings(page.slug)
  const containerStyles = getContainerStyles(layoutConfig)
  const contentStyles = getContentStyles(layoutConfig)

  return (
    <section className={styles.section()}>
      {/* 構造化データ: パンくずリスト */}
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: BASE_URL },
          { name: page.title, url: `${BASE_URL}/p/${page.slug}` },
        ]}
      />

      <div className={`${styles.container()} ${containerStyles.className}`} style={containerStyles.style}>
        <div className={shouldShowSidebar ? styles.layout() : styles.layoutNoSidebar()}>
          {/* メインコンテンツ */}
          <main className={styles.mainContent()}>
            <article className={`${styles.article()} ${contentStyles.className}`} style={contentStyles.style}>
              {/* パンくずリスト */}
              <nav className={styles.breadcrumb()} aria-label="パンくずリスト">
                <Link href="/" className={styles.breadcrumbLink()}>
                  ホーム
                </Link>
                <span aria-hidden="true">/</span>
                <span className="truncate max-w-[200px]">{page.title}</span>
              </nav>

              {/* ヘッダー */}
              <header className={styles.header()}>
                <h1 className={styles.title()}>{page.title}</h1>
                {page.description && (
                  <p className={styles.description()}>{page.description}</p>
                )}
              </header>

              {/* 本文（HTMLコンテンツ） */}
              <ContentRenderer html={page.content} className={styles.content()} />
            </article>
          </main>

          {/* サイドバー */}
          {shouldShowSidebar && sidebarData && (
            <aside className={styles.sidebar()}>
              <BlogSidebar settings={sidebarSettings.widgets} data={sidebarData} />
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}
