/**
 * /privacy — プライバシーポリシーページ（セクションベース）
 *
 * SEO: generatePageMetadata
 * コンテンツ: DB セクション（フォールバック: DEFAULT_PAGE_SECTIONS）を SectionRenderer で描画
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import { PageLayout } from "@/public/components/design-system/page-layout";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("privacy");
}

export default async function PrivacyPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("privacy");

  return (
    <PageLayout variant="content">
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
