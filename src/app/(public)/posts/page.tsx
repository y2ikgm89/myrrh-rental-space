/**
 * /posts — ブログ記事一覧ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * ページネーション + 検索 + カテゴリ: nuqs createSearchParamsCache
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultPostsListContent } from "@/public/lib/content/defaults";
import {
  getPublishedPostsList,
  getPostCategories,
} from "@/shared/domain/posts/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Pagination } from "@/public/components/pagination";
import { postsSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { CategoryFilter } from "@/public/components/ui/category-filter";
import { PostGrid } from "./_components/post-grid";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("posts");
}

export default async function PostsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page, q, category } = await postsSearchParams.parse(searchParams);

  const [content, { posts, totalPages, currentPage }, categories] =
    await Promise.all([
      getPageContent("posts", simplePageContentSchema, defaultPostsListContent),
      getPublishedPostsList(Math.max(1, page), undefined, q, category),
      getPostCategories(),
    ]);

  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;
  if (category) preservedQuery["category"] = category;

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          <Suspense fallback={null}>
            <div className="mb-6 max-w-md">
              <SearchBar placeholder="記事を検索..." />
            </div>
          </Suspense>
          {categories.length > 0 ? (
            <Suspense fallback={null}>
              <div className="mb-8">
                <CategoryFilter categories={categories} />
              </div>
            </Suspense>
          ) : null}
          <PostGrid posts={posts} />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/posts"
            {...(Object.keys(preservedQuery).length > 0
              ? { preservedQuery }
              : {})}
          />
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
