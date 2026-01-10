'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'

type Props = {
  page: number
  totalPages: number
  total: number
}

export function Pagination({ page, totalPages, total }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function goToPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`?${params.toString()}`)
  }

  const startItem = (page - 1) * 20 + 1
  const endItem = Math.min(page * 20, total)

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {total}件中 {startItem}-{endItem}件を表示
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
        >
          前へ
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (totalPages <= 7) return true
              if (p === 1 || p === totalPages) return true
              if (Math.abs(p - page) <= 1) return true
              return false
            })
            .map((p, i, arr) => (
              <span key={p}>
                {i > 0 && arr[i - 1] !== p - 1 && (
                  <span className="px-2 text-muted-foreground">...</span>
                )}
                <Button
                  variant={p === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => goToPage(p)}
                >
                  {p}
                </Button>
              </span>
            ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
        >
          次へ
        </Button>
      </div>
    </div>
  )
}
