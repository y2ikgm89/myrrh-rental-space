import { Suspense } from "react";
import Link from "next/link";
import { getLocations } from "@/admin/actions/location";
import { LocationFilters } from "../../locations/_components/LocationFilters";
import { LocationTable } from "../../locations/_components/LocationTable";
import { Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminSpaceSearchParams } from "@/shared/lib/nuqs";

// =============================================================================
// 型定義
// =============================================================================

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface LocationTabContentProps {
  searchParams: SearchParams;
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function LocationList({ searchParams }: { searchParams: SearchParams }) {
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
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">場所一覧</h2>
          <p className="text-sm text-muted-foreground">
            場所（建物・施設）の追加・編集・公開管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/locations/new">新規作成</Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <LocationFilters />
      </Suspense>

      {/* 場所一覧 */}
      <Suspense fallback={<LoadingState />}>
        <LocationList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
