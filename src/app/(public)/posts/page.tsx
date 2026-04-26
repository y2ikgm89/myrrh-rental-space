/**
 * /posts — ブログ一覧ページ
 *
 * SEO: generatePageMetadata("posts") → DB未登録時はスタティックフォールバック
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
import {
  getPublishedPostsList,
  getPostCategories,
} from "@/shared/domain/posts/queries";
import { getPageShowSidebar } from "@/shared/domain/pages/queries";
import { Container } from "@/public/components/design-system/container";
import { Pagination } from "@/public/components/pagination";
import { postsSearchParams } from "@/public/lib/search-params";
import { SearchBar } from "@/public/components/ui/search-bar";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { BlogLayout } from "@/public/components/layouts/blog-layout";
import { PostGrid } from "./_components/post-grid";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";
import { PostCategoryFilter } from "./_components/post-category-filter";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const FALLBACK_METADATA: Metadata = {
  title: "ブログ",
  description: "最新のブログ記事をお届けします。",
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  try {
    return await generatePageMetadata("posts");
  } catch {
    return FALLBACK_METADATA;
  }
}

const POSTS_PER_PAGE = 12;

export default async function PostsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { page, q, category } = await postsSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);

  const [sections, postsResult, categories, showSidebar] = await Promise.all([
    getPageSectionsWithFallback("posts"),
    getPublishedPostsList(currentPage, POSTS_PER_PAGE, q, category),
    getPostCategories(),
    getPageShowSidebar("posts"),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "post-list" &&
      s.type !== "cta",
  );

  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;
  if (category) preservedQuery["category"] = category;

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
          { name: "ブログ", url: `${baseUrl}/posts` },
        ]}
      />

      <section className="pt-10 pb-[var(--space-lg)] md:pt-14">
        <Container>
          <BlogLayout showSidebar={showSidebar}>
            <Suspense fallback={null}>
              <div className="mb-8 max-w-md">
                <SearchBar placeholder="記事を検索..." />
              </div>
            </Suspense>
            <Suspense fallback={null}>
              <PostCategoryFilter categories={categories} />
            </Suspense>
            <PostGrid posts={postsResult.posts} />
            <Pagination
              currentPage={currentPage}
              totalPages={postsResult.totalPages}
              basePath="/posts"
              {...(Object.keys(preservedQuery).length > 0
                ? { preservedQuery }
                : {})}
            />
          </BlogLayout>
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
