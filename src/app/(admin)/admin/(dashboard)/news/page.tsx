/**
 * お知らせ管理ページ
 *
 * 2タブ構造で記事一覧・メタ情報を管理
 */

import { Suspense } from "react";
import Link from "next/link";
import { getNewsList } from "@/admin/actions/news";
import { getPageBySlug } from "@/admin/actions/page";
import { NewsFilters } from "./_components/NewsFilters";
import { NewsTable } from "./_components/NewsTable";
import { ListPageSeoForm } from "@/admin/components/ListPageSeoForm";
import {
  Button,
  Pagination,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parseNewsStatusFilter } from "@/shared/lib/validations/enums";
import { loadAdminNewsSearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";
import { headers } from "next/headers";

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
      <div className="text-center py-8 text-muted-foreground">
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
  await headers();
  const params = await loadAdminNewsSearchParams(searchParams);
  const currentTab = params.tab;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">お知らせ管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            お知らせの作成・編集・公開管理を行います
          </p>
        </div>
        {currentTab === "posts" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/news/new">新規作成</Link>
          </Button>
        )}
      </div>

      {/* タブ */}
      <Tabs defaultValue={currentTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="posts" asChild>
            <Link href="/admin/news?tab=posts">記事一覧</Link>
          </TabsTrigger>
          <TabsTrigger value="meta" asChild>
            <Link href="/admin/news?tab=meta">メタ情報</Link>
          </TabsTrigger>
        </TabsList>

        {/* 記事一覧タブ */}
        <TabsContent value="posts" className="space-y-6">
          <Suspense fallback={<LoadingState variant="inline" />}>
            <NewsFilters />
          </Suspense>
          <Suspense fallback={<LoadingState />}>
            <NewsList searchParams={searchParams} />
          </Suspense>
        </TabsContent>

        {/* SEOタブ */}
        <TabsContent value="meta">
          <Suspense fallback={<LoadingState />}>
            <SeoContent />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
