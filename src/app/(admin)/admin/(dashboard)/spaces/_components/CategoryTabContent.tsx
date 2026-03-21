import { Suspense } from "react";
import { getSpaceCategories } from "@/admin/queries/space-category";
import { CategoryFilters } from "../../_space-categories/_components/CategoryFilters";
import { CategoryTable } from "../../_space-categories/_components/CategoryTable";
import { LoadingState } from "@/admin/components/LoadingState";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function CategoryList() {
  const params = adminSpaceSearchParamsCache.all();
  const includeInactive = params.includeInactive;

  const result = await getSpaceCategories(
    omitUndefined({
      includeInactive,
      search: params.search || undefined,
    }),
  );

  return <CategoryTable categories={result.categories} />;
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
