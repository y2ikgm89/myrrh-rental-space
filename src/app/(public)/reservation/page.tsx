/**
 * /reservation — ご予約ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: ダミー3ステップフォーム（DB連携は将来実装）
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultReservationContent } from "@/public/lib/content/defaults/reservation";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Container } from "@/public/components/design-system/container";
import { ReservationForm } from "./_components/ReservationForm";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("reservation");
}

export default async function ReservationPage(): Promise<ReactElement> {
  await connection();

  const content = await getPageContent(
    "reservation",
    simplePageContentSchema,
    defaultReservationContent,
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
          <ReservationForm />
        </Container>
      </section>

      <SiteCTA heading="お問い合わせ" body="ご不明点はお気軽にご相談ください" />
    </>
  );
}
