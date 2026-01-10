'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/admin/ui'

type PaginationProps = {
  currentPage: number
  totalPages: number
  total: number
}

export function Pagination({ currentPage, totalPages, total }: PaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))

    startTransition(() => {
      router.push(`/admin/spaces?${params.toString()}`)
    })
  }

  if (totalPages <= 1) {
    return (
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>全{total}件</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        全{total}件中 {(currentPage - 1) * 10 + 1}-{Math.min(currentPage * 10, total)}件を表示
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || isPending}
        >
          前へ
        </Button>
        <span className="text-sm">
          {currentPage} / {totalPages}
        </span>
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
