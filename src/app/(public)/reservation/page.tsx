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

  return (
    <>
      <PageHero
        variant="compact"
        title="ご予約"
        breadcrumb={<Breadcrumb items={[{ label: "ご予約" }]} />}
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
