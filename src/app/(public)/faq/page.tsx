/**
 * /faq — よくある質問ページ（セクションベース）
 *
 * SEO: generatePageMetadata + FAQPage JSON-LD
 * Hero はセクションシステムから描画、FAQ コンテンツは中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import {
  getPageSectionsWithFallback,
  getPublishedFaqCategoriesWithItems,
} from "@/shared/domain/sections/queries";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPublicSettingsForStyle } from "@/shared/domain/settings/queries/display";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { Container } from "@/public/components/design-system/container";
import { FAQPageJsonLd } from "@/public/components/seo/json-ld";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { FaqAccordion } from "./_components/faq-accordion";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("faq");
}

export default async function FaqPage(): Promise<ReactElement> {
  await connection();

  const [sections, categories, page, settings] = await Promise.all([
    getPageSectionsWithFallback("faq"),
    getPublishedFaqCategoriesWithItems(),
    getPublicPage("faq"),
    getPublicSettingsForStyle(),
  ]);

  const pageCtx = { pageStyle: page?.pageStyle ?? null };

  // JSON-LD は全項目をフラットに展開（構造化データはカテゴリ区別不要）
  const faqJsonLdItems = categories.flatMap((category) =>
    category.items.map((item) => ({
      question: item.question,
      answer: item.answer,
    })),
  );

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "faq-list" &&
      s.type !== "cta",
  );

  return (
    <PageLayout
      variant="content"
      hero={
        heroSection ? (
          <SectionRenderer
            section={heroSection}
            page={pageCtx}
            settings={settings}
          />
        ) : undefined
      }
      cta={
        <SiteCTA
          label="Contact"
          title="お探しの答えが見つかりませんか？"
          description="ご不明点がございましたら、お気軽にお問い合わせください。"
          buttonText="お問い合わせ"
          buttonHref="/contact"
        />
      }
    >
      {faqJsonLdItems.length > 0 ? (
        <FAQPageJsonLd items={faqJsonLdItems} />
      ) : null}

      <section className="pt-10 pb-[var(--space-lg)] md:pt-14">
        <Container variant="narrow">
          <FaqAccordion categories={categories} />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          page={pageCtx}
          settings={settings}
        />
      ))}
    </PageLayout>
  );
}
