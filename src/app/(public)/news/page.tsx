/**
 * /news — ニュース一覧ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * ページネーション: nuqs createSearchParamsCache
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultNewsListContent } from "@/public/lib/content/defaults/news-list";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Pagination } from "@/public/components/Pagination";
import { paginationSearchParams } from "@/public/lib/search-params";
import { NewsList } from "./_components/NewsList";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("news");
}

export default async function NewsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page } = await paginationSearchParams.parse(searchParams);

  const [content, { items, totalPages, currentPage }] = await Promise.all([
    getPageContent("news", simplePageContentSchema, defaultNewsListContent),
    getPublishedNewsList(Math.max(1, page)),
  ]);

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          <NewsList items={items} />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/news"
          />
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
