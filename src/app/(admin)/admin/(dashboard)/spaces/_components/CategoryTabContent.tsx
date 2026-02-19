import { Suspense } from "react";
import { getSpaceCategories } from "@/admin/actions/space-category";
import { CategoryFilters } from "../../space-categories/_components/CategoryFilters";
import { CategoryTable } from "../../space-categories/_components/CategoryTable";
import { CreateCategoryDialog } from "../../space-categories/_components/CreateCategoryDialog";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminSpaceSearchParams } from "@/shared/lib/nuqs";

// =============================================================================
// 型定義
// =============================================================================

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface CategoryTabContentProps {
  searchParams: SearchParams;
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function CategoryList({ searchParams }: { searchParams: SearchParams }) {
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
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CategoryFilters />
      </Suspense>

      {/* カテゴリー一覧 */}
      <Suspense fallback={<LoadingState />}>
        <CategoryList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
