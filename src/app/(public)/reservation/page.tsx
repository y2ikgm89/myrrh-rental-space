/**
 * /reservation — ご予約ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: 3ステップ予約フォーム（スペース選択 → 顧客情報 → 確認・送信）
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
import { getPublishedSpaces } from "@/shared/domain/spaces/public-queries";
import { ReservationForm } from "./_components/reservation-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("reservation");
}

export default async function ReservationPage(): Promise<ReactElement> {
  await connection();

  const [content, allSpaces] = await Promise.all([
    getPageContent(
      "reservation",
      simplePageContentSchema,
      defaultReservationContent,
    ),
    getPublishedSpaces(),
  ]);

  const spaces = allSpaces.map((s) => ({
    id: s.id,
    name: s.name,
    capacity: s.capacity,
    hourlyPrice: s.hourlyPrice,
    mainImageUrl: s.mainImageUrl,
  }));

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container variant="narrow">
          <ReservationForm spaces={spaces} />
        </Container>
      </section>

      <SiteCTA heading="お問い合わせ" body="ご不明点はお気軽にご相談ください" />
    </>
  );
}
