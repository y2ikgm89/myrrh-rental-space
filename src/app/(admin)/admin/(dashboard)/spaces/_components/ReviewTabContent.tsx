import { Suspense } from "react";
import { connection } from "next/server";
import { getReviews } from "@/admin/queries/review";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import { ReviewFilters } from "./ReviewFilters";
import { ReviewTable } from "./ReviewTable";

async function ReviewList() {
  await connection();

  const rvSearch = adminSpaceSearchParamsCache.get("rvSearch");
  const rvRating = adminSpaceSearchParamsCache.get("rvRating");
  const rvPublished = adminSpaceSearchParamsCache.get("rvPublished");
  const rvSpaceId = adminSpaceSearchParamsCache.get("rvSpaceId");
  const rvPage = adminSpaceSearchParamsCache.get("rvPage");
  const rvPerPage = adminSpaceSearchParamsCache.get("rvPerPage");

  const ratingNum = rvRating ? Number(rvRating) : undefined;
  const isPublished =
    rvPublished === "true"
      ? true
      : rvPublished === "false"
        ? false
        : ("ALL" as const);

  const filters: {
    search?: string;
    spaceId?: string;
    rating?: number;
    isPublished: boolean | "ALL";
  } = { isPublished };

  if (rvSearch) filters.search = rvSearch;
  if (rvSpaceId) filters.spaceId = rvSpaceId;
  if (ratingNum !== undefined) filters.rating = ratingNum;

  const result = await getReviews(filters, {
    page: rvPage,
    limit: rvPerPage,
  });

  return (
    <>
      <ReviewTable reviews={result.reviews} />
      <Pagination
        pageUrlKey="rvPage"
        perPageUrlKey="rvPerPage"
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={rvPerPage}
      />
    </>
  );
}

export function ReviewTabContent() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="inline" />}>
        <ReviewFilters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <ReviewList />
      </Suspense>
    </div>
  );
}
