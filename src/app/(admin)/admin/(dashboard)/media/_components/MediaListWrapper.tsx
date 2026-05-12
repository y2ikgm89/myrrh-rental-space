/**
 * メディアリストラッパー（Server Component）
 */

import { connection } from "next/server";
import { getMediaList } from "@/admin/queries/media";
import { MediaGrid } from "./MediaGrid";
import { MediaTable } from "./MediaTable";
import { Pagination } from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  type MediaFilters,
  type MediaPagination,
} from "@/admin/lib/validations/media";

type Props = {
  searchParams: {
    type: string;
    usage: string;
    search: string;
    view: string;
    page: number;
    perPage: number;
  };
};

export async function MediaListWrapper({ searchParams }: Props) {
  await connection();
  const filters: MediaFilters = {
    type: parseMediaTypeFilter(searchParams.type),
    usage: parseMediaUsageFilter(searchParams.usage),
    search: searchParams.search || undefined,
  };

  const pagination: MediaPagination = {
    page: searchParams.page,
    limit: searchParams.perPage,
  };

  const result = await getMediaList(filters, pagination);

  if (result.items.length === 0) {
    return (
      <EmptyState
        message="メディアがありません"
        description="上のアップロードボタンからファイルをアップロードしてください"
      />
    );
  }

  const viewMode = searchParams.view || "grid";

  return (
    <div className="space-y-4">
      {viewMode === "grid" ? (
        <MediaGrid items={result.items} />
      ) : (
        <MediaTable items={result.items} />
      )}

      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={searchParams.perPage}
        perPageOptions={[24, 48, 96]}
        defaultPerPage={24}
      />
    </div>
  );
}
