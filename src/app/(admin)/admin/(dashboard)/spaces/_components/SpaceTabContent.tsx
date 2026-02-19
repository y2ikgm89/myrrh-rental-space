import { Suspense } from "react";
import Link from "next/link";
import { getSpaces } from "@/admin/actions/space";
import { SpaceFilters } from "./SpaceFilters";
import { SpaceTable } from "./SpaceTable";
import { Button, Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminSpaceSearchParams } from "@/shared/lib/nuqs";

// =============================================================================
// 型定義
// =============================================================================

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface SpaceTabContentProps {
  searchParams: SearchParams;
}

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function SpaceList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminSpaceSearchParams(searchParams);
  const isPublished =
    params.status === "true" ? true : params.status === "false" ? false : "ALL";

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
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">スペース一覧</h2>
          <p className="text-sm text-muted-foreground">
            スペースの追加・編集・公開管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/spaces/new">新規作成</Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <SpaceFilters />
      </Suspense>

      {/* スペース一覧 */}
      <Suspense fallback={<LoadingState />}>
        <SpaceList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
