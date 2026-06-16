/**
 * /news — お知らせ一覧ページ
 *
 * `news-list` セクションの "archive" variant が SearchBar + NewsList +
 * Pagination を内包する。本ページは sections.map(SectionRenderer) のみで
 * 構成され、searchParams を SectionRenderer に forward する。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

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

export default async function NewsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("news");

  const sections = await getPageSectionsWithFallback("news");
  const baseUrl = getBaseUrl();

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: "お知らせ", url: `${baseUrl}/news` },
        ]}
      />
      <SectionStack
        sections={sections}
        searchParams={searchParams}
        pageSlug="news"
      />
    </PageLayout>
  );
}
