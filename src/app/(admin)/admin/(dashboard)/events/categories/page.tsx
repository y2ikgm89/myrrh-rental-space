/**
 * /admin/events/categories — イベントカテゴリー管理
 *
 * `/admin/spaces` のような**ページ内タブ埋め込みにはしない**。`/admin/events` は
 * URL query key `tab` を既にステータス絞り込み (open/past/draft/cancelled/all) に
 * 使っており、カテゴリー管理を同じ `tab` に相乗りさせると 2 つの意味が衝突する。
 * 同じ `/admin/events` 配下の `seo/page.tsx` と同じ「ハブの直下に独立ルートを足す」形。
 * （`/admin/posts` はカテゴリー管理をタブ埋め込みにしているが、あちらの `tab` は
 * 分類軸専用で衝突しない。）
 */
import { Suspense } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { getEventCategories } from "@/admin/queries/event-category";
import { loadAdminEventCategorySearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { Button, Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { CategoryFilters } from "../../event-categories/_components/CategoryFilters";
import { CategoryTable } from "../../event-categories/_components/CategoryTable";
import { CreateCategoryDialog } from "../../event-categories/_components/CreateCategoryDialog";

export const metadata: Metadata = {
  title: "イベントカテゴリー管理 | Myrrh Rental Space",
};

// カテゴリーは taxonomy 的な小規模データのため、D&D 並び替え中は全件を
// 1 ページで取得する（space-categories/spaces/_components/CategoryTabContent.tsx
// の SORTABLE_VIEW_LIMIT と同じ理由: sortOrder はページをまたぐ全体の連番）。
const SORTABLE_VIEW_LIMIT = 1000;

type PageProps = {
  searchParams: Promise<SearchParams>;
};

async function CategoryList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const params = await loadAdminEventCategorySearchParams(searchParams);
  const sortable = !params.search && params.includeInactive;

  const result = await getEventCategories(
    omitUndefined({
      includeInactive: params.includeInactive,
      search: params.search || undefined,
      page: sortable ? 1 : params.page,
      limit: sortable ? SORTABLE_VIEW_LIMIT : params.perPage,
    }),
  );

  const startIndex = (result.page - 1) * params.perPage;

  return (
    <>
      <CategoryTable
        categories={result.categories}
        sortable={sortable}
        startIndex={startIndex}
      />
      {!sortable && (
        <Pagination
          currentPage={result.page}
          totalPages={result.totalPages}
          total={result.total}
          perPage={params.perPage}
        />
      )}
    </>
  );
}

export default async function EventCategoriesPage({ searchParams }: PageProps) {
  await connection();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/events">
              <IconArrowLeft className="mr-1 h-4 w-4" />
              イベント管理に戻る
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            イベントカテゴリー管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            イベントの種類・カテゴリーを管理します
          </p>
        </div>
        <CreateCategoryDialog />
      </div>

      <div className="space-y-4">
        <Suspense fallback={<LoadingState variant="inline" />}>
          <CategoryFilters />
        </Suspense>
        <Suspense fallback={<LoadingState />}>
          <CategoryList searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
