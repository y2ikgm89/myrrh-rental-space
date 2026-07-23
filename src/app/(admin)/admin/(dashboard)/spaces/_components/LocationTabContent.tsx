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

// D&D 並び替えは常に「今 DB に存在する全拠点」を対象に updateLocationOrder の
// 過不足チェックを通過させる必要がある（sortOrder はページをまたぐ全体の連番
// のため）。拠点は数件〜数十件想定の小規模データで、通常のページング上限
// (parseAsPerPage 既定 10) だと 11 件目以降が存在する時点で通常ページングでは
// 対象外になり、ドラッグしても「場所数が一致しません」で毎回失敗していた
// （CategoryTabContent の Round-5 audit Finding #3 と同型のバグ）。sortable な
// 表示（検索・公開フィルタなし）のときはページングを無効化し全件を1ページで
// 取得する。
const SORTABLE_VIEW_LIMIT = 1000;

async function LocationList() {
  await connection();
  const params = adminSpaceSearchParamsCache.all();
  const isPublished =
    params.locStatus === "true"
      ? true
      : params.locStatus === "false"
        ? false
        : ("ALL" as const);

  // D&D 並び替えは検索・公開フィルタなしのときのみ有効
  // （絞り込み中は順序が部分集合になり破綻するため）
  const sortable = !params.locSearch && isPublished === "ALL";

  const result = await getLocations(
    omitUndefined({
      isPublished,
      search: params.locSearch || undefined,
      page: sortable ? 1 : params.locPage,
      limit: sortable ? SORTABLE_VIEW_LIMIT : params.locPerPage,
    }),
  );

  const startIndex = (result.page - 1) * params.locPerPage;

  return (
    <>
      <LocationTable
        locations={result.locations}
        sortable={sortable}
        startIndex={startIndex}
      />
      {!sortable && (
        <Pagination
          pageUrlKey="locPage"
          perPageUrlKey="locPerPage"
          currentPage={result.page}
          totalPages={result.totalPages}
          total={result.total}
          perPage={params.locPerPage}
        />
      )}
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
