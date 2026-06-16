/**
 * /faq — よくある質問ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * filter / 中間挿入なし。FAQ accordion・JSON-LD・CTA は section が内包。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("faq");
}

export default async function FaqPage(): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("faq");

  const sections = await getPageSectionsWithFallback("faq");

  return (
    <>
      <SectionStack sections={sections} pageSlug="faq" />
    </>
  );
}
