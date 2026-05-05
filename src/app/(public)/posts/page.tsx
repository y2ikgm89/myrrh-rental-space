/**
 * /posts — ブログ一覧ページ
 *
 * `post-list` セクションの "archive" variant が SearchBar +
 * PostCategoryFilter + PostGrid + Pagination + BlogLayout を内包する。
 * 本ページは sections.map(SectionRenderer) のみで構成され、searchParams を
 * SectionRenderer に forward する。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";

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

export default async function PostsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("posts");
  const baseUrl = getBaseUrl();

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: "ブログ", url: `${baseUrl}/posts` },
        ]}
      />
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          searchParams={searchParams}
          pageSlug="posts"
        />
      ))}
    </PageLayout>
  );
}
