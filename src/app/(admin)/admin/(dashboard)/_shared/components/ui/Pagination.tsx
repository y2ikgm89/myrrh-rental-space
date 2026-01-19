'use client'

import { useTransition } from 'react'
import { useQueryState } from 'nuqs'
import { Button } from '@/admin/components/ui'
import { parseAsPage } from '@/shared/lib/nuqs'

type PaginationProps = {
  currentPage: number
  totalPages: number
  total: number
}

export function Pagination({ currentPage, totalPages, total }: PaginationProps) {
  const [isPending, startTransition] = useTransition()

  const [, setPage] = useQueryState('page', {
    ...parseAsPage,
    shallow: false,
    history: 'push',
    startTransition,
  })

  const goToPage = (page: number) => {
    // デフォルト値（1）の場合はURLから削除
    setPage(page === 1 ? null : page)
  }

  if (totalPages <= 1) {
    return (
      <div className="text-sm text-muted-foreground">
        全 {total} 件
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        全 {total} 件（{currentPage} / {totalPages} ページ）
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || isPending}
        >
          前へ
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages || isPending}
        >
          次へ
        </Button>
      </div>
    </div>
  )
}
