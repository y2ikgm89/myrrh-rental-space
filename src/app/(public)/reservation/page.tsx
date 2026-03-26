/**
 * /reservation — ご予約ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: 3ステップ予約フォーム（スペース選択 → 日時選択 → 顧客情報・確認・送信）
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultReservationContent } from "@/public/lib/content/defaults";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Container } from "@/public/components/design-system/container";
import { getPublishedLocationsWithSpaces } from "@/shared/domain/locations/public-queries";
import { getBusinessHoursSettingsQuery } from "@/shared/domain/reservations/availability";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { getCurrentUser } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { ReservationForm } from "./_components/reservation-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("reservation");
}

export default async function ReservationPage(): Promise<ReactElement> {
  await connection();

  const [content, locations, businessHours, turnstileSiteKey, user] =
    await Promise.all([
      getPageContent(
        "reservation",
        simplePageContentSchema,
        defaultReservationContent,
      ),
      getPublishedLocationsWithSpaces(),
      getBusinessHoursSettingsQuery(),
      getTurnstileSiteKey(),
      getCurrentUser(),
    ]);

  const customer = user ? await getCustomerByUserId(user.id) : null;

  const prefillData = customer
    ? {
        lastName: customer.lastName,
        firstName: customer.firstName,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        companyName: customer.companyName,
      }
    : undefined;

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          <div className="mx-auto max-w-4xl">
            <ReservationForm
              locations={locations}
              businessHours={businessHours}
              turnstileSiteKey={turnstileSiteKey}
              prefillData={prefillData}
              isLoggedIn={user != null}
            />
          </div>
        </Container>
      </section>

      <SiteCTA heading="お問い合わせ" body="ご不明点はお気軽にご相談ください" />
    </>
  );
}
