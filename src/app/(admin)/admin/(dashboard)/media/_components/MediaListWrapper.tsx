/**
 * メディアリストラッパー（Server Component）
 */

import { getMediaList } from '@/admin/actions/media'
import { MediaGrid } from './MediaGrid'
import { MediaTable } from './MediaTable'
import { Pagination } from '@/admin/components/ui'
import { EmptyState } from '@/admin/components/EmptyState'
import {
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  type MediaFilters,
  type MediaPagination,
} from '@/admin/lib/validations/media'

type Props = {
  searchParams: {
    type?: string
    usage?: string
    search?: string
    page?: string
    view?: string
  }
}

export async function MediaListWrapper({ searchParams }: Props) {
  const filters: MediaFilters = {
    type: parseMediaTypeFilter(searchParams.type),
    usage: parseMediaUsageFilter(searchParams.usage),
    search: searchParams.search,
  }

  const pagination: MediaPagination = {
    page: searchParams.page ? parseInt(searchParams.page, 10) : 1,
    limit: 24,
  }

  const result = await getMediaList(filters, pagination)

  if (result.items.length === 0) {
    return (
      <EmptyState
        message="メディアがありません"
        description="上のアップロードボタンからファイルをアップロードしてください"
      />
    )
  }

  const viewMode = searchParams.view || 'grid'

  return (
    <div className="space-y-4">
      {viewMode === 'grid' ? (
        <MediaGrid items={result.items} />
      ) : (
        <MediaTable items={result.items} />
      )}

      {result.totalPages > 1 && (
        <Pagination
          currentPage={result.page}
          totalPages={result.totalPages}
          total={result.total}
        />
      )}
    </div>
  )
}
