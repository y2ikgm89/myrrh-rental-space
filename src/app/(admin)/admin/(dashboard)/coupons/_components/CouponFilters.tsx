'use client'

import { useRef, useEffect } from 'react'
import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import { Search, X } from 'lucide-react'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'

export function CouponFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(''),
      status: parseAsString.withDefault(''),
      type: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
    },
    { history: 'push', shallow: false }
  )

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      void setParams({ search: value || null, page: 1 })
    }, 300)
  }

  const clearFilters = () => {
    void setParams({
      search: null,
      status: null,
      type: null,
      page: 1,
    })
  }

  const hasFilters = params.status || params.type || params.search

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* ステータスフィルター */}
      <Select
        value={params.status || 'all'}
        onValueChange={(value) =>
          void setParams({ status: value === 'all' ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="ステータス" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          <SelectItem value="active">有効</SelectItem>
          <SelectItem value="inactive">無効</SelectItem>
          <SelectItem value="expired">期限切れ</SelectItem>
          <SelectItem value="limitReached">上限到達</SelectItem>
          <SelectItem value="notStarted">期間前</SelectItem>
        </SelectContent>
      </Select>

      {/* タイプフィルター */}
      <Select
        value={params.type || 'all'}
        onValueChange={(value) =>
          void setParams({ type: value === 'all' ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="割引タイプ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          <SelectItem value="PERCENTAGE">パーセント割引</SelectItem>
          <SelectItem value="FIXED_AMOUNT">定額割引</SelectItem>
        </SelectContent>
      </Select>

      {/* 検索 */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="コード・名称で検索..."
          defaultValue={params.search}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* クリアボタン */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          クリア
        </Button>
      )}
    </div>
  )
}
