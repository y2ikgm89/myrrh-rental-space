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
  getPublishedFaqItems,
  getPageSectionsWithFallback,
} from "@/shared/domain/sections/queries";
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

  const [sections, items] = await Promise.all([
    getPageSectionsWithFallback("faq"),
    getPublishedFaqItems(50),
  ]);

  // Strip HTML tags for plain text in JSON-LD Answer
  const faqJsonLdItems = items.map((item) => ({
    question: item.question,
    answer: (item.answerHtml ?? "").replace(/<[^>]*>/g, ""),
  }));

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
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
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

      <section className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <Container variant="narrow">
          <FaqAccordion items={items} />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
