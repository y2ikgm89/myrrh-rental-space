/**
 * /faq — よくある質問ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata + FAQPage JSON-LD
 *
 * NOTE: FAQPage JSON-LD uses dangerouslySetInnerHTML for schema.org structured data.
 * The content is admin-managed via Lexical editor and stored as sanitized HTML in DB.
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultFaqContent } from "@/public/lib/content/defaults";
import { getPublishedFaqItems } from "@/shared/domain/sections/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { FAQPageJsonLd } from "@/public/components/seo/json-ld";
import { FaqAccordion } from "./_components/faq-accordion";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("faq");
}

export default async function FaqPage(): Promise<ReactElement> {
  await connection();

  const [content, items] = await Promise.all([
    getPageContent("faq", simplePageContentSchema, defaultFaqContent),
    getPublishedFaqItems(50),
  ]);

  // Strip HTML tags for plain text in JSON-LD Answer
  const faqJsonLdItems = items.map((item) => ({
    question: item.question,
    answer: (item.answerHtml ?? "").replace(/<[^>]*>/g, ""),
  }));

  return (
    <>
      {faqJsonLdItems.length > 0 ? (
        <FAQPageJsonLd items={faqJsonLdItems} />
      ) : null}

      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container variant="narrow">
          <FaqAccordion items={items} />
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
