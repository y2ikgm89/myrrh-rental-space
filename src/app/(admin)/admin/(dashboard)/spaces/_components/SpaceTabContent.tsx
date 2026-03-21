import { Suspense } from "react";
import { getSpaces } from "@/admin/queries/space";
import { SpaceFilters } from "./SpaceFilters";
import { SpaceTable } from "./SpaceTable";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function SpaceList() {
  const params = adminSpaceSearchParamsCache.all();

  let isPublished: boolean | "ALL" = "ALL";
  if (params.status === "true") {
    isPublished = true;
  } else if (params.status === "false") {
    isPublished = false;
  }

  const result = await getSpaces(
    omitUndefined({ isPublished, search: params.search || undefined }),
    { page: params.page, limit: 10 },
  );

  return (
    <>
      <SpaceTable spaces={result.spaces} />
      <Pagination
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

export async function SpaceTabContent() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <SpaceFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <SpaceList />
      </Suspense>
    </div>
  );
}
