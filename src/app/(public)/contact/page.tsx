/**
 * /contact — お問い合わせページ（セクションベース）
 *
 * レイアウト: default Container + 2カラム（フォーム主体 + sticky サイドバー）
 * Hero はセクションシステムから描画、ページ固有コンテンツ（フォーム）は中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import { Container } from "@/public/components/design-system/container";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ContactForm } from "./_components/contact-form";
import { BusinessInfo } from "./_components/business-info";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("contact");
}

export default async function ContactPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  await connection();

  const params = await searchParams;
  const defaultSubject =
    typeof params["subject"] === "string"
      ? params["subject"].slice(0, 200)
      : undefined;

  const [sections, turnstileSiteKey] = await Promise.all([
    getPageSectionsWithFallback("contact"),
    getTurnstileSiteKey(),
  ]);

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax",
  );

  return (
    <>
      {heroSection ? <SectionRenderer section={heroSection} /> : null}

      <section className="py-[var(--spacing-section)]">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">
            <ContactForm
              turnstileSiteKey={turnstileSiteKey}
              defaultSubject={defaultSubject}
            />
            <div className="lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:self-start">
              <ScrollReveal delay={0.2}>
                <Suspense fallback={null}>
                  <BusinessInfo />
                </Suspense>
              </ScrollReveal>
            </div>
          </div>
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
