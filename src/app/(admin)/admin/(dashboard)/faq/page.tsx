/**
 * FAQ 管理ページ
 *
 * 3 タブ構造で質問・カテゴリ・FAQ ページ SEO を管理する。
 */

import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import {
  getDeletedFaqCategories,
  getDeletedFaqItems,
  getFaqCategories,
  getFaqItems,
} from "@/admin/queries/faq";
import { getPageBySlug } from "@/admin/queries/page";
import { ListPageSeoForm } from "@/admin/components/ListPageSeoForm";
import { LoadingState } from "@/admin/components/LoadingState";
import { Pagination } from "@/admin/components/ui";
import { loadAdminFaqSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { FaqManagementTabs } from "./_components/FaqManagementTabs";
import { FaqItemFilters } from "./_components/FaqItemFilters";
import { FaqItemTable } from "./_components/FaqItemTable";
import { FaqCategoryTable } from "./_components/FaqCategoryTable";
import { FaqTrashTable } from "./_components/FaqTrashTable";

export const metadata: Metadata = {
  title: "FAQ管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  readonly searchParams: SearchParams;
};

// ==============================================================================
// 質問一覧タブ
// ==============================================================================

async function FaqItemsTabContent({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  await connection();
  const params = await loadAdminFaqSearchParams(searchParams);
  const [{ items, page, totalPages, total }, { categories }] =
    await Promise.all([
      getFaqItems(
        omitUndefined({
          search: params.search || undefined,
          categoryId: params.categoryId || undefined,
          isPublished:
            params.status === "published"
              ? true
              : params.status === "draft"
                ? false
                : undefined,
          quickFilter: params.quickFilter,
        }),
        { page: params.page, limit: params.perPage },
        { sortBy: params.sortBy, sortOrder: params.sortOrder },
      ),
      getFaqCategories(),
    ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <FaqItemFilters categories={categoryOptions} />
      <FaqItemTable
        initialItems={items}
        activeCategoryId={params.categoryId}
        allCategories={categoryOptions}
        currentSortBy={params.sortBy}
      />
      <Pagination currentPage={page} totalPages={totalPages} total={total} />
    </div>
  );
}

// ==============================================================================
// カテゴリ一覧タブ
// ==============================================================================

async function FaqCategoriesTabContent() {
  await connection();
  const { categories } = await getFaqCategories();
  return <FaqCategoryTable initialCategories={categories} />;
}

// ==============================================================================
// SEO タブ
// ==============================================================================

async function FaqSeoTabContent() {
  await connection();
  const page = await getPageBySlug("faq");

  if (!page) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        FAQ ページのメタ情報が見つかりません。
        <br />
        シードデータを再実行するか、管理者にお問い合わせください。
      </div>
    );
  }

  return (
    <ListPageSeoForm
      slug="faq"
      seoData={{
        title: page.title,
        metaDescription: page.metaDescription,
        metaKeywords: page.metaKeywords,
        ogpTitle: page.ogpTitle,
        ogpDescription: page.ogpDescription,
        ogpImageUrl: page.ogpImageUrl,
      }}
    />
  );
}

// ==============================================================================
// ゴミ箱タブ
// ==============================================================================

async function FaqTrashTabContent() {
  await connection();
  const [deletedCategories, deletedItems] = await Promise.all([
    getDeletedFaqCategories(),
    getDeletedFaqItems(),
  ]);
  return <FaqTrashTable categories={deletedCategories} items={deletedItems} />;
}

// ==============================================================================
// メインページ
// ==============================================================================

export default async function FaqPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          FAQ管理
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          よくある質問とカテゴリを管理します
        </p>
      </div>

      <FaqManagementTabs
        itemsContent={
          <Suspense fallback={<LoadingState />}>
            <FaqItemsTabContent searchParams={searchParams} />
          </Suspense>
        }
        categoriesContent={
          <Suspense fallback={<LoadingState />}>
            <FaqCategoriesTabContent />
          </Suspense>
        }
        seoContent={
          <Suspense fallback={<LoadingState />}>
            <FaqSeoTabContent />
          </Suspense>
        }
        trashContent={
          <Suspense fallback={<LoadingState />}>
            <FaqTrashTabContent />
          </Suspense>
        }
      />
    </div>
  );
}
