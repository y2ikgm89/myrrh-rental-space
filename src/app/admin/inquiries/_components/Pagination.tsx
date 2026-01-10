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
    if (page > 1) {
      params.set('page', String(page))
    } else {
      params.delete('page')
    }

    startTransition(() => {
      router.push(`/admin/inquiries?${params.toString()}`)
    })
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
