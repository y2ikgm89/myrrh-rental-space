import { Suspense } from "react";
import { getSpaceCategories } from "@/admin/actions/space-category";
import { CategoryFilters } from "../../space-categories/_components/CategoryFilters";
import { CategoryTable } from "../../space-categories/_components/CategoryTable";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminSpaceSearchParams } from "@/shared/lib/nuqs";
import type { SearchParams } from "nuqs/server";

// =============================================================================
// 型定義
// =============================================================================

interface CategoryTabContentProps {
  searchParams: Promise<SearchParams>;
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function CategoryList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await loadAdminSpaceSearchParams(searchParams);
  const includeInactive = params.includeInactive === "true";

  const result = await getSpaceCategories({
    includeInactive,
    search: params.search || undefined,
  });

  return <CategoryTable categories={result.categories} />;
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export async function CategoryTabContent({
  searchParams,
}: CategoryTabContentProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CategoryFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <CategoryList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
