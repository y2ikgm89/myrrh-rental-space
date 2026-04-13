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

async function CategoryList() {
  await connection();
  const params = adminSpaceSearchParamsCache.all();

  const result = await getSpaceCategories(
    omitUndefined({
      includeInactive: params.catIncludeInactive,
      search: params.catSearch || undefined,
      page: params.catPage,
      limit: params.catPerPage,
    }),
  );

  return (
    <>
      <CategoryTable categories={result.categories} />
      <Pagination
        pageUrlKey="catPage"
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

// =============================================================================
// メインコンポーネント（親ページで `adminSpaceSearchParamsCache.parse` 済みであること）
// =============================================================================

export async function CategoryTabContent() {
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
