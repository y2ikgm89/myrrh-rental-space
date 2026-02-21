import { Suspense } from "react";
import { getLocations } from "@/admin/actions/location";
import { LocationFilters } from "../../locations/_components/LocationFilters";
import { LocationTable } from "../../locations/_components/LocationTable";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminSpaceSearchParams } from "@/shared/lib/nuqs";
import type { SearchParams } from "nuqs/server";

// =============================================================================
// 型定義
// =============================================================================

interface LocationTabContentProps {
  searchParams: Promise<SearchParams>;
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function LocationList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await loadAdminSpaceSearchParams(searchParams);
  const includeInactive = params.published !== "true";

  const result = await getLocations({
    includeInactive,
    search: params.search || undefined,
  });

  return <LocationTable locations={result.locations} />;
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export async function LocationTabContent({
  searchParams,
}: LocationTabContentProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <LocationFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <LocationList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
