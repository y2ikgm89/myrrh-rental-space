'use client'

import { Search } from 'lucide-react'
import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import { useCallback, useRef, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@/admin/components/ui'

const PUBLISH_STATUS_OPTIONS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'true', label: '公開中' },
  { value: 'false', label: '非公開' },
]

export function LocationFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(''),
      published: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
      tab: parseAsString.withDefault('locations'),
    },
    {
      history: 'push',
      shallow: false,
    }
  )

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const setSearchDebounced = useCallback(
    (value: string) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      searchTimeoutRef.current = setTimeout(() => {
        void setParams({ search: value || null, page: 1 })
      }, 300)
    },
    [setParams]
  )

  const setPublished = useCallback(
    (value: string) => {
      const publishedValue = value === 'ALL' ? null : value || null
      void setParams({ published: publishedValue, page: 1 })
    },
    [setParams]
  )

  const currentPublished = params.published || 'ALL'

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* 公開状態フィルター */}
      <div className="w-full sm:w-48">
        <Select value={currentPublished} onValueChange={setPublished}>
          <SelectTrigger>
            <SelectValue placeholder="公開状態" />
          </SelectTrigger>
          <SelectContent>
            {PUBLISH_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 検索 */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="名前・住所で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  )
}
