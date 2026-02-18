import type { ReactElement } from 'react'
import Link from 'next/link'

interface PaginationProps {
  currentPage: number
  totalPages: number
  basePath: string
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
}: PaginationProps): ReactElement | null {
  if (totalPages <= 1) return null

  const pages: number[] = []
  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, currentPage + 2)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  function getHref(page: number): string {
    return page === 1 ? basePath : `${basePath}?page=${page}`
  }

  return (
    <nav aria-label="ページネーション" className="mt-16 flex items-center justify-center gap-2">
      {currentPage > 1 && (
        <Link
          href={getHref(currentPage - 1)}
          className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
        >
          前へ
        </Link>
      )}

      {start > 1 && (
        <>
          <Link
            href={getHref(1)}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            1
          </Link>
          {start > 2 && (
            <span className="px-2 text-sm text-muted-foreground">...</span>
          )}
        </>
      )}

      {pages.map((page) => (
        <Link
          key={page}
          href={getHref(page)}
          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
            page === currentPage
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent'
          }`}
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </Link>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span className="px-2 text-sm text-muted-foreground">...</span>
          )}
          <Link
            href={getHref(totalPages)}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            {totalPages}
          </Link>
        </>
      )}

      {currentPage < totalPages && (
        <Link
          href={getHref(currentPage + 1)}
          className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
        >
          次へ
        </Link>
      )}
    </nav>
  )
}
