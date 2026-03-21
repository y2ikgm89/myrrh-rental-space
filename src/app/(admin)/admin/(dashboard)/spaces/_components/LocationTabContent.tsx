import { Suspense } from "react";
import { getLocations } from "@/admin/queries/location";
import { LocationFilters } from "../../locations/_components/LocationFilters";
import { LocationTable } from "../../locations/_components/LocationTable";
import { LoadingState } from "@/admin/components/LoadingState";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function LocationList() {
  const params = adminSpaceSearchParamsCache.all();
  const includeInactive = params.published !== "true";

  const result = await getLocations(
    omitUndefined({
      includeInactive,
      search: params.search || undefined,
    }),
  );

  return <LocationTable locations={result.locations} />;
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
