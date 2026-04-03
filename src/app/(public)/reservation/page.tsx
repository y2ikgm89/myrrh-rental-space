/**
 * /reservation — ご予約ページ（Editorial Magazine）
 *
 * Hero はセクションシステムから描画、3ステップ予約フォームは中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import { Section } from "@/public/components/design-system/section";
import { PageLayout } from "@/public/components/design-system/page-layout";
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

  const [sections, locations, businessHours, turnstileSiteKey, user] =
    await Promise.all([
      getPageSectionsWithFallback("reservation"),
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

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "space-list",
  );

  return (
    <PageLayout
      variant="form"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
    >
      <div className="mx-auto max-w-4xl">
        <ReservationForm
          locations={locations}
          businessHours={businessHours}
          turnstileSiteKey={turnstileSiteKey}
          prefillData={prefillData}
          isLoggedIn={user != null}
        />
      </div>

      {trailingSections.length > 0 ? (
        <Section
          spacing="default"
          border="top"
          className="mt-[var(--spacing-section)]"
        >
          {trailingSections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}
        </Section>
      ) : null}
    </PageLayout>
  );
}
