'use client'

import { BaseFilters } from '@/admin/components/table'
import { Checkbox, Label } from '@/admin/components/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export function CategoryFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const includeInactive = searchParams.get('includeInactive') === 'true'

  const handleIncludeInactiveChange = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (checked) {
      params.set('includeInactive', 'true')
    } else {
      params.delete('includeInactive')
    }
    params.delete('page')
    // タブパラメータを保持
    params.set('tab', 'categories')
    startTransition(() => {
      router.push(`/admin/spaces?${params.toString()}`)
    })
  }

  return (
    <BaseFilters
      basePath="/admin/spaces"
      statusOptions={[]}
      searchPlaceholder="名前・説明で検索..."
      preserveParams={{ tab: 'categories' }}
    >
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
    </BaseFilters>
  )
}
