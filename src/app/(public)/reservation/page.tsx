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
import { getCurrentUser } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { isCustomerProfileComplete } from "@/shared/domain/customers/profile-check";
import { Button } from "@/public/components/design-system/button";
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
        {customer && !isCustomerProfileComplete(customer) ? (
          <div className="border border-accent/30 bg-accent/5 p-6 sm:p-8 text-center space-y-4">
            <p className="text-foreground">
              ご予約にはプロフィールの入力が必要です。
            </p>
            <p className="text-sm text-muted-foreground">
              姓名とメールアドレスを登録してから予約にお進みください。
            </p>
            <Button variant="editorial" href="/mypage/settings">
              プロフィールを設定する
            </Button>
          </div>
        ) : (
          <ReservationForm
            locations={locations}
            businessHours={businessHours}
            turnstileSiteKey={turnstileSiteKey}
            prefillData={prefillData}
            initialSpaceId={initialSpaceId}
            isLoggedIn={user != null}
            requiredTerms={[]}
          />
        )}
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
