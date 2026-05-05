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
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { Section } from "@/public/components/design-system/section";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { getPublishedLocationsWithSpaces } from "@/shared/domain/locations/public-queries";
import { getBusinessHoursSettingsQuery } from "@/shared/domain/reservations/availability";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { CUSTOMER_PLACEHOLDER_NAME } from "@/shared/domain/customers/link";
import { getRequiredTermsAtReservation } from "@/shared/domain/terms/queries";
import { ReservationForm } from "./_components/reservation-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("reservation");
}

interface ReservationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReservationPage({
  searchParams,
}: ReservationPageProps): Promise<ReactElement> {
  await connection();
  const params = await searchParams;
  const rawSpaceId =
    typeof params["spaceId"] === "string" ? params["spaceId"] : undefined;

  const [
    sections,
    locations,
    businessHours,
    turnstileSiteKey,
    user,
    requiredTerms,
  ] = await Promise.all([
    getPageSectionsWithFallback("reservation"),
    getPublishedLocationsWithSpaces(),
    getBusinessHoursSettingsQuery(),
    getTurnstileSiteKey(),
    getCurrentCustomerUser(),
    getRequiredTermsAtReservation(),
  ]);

  const customer = user ? await getCustomerByUserId(user.id) : null;

  const prefillData = customer
    ? {
        lastName:
          customer.lastName === CUSTOMER_PLACEHOLDER_NAME
            ? ""
            : customer.lastName,
        firstName: customer.firstName,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        companyName: customer.companyName,
      }
    : undefined;

  // Validate spaceId against fetched locations
  const initialSpaceId = rawSpaceId
    ? locations.some((loc) => loc.spaces.some((s) => s.id === rawSpaceId))
      ? rawSpaceId
      : undefined
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
          key={initialSpaceId ?? ""}
          locations={locations}
          businessHours={businessHours}
          turnstileSiteKey={turnstileSiteKey}
          prefillData={prefillData}
          initialSpaceId={initialSpaceId}
          isLoggedIn={user != null}
          requiredTerms={requiredTerms}
        />
      </div>

      {trailingSections.length > 0 ? (
        <Section
          spacing="default"
          border="top"
          className="mt-[var(--spacing-block)]"
        >
          {trailingSections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}
        </Section>
      ) : null}
    </PageLayout>
  );
}
