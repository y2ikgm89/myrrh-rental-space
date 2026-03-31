/**
 * /news — ニュース一覧ページ（セクションベース）
 *
 * SEO: generatePageMetadata
 * Hero はセクションシステムから描画、ニュース一覧は中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { Container } from "@/public/components/design-system/container";
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

  const [sections, { items, totalPages, currentPage }] = await Promise.all([
    getPageSectionsWithFallback("news"),
    getPublishedNewsList(Math.max(1, page), undefined, q),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax",
  );

  return (
    <>
      {heroSection ? <SectionRenderer section={heroSection} /> : null}

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

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
