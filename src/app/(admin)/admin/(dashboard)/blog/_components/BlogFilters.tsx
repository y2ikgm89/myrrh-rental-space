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
import { useFilterParamsWithCategory } from '@/shared/hooks'

type BlogFiltersProps = {
  categories: BlogCategoryData[]
}

export function BlogFilters({ categories }: BlogFiltersProps) {
  const { params, setCategory } = useFilterParamsWithCategory()

  return (
    <BaseFilters searchPlaceholder="タイトル、本文で検索...">
      {/* カテゴリフィルター */}
      <div className="w-full sm:w-48">
        <Select value={params.categoryId} onValueChange={setCategory}>
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
