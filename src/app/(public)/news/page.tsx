/**
 * /news — お知らせ一覧ページ
 *
 * SEO: generatePageMetadata("news") → DB未登録時はスタティックフォールバック
 * Hero はセクションシステムから描画、記事一覧は中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { Container } from "@/public/components/design-system/container";
import { Pagination } from "@/public/components/pagination";
import { newsSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { NewsList } from "./_components/news-list";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const FALLBACK_METADATA: Metadata = {
  title: "お知らせ",
  description: "最新のお知らせをお届けします。",
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  try {
    return await generatePageMetadata("news");
  } catch {
    return FALLBACK_METADATA;
  }
}

const NEWS_PER_PAGE = 20;

export default async function NewsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page, q } = await newsSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);

  const [sections, newsResult] = await Promise.all([
    getPageSectionsWithFallback("news"),
    getPublishedNewsList(currentPage, NEWS_PER_PAGE, q),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "news-list" &&
      s.type !== "cta",
  );

  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;

  const baseUrl = getBaseUrl();

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={<SiteCTA />}
    >
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: "お知らせ", url: `${baseUrl}/news` },
        ]}
      />

      <section className="pt-10 pb-[var(--space-lg)] md:pt-14">
        <Container>
          <Suspense fallback={null}>
            <div className="mb-8 max-w-md">
              <SearchBar placeholder="お知らせを検索..." />
            </div>
          </Suspense>
          <NewsList items={newsResult.items} />
          <Pagination
            currentPage={currentPage}
            totalPages={newsResult.totalPages}
            basePath="/news"
            {...(Object.keys(preservedQuery).length > 0
              ? { preservedQuery }
              : {})}
          />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
