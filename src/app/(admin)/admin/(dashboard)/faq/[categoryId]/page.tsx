/**
 * /admin/faq/[categoryId] — FAQ カテゴリ詳細ページ
 *
 * カテゴリ配下の質問一覧を検索・並び替え・DnD 並び順設定・一括操作・
 * 質問 Dialog での CRUD を行う master-detail アーキテクチャの detail 側。
 *
 * Next.js 16 公式パターン準拠:
 * - params: Promise<{ categoryId: string }> を await して取得
 * - generateMetadata で動的 metadata 生成
 * - Suspense + connection() で PPR 対応
 */

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import {
  getFaqCategories,
  getFaqCategoryById,
  getFaqItems,
} from "@/admin/queries/faq";
import { LoadingState } from "@/admin/components/LoadingState";
import { Pagination } from "@/admin/components/ui";
import { loadAdminFaqCategoryDetailSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { FaqCategoryDetailView } from "../_components/FaqCategoryDetailView";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  readonly params: Promise<{ categoryId: string }>;
  readonly searchParams: SearchParams;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { categoryId } = await params;
  const category = await getFaqCategoryById(categoryId);
  if (!category) {
    return { title: "カテゴリが見つかりません | FAQ管理 | Myrrh Rental Space" };
  }
  return {
    title: `${category.name} | FAQ管理 | Myrrh Rental Space`,
  };
}

async function CategoryDetailContent({
  categoryId,
  searchParams,
}: {
  readonly categoryId: string;
  readonly searchParams: SearchParams;
}) {
  await connection();

  const [category, params, allCategoriesResult] = await Promise.all([
    getFaqCategoryById(categoryId),
    loadAdminFaqCategoryDetailSearchParams(searchParams),
    getFaqCategories(),
  ]);

  if (!category) {
    notFound();
  }

  const { items, page, totalPages, total } = await getFaqItems(
    omitUndefined({
      categoryId: category.id,
      search: params.search || undefined,
      isPublished:
        params.status === "published"
          ? true
          : params.status === "draft"
            ? false
            : undefined,
      quickFilter:
        params.quickFilter === "all" ? undefined : params.quickFilter,
    }),
    { page: params.page, limit: params.perPage },
    { sortBy: params.sortBy, sortOrder: params.sortOrder },
  );

  const allCategoryOptions = allCategoriesResult.categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/faq"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
          カテゴリ一覧に戻る
        </Link>
      </div>

      <FaqCategoryDetailView
        key={category.id}
        category={category}
        items={items}
        allCategories={allCategoryOptions}
        currentSortBy={params.sortBy}
        totalItems={total}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        total={total}
        perPage={params.perPage}
        defaultPerPage={20}
      />
    </div>
  );
}

export default async function FaqCategoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { categoryId } = await params;

  return (
    <Suspense fallback={<LoadingState />}>
      <CategoryDetailContent
        categoryId={categoryId}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
