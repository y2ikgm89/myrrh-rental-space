/**
 * メディアリストラッパー（Server Component）
 */

import { getMediaList } from '@/actions/admin/media'
import { MediaGrid } from './MediaGrid'
import { MediaTable } from './MediaTable'
import { Pagination } from '@/components/admin/ui'
import {
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  type MediaFilters,
  type MediaPagination,
} from '@/lib/validations/media'

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
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">メディアがありません</p>
        <p className="text-sm text-muted-foreground mt-1">
          上のアップロードボタンからファイルをアップロードしてください
        </p>
      </div>
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
