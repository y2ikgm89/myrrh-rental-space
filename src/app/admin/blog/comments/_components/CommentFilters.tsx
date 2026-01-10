'use client'

/**
 * コメントフィルター
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input, Button } from '@/components/admin/ui'

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'ACTIVE', label: 'アクティブ' },
  { value: 'DELETED', label: '削除済み' },
] as const

export function CommentFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentStatus = searchParams.get('status') ?? 'ALL'
  const currentSearch = searchParams.get('search') ?? ''

  const createQueryString = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    // ページをリセット
    if (!updates.page) {
      params.delete('page')
    }

    return params.toString()
  }

  function handleStatusChange(status: string) {
    const query = createQueryString({ status: status === 'ALL' ? null : status })
    router.push(`${pathname}${query ? `?${query}` : ''}`)
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const search = formData.get('search') as string
    const query = createQueryString({ search: search || null })
    router.push(`${pathname}${query ? `?${query}` : ''}`)
  }

  function handleClearSearch() {
    const query = createQueryString({ search: null })
    router.push(`${pathname}${query ? `?${query}` : ''}`)
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* ステータスフィルター */}
      <div className="flex items-center gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={currentStatus === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* 検索 */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            name="search"
            placeholder="コメント内容・投稿者名で検索"
            defaultValue={currentSearch}
            className="pl-9 w-64"
          />
          {currentSearch && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline" size="sm">
          検索
        </Button>
      </form>
    </div>
  )
}
