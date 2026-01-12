'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@/components/admin/ui'

export function CustomerFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentStatus = searchParams.get('status') || 'ALL'
  const currentSearch = searchParams.get('search') || ''

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'ALL') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // ページを1にリセット
    params.delete('page')

    startTransition(() => {
      router.push(`/admin/customers?${params.toString()}`)
    })
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* ステータスフィルター */}
      <div className="w-full sm:w-48">
        <Select
          value={currentStatus}
          onValueChange={(value) => updateParams('status', value)}
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="NEW">新規</SelectItem>
            <SelectItem value="REGULAR">リピーター</SelectItem>
            <SelectItem value="VIP">VIP</SelectItem>
            <SelectItem value="INACTIVE">休眠</SelectItem>
            <SelectItem value="BLACKLIST">ブラックリスト</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 検索 */}
      <div className="flex-1">
        <Input
          type="search"
          placeholder="名前、メール、電話番号で検索..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const value = e.target.value
            // デバウンス処理（300ms）
            const timeoutId = setTimeout(() => {
              updateParams('search', value)
            }, 300)
            return () => clearTimeout(timeoutId)
          }}
          disabled={isPending}
        />
      </div>

      {isPending && (
        <div className="text-sm text-muted-foreground">読み込み中...</div>
      )}
    </div>
  )
}
