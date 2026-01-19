'use client'

import { BaseFilters } from '@/admin/components/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import type { BlogCategoryData } from '@/admin/actions/blog'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

type BlogFiltersProps = {
  categories: BlogCategoryData[]
}

export function BlogFilters({ categories }: BlogFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentCategory = searchParams.get('categoryId') || 'ALL'

  const handleCategoryChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'ALL') {
      params.set('categoryId', value)
    } else {
      params.delete('categoryId')
    }
    params.delete('page')
    startTransition(() => {
      router.push(`/admin/blog?${params.toString()}`)
    })
  }

  return (
    <BaseFilters
      basePath="/admin/blog"
      searchPlaceholder="タイトル、本文で検索..."
    >
      {/* カテゴリフィルター */}
      <div className="w-full sm:w-48">
        <Select
          value={currentCategory}
          onValueChange={handleCategoryChange}
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべてのカテゴリ</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </BaseFilters>
  )
}
