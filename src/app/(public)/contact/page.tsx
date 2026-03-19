/**
 * /contact — お問い合わせページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultContactContent } from "@/public/lib/content/defaults/contact";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { ContactForm } from "./_components/contact-form";
import { BusinessInfo } from "./_components/BusinessInfo";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("contact");
}

export default async function ContactPage(): Promise<ReactElement> {
  await connection();

  const content = await getPageContent(
    "contact",
    simplePageContentSchema,
    defaultContactContent,
  );

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container variant="narrow">
          <div className="grid gap-10 md:grid-cols-[1fr_320px] md:gap-12">
            <ContactForm />
            <ScrollReveal delay={0.2}>
              <Suspense fallback={null}>
                <BusinessInfo />
              </Suspense>
            </ScrollReveal>
          </div>
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
