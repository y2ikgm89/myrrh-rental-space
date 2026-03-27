/**
 * /news — ニュース一覧ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * ページネーション + 検索: nuqs createSearchParamsCache
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultNewsListContent } from "@/public/lib/content/defaults";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Pagination } from "@/public/components/pagination";
import { newsSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { NewsList } from "./_components/news-list";

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

  const { page, q } = await newsSearchParams.parse(searchParams);

  const [content, { items, totalPages, currentPage }] = await Promise.all([
    getPageContent("news", simplePageContentSchema, defaultNewsListContent),
    getPublishedNewsList(Math.max(1, page), undefined, q),
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
          <Suspense fallback={null}>
            <div className="mb-8 max-w-md">
              <SearchBar placeholder="ニュースを検索..." />
            </div>
          </Suspense>
          <NewsList items={items} />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/news"
            {...(q ? { preservedQuery: { q } } : {})}
          />
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
