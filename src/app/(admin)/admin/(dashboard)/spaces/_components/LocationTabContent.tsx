import { Suspense } from "react";
import { connection } from "next/server";
import { getLocations } from "@/admin/queries/location";
import { LocationFilters } from "../../locations/_components/LocationFilters";
import { LocationTable } from "../../locations/_components/LocationTable";
import { LoadingState } from "@/admin/components/LoadingState";
import { Pagination } from "@/admin/components/ui";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function LocationList() {
  await connection();
  const params = adminSpaceSearchParamsCache.all();
  const includeInactive = params.locPublished !== "true";

  const result = await getLocations(
    omitUndefined({
      includeInactive,
      search: params.locSearch || undefined,
      page: params.locPage,
      limit: params.locPerPage,
    }),
  );

  // D&D 並び替えは検索・公開フィルタなしのときのみ有効
  // （絞り込み中は順序が部分集合になり破綻するため）
  const sortable = !params.locSearch && includeInactive;
  const startIndex = (result.page - 1) * params.locPerPage;

  return (
    <>
      <LocationTable
        locations={result.locations}
        sortable={sortable}
        startIndex={startIndex}
      />
      <Pagination
        pageUrlKey="locPage"
        perPageUrlKey="locPerPage"
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.locPerPage}
      />
    </>
  );
}

// =============================================================================
// メインコンポーネント（親ページで `adminSpaceSearchParamsCache.parse` 済みであること）
// =============================================================================

export async function LocationTabContent() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <LocationFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <LocationList />
      </Suspense>
    </div>
  );
}
