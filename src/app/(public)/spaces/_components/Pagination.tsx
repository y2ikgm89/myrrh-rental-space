'use client'

/**
 * ページネーション
 *
 * @description nuqs useQueryState を使用した URL State 管理のサンプル
 */

import { useQueryState } from 'nuqs'
import { useTransition, type ReactElement } from 'react'
import { tv } from 'tailwind-variants'
import { Button } from '@/components/site/ui'
import { parseAsPage } from '@/lib/nuqs'

const styles = tv({
  slots: {
    wrapper: 'mt-12 flex items-center justify-center gap-2',
    pageInfo: 'mx-4 text-sm text-muted-foreground',
    button: 'min-w-[40px]',
    ellipsis: 'px-2 text-muted-foreground',
  },
})()

interface PaginationProps {
  currentPage: number
  totalPages: number
}

export function Pagination({
  currentPage,
  totalPages,
}: PaginationProps): ReactElement {
  const [isPending, startTransition] = useTransition()

  // nuqs: 単一パラメータの管理
  const [, setPage] = useQueryState('page', {
    ...parseAsPage,
    shallow: false,
    scroll: true,
    history: 'push',
    startTransition,
  })

  const handlePageChange = (newPage: number): void => {
    // デフォルト値（1）の場合は URL から削除
    setPage(newPage === 1 ? null : newPage)
  }

  // 表示するページ番号を計算
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = []
    const showPages = 5 // 表示するページ数

    if (totalPages <= showPages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    // 常に最初のページを表示
    pages.push(1)

    // 現在のページ周辺を表示
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    if (start > 2) {
      pages.push('ellipsis')
    }

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (end < totalPages - 1) {
      pages.push('ellipsis')
    }

    // 常に最後のページを表示
    pages.push(totalPages)

    return pages
  }

  return (
    <nav
      className={styles.wrapper()}
      aria-label="ページネーション"
      role="navigation"
    >
      {/* 前へボタン */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage <= 1 || isPending}
        aria-label="前のページへ"
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
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Button>

      {/* ページ番号 */}
      {getPageNumbers().map((pageNum, index) =>
        pageNum === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className={styles.ellipsis()}>
            ...
          </span>
        ) : (
          <Button
            key={pageNum}
            variant={pageNum === currentPage ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handlePageChange(pageNum)}
            disabled={isPending}
            aria-label={`${pageNum}ページへ`}
            aria-current={pageNum === currentPage ? 'page' : undefined}
            className={styles.button()}
          >
            {pageNum}
          </Button>
        )
      )}

      {/* 次へボタン */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage >= totalPages || isPending}
        aria-label="次のページへ"
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
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Button>
    </nav>
  )
}
