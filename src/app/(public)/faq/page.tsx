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
import { getPublishedFaqItems } from "@/shared/domain/sections/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { FaqAccordion } from "./_components/FaqAccordion";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("faq");
}

export default async function FaqPage(): Promise<ReactElement> {
  await connection();

  const items = await getPublishedFaqItems(50);

  // Strip HTML tags for plain text in JSON-LD Answer
  // Content is admin-managed via Lexical editor and stored as sanitized HTML in DB.
  // JSON.stringify escapes all special characters, making this safe for JSON-LD output.
  const faqJsonLd =
    items.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: (item.answerHtml ?? "").replace(/<[^>]*>/g, ""),
            },
          })),
        }
      : null;

  return (
    <>
      {/* FAQPage JSON-LD -- sanitized via JSON.stringify (no raw HTML in output) */}
      {/* eslint-disable @eslint-react/dom/no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify-encoded, no raw HTML */}
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <PageHero
        variant="compact"
        title="よくある質問"
        breadcrumb={<Breadcrumb items={[{ label: "よくある質問" }]} />}
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
