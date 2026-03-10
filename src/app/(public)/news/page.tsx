/**
 * /news — ニュース一覧ページ
 *
 * パターンB: セクション + カスタムコンテンツ
 * セクション（Hero等）をレンダー後、ニュースリスト + ページネーション
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 * ページネーション: nuqs createSearchParamsCache
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { BreadcrumbJsonLd } from "@/public/components/seo/JsonLd";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPublishedNewsList } from "@/shared/domain/news/queries";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
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

  const [sections, { page }] = await Promise.all([
    getPageSectionsWithFallback("news"),
    paginationSearchParams.parse(searchParams),
  ]);

  const { items, totalPages, currentPage } = await getPublishedNewsList(
    Math.max(1, page),
  );

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "お知らせ", url: "/news" },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <NewsList items={items} />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/news"
        />
      </section>
    </>
  );
}
