'use client'

/**
 * ニュース一覧フィルター
 *
 * BaseFilters を使用したシンプルなフィルター実装
 */

import { BaseFilters } from '@/admin/components/table'

export function NewsFilters() {
  return (
    <BaseFilters
      basePath="/admin/news"
      searchPlaceholder="タイトル、本文で検索..."
    />
  )
}
