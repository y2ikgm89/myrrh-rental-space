/**
 * /contact — お問い合わせページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { ContactForm } from "./_components/ContactForm";
import { BusinessInfo } from "./_components/BusinessInfo";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("contact");
}

export default async function ContactPage(): Promise<ReactElement> {
  await connection();

  return (
    <>
      <PageHero
        variant="compact"
        title="お問い合わせ"
        breadcrumb={<Breadcrumb items={[{ label: "お問い合わせ" }]} />}
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
