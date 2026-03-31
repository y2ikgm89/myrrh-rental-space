/**
 * /contact — お問い合わせページ（Page-First アーキテクチャ）
 *
 * レイアウト: default Container + 2カラム（フォーム主体 + sticky サイドバー）
 * - フォーム側: ~850px（lg時）— 名前+メール2列でも各400px以上
 * - サイドバー: 360px固定 — 営業情報を常に視野に入れて信頼感を維持
 * - lg未満: スタック（フォーム→営業情報の順）
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultContactContent } from "@/public/lib/content/defaults";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
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

  const [content, turnstileSiteKey] = await Promise.all([
    getPageContent("contact", simplePageContentSchema, defaultContactContent),
    getTurnstileSiteKey(),
  ]);

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

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

      <SiteCTA />
    </>
  );
}
