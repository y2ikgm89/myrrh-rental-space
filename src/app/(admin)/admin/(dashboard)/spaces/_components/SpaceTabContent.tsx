import { Suspense } from "react";
import { getSpaces } from "@/admin/actions/space";
import { SpaceFilters } from "./SpaceFilters";
import { SpaceTable } from "./SpaceTable";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminSpaceSearchParams } from "@/shared/lib/nuqs";
import type { SearchParams } from "nuqs/server";

// =============================================================================
// 型定義
// =============================================================================

interface SpaceTabContentProps {
  searchParams: Promise<SearchParams>;
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function SpaceList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await loadAdminSpaceSearchParams(searchParams);

  let isPublished: boolean | "ALL" = "ALL";
  if (params.status === "true") {
    isPublished = true;
  } else if (params.status === "false") {
    isPublished = false;
  }

  const result = await getSpaces(
    { isPublished, search: params.search || undefined },
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
// メインコンポーネント
// =============================================================================

export async function SpaceTabContent({ searchParams }: SpaceTabContentProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <SpaceFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <SpaceList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
