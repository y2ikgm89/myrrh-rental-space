import { Suspense } from 'react'
import { getSpaceCategories } from '@/admin/actions/space-category'
import { CategoryFilters } from '../../space-categories/_components/CategoryFilters'
import { CategoryTable } from '../../space-categories/_components/CategoryTable'
import { CreateCategoryDialog } from '../../space-categories/_components/CreateCategoryDialog'

// =============================================================================
// 型定義
// =============================================================================

type SearchParams = Promise<{
  search?: string
  includeInactive?: string
  tab?: string
}>

interface CategoryTabContentProps {
  searchParams: SearchParams
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function CategoryList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const includeInactive = params.includeInactive === 'true'
  const search = params.search

  const result = await getSpaceCategories({ includeInactive, search })

  return <CategoryTable categories={result.categories} />
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export async function CategoryTabContent({ searchParams }: CategoryTabContentProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">カテゴリー一覧</h2>
          <p className="text-sm text-muted-foreground">
            スペースのカテゴリーを管理します
          </p>
        </div>
        <CreateCategoryDialog />
      </div>

      {/* フィルター */}
      <Suspense fallback={<div>読み込み中...</div>}>
        <CategoryFilters />
      </Suspense>

      {/* カテゴリー一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <CategoryList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
