/**
 * お知らせ管理ページ
 *
 * 2タブ構造で記事一覧・メタ情報を管理
 */

import { Suspense } from "react";
import { getNewsList } from "@/admin/actions/news";
import { getPageBySlug } from "@/admin/actions/page";
import { NewsFilters } from "./_components/NewsFilters";
import { NewsTable } from "./_components/NewsTable";
import { NewsManagementTabs } from "./_components/NewsManagementTabs";
import { ListPageSeoForm } from "@/admin/components/ListPageSeoForm";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parseNewsStatusFilter } from "@/shared/lib/validations/enums";
import { loadAdminNewsSearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "お知らせ管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

// ==============================================================================
// 記事一覧タブのコンポーネント
// ==============================================================================

async function NewsList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminNewsSearchParams(searchParams);
  const status = parseNewsStatusFilter(params.status);

  const result = await getNewsList(
    { status, search: params.search || undefined },
    { page: params.page, limit: 10 },
  );

  return (
    <>
      <NewsTable news={result.news} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

// ==============================================================================
// SEOタブのコンポーネント
// ==============================================================================

async function SeoContent() {
  const page = await getPageBySlug("news");

  if (!page) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        お知らせページのメタ情報が見つかりません。
        <br />
        シードデータを再実行するか、管理者にお問い合わせください。
      </div>
    );
  }

  return (
    <ListPageSeoForm
      slug="news"
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
// メインページコンポーネント
// ==============================================================================

export default async function NewsPage({ searchParams }: PageProps) {
  await connection();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          お知らせ管理
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          お知らせの作成・編集・公開管理を行います
        </p>
      </div>

      <NewsManagementTabs
        postsContent={
          <div className="space-y-6">
            <Suspense fallback={<LoadingState variant="inline" />}>
              <NewsFilters />
            </Suspense>
            <Suspense fallback={<LoadingState />}>
              <NewsList searchParams={searchParams} />
            </Suspense>
          </div>
        }
        seoContent={
          <Suspense fallback={<LoadingState />}>
            <SeoContent />
          </Suspense>
        }
      />
    </div>
  );
}
