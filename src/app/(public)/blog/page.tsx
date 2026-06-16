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
  title: "ブログ",
  description: "最新のブログ記事をお届けします。",
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  try {
    return await generatePageMetadata("blog");
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function BlogPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("posts");

  const sections = await getPageSectionsWithFallback("blog");
  const baseUrl = getBaseUrl();

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: "ブログ", url: `${baseUrl}/blog` },
        ]}
      />
      <SectionStack
        sections={sections}
        searchParams={searchParams}
        pageSlug="blog"
      />
    </PageLayout>
  );
}
