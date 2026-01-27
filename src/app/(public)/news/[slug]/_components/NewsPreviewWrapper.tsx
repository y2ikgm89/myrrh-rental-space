'use client'

/**
 * ニュースプレビューラッパー
 *
 * セッションストレージからプレビューデータを読み取り、
 * 公開ページと同じレイアウトで表示するClient Component
 */

import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { usePreviewData } from '@/public/hooks'
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'
import { buttonVariants } from '@/public/components/ui'
import { PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { cn } from '@/shared/lib/utils'
import type { NewsPreviewData } from '@/shared/types'
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
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    date: 'mt-2 text-sm text-muted-foreground',
    backLink: 'mt-12 flex justify-center',
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

type NewsPreviewWrapperProps = {
  slug: string
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
        <Link href="/admin/news" className={styles.errorLink()}>
          管理画面に戻る
        </Link>
      </div>
    </div>
  )
}

/**
 * ニュースプレビューコンテンツ
 */
function NewsPreviewContent({ data }: { data: NewsPreviewData }): ReactElement {
  return (
    <>
      <PreviewBanner />
      <section className={styles.section()}>
        <div className={styles.container()}>
          <article className={styles.article()}>
            <header className={styles.header()}>
              <h1 className={styles.title()}>{data.title}</h1>
              <time className={styles.date()}>
                {formatPublishedDate(data.publishedAt)}
              </time>
            </header>

            <SanitizedHtml html={data.content} className={PROSE_CLASSES} />

            <div className={styles.backLink()}>
              <Link
                href="/news"
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                お知らせ一覧に戻る
              </Link>
            </div>
          </article>
        </div>
      </section>
    </>
  )
}

/**
 * ニュースプレビューラッパー
 *
 * セッションストレージからプレビューデータを取得し表示
 */
export function NewsPreviewWrapper({ slug }: NewsPreviewWrapperProps): ReactElement {
  const { data, isPreview } = usePreviewData('news', slug)

  if (!isPreview || !data) {
    return <PreviewError />
  }

  return <NewsPreviewContent data={data} />
}
