/**
 * ブログ記事詳細ページ
 *
 * SafeHtmlコンポーネントでリッチテキストを安全に表示
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { tv } from 'tailwind-variants'
import { Container } from '@/components/site/ui'
import { BlogContentRenderer } from '@/components/site/BlogContentRenderer'
import { prisma } from '@/lib/prisma'
import { parseStringArray } from '@/lib/json-validators'
import { CommentSection } from './_components'
import type { ReactElement } from 'react'

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    article: 'max-w-3xl mx-auto',
    breadcrumb: 'mb-8 flex items-center gap-2 text-sm text-muted-foreground',
    breadcrumbLink: 'hover:text-foreground transition-colors',
    header: 'mb-8',
    meta: 'flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4',
    category: 'rounded-full bg-primary/10 px-3 py-1 text-primary text-xs font-medium',
    title: 'text-3xl sm:text-4xl font-bold tracking-tight text-foreground',
    excerpt: 'mt-4 text-lg text-muted-foreground',
    imageWrapper: 'relative aspect-video overflow-hidden rounded-xl mb-8',
    image: 'object-cover',
    content: 'mb-12',
    tagsWrapper: 'border-t pt-6 mt-12',
    tagsTitle: 'text-sm font-medium text-muted-foreground mb-3',
    tagsList: 'flex flex-wrap gap-2',
    tag: 'rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground hover:bg-muted/80 transition-colors',
    navigation: 'border-t pt-8 mt-8',
    navLinks: 'flex justify-between gap-4',
    navLink: 'flex-1 p-4 border rounded-lg hover:bg-muted/50 transition-colors',
    navLabel: 'text-xs text-muted-foreground mb-1',
    navTitle: 'font-medium line-clamp-1',
  },
})()

// =============================================================================
// Helpers
// =============================================================================

function formatDate(value: Date | null): string {
  if (!value) return '公開準備中'
  return value.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}


// =============================================================================
// Metadata
// =============================================================================

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params

  const post = await prisma.blogPost.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      thumbnailUrl: true,
      ogpImageUrl: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
    },
  })

  if (!post) {
    return {
      title: '記事が見つかりません',
    }
  }

  const title = post.ogpTitle || post.title
  const description = post.ogpDescription || post.metaDescription || post.excerpt
  const image = post.ogpImageUrl || post.thumbnailUrl

  return {
    title: post.title,
    description,
    keywords: post.metaKeywords || undefined,
    openGraph: {
      title,
      description,
      images: [image],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export async function generateStaticParams() {
  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    select: { slug: true },
  })

  return posts.map((post) => ({
    slug: post.slug,
  }))
}

// =============================================================================
// Page Component
// =============================================================================

export default async function BlogDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params

  const post = await prisma.blogPost.findUnique({
    where: {
      slug,
      isPublished: true,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      thumbnailUrl: true,
      ogpImageUrl: true,
      publishedAt: true,
      tags: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      categoryId: true,
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  })

  if (!post) {
    notFound()
  }

  const tags = parseStringArray(post.tags)

  // 前後の記事を取得
  const [prevPost, nextPost] = await Promise.all([
    prisma.blogPost.findFirst({
      where: {
        isPublished: true,
        AND: [
          { publishedAt: { not: null } },
          post.publishedAt
            ? { publishedAt: { lt: post.publishedAt } }
            : { id: { lt: post.id } },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { slug: true, title: true },
    }),
    prisma.blogPost.findFirst({
      where: {
        isPublished: true,
        AND: [
          { publishedAt: { not: null } },
          post.publishedAt
            ? { publishedAt: { gt: post.publishedAt } }
            : { id: { gt: post.id } },
        ],
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      select: { slug: true, title: true },
    }),
  ])

  return (
    <section className={styles.section()}>
      <Container>
        <article className={styles.article()}>
          {/* パンくずリスト */}
          <nav className={styles.breadcrumb()} aria-label="パンくずリスト">
            <Link href="/" className={styles.breadcrumbLink()}>
              ホーム
            </Link>
            <span aria-hidden="true">/</span>
            <Link href="/blog" className={styles.breadcrumbLink()}>
              ブログ
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate max-w-[200px]">{post.title}</span>
          </nav>

          {/* ヘッダー */}
          <header className={styles.header()}>
            <div className={styles.meta()}>
              <Link
                href={`/blog?category=${post.category.slug}`}
                className={styles.category()}
              >
                {post.category.name}
              </Link>
              <span aria-hidden="true">•</span>
              <time dateTime={post.publishedAt?.toISOString()}>
                {formatDate(post.publishedAt)}
              </time>
            </div>
            <h1 className={styles.title()}>{post.title}</h1>
            {post.excerpt && (
              <p className={styles.excerpt()}>{post.excerpt}</p>
            )}
          </header>

          {/* サムネイル */}
          <div className={styles.imageWrapper()}>
            <Image
              src={post.thumbnailUrl}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className={styles.image()}
              priority
            />
          </div>

          {/* 本文（HTMLコンテンツ + PostListWidget） */}
          <BlogContentRenderer
            html={post.content}
            categoryId={post.categoryId}
            currentPostId={post.id}
            className={styles.content()}
          />

          {/* タグ */}
          {tags.length > 0 && (
            <div className={styles.tagsWrapper()}>
              <h2 className={styles.tagsTitle()}>タグ</h2>
              <ul className={styles.tagsList()}>
                {tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={`/blog?tags=${encodeURIComponent(tag)}`}
                      className={styles.tag()}
                    >
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 前後の記事ナビゲーション */}
          {(prevPost || nextPost) && (
            <nav className={styles.navigation()} aria-label="記事ナビゲーション">
              <div className={styles.navLinks()}>
                {prevPost ? (
                  <Link href={`/blog/${prevPost.slug}`} className={styles.navLink()}>
                    <div className={styles.navLabel()}>← 前の記事</div>
                    <div className={styles.navTitle()}>{prevPost.title}</div>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {nextPost ? (
                  <Link
                    href={`/blog/${nextPost.slug}`}
                    className={`${styles.navLink()} text-right`}
                  >
                    <div className={styles.navLabel()}>次の記事 →</div>
                    <div className={styles.navTitle()}>{nextPost.title}</div>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
              </div>
            </nav>
          )}

          {/* コメントセクション */}
          <Suspense
            fallback={
              <div className="mt-12 border-t pt-8">
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-muted rounded w-32" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              </div>
            }
          >
            <CommentSection postId={post.id} postSlug={post.slug} />
          </Suspense>
        </article>
      </Container>
    </section>
  )
}
