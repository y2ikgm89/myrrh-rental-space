'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'

export function LocationFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentPublished = searchParams.get('published') || 'ALL'
  const currentSearch = searchParams.get('search') || ''

  const buildUrl = (params: URLSearchParams) => {
    // タブパラメータを保持
    params.set('tab', 'locations')
    return `/admin/spaces?${params.toString()}`
  }

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value && value !== 'ALL') {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    startTransition(() => {
      router.push(buildUrl(params))
    })
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

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-white p-4 sm:flex-row sm:items-center">
      {/* 公開状態フィルター */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">公開状態:</span>
        <Select
          value={currentPublished}
          onValueChange={(value) => updateParams('published', value)}
          disabled={isPending}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="true">公開中</SelectItem>
            <SelectItem value="false">非公開</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 検索 */}
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm text-muted-foreground">検索:</span>
        <Input
          type="text"
          placeholder="名前・住所で検索..."
          defaultValue={currentSearch}
          onChange={handleSearchChange}
          className="max-w-xs"
          disabled={isPending}
        />
      </div>

      {isPending && (
        <span className="text-sm text-muted-foreground">読み込み中...</span>
      )}
    </div>
  )
}
