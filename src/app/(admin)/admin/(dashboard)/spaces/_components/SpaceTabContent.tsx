import { Suspense } from "react";
import { connection } from "next/server";
import { z } from "zod";
import { getSpaces } from "@/admin/queries/space";
import { getActiveLocationsForSelect } from "@/admin/queries/location";
import { getActiveSpaceCategories } from "@/admin/queries/space-category";
import { SpaceFilters } from "./SpaceFilters";
import { SpaceTable } from "./SpaceTable";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { ADMIN_SPACE_LIST_CATEGORY_UNASSIGNED } from "@/shared/lib/constants/admin-space-management";

// =============================================================================
// 内部コンポーネント
// =============================================================================

async function SpaceList() {
  await connection();
  const params = adminSpaceSearchParamsCache.all();

  let isPublished: boolean | "ALL" = "ALL";
  if (params.spStatus === "true") {
    isPublished = true;
  } else if (params.spStatus === "false") {
    isPublished = false;
  }

  const locationParsed = z.uuid().safeParse(params.spLocationId);
  const locationId = locationParsed.success ? locationParsed.data : undefined;

  let uncategorizedOnly: boolean | undefined;
  let categoryId: string | undefined;
  if (params.spCategoryId === ADMIN_SPACE_LIST_CATEGORY_UNASSIGNED) {
    uncategorizedOnly = true;
  } else if (params.spCategoryId !== "") {
    const categoryParsed = z.uuid().safeParse(params.spCategoryId);
    if (categoryParsed.success) {
      categoryId = categoryParsed.data;
    }
  }

  const result = await getSpaces(
    omitUndefined({
      isPublished,
      search: params.spSearch || undefined,
      locationId,
      categoryId,
      uncategorizedOnly,
    }),
    {
      page: params.spPage,
      limit: params.spPerPage,
      sortBy: params.spSortBy,
      sortOrder: params.spSortOrder,
    },
  );

  return (
    <>
      <SpaceTable spaces={result.spaces} />
      <Pagination
        pageUrlKey="spPage"
        perPageUrlKey="spPerPage"
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.spPerPage}
      />
    </>
  );
}

// =============================================================================
// メインコンポーネント（親ページで `adminSpaceSearchParamsCache.parse` 済みであること）
// =============================================================================

export async function SpaceTabContent() {
  await connection();
  const [locations, categories] = await Promise.all([
    getActiveLocationsForSelect(),
    getActiveSpaceCategories(),
  ]);

  return (
    <div className="space-y-6">
      <SpaceFilters
        locationOptions={locations.map((loc) => ({
          id: loc.id,
          name: loc.name,
        }))}
        categoryOptions={categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
        }))}
      />
      <Suspense fallback={<LoadingState />}>
        <SpaceList />
      </Suspense>
    </div>
  );
}
