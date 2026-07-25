/**
 * /terms — 規約一覧ページ
 *
 * `terms-list` セクションが公開中の規約（TermsDocument）一覧を内包する。
 * 本ページは sections.map(SectionRenderer) のみで構成される
 * (blog/news/spaces と同型の Page-Template Architecture)。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { createMetadataErrorFallback } from "@/public/lib/seo/feature-gated-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";
import { requireSystemPagePublished } from "@/shared/lib/pages/require-published";

const FALLBACK_METADATA: Metadata = createMetadataErrorFallback(
  "規約一覧",
  "利用規約・プライバシーポリシー・キャンセルポリシー等の一覧",
);

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  try {
    return await generatePageMetadata("terms");
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function TermsListPage(): Promise<ReactElement> {
  await connection();
  await requireSystemPagePublished("terms");

  const sections = await getPageSectionsWithFallback("terms");
  const baseUrl = getBaseUrl();

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: "規約一覧", url: `${baseUrl}/terms` },
        ]}
      />
      <SectionStack sections={sections} pageSlug="terms" />
    </PageLayout>
  );
}
