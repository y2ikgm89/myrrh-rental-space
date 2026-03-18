/**
 * /posts — ブログ記事一覧ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * ページネーション: nuqs createSearchParamsCache
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPublishedPostsList } from "@/shared/domain/posts/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Pagination } from "@/public/components/Pagination";
import { paginationSearchParams } from "@/public/lib/search-params";
import { PostGrid } from "./_components/PostGrid";

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

  const { page } = await paginationSearchParams.parse(searchParams);

  const { posts, totalPages, currentPage } = await getPublishedPostsList(
    Math.max(1, page),
  );

  return (
    <>
      <PageHero
        variant="compact"
        title="ブログ"
        breadcrumb={<Breadcrumb items={[{ label: "ブログ" }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          <PostGrid posts={posts} />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/posts"
          />
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
