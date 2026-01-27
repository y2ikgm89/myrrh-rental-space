'use client'

/**
 * 投稿プレビューラッパー
 *
 * セッションストレージからプレビューデータを読み取り、
 * 公開ページと同じレイアウトで表示するClient Component
 */

import Image from 'next/image'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { usePreviewData } from '@/public/hooks'
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'
import { PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { cn } from '@/shared/lib/utils'
import type { PostPreviewData } from '@/shared/types'
import type { ReactElement } from 'react'

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    previewBanner: 'fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 py-2 px-4 text-center text-sm font-medium shadow-md',
    previewBadge: 'inline-flex items-center gap-1.5 bg-amber-600/20 rounded-full px-3 py-0.5',
    section: 'py-16 bg-background min-h-screen pt-24', // pt-24 for banner offset
    container: 'mx-auto max-w-4xl px-4 sm:px-6 lg:px-8',
    article: '',
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
    tag: 'rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground',
    errorContainer: 'min-h-[50vh] flex items-center justify-center',
    errorCard: 'text-center p-8 bg-muted/50 rounded-lg max-w-md',
    errorTitle: 'text-xl font-semibold text-foreground mb-2',
    errorMessage: 'text-muted-foreground mb-4',
    errorLink: 'text-primary hover:underline',
  },
})()

// =============================================================================
// Types
// =============================================================================

type PostPreviewWrapperProps = {
  slug: string
  postPrefix: string
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * 公開日を表示用に整形
 */
function formatPublishedDate(value: string | null): string {
  if (!value) return '公開準備中'
  try {
    return new Date(value).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return '公開準備中'
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * プレビューバナー
 */
function PreviewBanner(): ReactElement {
  return (
    <div className={styles.previewBanner()}>
      <span className={styles.previewBadge()}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        プレビューモード
      </span>
      <span className="ml-2 text-amber-900/80">
        - この内容はまだ保存されていません
      </span>
    </div>
  )
}

/**
 * プレビューエラー表示
 */
function PreviewError(): ReactElement {
  return (
    <div className={styles.errorContainer()}>
      <div className={styles.errorCard()}>
        <h1 className={styles.errorTitle()}>
          プレビューデータが見つかりません
        </h1>
        <p className={styles.errorMessage()}>
          プレビューデータの有効期限が切れているか、
          データが存在しません。
        </p>
        <Link href="/admin/posts" className={styles.errorLink()}>
          管理画面に戻る
        </Link>
      </div>
    </div>
  )
}

/**
 * 投稿プレビューコンテンツ
 */
function PostPreviewContent({ data, postPrefix }: { data: PostPreviewData; postPrefix: string }): ReactElement {
  return (
    <>
      <PreviewBanner />
      <section className={styles.section()}>
        <div className={styles.container()}>
          <article className={styles.article()}>
            {/* パンくずリスト */}
            <nav className={styles.breadcrumb()} aria-label="パンくずリスト">
              <Link href="/" className={styles.breadcrumbLink()}>
                ホーム
              </Link>
              <span aria-hidden="true">/</span>
              <Link href={postPrefix || '/'} className={styles.breadcrumbLink()}>
                ブログ
              </Link>
              <span aria-hidden="true">/</span>
              <span className="truncate max-w-[200px]">{data.title}</span>
            </nav>

            {/* ヘッダー */}
            <header className={styles.header()}>
              <div className={styles.meta()}>
                <span className={styles.category()}>
                  {data.category.name}
                </span>
                <span aria-hidden="true">•</span>
                <time>{formatPublishedDate(data.publishedAt)}</time>
              </div>
              <h1 className={styles.title()}>{data.title}</h1>
              {data.excerpt && (
                <p className={styles.excerpt()}>{data.excerpt}</p>
              )}
            </header>

            {/* サムネイル */}
            {data.thumbnailUrl && (
              <div className={styles.imageWrapper()}>
                <Image
                  src={data.thumbnailUrl}
                  alt={data.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className={styles.image()}
                  priority
                />
              </div>
            )}

            {/* 本文 */}
            <SanitizedHtml
              html={data.content}
              className={cn(PROSE_CLASSES, styles.content())}
            />

            {/* タグ */}
            {data.tags.length > 0 && (
              <div className={styles.tagsWrapper()}>
                <h2 className={styles.tagsTitle()}>タグ</h2>
                <ul className={styles.tagsList()}>
                  {data.tags.map((tag) => (
                    <li key={tag}>
                      <span className={styles.tag()}>#{tag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* プレビューではコメントセクション・ナビゲーションを非表示 */}
          </article>
        </div>
      </section>
    </>
  )
}

/**
 * 投稿プレビューラッパー
 *
 * セッションストレージからプレビューデータを取得し表示
 */
export function PostPreviewWrapper({ slug, postPrefix }: PostPreviewWrapperProps): ReactElement {
  const { data, isPreview } = usePreviewData('post', slug)

  if (!isPreview || !data) {
    return <PreviewError />
  }

  return <PostPreviewContent data={data} postPrefix={postPrefix} />
}
