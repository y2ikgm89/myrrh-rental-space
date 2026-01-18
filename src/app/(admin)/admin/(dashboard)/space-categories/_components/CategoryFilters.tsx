'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Input, Checkbox, Label } from '@/admin/components/ui'

export function CategoryFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentSearch = searchParams.get('search') || ''
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const buildUrl = (params: URLSearchParams) => {
    // タブパラメータを保持
    params.set('tab', 'categories')
    return `/admin/spaces?${params.toString()}`
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set('search', value)
    } else {
      params.delete('search')
    }

    startTransition(() => {
      router.push(buildUrl(params))
    })
  }

  const handleIncludeInactiveChange = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString())

    if (checked) {
      params.set('includeInactive', 'true')
    } else {
      params.delete('includeInactive')
    }

    startTransition(() => {
      router.push(buildUrl(params))
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-white p-4 sm:flex-row sm:items-center">
      {/* 検索 */}
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm text-muted-foreground">検索:</span>
        <Input
          type="text"
          placeholder="名前・説明で検索..."
          defaultValue={currentSearch}
          onChange={handleSearchChange}
          className="max-w-xs"
          disabled={isPending}
        />
      </div>

      {/* 非アクティブを含める */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="includeInactive"
          checked={includeInactive}
          onCheckedChange={handleIncludeInactiveChange}
          disabled={isPending}
        />
        <Label htmlFor="includeInactive" className="text-sm cursor-pointer">
          非アクティブを含める
        </Label>
      </div>

      {isPending && (
        <span className="text-sm text-muted-foreground">読み込み中...</span>
      )}
    </div>
  )
}
