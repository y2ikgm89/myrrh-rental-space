/**
 * /about — 会社概要ページ（セクションベース）
 *
 * SEO: generatePageMetadata
 * コンテンツ: DB セクション（フォールバック: DEFAULT_PAGE_SECTIONS）を SectionRenderer で描画
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPublicSettingsForStyle } from "@/shared/domain/settings/queries/display";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("about");
}

export default async function AboutPage(): Promise<ReactElement> {
  await connection();

  const [sections, page, settings] = await Promise.all([
    getPageSectionsWithFallback("about"),
    getPublicPage("about"),
    getPublicSettingsForStyle(),
  ]);

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          page={{ pageStyle: page?.pageStyle ?? null }}
          settings={settings}
        />
      ))}
    </PageLayout>
  );
}
