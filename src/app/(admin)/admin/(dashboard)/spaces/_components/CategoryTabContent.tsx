import { Suspense } from "react";
import { connection } from "next/server";
import { getSpaceCategories } from "@/admin/queries/space-category";
import { CategoryFilters } from "../../space-categories/_components/CategoryFilters";
import { CategoryTable } from "../../space-categories/_components/CategoryTable";
import { LoadingState } from "@/admin/components/LoadingState";
import { Pagination } from "@/admin/components/ui";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// 内部コンポーネント
// =============================================================================

// Round-5 audit Finding #3: D&D 並び替えは常に「今 DB に存在する全カテゴリー」
// を対象に updateSpaceCategoryOrder の過不足チェックを通過させる必要がある
// (sortOrder はページをまたぐ全体の連番のため)。カテゴリーは taxonomy 的な
// 小規模データ (数件〜数十件想定) で、通常のページング上限
// (parseAsPerPage 既定 10) だと 11 件目以降が存在する時点で並び替えページの
// 通常ページングでは対象外になり、ドラッグしても「カテゴリー数が一致しません」
// で毎回失敗していた。sortable な表示 (検索なし・非アクティブ含む) のときは
// ページングを無効化し全件を 1 ページで取得する。
const SORTABLE_VIEW_LIMIT = 1000;

async function CategoryList() {
  await connection();
  const params = adminSpaceSearchParamsCache.all();

  // D&D 並び替えは検索・絞り込みなしのときのみ有効
  // （非アクティブ除外中は順序が部分集合になり破綻するため）
  const sortable = !params.catSearch && params.catIncludeInactive;

  const result = await getSpaceCategories(
    omitUndefined({
      includeInactive: params.catIncludeInactive,
      search: params.catSearch || undefined,
      page: sortable ? 1 : params.catPage,
      limit: sortable ? SORTABLE_VIEW_LIMIT : params.catPerPage,
    }),
  );

  const startIndex = (result.page - 1) * params.catPerPage;

  return (
    <>
      <CategoryTable
        categories={result.categories}
        sortable={sortable}
        startIndex={startIndex}
      />
      {!sortable && (
        <Pagination
          pageUrlKey="catPage"
          perPageUrlKey="catPerPage"
          currentPage={result.page}
          totalPages={result.totalPages}
          total={result.total}
          perPage={params.catPerPage}
        />
      )}
    </>
  );
}

// =============================================================================
// メインコンポーネント（親ページで `adminSpaceSearchParamsCache.parse` 済みであること）
// =============================================================================

export function CategoryTabContent() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CategoryFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <CategoryList />
      </Suspense>
    </div>
  );
}
