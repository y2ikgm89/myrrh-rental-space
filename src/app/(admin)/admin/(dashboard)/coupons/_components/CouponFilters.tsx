'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
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

// =============================================================================
// Types
// =============================================================================

type FilterValue = {
  status?: string
  type?: string
  search?: string
}

// =============================================================================
// CouponFilters Component
// =============================================================================

export function CouponFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentValues: FilterValue = {
    status: searchParams.get('status') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  }

  const updateFilters = (updates: Partial<FilterValue>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })

    // ページをリセット
    params.delete('page')

    router.push(`${pathname}?${params.toString()}`)
  }

  const clearFilters = () => {
    router.push(pathname)
  }

  const hasFilters = currentValues.status || currentValues.type || currentValues.search

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* ステータスフィルター */}
      <Select
        value={currentValues.status ?? 'all'}
        onValueChange={(value) =>
          updateFilters({ status: value === 'all' ? undefined : value })
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
        value={currentValues.type ?? 'all'}
        onValueChange={(value) =>
          updateFilters({ type: value === 'all' ? undefined : value })
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
          value={currentValues.search ?? ''}
          onChange={(e) => updateFilters({ search: e.target.value || undefined })}
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
