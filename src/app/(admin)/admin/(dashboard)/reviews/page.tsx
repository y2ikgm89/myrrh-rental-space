import { Suspense } from "react";
import { getReviews } from "@/admin/queries/review";
import { ReviewFilters } from "./_components/ReviewFilters";
import { ReviewTable } from "./_components/ReviewTable";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminReviewSearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "レビュー管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function ReviewList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminReviewSearchParams(searchParams);

  const ratingNum = params.rating ? Number(params.rating) : undefined;
  const isPublished =
    params.published === "true"
      ? true
      : params.published === "false"
        ? false
        : ("ALL" as const);

  const filters: {
    search?: string;
    rating?: number;
    isPublished: boolean | "ALL";
  } = { isPublished };

  if (params.search) {
    filters.search = params.search;
  }

  if (ratingNum !== undefined) {
    filters.rating = ratingNum;
  }

  const result = await getReviews(filters, {
    page: params.page,
    limit: params.perPage,
  });

  return (
    <>
      <ReviewTable reviews={result.reviews} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            レビュー管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペースに投稿されたレビューの確認・公開管理を行います
          </p>
        </div>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <ReviewFilters />
      </Suspense>

      {/* レビュー一覧 */}
      <Suspense fallback={<LoadingState />}>
        <ReviewList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
