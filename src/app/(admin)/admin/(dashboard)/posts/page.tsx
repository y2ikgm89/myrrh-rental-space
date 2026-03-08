/**
 * 投稿管理ページ
 *
 * 4タブ構造で記事一覧・カテゴリー・タグ・コメントを管理
 */

import { Suspense } from "react";
import { getPosts, getPostCategories, getPostTags } from "@/admin/actions/post";
import {
  getAdminComments,
  getCommentStats,
} from "@/admin/actions/post-comment";
import { PostFilters } from "./_components/PostFilters";
import { PostTable } from "./_components/PostTable";
import { PostsManagementTabs } from "./_components/PostsManagementTabs";
import { CategoryManager } from "./taxonomy/_components/CategoryManager";
import { TagManager } from "./taxonomy/_components/TagManager";
import { CommentFilters } from "./comments/_components/CommentFilters";
import { CommentTable } from "./comments/_components/CommentTable";
import { CommentStats } from "./comments/_components/CommentStats";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parsePostStatusFilter } from "@/shared/lib/validations/enums";
import { createTypeGuard } from "@/shared/lib/serialize";
import { loadAdminPostSearchParams } from "@/shared/lib/nuqs";
import type { CommentFilters as CommentFiltersType } from "@/shared/domain/post-comments/types";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "投稿管理 | Myrrh Rental Space",
};

// コメントステータスフィルター
const COMMENT_STATUS_VALUES = ["ALL", "ACTIVE", "DELETED"] as const;
const isValidCommentStatus = createTypeGuard(COMMENT_STATUS_VALUES);

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

// ==============================================================================
// 記事一覧タブのコンポーネント
// ==============================================================================

async function PostFiltersWrapper() {
  const categories = await getPostCategories();
  return <PostFilters categories={categories} />;
}

async function PostList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminPostSearchParams(searchParams);
  const status = parsePostStatusFilter(params.status);

  const result = await getPosts(
    {
      status,
      categoryId: params.categoryId || undefined,
      search: params.search || undefined,
    },
    { page: params.page, limit: 10 },
  );

  return (
    <>
      <PostTable posts={result.posts} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

// ==============================================================================
// カテゴリータブのコンポーネント
// ==============================================================================

async function CategoryContent() {
  const categories = await getPostCategories();
  return <CategoryManager initialCategories={categories} />;
}

// ==============================================================================
// タグタブのコンポーネント
// ==============================================================================

async function TagContent() {
  const tags = await getPostTags();
  return <TagManager initialTags={tags} />;
}

// ==============================================================================
// コメントタブのコンポーネント
// ==============================================================================

async function CommentStatsWrapper() {
  const stats = await getCommentStats();
  return <CommentStats stats={stats} />;
}

async function CommentList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminPostSearchParams(searchParams);
  const status = isValidCommentStatus(params.status)
    ? params.status
    : undefined;

  const filters: CommentFiltersType = {
    status: status ?? "ALL",
    postId: params.postId || undefined,
    search: params.search || undefined,
  };

  const result = await getAdminComments(filters, {
    page: params.page,
    limit: 20,
  });

  return (
    <>
      <CommentTable comments={result.comments} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

// ==============================================================================
// メインページコンポーネント
// ==============================================================================

export default async function PostsPage({ searchParams }: PageProps) {
  await connection();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          投稿管理
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          投稿・カテゴリー・タグ・コメントを管理します
        </p>
      </div>

      <PostsManagementTabs
        postsContent={
          <div className="space-y-6">
            <Suspense fallback={<LoadingState variant="inline" />}>
              <PostFiltersWrapper />
            </Suspense>
            <Suspense fallback={<LoadingState />}>
              <PostList searchParams={searchParams} />
            </Suspense>
          </div>
        }
        categoriesContent={
          <Suspense fallback={<LoadingState />}>
            <CategoryContent />
          </Suspense>
        }
        tagsContent={
          <Suspense fallback={<LoadingState />}>
            <TagContent />
          </Suspense>
        }
        commentsContent={
          <div className="space-y-6">
            <Suspense fallback={<LoadingState />}>
              <CommentStatsWrapper />
            </Suspense>
            <CommentFilters />
            <Suspense fallback={<LoadingState />}>
              <CommentList searchParams={searchParams} />
            </Suspense>
          </div>
        }
      />
    </div>
  );
}
