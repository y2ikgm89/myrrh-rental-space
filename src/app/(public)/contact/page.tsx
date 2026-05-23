/**
 * /contact — お問い合わせページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * filter / 中間挿入なし。フォーム本体・BusinessInfo は contact-form section が内包。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { getInquiryDefaultsForCurrentCustomer } from "@/shared/domain/inquiries/customer-defaults";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("contact");
}

export default async function ContactPage(): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("contact");

  const [sections, inquiryDefaults] = await Promise.all([
    getPageSectionsWithFallback("contact"),
    getInquiryDefaultsForCurrentCustomer(),
  ]);

  return (
    <>
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          pageSlug="contact"
          inquiryDefaults={inquiryDefaults}
        />
      ))}
    </>
  );
}
