/**
 * 投稿管理ページ
 *
 * 3タブ構造で記事一覧・カテゴリー・タグを管理
 */

import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { getPosts, getPostCategories, getPostTags } from "@/admin/queries/post";
import { PostFilters } from "./_components/PostFilters";
import { PostTable } from "./_components/PostTable";
import { PostsManagementTabs } from "./_components/PostsManagementTabs";
import { CategoryManager } from "./taxonomy/_components/CategoryManager";
import { TagManager } from "./taxonomy/_components/TagManager";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parsePostStatusFilter } from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "@/shared/lib/serialize";
import { loadAdminPostSearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "投稿管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

// ==============================================================================
// 記事一覧タブのコンポーネント
// ==============================================================================

async function PostFiltersWrapper() {
  await connection();
  const categories = await getPostCategories();
  return <PostFilters categories={categories} />;
}

async function PostList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await loadAdminPostSearchParams(searchParams);
  const status = parsePostStatusFilter(params.status);

  const result = await getPosts(
    omitUndefined({
      status,
      categoryId: params.categoryId || undefined,
      search: params.search || undefined,
    }),
    {
      page: params.page,
      limit: params.perPage,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    },
  );

  return (
    <>
      <PostTable posts={result.posts} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.perPage}
      />
    </>
  );
}

// ==============================================================================
// カテゴリータブのコンポーネント
// ==============================================================================

async function CategoryContent() {
  await connection();
  const categories = await getPostCategories();
  return <CategoryManager initialCategories={categories} />;
}

// ==============================================================================
// タグタブのコンポーネント
// ==============================================================================

async function TagContent() {
  await connection();
  const tags = await getPostTags();
  return <TagManager initialTags={tags} />;
}

// ==============================================================================
// タブパネル（アクティブタブのみ描画）
// ==============================================================================

function tabPanel(
  tab: "posts" | "categories" | "tags",
  searchParams: SearchParams,
) {
  switch (tab) {
    case "posts":
      return (
        <div className="space-y-6">
          <Suspense fallback={<LoadingState variant="inline" />}>
            <PostFiltersWrapper />
          </Suspense>
          <Suspense fallback={<LoadingState />}>
            <PostList searchParams={searchParams} />
          </Suspense>
        </div>
      );
    case "categories":
      return (
        <Suspense fallback={<LoadingState />}>
          <CategoryContent />
        </Suspense>
      );
    case "tags":
      return (
        <Suspense fallback={<LoadingState />}>
          <TagContent />
        </Suspense>
      );
  }
}

// ==============================================================================
// メインページコンポーネント
// ==============================================================================

export default async function PostsPage({ searchParams }: PageProps) {
  const { tab } = await loadAdminPostSearchParams(searchParams);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            投稿管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            投稿・カテゴリー・タグを管理します
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/posts/new">
            <IconPlus className="mr-2 h-4 w-4" />
            新規投稿作成
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        <PostsManagementTabs />
        {/* タブ依存パネルは Suspense 動的ホールで描画し `shallow:false` ソフトナビ時に
            request 時再ストリーム。`key={tab}` でタブ切替ごとに subtree を作り直す
            （events / reservations / spaces と同じ公式 PPR パターン）。 */}
        <Suspense key={tab} fallback={<LoadingState />}>
          {tabPanel(tab, searchParams)}
        </Suspense>
      </div>
    </div>
  );
}
