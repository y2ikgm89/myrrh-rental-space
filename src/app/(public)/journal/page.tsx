/**
 * /journal — ニュース＋コラム統合一覧ページ
 *
 * SEO: generatePageMetadata("journal") → DB未登録時はスタティックフォールバック
 * Hero はセクションシステムから描画、統合フィードは中間に配置
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
import { getPublishedPostsList } from "@/shared/domain/posts/queries";
import { Container } from "@/public/components/design-system/container";
import { Pagination } from "@/public/components/Pagination";
import { journalSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { JournalContent } from "./_components/JournalContent";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const FALLBACK_METADATA: Metadata = {
  title: "Journal",
  description: "ニュースやコラムなど、最新の情報をお届けします。",
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  try {
    return await generatePageMetadata("journal");
  } catch {
    return FALLBACK_METADATA;
  }
}

/** Items per page for each content type when showing combined feed */
const ITEMS_PER_TAB = 12;

export default async function JournalPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page, q, tab } = await journalSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);

  // Fetch sections + content in parallel
  const showNews = tab === "all" || tab === "news";
  const showPosts = tab === "all" || tab === "posts";

  const [sections, newsResult, postsResult] = await Promise.all([
    getPageSectionsWithFallback("journal"),
    showNews
      ? getPublishedNewsList(currentPage, ITEMS_PER_TAB, q)
      : Promise.resolve({
          items: [],
          totalCount: 0,
          totalPages: 0,
          currentPage,
        }),
    showPosts
      ? getPublishedPostsList(currentPage, ITEMS_PER_TAB, q)
      : Promise.resolve({
          posts: [],
          totalCount: 0,
          totalPages: 0,
          currentPage,
        }),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax",
  );

  // Build combined feed items
  const newsItems = newsResult.items.map((item) => ({
    id: item.id,
    type: "news" as const,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
  }));

  const postItems = postsResult.posts.map((post) => ({
    id: post.id,
    type: "post" as const,
    title: post.title,
    url: post.url,
    publishedAt: post.publishedAt,
  }));

  // Merge and sort by date (newest first)
  const allItems = [...newsItems, ...postItems].sort((a, b) => {
    const dateA = a.publishedAt ?? "";
    const dateB = b.publishedAt ?? "";
    return dateB.localeCompare(dateA);
  });

  // Determine total pages based on active tab
  const totalPages =
    tab === "all"
      ? Math.max(newsResult.totalPages, postsResult.totalPages)
      : tab === "news"
        ? newsResult.totalPages
        : postsResult.totalPages;

  // Build preserved query params for pagination
  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;
  if (tab && tab !== "all") preservedQuery["tab"] = tab;

  return (
    <>
      {heroSection ? <SectionRenderer section={heroSection} /> : null}

      <section className="py-[var(--spacing-section)]">
        <Container>
          <Suspense fallback={null}>
            <div className="mb-8 max-w-md">
              <SearchBar placeholder="記事を検索..." />
            </div>
          </Suspense>
          <Suspense fallback={null}>
            <JournalContent items={allItems} activeTab={tab} />
          </Suspense>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/journal"
            {...(Object.keys(preservedQuery).length > 0
              ? { preservedQuery }
              : {})}
          />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
