/**
 * /posts — ブログ記事一覧ページ（セクションベース）
 *
 * SEO: generatePageMetadata
 * Hero はセクションシステムから描画、記事一覧は中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import {
  getPublishedPostsList,
  getPostCategories,
} from "@/shared/domain/posts/queries";
import { Container } from "@/public/components/design-system/container";
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

  const [sections, { posts, totalPages, currentPage }, categories] =
    await Promise.all([
      getPageSectionsWithFallback("posts"),
      getPublishedPostsList(Math.max(1, page), undefined, q, category),
      getPostCategories(),
    ]);

  const preservedQuery: Record<string, string | undefined> = {};
  if (q) preservedQuery["q"] = q;
  if (category) preservedQuery["category"] = category;

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

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
